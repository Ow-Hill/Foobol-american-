// Ripple engine: when one NFL player's situation changes (injury, return, trade), estimate who
// else on his NFL team gains or loses volume. Deterministic and labelled as an estimate:
// a ripple can raise a flag or reorder a list, but never flips a start/sit on its own.
//
// Rules (fantasy roster-management consensus, see skills/ff-news-search/references/ripple.md):
// - Vacated targets go to the remaining pass catchers roughly by their current share, with a
//   bump for the next man up at the same position. Targets are not inherited evenly.
// - A missing RB's carries mostly go to the next RB on the depth chart.
// - A missing QB downgrades the whole passing game; the top target loses the least.
// - A returning starter takes back what the fill-ins gained while he was out.
// - A player traded in competes with the same-position players already there; his old team
//   loses him like an injury.
// When this season has games with and without the source player, the observed split replaces
// the share heuristic.
import { canon } from './model.js';

const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);
const PASS_CATCHERS = new Set(['WR', 'TE', 'RB']);
const TRADE_WINDOW = 21 * 86400000;
const RECENT = 3;

const r1 = (v) => Math.round(v * 10) / 10;
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// Recent per-game usage from league-scored history.
export function usage(p) {
  const h = (p.hist || []).slice(-RECENT);
  return {
    tgt: avg(h.map((x) => x.tgt || 0)),
    att: avg(h.map((x) => x.att || 0)),
    games: h.length,
    lastW: h.length ? h[h.length - 1].w : null,
    weeks: new Set((p.hist || []).map((x) => x.w)),
  };
}

// Observed with/without split: q's average usage in weeks the team played without src,
// minus weeks src played. Needs at least one game of each.
function split(src, q, teamWeeks) {
  const srcW = new Set((src.hist || []).map((x) => x.w));
  const withG = [];
  const withoutG = [];
  for (const h of q.hist || []) {
    if (!teamWeeks.has(h.w)) continue;
    (srcW.has(h.w) ? withG : withoutG).push(h);
  }
  if (!withG.length || !withoutG.length) return null;
  return {
    tgt: avg(withoutG.map((x) => x.tgt || 0)) - avg(withG.map((x) => x.tgt || 0)),
    att: avg(withoutG.map((x) => x.att || 0)) - avg(withG.map((x) => x.att || 0)),
    n: withoutG.length,
  };
}

function magnitude(e) {
  if (e.pct != null) return Math.min(1, Math.abs(e.pct) / 0.25);
  if (e.starts) return 1;
  return Math.min(1, (Math.abs(e.tgt || 0) + Math.abs(e.att || 0) * 0.5) / 6);
}

const CONF_DOWN = { clear: 'lean', lean: 'toss', toss: 'toss' };

// players: snapshot players (id -> {id,n,pos,team,depth,inj,hist,tchg,prevTeam,...})
// opts.P: optional status resolver (pid -> {eff, effSev}); defaults to the Sleeper tag
// opts.W: current week; opts.now; opts.isBye(team, wk); opts.better: Set of pids with
// dated "activated / cleared" news; opts.lines: { team: { open, now } } implied totals
export function buildRipple(players, opts = {}) {
  const now = opts.now ?? Date.now();
  const W = opts.W ?? 1;
  const isBye = opts.isBye || (() => false);
  const better = opts.better || new Set();
  const status = (p) => {
    if (opts.P) {
      const x = opts.P(p.id);
      return { eff: x.eff || null, sev: x.effSev || 0 };
    }
    const eff = canon(p.inj);
    const SEV = { IR: 5, PUP: 5, Sus: 5, NA: 4, DNR: 4, COV: 4, Out: 4, Doubtful: 3, Questionable: 2, Probable: 1 };
    return { eff, sev: eff ? SEV[eff] || 0 : 0 };
  };

  // ---- team index ----
  const byTeam = {};
  const teamWeeks = {};
  for (const p of Object.values(players)) {
    if (!p || !p.team || !SKILL.has(p.pos)) continue;
    (byTeam[p.team] ||= []).push(p);
    for (const h of p.hist || []) (teamWeeks[p.team] ||= new Set()).add(h.w);
  }
  const U = {};
  const use = (p) => (U[p.id] ||= usage(p));
  const healthy = (p) => status(p).sev < 3;
  const depthSort = (a, b) => (a.depth ?? 99) - (b.depth ?? 99) || use(b).att + use(b).tgt - (use(a).att + use(a).tgt);

  const effects = [];
  const events = [];
  const push = (e) => {
    if (!e.pid || e.pid === e.src) return;
    e.mag = magnitude(e);
    if (e.mag < 0.12) return;
    effects.push(e);
  };

  // Did src miss the team's most recent game (not a bye)?
  const missedLast = (p) => {
    const tw = teamWeeks[p.team];
    if (!tw || !tw.size) return false;
    const last = Math.max(...tw);
    return !use(p).weeks.has(last);
  };
  // Has src been out long enough that teammates' recent usage already reflects it?
  const priced = (p) => {
    const tw = [...(teamWeeks[p.team] || [])].sort((a, b) => b - a).slice(0, 2);
    return tw.length === 2 && tw.every((w) => !use(p).weeks.has(w));
  };

  function vacate(src, kind, label, baseConf, team = src.team) {
    const mates = (byTeam[team] || []).filter((q) => q.id !== src.id && healthy(q));
    const u = use(src);
    const tw = teamWeeks[team] || new Set();
    const why0 = `${src.n} ${label}`;
    events.push({ kind, src: src.id, team, label });

    if (src.pos === 'QB') {
      const backup = mates.filter((q) => q.pos === 'QB').sort(depthSort)[0];
      if (backup) push({ kind, src: src.id, pid: backup.id, dir: 'up', starts: true, conf: CONF_DOWN[baseConf], why: `${why0} — ${backup.n} in line to start at QB` });
      const catchers = mates.filter((q) => PASS_CATCHERS.has(q.pos) && use(q).tgt >= 2);
      const top = catchers.reduce((a, b) => (use(b).tgt > (a ? use(a).tgt : -1) ? b : a), null);
      for (const q of catchers) {
        const pct = q === top ? -0.1 : -0.2;
        push({ kind, src: src.id, pid: q.id, dir: 'down', pct, conf: CONF_DOWN[baseConf], why: `${why0} — passing-game downgrade with ${backup ? backup.n : 'the backup'} at QB (~${Math.round(-pct * 100)}% less, estimate)` });
      }
      return;
    }

    if (src.pos === 'RB') {
      const rbs = mates.filter((q) => q.pos === 'RB').sort(depthSort);
      if (!rbs.length) return;
      const next = rbs[0];
      const sumAtt = rbs.reduce((s, q) => s + use(q).att, 0);
      const sumTgt = rbs.reduce((s, q) => s + use(q).tgt, 0);
      const w = rbs.map((q) => (sumAtt ? use(q).att / sumAtt : 1 / rbs.length) + (q === next ? 1 : 0));
      const wSum = w.reduce((s, x) => s + x, 0);
      rbs.forEach((q, i) => {
        const obs = split(src, q, tw);
        const att = obs ? obs.att : (u.att * w[i]) / wSum;
        const tgt = obs ? obs.tgt : sumTgt ? (u.tgt * use(q).tgt) / sumTgt : i === 0 ? u.tgt : 0;
        if (att <= 0 && tgt <= 0) return;
        const conf = obs ? baseConf : CONF_DOWN[baseConf];
        push({
          kind, src: src.id, pid: q.id, dir: 'up', att: r1(att), tgt: r1(tgt), conf, observed: !!obs,
          why: `${why0} — ~+${r1(att)} carries${tgt >= 0.5 ? `, +${r1(tgt)} targets` : ''}/g for ${q.n}${obs ? ` (seen in ${obs.n} game${obs.n > 1 ? 's' : ''} without him)` : ' (estimate)'}`,
        });
      });
      return;
    }

    // WR / TE: vacated targets
    const V = u.tgt;
    const catchers = mates.filter((q) => PASS_CATCHERS.has(q.pos));
    const sum = catchers.reduce((s, q) => s + use(q).tgt, 0);
    const nextUp = mates.filter((q) => q.pos === src.pos && (src.dpos ? q.dpos === src.dpos : true)).sort(depthSort)[0]
      || mates.filter((q) => q.pos === src.pos).sort(depthSort)[0];
    for (const q of catchers) {
      const obs = split(src, q, tw);
      let tgt;
      if (obs) tgt = obs.tgt;
      else {
        tgt = sum ? (V * 0.75 * use(q).tgt) / sum : 0;
        if (q === nextUp) tgt += V * 0.25;
      }
      if (tgt <= 0) continue;
      const conf = obs ? baseConf : CONF_DOWN[baseConf];
      push({
        kind, src: src.id, pid: q.id, dir: 'up', tgt: r1(tgt), conf, observed: !!obs,
        why: `${why0} — ~+${r1(tgt)} targets/g for ${q.n}${q === nextUp && !obs ? ' (next man up)' : ''}${obs ? ` (seen in ${obs.n} game${obs.n > 1 ? 's' : ''} without him)` : ' (estimate)'}`,
      });
    }
  }

  function returning(src) {
    const mates = (byTeam[src.team] || []).filter((q) => q.id !== src.id && healthy(q));
    const tw = teamWeeks[src.team] || new Set();
    events.push({ kind: 'return', src: src.id, team: src.team, label: 'returning' });
    for (const q of mates) {
      if (src.pos === 'QB' ? q.pos !== 'QB' : !(q.pos === src.pos || (PASS_CATCHERS.has(src.pos) && PASS_CATCHERS.has(q.pos)))) continue;
      const obs = split(src, q, tw);
      if (!obs) continue;
      const tgt = obs.tgt > 0.5 ? -obs.tgt : 0;
      const att = obs.att > 1 ? -obs.att : 0;
      if (!tgt && !att) continue;
      push({
        kind: 'return', src: src.id, pid: q.id, dir: 'down', tgt: r1(tgt), att: r1(att), conf: 'lean', observed: true,
        why: `${src.n} returning — ${q.n} averaged ${att ? `+${r1(-att)} carries` : ''}${att && tgt ? ', ' : ''}${tgt ? `+${r1(-tgt)} targets` : ''}/g in ${obs.n} game${obs.n > 1 ? 's' : ''} without him`,
      });
    }
  }

  function tradedIn(src) {
    const mates = (byTeam[src.team] || []).filter((q) => q.id !== src.id && healthy(q) && q.pos === src.pos);
    const u = use(src);
    events.push({ kind: 'trade-in', src: src.id, team: src.team, label: `joins ${src.team}` });
    const sum = mates.reduce((s, q) => s + use(q).tgt + use(q).att, 0);
    for (const q of mates) {
      const share = sum ? (use(q).tgt + use(q).att) / sum : 0;
      const tgt = -(u.tgt * 0.5 * share);
      const att = -(u.att * 0.5 * share);
      push({
        kind: 'trade-in', src: src.id, pid: q.id, dir: 'down', tgt: r1(tgt), att: r1(att), conf: 'toss',
        why: `${src.n} traded to ${src.team} — competes with ${q.n} for ${src.pos === 'RB' ? 'touches' : 'targets'} (estimate)`,
      });
    }
  }

  // Line movement: the betting market reprices a team when it learns something (often a QB or
  // line injury before it is reported). A 2.5-point move in the team's implied total since the
  // week opened moves every player with a role on that offense a little, as a low-confidence flag.
  for (const [team, ln] of Object.entries(opts.lines || {})) {
    if (!ln || ln.open == null || ln.now == null || isBye(team, W)) continue;
    const d = ln.now - ln.open;
    if (Math.abs(d) < 2.5) continue;
    const dir = d < 0 ? 'down' : 'up';
    events.push({ kind: 'line-move', src: team, team, label: `${ln.open} → ${ln.now}` });
    for (const q of byTeam[team] || []) {
      if (!healthy(q)) continue;
      const u = use(q);
      const role = q.pos === 'QB' ? (q.depth ?? 9) <= 1 : q.pos === 'RB' ? u.att + u.tgt >= 8 : u.tgt >= 4;
      if (!role) continue;
      push({
        kind: 'line-move', src: team, pid: q.id, dir, pct: dir === 'down' ? -0.1 : 0.1, conf: 'toss',
        why: `${team} implied total ${dir === 'down' ? 'fell' : 'rose'} ${r1(ln.open)} → ${r1(ln.now)} since the week opened — the market expects ${dir === 'down' ? 'less' : 'more'} scoring (estimate)`,
      });
    }
  }

  for (const p of Object.values(players)) {
    if (!p || !p.team || !SKILL.has(p.pos)) continue;
    if (isBye(p.team, W)) continue;
    const u = use(p);
    const st = status(p);
    const hasRole = p.pos === 'QB' ? (p.depth ?? 9) <= 1 && u.games > 0 : p.pos === 'RB' ? u.att + u.tgt >= 8 : u.tgt >= 4;

    // Trade: team changed recently. Old team loses him like an injury.
    let tchg = Number(p.tchg) || 0;
    if (tchg && tchg < 1e12) tchg *= 1000;
    if (tchg && now - tchg <= TRADE_WINDOW && (u.tgt + u.att >= 4 || p.pos === 'QB')) {
      tradedIn(p);
      if (p.prevTeam && p.prevTeam !== p.team) vacate(p, 'trade-out', `traded away to ${p.team}`, 'lean', p.prevTeam);
      continue;
    }

    if (st.sev >= 3 && hasRole && !priced(p)) {
      const conf = st.sev >= 4 ? (u.games >= 2 ? 'clear' : 'lean') : 'toss';
      vacate(p, 'out', `(${st.eff})`, conf);
      continue;
    }

    // Return: missed the last game, now healthy or cleared, and had a role before.
    if (st.sev <= 1 && missedLast(p) && (better.has(p.id) || st.sev === 0)) {
      const before = (p.hist || []).slice(-RECENT);
      const role = p.pos === 'QB' ? before.length > 0 : p.pos === 'RB' ? avg(before.map((x) => x.att + x.tgt)) >= 8 : avg(before.map((x) => x.tgt)) >= 4;
      if (role) returning(p);
    }
  }

  const byPid = new Map();
  for (const e of effects) {
    if (!byPid.has(e.pid)) byPid.set(e.pid, []);
    byPid.get(e.pid).push(e);
  }
  for (const list of byPid.values()) list.sort((a, b) => b.mag - a.mag);
  return { effects, events, byPid };
}

// Net signed score in [-1, 1] for a player.
export function rippleNet(list) {
  if (!list || !list.length) return 0;
  const s = list.reduce((t, e) => t + (e.dir === 'up' ? e.mag : -e.mag), 0);
  return Math.max(-1, Math.min(1, s));
}
