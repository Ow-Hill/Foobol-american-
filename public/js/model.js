// All league logic lives here. It follows the rules in the ff-* skills:
// live roster first, health beats models, most-severe status wins conflicts,
// league IR rules, rolling waivers, Week-11 deadline, advice only.
import { avg, sum, quantile, clamp, fmtKick, setTz } from './util.js';
import { buildValues } from './values.js';
import { matchupFor } from './matchup.js';

const SEV = { IR: 5, PUP: 5, Sus: 5, NA: 4, DNR: 4, COV: 4, Out: 4, Doubtful: 3, Questionable: 2, Probable: 1 };
const FLEX_ELIG = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
  REC_FLEX: ['WR', 'TE'],
};

export function canon(s) {
  if (!s) return null;
  const u = String(s).trim().toUpperCase();
  const map = {
    'IR': 'IR', 'INJURED RESERVE': 'IR', 'PUP': 'PUP', 'SUS': 'Sus', 'SUSPENDED': 'Sus', 'NA': 'NA', 'DNR': 'DNR', 'COV': 'COV',
    'OUT': 'Out', 'DOUBTFUL': 'Doubtful', 'QUESTIONABLE': 'Questionable', 'PROBABLE': 'Probable',
  };
  return map[u] || null; // Active / Healthy / unknown -> no tag
}
export const sevOf = (label) => (label ? SEV[label] || 0 : 0);

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildModel(snap, rosterId, now = Date.now(), hist = null) {
  const W = snap.meta.week;
  const L = snap.league;
  const cfgLeague = L.settings;
  const teams = snap.teams;
  const teamBy = Object.fromEntries(teams.map((t) => [t.id, t]));
  const me = teamBy[rosterId] || teams[0];
  const slotNames = L.rosterPositions.filter((p) => p !== 'BN');
  const maxRoster = L.rosterPositions.length + (cfgLeague.reserve_slots || 0) + (cfgLeague.taxi_slots || 0);
  const irSlots = cfgLeague.reserve_slots || 0;

  // ---------- schedule index ----------
  const gameIdx = {};
  const byeIdx = {};
  for (const wk of Object.keys(snap.schedule)) {
    gameIdx[wk] = {};
    byeIdx[wk] = new Set(snap.schedule[wk].byes);
    for (const g of snap.schedule[wk].games) {
      gameIdx[wk][g.home.t] = { opp: g.away.t, home: true, date: g.date, state: g.state, completed: g.completed, detail: g.detail, imp: g.home.imp, oppImp: g.away.imp, spread: g.spread, score: g.home.score, oppScore: g.away.score };
      gameIdx[wk][g.away.t] = { opp: g.home.t, home: false, date: g.date, state: g.state, completed: g.completed, detail: g.detail, imp: g.away.imp, oppImp: g.home.imp, spread: g.spread, score: g.away.score, oppScore: g.home.score };
    }
  }
  const gameFor = (team, wk = W) => (team && gameIdx[wk] ? gameIdx[wk][team] || null : null);
  const isBye = (team, wk = W) => !!(team && byeIdx[wk] && byeIdx[wk].has(team));

  // ---------- notes (ESPN/RotoWire) ----------
  const notesBy = {};
  for (const n of snap.notes) {
    const cur = notesBy[n.pid];
    if (!cur || (n.date || '') > (cur.date || '')) notesBy[n.pid] = n;
  }

  // ---------- player info ----------
  const cache = {};
  function P(pid) {
    if (cache[pid]) return cache[pid];
    const p = snap.players[pid];
    if (!p) {
      const hn = hist?.names?.[pid];
      return (cache[pid] = { id: pid, n: hn ? hn[0] : pid.length <= 3 ? pid : 'Player ' + pid, pos: hn ? hn[1] : pid.length <= 3 ? 'DEF' : '?', team: hn ? hn[2] : null, eff: null, effSev: 0, avail: 'ok', proj: 0, hist: [], missing: true, ppg: null, ppg3: null, own: null, game: null, bye: false });
    }
    const note = notesBy[pid] || null;
    const sl = canon(p.inj);
    const es = note ? canon(note.status) : undefined;
    let eff = sl;
    if (es && sevOf(es) > sevOf(sl)) eff = es;
    const conflict = !!note && (sl || null) !== (es || null);
    const game = gameFor(p.team, W);
    const bye = isBye(p.team, W);
    const effSev = sevOf(eff);
    const ph = p.hist || []; // not `hist`: that would shadow the history argument used above
    const pts = ph.map((h) => h.pts);
    const snps = ph.filter((h) => h.snp != null).map((h) => h.snp);
    const last3 = pts.slice(-3);
    const recent = pts.slice(-6);
    const info = {
      ...p,
      sl,
      es: es === undefined ? undefined : es,
      eff,
      effSev,
      conflict,
      slAt: p.nu,
      esAt: note?.date || null,
      note,
      game,
      bye,
      locked: !!(game && (game.state !== 'pre' || new Date(game.date).getTime() <= now)),
      avail: bye ? 'bye' : effSev >= 3 ? 'out' : effSev === 2 ? 'q' : 'ok',
      proj: p.proj?.pts ?? 0,
      projNext: p.next?.pts ?? null,
      ppg: avg(pts),
      ppg3: last3.length ? avg(last3) : null,
      gp: pts.length,
      floor: recent.length >= 3 ? quantile(recent, 0.25) : null,
      ceil: recent.length >= 3 ? quantile(recent, 0.75) : null,
      snpNow: snps.length ? snps[snps.length - 1] : null,
      snpTrend: snps.length >= 3 ? snps[snps.length - 1] - avg(snps.slice(-3, -1)) : null,
    };
    return (cache[pid] = info);
  }

  // value of a player in a given week if he suits up
  function val(pid, wk = W) {
    const p = P(pid);
    if (p.missing) return 0;
    if (isBye(p.team, wk)) return 0;
    if (wk === W) {
      if (p.effSev >= 3) return 0;
      return p.proj || 0;
    }
    if (p.effSev >= 4 && p.eff === 'IR') return 0;
    if (wk === W + 1) return p.projNext ?? 0;
    return 0;
  }

  // ---------- lineup solver ----------
  const slotEligible = (slot, pos) => (FLEX_ELIG[slot] ? FLEX_ELIG[slot].includes(pos) : slot === pos);
  function solve(pids, { v = (id) => val(id), can = () => true, locked = null } = {}) {
    const out = Array(slotNames.length).fill(null);
    const used = new Set();
    if (locked) locked.forEach((pid, i) => pid && (out[i] = pid, used.add(pid)));
    const pool = pids.filter((id) => can(id) && !used.has(id));
    const order = slotNames.map((s, i) => i).sort((a, b) => (FLEX_ELIG[slotNames[a]] ? FLEX_ELIG[slotNames[a]].length : 0) - (FLEX_ELIG[slotNames[b]] ? FLEX_ELIG[slotNames[b]].length : 0));
    for (const i of order) {
      if (out[i]) continue;
      let best = null;
      for (const id of pool) {
        if (used.has(id) || !slotEligible(slotNames[i], P(id).pos)) continue;
        if (best == null || v(id) > v(best)) best = id;
      }
      if (best) (out[i] = best), used.add(best);
    }
    const slots = slotNames.map((s, i) => ({ slot: s, pid: out[i], v: out[i] ? v(out[i]) : 0 }));
    return { slots, total: sum(slots.map((s) => s.v)) };
  }

  function rosterParts(t) {
    const starters = slotNames.map((_, i) => (t.starters[i] && t.starters[i] !== '0' ? t.starters[i] : null));
    const startSet = new Set(starters.filter(Boolean));
    const ir = t.reserve.filter(Boolean);
    const bench = t.players.filter((id) => !startSet.has(id) && !ir.includes(id) && !t.taxi.includes(id));
    const active = t.players.filter((id) => !ir.includes(id) && !t.taxi.includes(id));
    return { starters, bench, ir, active };
  }
  const canStartNow = (id) => {
    const p = P(id);
    return !p.missing && p.avail !== 'out' && p.avail !== 'bye';
  };
  const lockedSlotsFor = (starters) => starters.map((id) => (id && P(id).locked ? id : null));

  function lineupFor(t) {
    const parts = rosterParts(t);
    const cur = parts.starters.map((pid, i) => ({ slot: slotNames[i], pid, v: pid ? val(pid) : 0 }));
    const curTotal = sum(cur.map((s) => s.v));
    const lockedSlots = lockedSlotsFor(parts.starters);
    const opt = solve(parts.active, { can: (id) => canStartNow(id) && !P(id).locked, locked: lockedSlots });
    return { ...parts, cur, curTotal, opt };
  }

  const lineups = {};
  const lineup = (t) => (lineups[t.id] ||= lineupFor(t));

  // ---------- opponent / posture ----------
  const mus = snap.matchups[W] || [];
  const myMu = mus.find((m) => m.rid === me.id);
  const oppMu = myMu ? mus.find((m) => m.mid === myMu.mid && m.rid !== me.id) : null;
  const opp = oppMu ? teamBy[oppMu.rid] : null;
  const myOpt = lineup(me).opt.total;
  const oppOpt = opp ? lineup(opp).opt.total : null;
  const margin = oppOpt == null ? 0 : myOpt - oppOpt;
  const posture = margin >= 8 ? 'floor' : margin <= -8 ? 'ceiling' : 'expected';

  // ---------- swaps (current vs best legal) ----------
  function swaps() {
    const l = lineup(me);
    const curSet = new Set(l.starters.filter(Boolean));
    const optSet = new Set(l.opt.slots.map((s) => s.pid).filter(Boolean));
    const ins = [...optSet].filter((id) => !curSet.has(id));
    let outs = [...curSet].filter((id) => !optSet.has(id));
    const rows = [];
    const compat = (a, b) => {
      const pa = P(a).pos;
      const pb = P(b).pos;
      const skill = ['RB', 'WR', 'TE'];
      return pa === pb || (skill.includes(pa) && skill.includes(pb));
    };
    for (const inn of ins.sort((a, b) => val(b) - val(a))) {
      const cands = outs.filter((o) => compat(inn, o)).sort((a, b) => val(a) - val(b));
      const outId = cands[0] || null;
      if (outId) outs = outs.filter((o) => o !== outId);
      const slot = l.opt.slots.find((s) => s.pid === inn)?.slot;
      const gap = val(inn) - (outId ? val(outId) : 0);
      rows.push({ start: inn, bench: outId, slot, gap, empty: !outId, ...callFor(inn, outId, gap) });
    }
    return rows;
  }

  function tiebreak(a, b) {
    const A = P(a);
    const B = outPlayer(b);
    const reasons = [];
    // 1. health certainty
    if (A.effSev !== B.effSev) {
      const pick = A.effSev < B.effSev ? 'start' : 'bench';
      reasons.push({ step: 'Health', pick, why: `${(pick === 'start' ? A : B).n.split(' ').slice(-1)[0]} carries no injury tag` });
      return { pick, reasons };
    }
    // 2. matchup posture
    if (posture !== 'expected' && A.floor != null && B.floor != null) {
      const pa = posture === 'floor' ? A.floor : A.ceil;
      const pb = posture === 'floor' ? B.floor : B.ceil;
      if (Math.abs(pa - pb) > 0.5) {
        const pick = pa > pb ? 'start' : 'bench';
        reasons.push({ step: 'Matchup', pick, why: posture === 'floor' ? 'you are the favorite → higher floor' : 'you are the underdog → higher ceiling' });
        return { pick, reasons };
      }
    }
    // 3. game environment
    const ia = A.game?.imp;
    const ib = B.game?.imp;
    if (ia != null && ib != null && Math.abs(ia - ib) >= 1) {
      const pick = ia > ib ? 'start' : 'bench';
      reasons.push({ step: 'Game environment', pick, why: `higher implied team total (${ia.toFixed(1)} vs ${ib.toFixed(1)})` });
      return { pick, reasons };
    }
    // 4. matchup vs position (points the opponent allowed to that position, last six weeks)
    const ma = matchupFor({ P, snap }, a);
    const mb = matchupFor({ P, snap }, b);
    if (ma && mb && ma.of >= 8 && Math.abs(ma.rank - mb.rank) >= Math.round(ma.of / 4)) {
      const pick = ma.rank < mb.rank ? 'start' : 'bench';
      const w = pick === 'start' ? ma : mb;
      reasons.push({ step: 'Position matchup', pick, why: `${w.opp} ${w.label} over the last ${buildWeeks()} weeks` });
      return { pick, reasons };
    }
    // 5. kickoff
    if (A.game && B.game && A.game.date !== B.game.date) {
      const pick = A.game.date > B.game.date ? 'start' : 'bench';
      reasons.push({ step: 'Kickoff', pick, why: 'later game keeps late-swap flexibility' });
      return { pick, reasons };
    }
    return { pick: 'start', reasons: [{ step: 'No tiebreak separates them', pick: 'start', why: 'keep the higher projection' }] };
  }
  const outPlayer = (id) => P(id);
  const buildWeeks = () => Object.keys(snap.results || {}).length;

  function callFor(inn, outId, gap) {
    if (!outId) return { call: 'Fix', band: 'hard', note: 'Empty or illegal slot — fill it', tb: null };
    const o = P(outId);
    if (o.effSev >= 3 || o.avail === 'bye') return { call: 'Fix', band: 'hard', note: o.avail === 'bye' ? 'Starter is on bye' : `Starter is listed ${o.eff}`, tb: null };
    if (gap >= 4) return { call: 'Clear', band: 'clear', note: 'Large projection gap', tb: null };
    if (gap >= 2) return { call: 'Lean', band: 'lean', note: 'Moderate gap — one model only', tb: null };
    const tb = tiebreak(inn, outId);
    return { call: 'Toss-up', band: 'toss', note: tb.reasons[0].step + ': ' + tb.reasons[0].why, tb, keep: tb.pick === 'bench' };
  }

  // Head-to-head start/sit for any two players this week (health first, then gap, then the tiebreak order)
  function startSit(a, b) {
    const A = P(a);
    const B = P(b);
    const va = val(a);
    const vb = val(b);
    const hi = va >= vb ? a : b;
    const lo = hi === a ? b : a;
    const gap = Math.abs(va - vb);
    const dead = (p) => p.avail === 'out' || p.avail === 'bye';
    if (dead(A) !== dead(B)) {
      const pick = dead(A) ? b : a;
      const bad = P(pick === a ? b : a);
      return { pick, other: pick === a ? b : a, gap, band: 'clear', why: [`${bad.n} ${bad.avail === 'bye' ? 'is on bye' : 'is listed ' + bad.eff}`], tb: null };
    }
    if (gap >= 4) return { pick: hi, other: lo, gap, band: 'clear', why: ['Large projection gap'], tb: null };
    if (gap >= 2) return { pick: hi, other: lo, gap, band: 'lean', why: ['Moderate gap — one model only'], tb: null };
    const tb = tiebreak(hi, lo);
    return { pick: tb.pick === 'start' ? hi : lo, other: tb.pick === 'start' ? lo : hi, gap, band: 'toss', why: tb.reasons.map((r) => r.step + ': ' + r.why), tb };
  }

  // ---------- IR rules ----------
  const irAllowed = (label) => {
    if (!label) return false;
    const m = { IR: true, PUP: true, Out: cfgLeague.reserve_allow_out, Doubtful: cfgLeague.reserve_allow_doubtful, Sus: cfgLeague.reserve_allow_sus, NA: cfgLeague.reserve_allow_na, DNR: cfgLeague.reserve_allow_dnr, COV: cfgLeague.reserve_allow_cov };
    return !!m[label];
  };

  // ---------- helpers for names / owners ----------
  const ownerName = (rid) => (rid == null ? 'Free agent' : teamBy[rid]?.owner || 'Team ' + rid);
  const chipOwner = (pid) => {
    const o = P(pid).own;
    return o == null ? 'fa' : o === me.id ? 'mine' : 'rival';
  };
  const shortName = (id) => (P(id).pos === 'DEF' ? P(id).n : lastName(P(id).n));
  const lastName = (n) => {
    const parts = String(n).replace(/\s(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(' ');
    return parts[parts.length - 1];
  };

  // ---------- time ----------
  const kick = (pid) => P(pid).game?.date || null;
  setTz(snap.meta.tz);
  const dayLabel = (iso) => new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: snap.meta.tz }).format(new Date(iso));

  // Fallback: health beats models, so a questionable fallback is discounted
  const fbScore = (id) => val(id) * (P(id).avail === 'q' ? 0.75 : 1);
  function fallbackFor(slot, exclude = []) {
    return lineup(me).bench
      .filter((id) => !exclude.includes(id) && canStartNow(id) && slotEligible(slot, P(id).pos))
      .sort((a, b) => fbScore(b) - fbScore(a))[0];
  }

  // ---------- hard problems ----------
  function problems() {
    const out = [];
    const l = lineup(me);
    const bestBench = (pos, exclude = []) => fallbackFor(pos, exclude);

    l.starters.forEach((pid, i) => {
      const slot = slotNames[i];
      if (!pid) {
        const fb = bestBench(slot);
        const fbp = fb && P(fb);
        out.push({
          sev: 'critical',
          tab: 'lineup',
          title: `${slot} slot is empty`,
          body: fb
            ? `${fbp.n} ${fbp.pos === 'DEF' ? 'are' : 'is'} on your bench${fbp.game ? ` and ${fbp.pos === 'DEF' ? 'play' : 'plays'} ${fmtKick(fbp.game.date)}` : ''} — move ${shortName(fb)} into ${slot}.`
            : `Nobody on your roster fits ${slot}. Claim one (see Waivers).`,
        });
        return;
      }
      const p = P(pid);
      if (p.avail === 'bye') {
        const fb = bestBench(slot, [pid]);
        out.push({ sev: 'critical', tab: 'lineup', pid, title: `${p.n} is on bye`, body: fb ? `Start ${P(fb).n} in his place (${val(fb).toFixed(1)} projected).` : 'No healthy replacement on your bench — see Waivers.' });
      } else if (p.avail === 'out') {
        const fb = bestBench(slot, [pid]);
        out.push({ sev: 'critical', tab: 'injuries', pid, title: `${p.n} is listed ${p.eff}`, body: fb ? `Bench him and start ${P(fb).n} (${val(fb).toFixed(1)} projected).` : 'No healthy replacement on your bench — see Waivers.' });
      }
    });

    for (const pid of l.ir) {
      const p = P(pid);
      if (!irAllowed(p.sl)) {
        out.push({ sev: 'critical', tab: 'injuries', pid, title: `${p.n} is on IR but tagged ${p.sl || 'healthy'}`, body: 'Sleeper locks all your adds and claims until he is moved off IR. Move him to the bench (or drop him) before claiming anyone.' });
      } else if (p.es && !irAllowed(p.es) && p.es !== p.sl) {
        out.push({ sev: 'warn', tab: 'injuries', pid, title: `${p.n}: ESPN shows ${p.es}, Sleeper still shows ${p.sl}`, body: `If Sleeper upgrades him, your claims lock. Check ${waiverDayName()} before waivers.` });
      }
    }

    for (const pid of l.starters.filter(Boolean)) {
      const p = P(pid);
      if (p.avail === 'q') {
        const slot = slotNames[l.starters.indexOf(pid)];
        const fb = bestBench(slot, [pid]);
        out.push({
          sev: 'warn',
          tab: 'injuries',
          pid,
          title: `${p.n} is questionable${p.body ? ` (${p.body.toLowerCase()})` : ''}`,
          body: fb ? `Start him only if active; fallback is ${P(fb).n} (${val(fb).toFixed(1)}). Re-check at inactives${p.game ? ` (${dayLabel(p.game.date)}, 90 min before kickoff)` : ''}.` : 'No healthy fallback on the bench — see Waivers.',
        });
      }
    }

    // IR-eligible players parked on the active roster
    const openIr = irSlots - l.ir.length;
    l.bench.forEach((pid) => {
      const p = P(pid);
      if (p.sl && irAllowed(p.sl) && openIr > 0) {
        out.push({ sev: 'info', tab: 'injuries', pid, title: `${p.n} can move to IR`, body: `He is tagged ${p.sl}; you have ${openIr} open IR slot${openIr > 1 ? 's' : ''}. That frees a roster spot.` });
      }
    });

    // Bench player clearly better than a healthy starter
    swaps()
      .filter((s) => !s.empty && s.band !== 'hard' && s.gap >= 4)
      .forEach((s) => out.push({ sev: 'warn', tab: 'lineup', title: `Start ${P(s.start).n} over ${P(s.bench).n}`, body: `${val(s.start).toFixed(1)} vs ${val(s.bench).toFixed(1)} projected.` }));

    // Upcoming byes for starters (next two weeks)
    for (const wk of [W + 1, W + 2]) {
      const hit = lineup(me).opt.slots.map((s) => s.pid).filter(Boolean).filter((id) => isBye(P(id).team, wk));
      if (hit.length) out.push({ sev: 'info', tab: 'waivers', title: `Week ${wk} byes: ${hit.map((id) => P(id).n).join(', ')}`, body: 'Plan cover now — see the bye look-ahead on Waivers.' });
    }

    const order = { critical: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.sev] - order[b.sev]);
  }

  // ---------- injuries ----------
  function injuryRows() {
    const l = lineup(me);
    const rows = [];
    for (const pid of me.players) {
      const p = P(pid);
      if (!p.eff && !(p.note && p.note.status && canon(p.note.status))) continue;
      const slotIdx = l.starters.indexOf(pid);
      const where = slotIdx >= 0 ? 'starter' : l.ir.includes(pid) ? 'ir' : 'bench';
      const slot = slotIdx >= 0 ? slotNames[slotIdx] : null;
      const fb = where === 'starter' ? fallbackFor(slot) : null;
      const verdict = p.avail === 'bye' ? 'Bye week' : p.eff === 'IR' || p.eff === 'PUP' || p.eff === 'Sus' ? 'Multi-week' : p.effSev >= 3 ? 'Out this week' : p.effSev === 2 ? 'Game-time decision' : 'Playing';
      const starterLevel = l.opt.slots.some((s) => s.pid === pid) || (p.ppg || 0) >= 10;
      let action;
      if (where === 'ir') {
        action = irAllowed(p.sl) ? (starterLevel ? { t: 'Hold on IR', d: 'Starter-level — hold however long the absence.' } : { t: 'Hold on IR', d: 'Cut only if out 4+ weeks and you need the IR slot.' }) : { t: 'Move off IR now', d: 'Tag is no longer IR-eligible; this locks adds and claims.', bad: true };
      } else if (where === 'starter' && p.effSev >= 3) {
        action = { t: 'Bench him', d: fb ? `Start ${P(fb).n} (${val(fb).toFixed(1)} projected).` : 'No healthy replacement — claim one.', bad: true };
      } else if (where === 'starter' && p.effSev === 2) {
        action = { t: 'Conditional start', d: fb ? `Start ${lastName(p.n)} if active; otherwise ${P(fb).n}.` : 'No fallback on bench — claim one.' };
      } else if (where === 'bench' && p.sl && irAllowed(p.sl) && irSlots - l.ir.length > 0) {
        action = { t: 'Move to IR', d: starterLevel ? 'Hold him there — starter-level.' : 'Frees a roster spot; reassess when he returns.' };
      } else if (where === 'bench' && p.effSev >= 3) {
        action = { t: 'Hold, monitor', d: 'IR is full or he is not IR-eligible.' };
      } else {
        action = { t: 'Hold, monitor', d: 'Bench stash — no lineup impact this week.' };
      }
      const checks = [];
      if (where === 'ir') {
        checks.push(`${waiverDayName()} before waivers — an upgrade off IR would lock your claims`);
      } else if (p.game && p.game.state === 'pre') {
        const kickMs = new Date(p.game.date).getTime();
        const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: snap.meta.tz }).format(new Date(now));
        if (['Mon', 'Tue', 'Wed', 'Thu'].includes(wd)) checks.push('Thursday and Friday practice reports');
        checks.push(`Inactives ~90 min before kickoff (${new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: snap.meta.tz, timeZoneName: 'short' }).format(new Date(kickMs - 90 * 60000))})`);
      }
      rows.push({ pid, p, where, slot, verdict, action, checks, next: nextManUp(pid), startsNow: where === 'starter' });
    }
    const w = { starter: 0, bench: 1, ir: 2 };
    return rows.sort((a, b) => w[a.where] - w[b.where] || b.p.effSev - a.p.effSev);
  }

  function nextManUp(pid) {
    const p = P(pid);
    if (!p.team) return [];
    const list = Object.values(snap.players).filter((q) => q.team === p.team && q.pos === p.pos && q.id !== pid && (q.depth ?? 99) > (p.depth ?? 0) && canon(q.inj) !== 'IR');
    return list
      .sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99))
      .slice(0, 2)
      .map((q) => ({ id: q.id, n: q.n, depth: q.depth, own: q.own, ownerLabel: q.own == null ? 'Free agent' : q.own === me.id ? 'on your roster' : 'rostered by ' + ownerName(q.own) }));
  }

  // ---------- simulation ----------
  const weekScores = {};
  for (const t of teams) weekScores[t.id] = [];
  for (let wk = 1; wk < W; wk++) for (const m of snap.matchups[wk] || []) if (m.pts > 0 || true) weekScores[m.rid]?.push(m.pts);

  const erf = (x) => {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  };
  const cdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

  let simCache = null;
  let profCache = null;
  function profiles() {
    if (profCache) return profCache;
    const poolSd = Math.sqrt(avg(teams.map((t) => { const s = weekScores[t.id]; const m = avg(s) || 0; return avg(s.map((x) => (x - m) ** 2)) || 0; })));
    const prof = {};
    for (const t of teams) {
      const s = weekScores[t.id].filter((x) => x > 0);
      const mean = s.length ? 0.65 * avg(s) + 0.35 * avg(s.slice(-3)) : 100;
      const m0 = avg(s) || mean;
      const v = s.length > 1 ? avg(s.map((x) => (x - m0) ** 2)) * (s.length / (s.length - 1)) : poolSd ** 2;
      const k = s.length;
      prof[t.id] = { mean, sd: Math.sqrt((k * v + 4 * poolSd ** 2) / (k + 4)) };
    }
    return (profCache = prof);
  }
  // P(team a beats team b) from each team's scoring profile (or explicit means)
  function winProb(a, b, mu = null) {
    const p = profiles();
    const ma = mu ? mu[0] : p[a].mean;
    const mb = mu ? mu[1] : p[b].mean;
    return cdf((ma - mb) / Math.sqrt(p[a].sd ** 2 + p[b].sd ** 2));
  }

  // Monte Carlo of the rest of the season. force: [{rid, wk, win}] pins results. track: roster id to trace through the bracket.
  function runSim({ n = 8000, force = [], track = null, seed = 1312204, meanAdj = {} } = {}) {
    const rand = rng(seed);
    const gauss = () => {
      let u = 0;
      while (u === 0) u = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    const prof = profiles();
    const lastReg = cfgLeague.playoff_week_start - 1;
    const sched = [];
    for (let wk = W; wk <= lastReg; wk++) {
      const ms = snap.matchups[wk] || [];
      const by = {};
      ms.forEach((m) => (by[m.mid] ||= []).push(m.rid));
      sched.push({ wk, games: Object.values(by).filter((x) => x.length === 2) });
    }
    const pcount = cfgLeague.playoff_teams || 6;
    const res = {};
    teams.forEach((t) => (res[t.id] = { playoff: 0, bye: 0, title: 0, wins: 0, seedSum: 0 }));
    const path = track
      ? { seed: Array(teams.length + 1).fill(0), r1Play: 0, r1Win: 0, r2: 0, final: 0, title: 0, opp: { 1: {}, 2: {}, 3: {} }, byWins: {} }
      : null;
    const sample = (id) => prof[id].mean + (meanAdj[id] || 0) + prof[id].sd * gauss();
    const pin = (wk, a, b) => force.find((f) => f.wk === wk && (f.rid === a || f.rid === b));
    for (let i = 0; i < n; i++) {
      const w = {};
      const pf = {};
      teams.forEach((t) => ((w[t.id] = t.w + t.t * 0.5), (pf[t.id] = t.pf)));
      for (const wkRow of sched)
        for (const [a, b] of wkRow.games) {
          let sa = sample(a);
          let sb = sample(b);
          const f = pin(wkRow.wk, a, b);
          if (f) {
            const wantA = f.rid === a ? f.win : !f.win;
            if ((sa > sb) !== wantA) [sa, sb] = [sb, sa];
          }
          pf[a] += sa;
          pf[b] += sb;
          if (sa > sb) w[a]++;
          else w[b]++;
        }
      const order = teams.map((t) => t.id).sort((a, b) => w[b] - w[a] || pf[b] - pf[a]);
      order.forEach((id, idx) => {
        res[id].wins += w[id];
        res[id].seedSum += idx + 1;
        if (idx < pcount) res[id].playoff++;
        if (idx < 2) res[id].bye++;
      });
      if (path) {
        const idx = order.indexOf(track);
        path.seed[idx + 1]++;
        const k = String(w[track]);
        (path.byWins[k] ||= { n: 0, made: 0 }).n++;
        if (idx < pcount) path.byWins[k].made++;
      }
      const [s1, s2, s3, s4, s5, s6] = order;
      const game = (a, b, round) => {
        const wa = sample(a) > sample(b) ? a : b;
        if (path && (a === track || b === track)) {
          const opp = a === track ? b : a;
          path.opp[round][opp] = (path.opp[round][opp] || 0) + 1;
          if (round === 1) { path.r1Play++; if (wa === track) path.r1Win++; }
        }
        return wa;
      };
      if (order.length >= 6) {
        const w36 = game(s3, s6, 1);
        const w45 = game(s4, s5, 1);
        const f1 = game(s1, w45, 2);
        const f2 = game(s2, w36, 2);
        if (path) {
          if ([s1, s2, w36, w45].includes(track)) path.r2++;
          if ([f1, f2].includes(track)) path.final++;
        }
        const champ = game(f1, f2, 3);
        res[champ].title++;
        if (path && champ === track) path.title++;
      }
    }
    for (const id in res) {
      res[id].playoff /= n;
      res[id].bye /= n;
      res[id].title /= n;
      res[id].wins /= n;
      res[id].seed = res[id].seedSum / n;
    }
    return { res, prof, n, path };
  }
  function sim() {
    return (simCache ||= runSim({}));
  }
  // Change in playoff/title odds for both teams if a trade shifts their weekly scoring (common random numbers keep it stable)
  let baseOdds = null;
  function tradeOdds(partnerId, dMe, dThem, n = 4000) {
    baseOdds ||= runSim({ n, seed: 99 });
    const adj = runSim({ n, seed: 99, meanAdj: { [me.id]: dMe, [partnerId]: dThem } });
    const d = (id) => ({ playoff: adj.res[id].playoff - baseOdds.res[id].playoff, title: adj.res[id].title - baseOdds.res[id].title, after: adj.res[id].playoff });
    return { me: d(me.id), them: d(partnerId) };
  }

  // ---------- trade deadline / waiver clocks ----------
  const dl = cfgLeague.trade_deadline;
  const dlGames = snap.schedule[dl]?.games || [];
  const deadlineAt = dlGames.length ? Math.min(...dlGames.map((g) => new Date(g.date).getTime())) : null;
  const acceptBy = deadlineAt ? deadlineAt - 24 * 3600 * 1000 : null;
  const deadlinePassed = W >= dl && deadlineAt != null ? now >= deadlineAt : false;

  function nextWaiverRun() {
    // Sleeper waiver_day_of_week: 0 = Sunday ... 2 = Tuesday
    const target = cfgLeague.waiver_day_of_week ?? 2;
    const dayIdx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wd = dayIdx[new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: snap.meta.tz }).format(new Date(now))];
    const add = (target - wd + 7) % 7 || 7;
    return now + add * 86400000;
  }
  function waiverDayName() {
    try {
      return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: snap.meta.tz }).format(new Date(nextWaiverRun()));
    } catch {
      return 'waiver day';
    }
  }

  // ---------- league-wide position medians ----------
  const posVals = {};
  const profile = {};
  for (const t of teams) {
    const l = lineup(t);
    const byPos = {};
    l.opt.slots.forEach((s) => s.pid && (byPos[P(s.pid).pos] ||= []).push(val(s.pid)));
    profile[t.id] = { byPos, benchByPos: {} };
    for (const pos in byPos) (posVals[pos] ||= []).push(...byPos[pos]);
    l.bench.forEach((id) => (profile[t.id].benchByPos[P(id).pos] ||= []).push(id));
  }
  const posMedian = Object.fromEntries(Object.entries(posVals).map(([k, v]) => [k, median(v)]));

  // ---------- waivers ----------
  function lookahead() {
    const l = lineup(me);
    const rows = [];
    for (const wk of [W, W + 1, W + 2]) {
      const bye = l.active.filter((id) => isBye(P(id).team, wk));
      const starters = l.opt.slots.map((s) => s.pid).filter(Boolean);
      const hitStarters = starters.filter((id) => isBye(P(id).team, wk));
      const left = l.active.filter((id) => !isBye(P(id).team, wk));
      const o = solve(left, { v: (id) => val(id, wk === W ? W : wk === W + 1 ? W + 1 : W + 1), can: (id) => (wk === W ? canStartNow(id) : P(id).effSev < 4) });
      rows.push({ wk, hit: hitStarters, bye, total: o.total, empty: o.slots.filter((s) => !s.pid).map((s) => s.slot) });
    }
    return rows;
  }

  function addImpact(pid, wk) {
    const l = lineup(me);
    const base = solve(l.active, { v: (id) => val(id, wk), can: (id) => (wk === W ? canStartNow(id) && !P(id).locked : P(id).effSev < 4 && !isBye(P(id).team, wk)) });
    const withIt = solve([...l.active, pid], { v: (id) => val(id, wk), can: (id) => (wk === W ? canStartNow(id) && !P(id).locked : P(id).effSev < 4 && !isBye(P(id).team, wk)) });
    return withIt.total - base.total;
  }

  function dropFor(cand) {
    const l = lineup(me);
    const openSpots = maxRoster - me.players.length;
    if (openSpots > 0) return { none: true, text: `No drop needed — ${openSpots} open roster spot${openSpots > 1 ? 's' : ''} (${me.players.length}/${maxRoster})` };
    const keepers = new Set(l.opt.slots.map((s) => s.pid).filter(Boolean));
    const qbs = l.active.filter((id) => P(id).pos === 'QB');
    const tes = l.active.filter((id) => P(id).pos === 'TE');
    const pool = l.bench
      .filter((id) => !keepers.has(id))
      .filter((id) => !(P(id).pos === 'QB' && qbs.length <= 2))
      .filter((id) => !(P(id).pos === 'TE' && tes.length <= 2))
      .filter((id) => id !== cand.id)
      .sort((a, b) => Math.max(val(a), P(a).ppg || 0) - Math.max(val(b), P(b).ppg || 0));
    const d = pool[0];
    return d ? { pid: d, text: `Drop ${P(d).n}` } : { none: true, text: 'No safe drop — roster is full of needed pieces' };
  }

  const dropsRecent = {};
  const clearMs = (cfgLeague.waiver_clear_days || 2) * 86400000;
  for (const t of snap.transactions) {
    for (const pid in t.drops || {}) {
      const cur = dropsRecent[pid];
      if (!cur || t.created > cur.at) dropsRecent[pid] = { at: t.created, by: t.drops[pid], type: t.type };
    }
  }

  function waiverPlan() {
    const l = lineup(me);
    const needs = [];
    l.starters.forEach((pid, i) => {
      if (!pid) {
        const hasFix = l.bench.some((id) => canStartNow(id) && slotEligible(slotNames[i], P(id).pos));
        needs.push({ pri: 1, label: `Empty ${slotNames[i]} slot`, pos: slotNames[i], detail: hasFix ? 'A bench player can fill it — fix the lineup, no claim needed.' : 'Nobody on your roster fits.', claim: !hasFix });
      }
    });
    l.starters.filter(Boolean).forEach((pid) => {
      const p = P(pid);
      if (p.avail === 'out') needs.push({ pri: 2, label: `${p.n} is ${p.eff}`, pos: p.pos, detail: 'Starter out this week.', claim: !l.bench.some((id) => canStartNow(id) && slotEligible(slotNames[l.starters.indexOf(pid)], P(id).pos)) });
      if (p.avail === 'bye') needs.push({ pri: 3, label: `${p.n} is on bye`, pos: p.pos, detail: 'Starter on bye this week.', claim: true });
    });
    const look = lookahead();
    for (const r of look.slice(1)) {
      if (r.hit.length || r.empty.length) {
        needs.push({ pri: 3, label: `Week ${r.wk} byes: ${r.hit.map((id) => P(id).n).join(', ') || '—'}`, pos: null, detail: r.empty.length ? `Lineup would have empty ${r.empty.join(', ')} slot${r.empty.length > 1 ? 's' : ''}.` : 'Bench covers every slot.', claim: r.empty.length > 0, wk: r.wk, empty: r.empty });
      }
    }
    // thin position: weakest group vs league median
    const prof = profile[me.id];
    let hole = null;
    for (const pos of Object.keys(prof.byPos)) {
      const gap = (posMedian[pos] || 0) - avg(prof.byPos[pos]);
      if (!hole || gap > hole.gap) hole = { pos, gap };
    }
    if (hole && hole.gap > 1) needs.push({ pri: 4, label: `Thin at ${hole.pos}`, pos: hole.pos, detail: `Your ${hole.pos} starters project ${hole.gap.toFixed(1)} below the league's typical starter.`, claim: false });

    // insurance: handcuffs for my RBs (Gibbs etc.) and injured starter-level players
    const cuffTargets = [];
    for (const pid of l.active) {
      const p = P(pid);
      if (p.pos !== 'RB') continue;
      const starterLevel = l.opt.slots.some((s) => s.pid === pid) || (p.ppg || 0) >= 12;
      if (starterLevel) cuffTargets.push(pid);
    }
    for (const pid of l.ir) if (['RB'].includes(P(pid).pos)) cuffTargets.push(pid);
    const insurance = [];
    for (const pid of cuffTargets) for (const c of nextManUp(pid)) if (c.own == null) insurance.push({ cand: c.id, of: pid });
    if (insurance.length) needs.push({ pri: 5, label: 'Insurance', pos: 'RB', detail: `Handcuffs available for ${[...new Set(insurance.map((x) => lastName(P(x.of).n)))].join(', ')}.`, claim: false });
    needs.sort((a, b) => a.pri - b.pri);

    // candidate pool
    const pool = Object.values(snap.players).filter((p) => p.own == null && p.team && (p.proj || p.hist.length));
    const wantPos = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
    const cards = [];
    const nextBestImpact = (id) => addImpact(id, W + 1);
    for (const raw of pool) {
      if (!wantPos.has(raw.pos)) continue;
      const p = P(raw.id);
      if (p.effSev >= 4 && p.eff !== 'Out' && !(p.ppg >= 10)) continue;
      const impact = p.avail === 'bye' ? 0 : addImpact(raw.id, W);
      const impactNext = isBye(p.team, W + 1) ? 0 : nextBestImpact(raw.id);
      cards.push({ id: raw.id, p, impact, impactNext, rec: dropsRecent[raw.id] || null });
    }
    const used = new Set();
    const mk = (c, group, extra = {}) => ({ ...c, group, drop: dropFor(c), ...extra });

    // handcuffs
    const cuffs = [];
    for (const x of insurance) {
      const c = cards.find((k) => k.id === x.cand);
      if (c && !used.has(c.id)) {
        used.add(c.id);
        cuffs.push(mk(c, 'cuff', { of: x.of }));
      }
    }
    // proven risers
    const risers = cards
      .filter((c) => !used.has(c.id) && ['RB', 'WR', 'TE', 'QB'].includes(c.p.pos) && c.p.avail !== 'out')
      .map((c) => {
        const up = [];
        if (c.p.ppg3 != null && c.p.ppg != null && c.p.gp >= 3 && c.p.ppg3 >= 1.2 * (avg(c.p.hist.slice(0, -3).map((h) => h.pts)) || c.p.ppg) && c.p.ppg3 >= 7) up.push('scoring up');
        if (c.p.snpTrend != null && c.p.snpTrend >= 8) up.push('snaps up');
        if (c.p.trend?.add && c.p.trend.add.rank <= 20) up.push('trending add');
        if (c.impact >= 2) up.push('lineup upgrade');
        return { c, up, score: c.impact * 2 + c.impactNext + (c.p.ppg3 || 0) * 0.3 + up.length * 2 };
      })
      .filter((x) => x.up.length >= 2 || x.c.impact >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => (used.add(x.c.id), mk(x.c, 'riser', { why: x.up })));
    // lottery tickets
    const lottery = cards
      .filter((c) => !used.has(c.id) && ['RB', 'WR', 'TE'].includes(c.p.pos))
      .map((c) => {
        const why = [];
        if (c.p.trend?.add && c.p.trend.add.rank <= 40) why.push('trending add');
        if ((c.p.exp ?? 9) <= 1 && (c.p.proj || 0) >= 3) why.push('young, ascending');
        if (c.p.avail === 'out' && (c.p.ppg || 0) >= 10) why.push(`stash — ${c.p.eff}, averaged ${c.p.ppg.toFixed(1)}`);
        if (c.p.snpTrend != null && c.p.snpTrend >= 5) why.push('snaps up');
        return { c, why, score: why.length * 3 + (c.p.ppg3 || 0) * 0.3 + (c.p.trend?.add ? 40 - c.p.trend.add.rank : 0) * 0.1 };
      })
      .filter((x) => x.why.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => (used.add(x.c.id), mk(x.c, 'lottery', { why: x.why })));

    const streamsFor = (pos) =>
      cards
        .filter((c) => c.p.pos === pos)
        .sort((a, b) => b.p.proj + (b.p.projNext || 0) * 0.5 - (a.p.proj + (a.p.projNext || 0) * 0.5))
        .slice(0, 4)
        .map((c) => mk(c, 'stream'));
    const streams = { DEF: streamsFor('DEF'), K: streamsFor('K') };

    const all = [...risers, ...lottery, ...cuffs];
    const openIr = irSlots - l.ir.length;
    all.forEach((c) => (c.tier = tierFor(c, openIr)));
    streams.DEF.concat(streams.K).forEach((c) => (c.tier = tierFor(c, openIr)));

    const rivalDrops = [];
    for (const c of cards) {
      if (!c.rec || c.rec.by === me.id) continue;
      if (now - c.rec.at > 7 * 86400000) continue;
      if (!(c.p.ppg >= 6 || c.p.proj >= 6)) continue;
      rivalDrops.push({ ...c, inClear: now - c.rec.at < clearMs, clearsAt: c.rec.at + clearMs });
    }
    rivalDrops.sort((a, b) => (b.p.ppg || 0) - (a.p.ppg || 0));

    const tier1 = all.filter((c) => c.tier === 1);
    return {
      needs,
      look,
      groups: { risers, lottery, cuffs },
      streams,
      rivalDrops: rivalDrops.slice(0, 8),
      tier1,
      noNeed: needs.filter((n) => n.claim).length === 0,
      open: { spots: maxRoster - me.players.length, ir: irSlots - l.ir.length, max: maxRoster },
      wp: me.wp,
      locked: l.ir.some((id) => !irAllowed(P(id).sl)),
    };
  }

  function tierFor(c, openIr = 0) {
    if (c.group === 'cuff' || c.group === 'stream') return 4;
    if (c.p.avail === 'out' && (c.p.ppg || 0) >= 10 && openIr > 0) return 2;
    const takeover = c.p.depth === 1 && c.p.pos === 'RB' && (c.p.ppg3 || 0) >= 12;
    if (c.impact >= 3 || takeover) return 1;
    if (c.impact >= 1 || (c.group === 'lottery' && (c.p.exp ?? 9) <= 1)) return 2;
    return 3;
  }

  // ---------- trades ----------
  const odds = () => sim().res;
  function needScore(t, pos) {
    const p = profile[t.id];
    const vals = p.byPos[pos] || [];
    if (!vals.length) return 12;
    const l = lineup(t);
    const outStarter = l.starters.some((id) => id && P(id).pos === pos && P(id).avail === 'out') ? 6 : 0;
    return (posMedian[pos] || 0) - avg(vals) + outStarter;
  }
  function marketFor() {
    const l = lineup(me);
    const o = odds();
    const myNeeds = ['QB', 'RB', 'WR', 'TE']
      .map((pos) => ({ pos, score: needScore(me, pos) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    const optSet = new Set(l.opt.slots.map((s) => s.pid));
    const surplus = l.active
      .filter((id) => !optSet.has(id))
      .filter((id) => !P(id).missing && ['QB', 'RB', 'WR', 'TE'].includes(P(id).pos) && val(id) >= (posMedian[P(id).pos] || 99) - 1 && P(id).avail !== 'out')
      .map((id) => ({ id, v: val(id) }))
      .sort((a, b) => b.v - a.v);
    const sellers = teams.filter((t) => t.id !== me.id && o[t.id].playoff < 0.3).map((t) => t.id);
    const rows = [];
    for (const s of surplus) {
      const sp = P(s.id);
      for (const t of teams) {
        if (t.id === me.id) continue;
        const need = needScore(t, sp.pos);
        const tl = lineup(t);
        const weakest = tl.opt.slots.filter((x) => x.pid && P(x.pid).pos === sp.pos).sort((a, b) => a.v - b.v)[0];
        const gain = weakest ? s.v - weakest.v : s.v;
        const hurt = tl.starters.some((id) => id && P(id).pos === sp.pos && P(id).avail === 'out');
        if (gain >= 2 || hurt) rows.push({ give: s.id, team: t, gain, hurt, need, buyer: o[t.id].playoff >= 0.3 });
      }
    }
    rows.sort((a, b) => (b.hurt - a.hurt) || b.gain - a.gain);
    const targets = [];
    for (const n of myNeeds) {
      const mine = (profile[me.id].byPos[n.pos] || []).slice().sort((a, b) => a - b)[0] ?? 0;
      for (const t of teams) {
        if (t.id === me.id) continue;
        const tl = lineup(t);
        for (const id of t.players) {
          const p = P(id);
          if (p.pos !== n.pos || p.avail === 'out' || p.missing) continue;
          const inTheirLineup = tl.opt.slots.some((s) => s.pid === id);
          const v = val(id);
          if (v < mine + 2) continue;
          const theirNeedAfter = needScore(t, n.pos);
          targets.push({ need: n.pos, id, team: t, v, gainMe: v - mine, bench: !inTheirLineup, seller: sellers.includes(t.id), theirNeed: theirNeedAfter });
        }
      }
    }
    const plausible = targets.filter((t) => t.bench || t.seller).sort((a, b) => (b.bench - a.bench) + (b.seller - a.seller) * 0.5 || b.gainMe - a.gainMe);
    return { myNeeds, surplus, rows: rows.slice(0, 8), targets: plausible.slice(0, 8), sellers };
  }

  function evalTrade(partnerId, give, get) {
    const partner = teamBy[partnerId];
    const mk = (t, out, inn) => {
      const pids = t.players.filter((id) => !out.includes(id)).concat(inn);
      const act = pids.filter((id) => !t.reserve.includes(id) || inn.includes(id));
      const before = lineup(t).opt.total;
      const after = solve(act.filter((id) => !(t.reserve.includes(id) && !inn.includes(id))), { can: (id) => canStartNow(id) && !P(id).locked }).total;
      return { before, after, delta: after - before };
    };
    const mine = mk(me, give, get);
    const theirs = mk(partner, get, give);
    return { mine, theirs, partner, rosterAfter: me.players.length - give.length + get.length, rosterMax: maxRoster };
  }

  function tradeLog() {
    return snap.transactions.filter((t) => t.type === 'trade').sort((a, b) => b.created - a.created);
  }

  function picksOwned(rid) {
    const maxRound = cfgLeague.draft_rounds || 3;
    const out = { own: [], acquired: [], sold: [] };
    const seasons = [...new Set((snap.picks || []).map((p) => Number(p.season)))].filter((s) => s > Number(snap.meta.season)).sort();
    for (const s of seasons.length ? seasons : [Number(snap.meta.season) + 1]) {
      for (let r = 1; r <= maxRound; r++) {
        const traded = (snap.picks || []).find((p) => Number(p.season) === s && p.round === r && p.roster_id === rid);
        if (!traded || traded.owner_id === rid) out.own.push({ season: s, round: r });
        else out.sold.push({ season: s, round: r, to: traded.owner_id });
      }
    }
    for (const p of snap.picks || []) if (p.owner_id === rid && p.roster_id !== rid && p.round <= maxRound && Number(p.season) > Number(snap.meta.season)) out.acquired.push({ season: Number(p.season), round: p.round, from: p.roster_id });
    return out;
  }

  // ---------- season / review ----------
  function optimalPast(m) {
    const pids = m.players || [];
    const pp = m.pp || {};
    return solve(pids, { v: (id) => pp[id] || 0, can: () => true });
  }
  function reviewWeek(wk) {
    const ms = snap.matchups[wk] || [];
    const by = {};
    ms.forEach((m) => (by[m.mid] ||= []).push(m));
    return Object.values(by).map((pair) => pair.map((m) => ({ ...m, team: teamBy[m.rid], opt: optimalPast(m).total, lines: m })));
  }
  function efficiency(t) {
    const rows = [];
    for (let wk = 1; wk < W; wk++) {
      const m = (snap.matchups[wk] || []).find((x) => x.rid === t.id);
      if (!m) continue;
      const opt = optimalPast(m).total;
      rows.push({ wk, pts: m.pts, opt });
    }
    return rows;
  }

  function wireItems() {
    const items = [];
    const name = (pid) => P(pid).n;
    for (const t of snap.transactions) {
      const who = t.rids.map(ownerName).join(' & ');
      if (t.type === 'trade') {
        const moves = {};
        for (const pid in t.adds || {}) (moves[t.adds[pid]] ||= []).push(name(pid));
        for (const pk of t.picks) (moves[pk.to] ||= []).push(`${pk.season} R${pk.r}`);
        const parts = Object.keys(moves).map((rid) => `${ownerName(Number(rid))} gets ${moves[rid].join(', ')}`);
        items.push({ time: t.created, kind: 'trade', text: parts.join(' · '), rids: t.rids, mine: t.rids.includes(me.id) });
      } else {
        const adds = Object.keys(t.adds || {}).map(name);
        const drops = Object.keys(t.drops || {}).map(name);
        if (!adds.length && !drops.length) continue;
        const txt = `${who}${adds.length ? ' added ' + adds.join(', ') : ''}${adds.length && drops.length ? ' and' : ''}${drops.length ? ' dropped ' + drops.join(', ') : ''}`;
        items.push({ time: t.created, kind: adds.length ? 'add' : 'drop', text: txt, rids: t.rids, mine: t.rids.includes(me.id), pids: [...Object.keys(t.adds || {}), ...Object.keys(t.drops || {})] });
      }
    }
    return items.sort((a, b) => b.time - a.time);
  }

  const M = {
    snap, now, W, me, opp, teams, teamBy, L, slotNames, maxRoster, irSlots,
    P, val, solve, lineup, canStartNow, slotEligible,
    posture, margin, myOpt, oppOpt,
    swaps, startSit, tiebreakFor: tiebreak, problems, injuryRows, fallbackFor, nextManUp, irAllowed,
    addImpact, sim, runSim, tradeOdds, winProb, profiles, odds, waiverPlan, lookahead, marketFor, evalTrade, tradeLog, picksOwned,
    reviewWeek, efficiency, wireItems, optimalPast,
    deadlineAt, acceptBy, deadlinePassed, deadlineWeek: dl, nextWaiverRun, waiverDayName,
    ownerName, chipOwner, lastName, gameFor, isBye, weekScores, posMedian, profile, dayLabel, kick,
  };
  let _V = null;
  Object.defineProperty(M, 'V', { get: () => (_V ||= buildValues(M)) });
  return M;
}
