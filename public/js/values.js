// League-adjusted player values.
// points/game (blend of projection + recent form) x games left (byes) x health,
// measured against replacement level for THIS league: its scoring, its lineup slots, its 10 teams.
import { avg, sum } from './util.js';
import { rosHealth, xpGame, VALUE_USAGE_WEIGHT, NEXT4, BUY_SELL_GAP, PICK_POINTS, keepShare } from './fitted.js';

// How much a playoff week counts next to a regular-season week for a team certain to be in it.
// Three games decide the title; a judgment, not a fitted number.
const PLAYOFF_WEEK_WEIGHT = 1.5;

export function buildValues(M) {
  const { snap, W, L } = M;
  const finalWeek = L.settings.playoff_week_start + 2;
  const regEnd = L.settings.playoff_week_start - 1;
  // Weeks 15-17 only matter to a team that gets there: weight them by that team's playoff chance.
  // (They used to count 0.6 for everyone, contender or not.)
  const weeksCache = {};
  let oddsCache;
  const playoffChance = (rid) => {
    if (oddsCache === undefined) {
      try {
        oddsCache = M.odds();
      } catch {
        oddsCache = null;
      }
    }
    return oddsCache?.[rid]?.playoff ?? 0.4;
  };
  const weeksFor = (rid = M.me.id) => {
    if (weeksCache[rid]) return weeksCache[rid];
    const pw = PLAYOFF_WEEK_WEIGHT * playoffChance(rid);
    const out = [];
    for (let wk = W; wk <= finalWeek; wk++) out.push({ wk, w: wk <= regEnd ? 1 : pw });
    return (weeksCache[rid] = out);
  };
  const weeks = weeksFor(M.me.id);

  const gamesCache = {};
  const games = (team, rid = M.me.id) => {
    if (!team) return 0;
    return (gamesCache[team + '|' + rid] ??= sum(weeksFor(rid).map((x) => (M.isBye(team, x.wk) ? 0 : x.w))));
  };
  // Team games missed in a row up to now (from the last six weeks of results in the snapshot).
  const missedGames = (pid) => {
    const p = M.P(pid);
    const res = snap.results || {};
    const played = new Set((p.hist || []).map((h) => h.w));
    let k = 0;
    for (let wk = W - 1; wk >= 1 && res[wk]; wk--) {
      if (!res[wk][p.team]) continue; // bye
      if (played.has(wk)) break;
      k++;
    }
    return k;
  };
  // Share of the remaining games he is likely to play, times how he scores when back (backtest E11).
  const avail = (pid) => {
    const p = M.P(pid);
    return p.eff ? rosHealth(p.eff, missedGames(pid)) : 1;
  };
  // Points his usage normally produces, per game (null when the snapshot carries no usage detail).
  const usagePpg = (pid, n = 99) => {
    const p = M.P(pid);
    const h = (p.hist || []).slice(-n);
    if (!h.length || !h.some((x) => x.air !== undefined || x.passAtt !== undefined)) return null;
    const v = h.map((x) => xpGame(p.pos, x)).filter((x) => x != null);
    return v.length ? avg(v) : null;
  };

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
    // Half results, half usage: this beat the results-only blend at every position on 2025 (E11).
    const xp = g >= 3 ? usagePpg(pid) : null;
    if (xp != null && est) est = (1 - VALUE_USAGE_WEIGHT) * est + VALUE_USAGE_WEIGHT * xp;
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

  // Buy / hold / sell: is he scoring above or below what his usage supports? (backtest E12)
  function signal(pid) {
    const p = M.P(pid);
    const m = NEXT4[p.pos];
    const last = (p.hist || []).slice(-4);
    if (!m || last.length < 4 || !last.some((x) => x.air !== undefined || x.passAtt !== undefined)) return null;
    const T = avg(last.map((h) => h.pts));
    const X = avg(last.map((h) => xpGame(p.pos, h)));
    if (T < 6 && X < 6) return null;
    const next = m.a + m.t * T + m.x * X;
    const gap = T - X;
    const tag = gap >= BUY_SELL_GAP ? 'Sell' : gap <= -BUY_SELL_GAP ? 'Buy' : 'Hold';
    const why = tag === 'Sell'
      ? `Scoring ${T.toFixed(1)} a game on usage that normally produces ${X.toFixed(1)}. Players this far above their usage gave back about 4 a game over the next month; expect about ${next.toFixed(1)}.`
      : tag === 'Buy'
        ? `Scoring ${T.toFixed(1)} a game on usage that normally produces ${X.toFixed(1)}. Players this far below their usage gained 1-4 a game over the next month; expect about ${next.toFixed(1)}.`
        : `Scoring ${T.toFixed(1)} a game, in line with his usage (${X.toFixed(1)}). Expect about ${next.toFixed(1)} over the next month.`;
    return { tag, last4: T, usage: X, next, gap, why };
  }
  // Draft picks and keepers, in the same 0-100 units as player values. A pick is next season's
  // points above replacement from this league's own drafts (E15), discounted a fifth for the wait.
  const PICK_DISCOUNT = 0.8;
  const seasonWeeks = regEnd; // regular-season weeks a pick or keeper helps in next year
  const toValue = (pointsAboveRep) => Math.round((pointsAboveRep / maxV) * 1000) / 10;
  const pickValue = (round) => (PICK_POINTS[round] ? toValue(PICK_POINTS[round] * PICK_DISCOUNT) : 0);
  // A keeper is worth what he should score above replacement next year (age-adjusted), less the
  // first-round pick he takes the place of.
  function keeperValue(pid) {
    const p = M.P(pid);
    const r = by[pid];
    if (!r || !PICK_POINTS[1]) return null;
    const next = Math.max(0, r.ppg * keepShare(p.pos, p.age) - (rep[p.pos] || 0)) * seasonWeeks;
    return { points: Math.round(next), share: keepShare(p.pos, p.age), net: Math.round(next - PICK_POINTS[1]), value: toValue(Math.max(0, next - PICK_POINTS[1]) * PICK_DISCOUNT) };
  }

  const V = {
    rows, by, rep, games, finalWeek, weeksFor, missedGames, usagePpg, signal, pickValue, keeperValue, playoffChance,
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
      return M.solve(ids, { v: (id) => ppg(id) * avail(id), can: (id) => !M.P(id).missing }).total;
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
      return M.solve(ids, { v: (id) => ppg(id) * avail(id), can: (id) => !M.P(id).missing });
    },
    // points over the rest of the season: best lineup each remaining week, byes removed, playoff weeks discounted
    rosLineup(t, extra = [], remove = []) {
      const l = M.lineup(t);
      const rm = new Set(remove);
      const ids = l.active.filter((id) => !rm.has(id)).concat(extra);
      let tot = 0;
      for (const { wk, w } of weeksFor(t.id)) {
        const ok = ids.filter((id) => !M.isBye(M.P(id).team, wk));
        tot += w * M.solve(ok, { v: (id) => ppg(id) * avail(id), can: (id) => !M.P(id).missing }).total;
      }
      return tot;
    },
    sum: (ids) => sum(ids.map((id) => by[id]?.value ?? 0)),
    tsum: (ids) => sum(ids.map((id) => (by[id]?.value ?? 0) + 0.4 * (by[id]?.ppg ?? 0))),
  };
  return V;
}
