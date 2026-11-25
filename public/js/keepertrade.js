// Offseason trades in a keeper league: what a player or pick is worth once this season is over.
//
// After the deadline nothing a player scores this season can change hands, so the only thing a
// trade moves is next season: keeper slots and draft picks. With N keepers per team (1 here) a
// player is only worth something to a team if he would become one of its keepers, and only by
// how much he beats the keeper it already has. So the same player is worth a lot to a team with
// no keeper and nothing to a team that already keeps someone better. That difference is where
// fair, win-win offseason trades come from: a team's second keeper-quality player is dead weight
// to it and real value to a team without one.
//
// Units are the site's 0-100 player value (values.js): keeperValue(id).value (points above
// replacement next season, age-adjusted, less the first-round pick a keeper takes the place of,
// E15) and pickValue(round). A pick more than one draft away loses another tenth a year: a
// judgment, like the fifth pickValue already takes off for the wait.
import { sum } from './util.js';

export const EXTRA_YEAR = 0.9;
const MAX_PICKS_SIDE = 2;
const PICK_COST = 3; // value units: a split has to improve by this much to justify one more pick

const pickKey = (pk) => `pk:${pk.season}:${pk.round}:${pk.orig}`;
export const isPick = (key) => String(key).startsWith('pk:');

export function buildKeeperMarket(M) {
  const V = M.V;
  const nKeep = M.L.settings.max_keepers || 1;
  const season = Number(M.snap.meta.season);
  const kvCache = {};
  const kv = (id) => (kvCache[id] ??= (['K', 'DEF'].includes(M.P(id).pos) || !M.snap.players[id] ? 0 : V.keeperValue(id)?.value || 0));

  const pickVal = (pk) => V.pickValue(pk.round) * Math.pow(EXTRA_YEAR, Math.max(0, pk.season - season - 1));
  // Every pick in the next three drafts (Sleeper's trading window) and who owns it now. Sleeper's
  // traded_picks lists only picks that changed hands; every other pick is still its team's own.
  const rounds = M.L.settings.draft_rounds || 3;
  const traded = M.snap.picks || [];
  const seasons = [...new Set([season + 1, season + 2, season + 3, ...traded.map((p) => Number(p.season)).filter((x) => x > season)])].sort();
  const allPicks = [];
  for (const s of seasons) for (let r = 1; r <= rounds; r++) for (const t of M.teams) {
    const tr = traded.find((p) => Number(p.season) === s && p.round === r && p.roster_id === t.id);
    allPicks.push({ season: s, round: r, orig: t.id, owner: tr ? tr.owner_id : t.id });
  }
  const picksOf = (t) => allPicks
    .filter((p) => p.owner === t.id)
    .map((p) => ({ season: p.season, round: p.round, orig: p.orig, key: pickKey(p), v: pickVal(p) }))
    .sort((a, b) => a.season - b.season || a.round - b.round || (a.orig === t.id ? -1 : 1));
  const pickBy = {};
  const teams = M.teams.map((t) => {
    const keepers = t.players.map((id) => ({ id, v: kv(id) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const picks = picksOf(t);
    picks.forEach((p) => (pickBy[p.key] = { ...p, owner: t.id }));
    return { t, keepers, picks, slot: slotOf(keepers.map((k) => k.v)), spare: keepers[nKeep]?.v || 0, pickTotal: sum(picks.map((p) => p.v)) };
  });
  const byTeam = Object.fromEntries(teams.map((x) => [x.t.id, x]));
  function slotOf(values) {
    return sum([...values].sort((a, b) => b - a).slice(0, nKeep));
  }
  const slotFor = (t, out, inn) => slotOf(t.players.filter((id) => !out.includes(id)).concat(inn).map(kv));
  const label = (key) => {
    if (!isPick(key)) return M.P(key).n;
    const p = pickBy[key];
    return p ? `${p.season} round ${p.round}${p.orig !== p.owner ? ` (${M.ownerName(p.orig)}'s)` : ''}` : key;
  };
  const valueOf = (key) => (isPick(key) ? pickBy[key]?.v || 0 : kv(key));

  // One deal, both sides: give/get are player ids and pick keys.
  function evaluate(partnerId, give, get) {
    const me = M.me;
    const them = M.teamBy[partnerId];
    const gP = give.filter((k) => !isPick(k));
    const rP = get.filter((k) => !isPick(k));
    const gK = sum(give.filter(isPick).map(valueOf));
    const rK = sum(get.filter(isPick).map(valueOf));
    const side = (t, out, inn, kOut, kIn) => {
      const before = byTeam[t.id].slot;
      const after = slotFor(t, out, inn);
      const keepAfter = t.players.filter((id) => !out.includes(id)).concat(inn).filter((id) => kv(id) > 0).sort((a, b) => kv(b) - kv(a)).slice(0, nKeep);
      return { before, after, keeper: after - before, picks: kIn - kOut, delta: after - before + kIn - kOut, keepBefore: byTeam[t.id].keepers.slice(0, nKeep).map((k) => k.id), keepAfter };
    };
    const mine = side(me, gP, rP, gK, rK);
    const theirs = side(them, rP, gP, rK, gK);
    // Surplus: what the player movement creates for the two teams together. Picks only split it.
    const surplus = mine.keeper + theirs.keeper;
    return { partner: them, give, get, mine, theirs, surplus, gap: mine.delta - theirs.delta };
  }

  function* subsets(arr, max, start = 0, cur = []) {
    yield cur.slice();
    if (cur.length >= max) return;
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      yield* subsets(arr, max, i + 1, cur);
      cur.pop();
    }
  }

  // Pick packages that split a deal's surplus: the even split, and the most you can ask for while
  // they still come out ahead. Players stay as given; only picks move.
  function priceWithPicks(partnerId, giveP, getP) {
    const mineP = byTeam[M.me.id].picks;
    const theirP = byTeam[partnerId].picks;
    // Players fix the keeper change; picks add straight on, so price every package off one core.
    const core = evaluate(partnerId, giveP, getP);
    let fair = null;
    let ask = null;
    for (const gp of subsets(mineP, MAX_PICKS_SIDE)) {
      const gv = sum(gp.map((p) => p.v));
      for (const rp of subsets(theirP, MAX_PICKS_SIDE)) {
        if (gp.length && rp.length && gp.length + rp.length > 3) continue;
        const rv = sum(rp.map((p) => p.v));
        const me = core.mine.delta + rv - gv;
        const them = core.theirs.delta + gv - rv;
        if (me < 0 || them < 0) continue;
        const n = gp.length + rp.length;
        // Fewest picks wins a near-tie: each extra pick has to buy a real improvement in the split.
        const fScore = Math.abs(me - them) + PICK_COST * n;
        const aScore = me - PICK_COST * n;
        if (!fair || fScore < fair.s) fair = { s: fScore, gp, rp };
        if (!ask || aScore > ask.s) ask = { s: aScore, gp, rp };
      }
    }
    const full = (x) => x && evaluate(partnerId, giveP.concat(x.gp.map((p) => p.key)), getP.concat(x.rp.map((p) => p.key)));
    fair = full(fair);
    ask = full(ask);
    return { fair, ask };
  }

  // Every one-player-each-way (or player-for-picks) deal with any team that creates keeper value.
  function search({ partner = null, min = 0.5 } = {}) {
    const me = byTeam[M.me.id];
    const out = [];
    const mine = me.keepers.slice(0, nKeep + 3).map((k) => k.id);
    for (const x of teams) {
      if (x.t.id === M.me.id || (partner && x.t.id !== partner)) continue;
      const theirs = x.keepers.slice(0, nKeep + 3).map((k) => k.id);
      for (const g of [null, ...mine]) {
        for (const r of [null, ...theirs]) {
          if (!g && !r) continue;
          const core = evaluate(x.t.id, g ? [g] : [], r ? [r] : []);
          if (core.surplus < min) continue;
          const { fair, ask } = priceWithPicks(x.t.id, core.give, core.get);
          if (!fair || Math.max(fair.mine.delta, ask.mine.delta) < min) continue;
          out.push({ core, fair, ask });
        }
      }
    }
    // Best for Owen at a fair price first, then the bigger total.
    return out.sort((a, b) => b.fair.mine.delta - a.fair.mine.delta || b.core.surplus - a.core.surplus);
  }

  // A counter to an offer: keep the players, re-price with picks. If no pick package makes it work
  // for both sides, say what the players are worth to each team instead.
  function counter(partnerId, give, get) {
    const asIs = evaluate(partnerId, give, get);
    const giveP = give.filter((k) => !isPick(k));
    const getP = get.filter((k) => !isPick(k));
    const core = evaluate(partnerId, giveP, getP);
    const { fair, ask } = core.surplus >= 0 ? priceWithPicks(partnerId, giveP, getP) : { fair: null, ask: null };
    return { asIs, core, fair, ask };
  }

  // Who to call: teams with no keeper worth a first-round pick want one; teams with a spare
  // keeper-quality player can only keep one of them.
  const partners = teams
    .filter((x) => x.t.id !== M.me.id)
    .map((x) => ({ ...x, needs: x.slot < 1, hasSpare: x.spare > 0 }));

  return { nKeep, season, kv, pickVal, teams, byTeam, partners, evaluate, priceWithPicks, search, counter, label, valueOf, isPick };
}
