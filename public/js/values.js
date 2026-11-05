// League-adjusted player values.
// points/game (blend of projection + recent form) x games left (byes) x health,
// measured against replacement level for THIS league: its scoring, its lineup slots, its 10 teams.
import { avg, sum } from './util.js';

const AVAIL = { IR: 0.5, PUP: 0.5, Sus: 0.5, NA: 0.5, DNR: 0.5, COV: 0.5, Out: 0.85, Doubtful: 0.92, Questionable: 0.97 };

export function buildValues(M) {
  const { snap, W, L } = M;
  const finalWeek = L.settings.playoff_week_start + 2;
  const regEnd = L.settings.playoff_week_start - 1;
  const weeks = [];
  for (let wk = W; wk <= finalWeek; wk++) weeks.push({ wk, w: wk <= regEnd ? 1 : 0.6 });

  const gamesCache = {};
  const games = (team) => {
    if (!team) return 0;
    return (gamesCache[team] ??= sum(weeks.map((x) => (M.isBye(team, x.wk) ? 0 : x.w))));
  };
  const avail = (pid) => AVAIL[M.P(pid).eff] ?? 1;

  // Position peaks from the ff-ml-projections methodology; RBs decline faster after theirs.
  const PEAK = { QB: 30.5, RB: 24.5, WR: 27, TE: 27.5, K: 30, DEF: 99 };
  const ageFactor = (pos, age) => {
    if (!age || pos === 'K' || pos === 'DEF') return 1;
    const d = age - (PEAK[pos] || 27);
    return d > 0 ? Math.max(0.5, 1 - (pos === 'RB' ? 0.07 : 0.04) * d) : Math.min(1.1, 1 + 0.02 * Math.min(3, -d));
  };
  // typical starter ppg by position: prior for players with little history
  const prior = {};
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
    const xs = Object.values(snap.players).filter((p) => p.pos === pos && p.own != null && p.proj?.pts > 0).map((p) => p.proj.pts);
    prior[pos] = xs.length ? sum(xs) / xs.length : 8;
  }
  const rawPpg = {};
  function ppgRaw(pid) {
    const p = M.P(pid);
    if (p.missing) return 0;
    const proj = p.proj > 0 && p.effSev < 3 ? p.proj : 0;
    const g = p.gp || 0;
    let hist = null;
    if (g > 0) hist = g >= 4 && p.ppg3 != null ? 0.5 * p.ppg3 + 0.5 * p.ppg : p.ppg;
    let est;
    if (hist != null && proj > 0) {
      // shrink small samples toward the projection (opportunity-adjusted prior), then keep some projection weight
      const w = g / (g + 3);
      est = 0.65 * (w * hist + (1 - w) * proj) + 0.35 * proj;
    } else if (hist != null) {
      est = (g * hist + 3 * (prior[p.pos] || 8)) / (g + 3);
    } else est = proj;
    return est || 0;
  }
  // hard sanity bound: nobody projects past 110% of the best established player at his position
  const cap = {};
  for (const p of Object.values(snap.players)) {
    const q = M.P(p.id);
    if (!q.missing && (q.gp || 0) >= 4) cap[q.pos] = Math.max(cap[q.pos] || 0, ppgRaw(p.id));
  }
  function ppg(pid) {
    if (rawPpg[pid] != null) return rawPpg[pid];
    const p = M.P(pid);
    let v = ppgRaw(pid);
    if (cap[p.pos]) v = Math.min(v, cap[p.pos] * 1.1);
    return (rawPpg[pid] = v);
  }

  // replacement level: fill every team's starting slots league-wide, replacement = best player left
  const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const nTeams = M.teams.length;
  const slotCount = {};
  let flexSlots = 0;
  for (const s of M.slotNames) {
    if (POS.includes(s)) slotCount[s] = (slotCount[s] || 0) + 1;
    else flexSlots++;
  }
  const byPos = {};
  const all = Object.values(snap.players).filter((p) => !M.P(p.id).missing);
  for (const pos of POS) byPos[pos] = all.filter((p) => p.pos === pos).map((p) => ({ id: p.id, v: ppg(p.id) })).sort((a, b) => b.v - a.v);
  const taken = {};
  for (const pos of POS) taken[pos] = (slotCount[pos] || 0) * nTeams;
  const flexPool = [];
  for (const pos of ['RB', 'WR', 'TE']) byPos[pos].slice(taken[pos]).forEach((x) => flexPool.push({ ...x, pos }));
  flexPool.sort((a, b) => b.v - a.v).slice(0, flexSlots * nTeams).forEach((x) => taken[x.pos]++);
  const rep = {};
  for (const pos of POS) rep[pos] = byPos[pos][taken[pos]]?.v ?? 0;

  const rows = [];
  for (const p of all) {
    const g = games(p.team);
    const a = avail(p.id);
    const pg = ppg(p.id);
    const ros = pg * g * a;
    const vorp = Math.max(0, (pg - (rep[p.pos] || 0)) * g * a);
    rows.push({ pid: p.id, pos: p.pos, ppg: pg, games: g, avail: a, ros, vorp });
  }
  const maxV = Math.max(...rows.map((r) => r.vorp), 1);
  rows.forEach((r) => (r.value = Math.round((r.vorp / maxV) * 1000) / 10));
  rows.sort((a, b) => b.vorp - a.vorp);
  const by = {};
  rows.forEach((r, i) => ((r.rank = i + 1), (by[r.pid] = r)));
  const posCount = {};
  rows.forEach((r) => ((posCount[r.pos] = (posCount[r.pos] || 0) + 1), (r.posRank = posCount[r.pos])));

  const V = {
    rows, by, rep, games, finalWeek,
    ppg: (pid) => by[pid]?.ppg ?? ppg(pid),
    avail,
    value: (pid) => by[pid]?.value ?? 0,
    // trade value: league-adjusted value plus a small credit for useful-but-replaceable starters
    tv: (pid) => (by[pid]?.value ?? 0) + 0.4 * (by[pid]?.ppg ?? 0),
    vorp: (pid) => by[pid]?.vorp ?? 0,
    ros: (pid) => by[pid]?.ros ?? 0,
    rank: (pid) => by[pid]?.rank ?? null,
    posRank: (pid) => by[pid]?.posRank ?? null,
    typical(t, extra = [], remove = []) {
      const l = M.lineup(t);
      const rm = new Set(remove);
      const ids = l.active.filter((id) => !rm.has(id)).concat(extra);
      return M.solve(ids, { v: (id) => ppg(id) * Math.min(1, avail(id) + 0.1), can: (id) => !M.P(id).missing }).total;
    },
    weeks,
    ageFactor: (pid) => ageFactor(M.P(pid).pos, M.P(pid).age),
    // trade value under a horizon: win-now / balanced / future (age-weighted)
    tvH(pid, h = 'now') {
      const base = (by[pid]?.value ?? 0) + 0.4 * (by[pid]?.ppg ?? 0);
      const f = ageFactor(M.P(pid).pos, M.P(pid).age);
      return h === 'future' ? base * f ** 3 : h === 'balanced' ? base * f : base;
    },
    tsumH: (ids, h = 'now') => sum(ids.map((id) => V.tvH(id, h))),
    // best lineup (slots) from the typical healthy roster, with players added/removed
    lineup(t, extra = [], remove = []) {
      const l = M.lineup(t);
      const rm = new Set(remove);
      const ids = l.active.filter((id) => !rm.has(id)).concat(extra);
      return M.solve(ids, { v: (id) => ppg(id) * Math.min(1, avail(id) + 0.1), can: (id) => !M.P(id).missing });
    },
    // points over the rest of the season: best lineup each remaining week, byes removed, playoff weeks discounted
    rosLineup(t, extra = [], remove = []) {
      const l = M.lineup(t);
      const rm = new Set(remove);
      const ids = l.active.filter((id) => !rm.has(id)).concat(extra);
      let tot = 0;
      for (const { wk, w } of weeks) {
        const ok = ids.filter((id) => !M.isBye(M.P(id).team, wk));
        tot += w * M.solve(ok, { v: (id) => ppg(id) * Math.min(1, avail(id) + 0.1), can: (id) => !M.P(id).missing }).total;
      }
      return tot;
    },
    sum: (ids) => sum(ids.map((id) => by[id]?.value ?? 0)),
    tsum: (ids) => sum(ids.map((id) => (by[id]?.value ?? 0) + 0.4 * (by[id]?.ppg ?? 0))),
  };
  return V;
}
