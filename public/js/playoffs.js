// Playoff tools: who to root for, scouting your playoff opponent, and the live game-day read.
// Pure functions over the model (M) so they can be tested without a browser.
import { WIN } from './fitted.js';

const erf = (x) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const cdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// ---------- who to root for ----------
// One simulation run with `track` records, for every other team's game left in the regular season,
// how often you make the playoffs when each side wins. The difference is how much that game
// matters to you. Read from the same simulated seasons, so no game is pinned or forced.
export const ROOT_PER_WEEK = 3;
export const ROOT_MIN = 0.01; // games that move your odds by less than 1 point are left out

export function rooting(M, base) {
  const me = M.me.id;
  const p = base.path;
  const games = Object.values(p?.games || {})
    .map((g) => {
      const nA = g.aWin;
      const nB = base.n - g.aWin;
      if (nA < 50 || nB < 50) return null; // one side almost never wins: no stable read
      const pA = g.madeA / nA;
      const pB = g.madeB / nB;
      const want = pA >= pB ? g.a : g.b;
      const other = want === g.a ? g.b : g.a;
      return { wk: g.wk, want, other, swing: Math.abs(pA - pB), ifWant: Math.max(pA, pB), ifOther: Math.min(pA, pB), wantChance: want === g.a ? nA / base.n : nB / base.n };
    })
    .filter((g) => g && g.swing >= ROOT_MIN)
    .sort((a, b) => a.wk - b.wk || b.swing - a.swing)
    // the three that matter most each week
    .filter((g, i, all) => all.slice(0, i).filter((x) => x.wk === g.wk).length < ROOT_PER_WEEK);
  // points-for tiebreak
  const pfRank = [...M.teams].sort((a, b) => b.pf - a.pf).findIndex((t) => t.id === me) + 1;
  const tie = p?.tie || { n: 0, made: 0 };
  return { games, tie: { share: tie.n / base.n, won: tie.n ? tie.made / tie.n : null }, pfRank };
}

// ---------- scouting your playoff opponent ----------
// Which round you most likely play first (wild card, or the semifinal on a bye), the teams you
// most likely meet there, their best lineup that week, their weak spots, and free agents that
// would help them most: grab one with a spare bench spot and they can't have him.
export const BLOCK_MIN = 1.5; // points the pickup adds to their lineup that week

export function playoffWeeks(M) {
  const start = M.L.settings.playoff_week_start || 15;
  const w = M.snap.meta.playoffWeeks;
  return Array.isArray(w) && w.length ? w : [start, start + 1, start + 2];
}

export function scout(M, base) {
  const V = M.V;
  const start = M.L.settings.playoff_week_start || 15;
  let opps;
  let wk;
  let round;
  if (M.W >= start) {
    // in the playoffs: Sleeper already says who you play
    if (!M.opp) return null;
    wk = M.W;
    round = M.W - start + 1;
    opps = [{ t: M.opp, share: 1 }];
  } else {
    const p = base.path;
    if (!p) return null;
    // seeds 1-2 skip the wild card; scout the round you most often play first
    round = p.r1Play >= (p.seed[1] || 0) + (p.seed[2] || 0) ? 1 : 2;
    wk = start + round - 1;
    const counts = p.opp[round] || {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return null;
    opps = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([rid, c]) => ({ t: M.teamBy[rid], share: c / total }));
  }
  // league average for each starting slot that week, from every team's best lineup
  const plans = Object.fromEntries(M.teams.map((t) => [t.id, V.weekPlan(t, wk)]));
  const slotAvg = M.slotNames.map((_, i) => {
    const vals = M.teams.map((t) => plans[t.id].slots[i]?.v || 0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const fas = Object.values(M.snap.players).filter((p) => p.own == null && p.team && !M.isBye(p.team, wk)).map((p) => p.id);
  const myPlan = plans[M.me.id];
  const out = opps.map(({ t, share }) => {
    const plan = plans[t.id];
    const weak = plan.slots
      .map((s, i) => ({ slot: s.slot, pid: s.pid, v: s.v, avg: slotAvg[i] }))
      .filter((s) => s.v < 0.8 * s.avg);
    const blocks = [];
    for (const id of fas) {
      const pts = V.weekPts(id, wk);
      if (!(pts > 0)) continue;
      const gain = V.weekPlan(t, wk, [id]).total - plan.total;
      if (gain < BLOCK_MIN) continue;
      const mine = V.weekPlan(M.me, wk, [id]).total - myPlan.total;
      blocks.push({ id, gain, mine, pts });
    }
    blocks.sort((a, b) => b.gain - a.gain);
    // their starting backs' handcuffs still on waivers: a stash that only matters if the starter goes down
    const cuffs = [];
    for (const s of plan.slots) {
      if (!s.pid || M.P(s.pid).pos !== 'RB') continue;
      for (const c of M.nextManUp(s.pid).slice(0, 1)) if (c.own == null) cuffs.push({ id: c.id, of: s.pid });
    }
    return { t, share, total: plan.total, weak, blocks: blocks.slice(0, 5), cuffs };
  });
  return { wk, round, myTotal: myPlan.total, opps: out };
}

// ---------- live game-day ----------
// How much of a player's game is left: 1 before kickoff, 0 when it's over, otherwise the share of
// the 60 minutes still to play (overtime counts as nothing left).
export function gameLeft(g) {
  if (!g) return 0;
  if (g.completed || g.state === 'post') return 0;
  if (g.state !== 'in') return 1;
  const q = Number(g.period) || 1;
  if (q > 4) return 0;
  const clock = Number.isFinite(g.clock) ? g.clock : 450;
  return Math.max(0, Math.min(1, ((4 - q) * 900 + clock) / 3600));
}

// One side of a live matchup: points so far, what's still to come, and who's left.
function side(M, rid, mu) {
  const t = M.teamBy[rid];
  const starters = (mu?.starters || t.starters || []).map((id) => (id && id !== '0' ? id : null));
  const rows = starters.map((pid, i) => {
    if (!pid) return { slot: M.slotNames[i], pid: null, pts: 0, left: 0, rem: 0, proj: 0, state: 'empty' };
    const p = M.P(pid);
    const g = p.game;
    const pts = mu?.pp?.[pid] ?? 0;
    const left = p.bye ? 0 : gameLeft(g);
    // before kickoff an Out player is worth nothing; once his game starts Sleeper's points tell
    const full = g && g.state === 'pre' ? M.val(pid) : p.proj || 0;
    const rem = full * left;
    const state = !g || p.bye ? 'bye' : g.completed || g.state === 'post' ? 'done' : g.state === 'in' ? 'live' : 'pre';
    return { slot: M.slotNames[i], pid, pts, left, rem, proj: full, state, out: state === 'pre' && p.avail === 'out' };
  });
  const pts = mu?.pts ?? rows.reduce((a, r) => a + r.pts, 0);
  return {
    t,
    rows,
    pts,
    rem: rows.reduce((a, r) => a + r.rem, 0),
    full: rows.reduce((a, r) => a + r.proj, 0),
    toPlay: rows.filter((r) => r.state === 'pre').length,
    playing: rows.filter((r) => r.state === 'live').length,
  };
}

// Win chance from here: projected finish gap, with the fitted lineup spread (WIN.lineupSd) shrunk
// by how much of the projected scoring is still to come.
export function liveChance(a, b) {
  const gap = a.pts + a.rem - (b.pts + b.rem);
  const fullBoth = a.full + b.full;
  const share = fullBoth > 0 ? (a.rem + b.rem) / fullBoth : 0;
  const sd = WIN.lineupSd * Math.sqrt(Math.max(0, Math.min(1, share)));
  if (sd < 0.5) return gap > 0 ? 1 : gap < 0 ? 0 : 0.5;
  return cdf(gap / sd);
}

export function live(M) {
  const ms = M.snap.matchups[M.W] || [];
  const mine = ms.find((m) => m.rid === M.me.id);
  const theirs = M.opp ? ms.find((m) => m.rid === M.opp.id) : null;
  const a = side(M, M.me.id, mine);
  const b = M.opp ? side(M, M.opp.id, theirs) : null;
  const chance = b ? liveChance(a, b) : null;
  // starters ruled out whose game hasn't started: swap them now
  const swaps = [];
  const l = M.lineup(M.me);
  const used = new Set(a.rows.map((r) => r.pid).filter(Boolean));
  for (const r of a.rows) {
    if (!r.out) continue;
    const pick = l.bench
      .filter((id) => !used.has(id) && M.slotEligible(r.slot, M.P(id).pos) && !M.P(id).locked && M.canStartNow(id) && M.val(id) > 0)
      .sort((x, y) => M.val(y) - M.val(x))[0];
    if (pick) used.add(pick);
    swaps.push({ out: r.pid, slot: r.slot, inn: pick || null });
  }
  // every matchup in the league this week, with its live chance
  const byMid = {};
  for (const m of ms) if (m.mid != null) (byMid[m.mid] ||= []).push(m);
  const league = Object.values(byMid)
    .filter((x) => x.length === 2)
    .map(([x, y]) => {
      const sx = side(M, x.rid, x);
      const sy = side(M, y.rid, y);
      return { a: sx, b: sy, chance: liveChance(sx, sy) };
    });
  const started = a.rows.some((r) => r.state === 'live' || r.state === 'done') || (b && b.rows.some((r) => r.state === 'live' || r.state === 'done'));
  const inProgress = Object.values(M.snap.schedule[M.W]?.games || []).some((g) => g.state === 'in');
  return { me: a, opp: b, chance, swaps, league, started, inProgress, need: b ? b.pts + b.rem - a.pts : null };
}
