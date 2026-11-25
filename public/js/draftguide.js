// Live draft guide engine. Pure functions, no DOM: the page (draftpage.js) feeds it the board from
// /api/draft/board, the live picks from /api/draft/live and camp headlines from /api/draft/news.
//
// It values every player on the same 0-100 scale as the rest of the site (values.js, M.V): points
// per game x games x health, above replacement for THIS draft's scoring, lineup slots and team
// count, scaled so the best player is 100. Before the season there are no weekly results, so points
// per game come from Sleeper's season projection blended with last season's usage (the same
// volume model the waiver scanner uses, fitted.js XP) and last season's results, then nudged by
// training camp and preseason news.
//
// What is fitted and what is judgment: the volume model (XP) and the usage/regression gap are
// backtested (E11, E12). The draft blend weights, camp news nudges, survival spread and need
// weights below are judgment, not backtested, and say so on the page.
import { classify } from './playernews.js';
import { advancedOf, benchUsage, XP_GAP } from './advstats.js';
import { xpGame } from './fitted.js';

// ---------- judgment knobs (one place, so a backtest can replace them) ----------
export const DRAFT_BLEND = {
  same: { proj: 0.6, usage: 0.25, last: 0.15 }, // same team as last year
  moved: { proj: 0.75, usage: 0.15, last: 0.1 }, // new team: last year's role tells less
  minGames: 6,
};
export const SEASON_GAMES = 17;
// Health going into the season: share of the season he is expected to play.
export const PRESEASON_HEALTH = { IR: 0.6, PUP: 0.7, NA: 0.7, Sus: 0.85, Out: 0.92, Doubtful: 0.95, Questionable: 0.98 };
// Camp news nudges to points per game, summed then capped.
export const CAMP = { up: 0.03, down: -0.04, injuryMinor: -0.02, injuryMajor: -0.08, holdout: -0.05, cap: [-0.15, 0.08], staleDays: 7 };
// How far a player usually goes from his ADP: sd = a + b x ADP picks.
export const SPREAD = { a: 2, b: 0.2 };
// What a pick is worth when it does not fill a starting spot.
export const BENCH = { RB: 0.6, WR: 0.6, TE: 0.3, QB: 0.25, QB_SF: 0.6, K: 0, DEF: 0 };
export const VONA_WEIGHT = 0.5;
// Late in a draft everyone left is at or below replacement (value 0): points per game breaks the tie.
export const PPG_TIEBREAK = 0.05;

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const FLEX_OK = {
  FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], IDP_FLEX: [],
};
const NON_STARTER = new Set(['BN', 'IR', 'TAXI']);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round1 = (x) => Math.round(x * 10) / 10;

// ---------- draft order ----------
// Which slot picks at overall pick `no`: snake, linear, and snake with a third-round reversal.
export function slotAt(no, order) {
  const n = order.teams;
  const r = Math.ceil(no / n);
  const i = (no - 1) % n; // 0-based position in the round
  let forward = true;
  if (order.type === 'snake') forward = order.reversal > 0 && r >= order.reversal ? r % 2 === 0 : r % 2 === 1;
  return { round: r, slot: forward ? i + 1 : n - i };
}
// Who owns a pick: the slot's roster, unless that round's pick was traded.
export function ownerAt(no, order, slotToRoster, traded = []) {
  const { round, slot } = slotAt(no, order);
  const orig = Number(slotToRoster?.[slot] ?? slot);
  const t = traded.find((x) => Number(x.round) === round && Number(x.rid) === orig);
  return { round, slot, rid: t ? Number(t.owner) : orig };
}
export function totalPicks(order) {
  return order.teams * order.rounds;
}
// The next pick to be made: the lowest pick number nobody has used (keepers fill their own spots).
export function currentPick(picks, order) {
  const used = new Set(picks.map((p) => p.no));
  for (let no = 1; no <= totalPicks(order); no++) if (!used.has(no)) return no;
  return null;
}
export function picksOf(rid, order, slotToRoster, traded, from = 1) {
  const out = [];
  for (let no = from; no <= totalPicks(order); no++) if (ownerAt(no, order, slotToRoster, traded).rid === rid) out.push(no);
  return out;
}
export function ridOfPick(pk, slotToRoster) {
  return Number(pk.rid ?? slotToRoster?.[pk.slot] ?? pk.slot);
}

// ---------- camp and preseason news ----------
const UP = /first.team|named (the |as )?(the )?starter|\bstandout\b|impress(ed|ing|ive)|turning heads|stand(s|ing)? out|breakout|lead back|\b(RB|WR|TE)1\b|feature(d)? back|three.down|bell.?cow|workhorse|won the (starting )?job|earned the (starting )?job|locked in|bigger role|expanded role|in line for (a )?(big|bigger|larger|expanded|heavy)|top target|go.to (target|receiver)|starting (job|role)|will start\b/i;
const DOWN = /second.team|demoted|\bbehind\b.{0,30}depth chart|loses? (the )?(job|starting)|reduced role|committee|timeshare|time.share|backup role|fallen (down|behind)|camp battle|competition for/i;
const HOLDOUT = /hold.?out|hold.?in|contract dispute|trade request|requests? (a )?trade|not (reporting|report) to camp|skipping camp/i;
const MAJOR = /surgery|torn|tears?\b|fracture|broken|season.ending|\bPUP\b|physically unable|non.football injury|\bNFI\b|injured reserve|out (for|until) (week|the season|several|multiple)|weeks? to (heal|recover)|suspen/i;
export function campSignals(items = [], player = {}, now = Date.now()) {
  const sig = [];
  for (const it of items) {
    const title = it.title || '';
    const c = classify(title, '', 'search', null, player.n || null, null);
    const ageDays = (now - (it.time || now)) / 86400000;
    const fresh = ageDays <= CAMP.staleDays ? 1 : 0.5;
    const soft = c.posture === 'speculative' ? 0.5 : 1;
    let kind = null;
    let w = 0;
    if (HOLDOUT.test(title)) (kind = 'holdout'), (w = CAMP.holdout);
    else if (MAJOR.test(title) || c.status === 'IR' || c.status === 'Out') (kind = 'injury'), (w = c.better ? 0 : CAMP.injuryMajor);
    else if (c.cats.includes('injury') && !c.better) (kind = 'injury'), (w = CAMP.injuryMinor);
    else if (c.roleDir === 'down' || DOWN.test(title)) (kind = 'role down'), (w = CAMP.down);
    else if (c.roleDir === 'up' || UP.test(title)) (kind = 'role up'), (w = CAMP.up);
    else if (c.better) (kind = 'healthy'), (w = 0.01);
    if (!kind) continue;
    sig.push({ kind, w: w * fresh * soft, title, src: it.src || null, time: it.time || null, url: it.url || null, speculative: c.posture === 'speculative', camp: c.cats.includes('camp') });
  }
  // one story told by five outlets is still one story: count each kind at most twice
  const seen = {};
  const kept = sig.sort((a, b) => (b.time || 0) - (a.time || 0)).filter((s) => (seen[s.kind] = (seen[s.kind] || 0) + 1) <= 2);
  const net = Math.max(CAMP.cap[0], Math.min(CAMP.cap[1], kept.reduce((s, x) => s + x.w, 0)));
  return { signals: kept, factor: 1 + net, net };
}

// ---------- points per game ----------
const PEAK = { QB: 30.5, RB: 24.5, WR: 27, TE: 27.5, K: 30, DEF: 99 }; // same as values.js
function ageFactor(pos, age) {
  if (!age || pos === 'K' || pos === 'DEF') return 1;
  const d = age - (PEAK[pos] || 27);
  return d > 0 ? Math.max(0.5, 1 - (pos === 'RB' ? 0.07 : 0.04) * d) : Math.min(1.1, 1 + 0.02 * Math.min(3, -d));
}
// Dynasty: the next three seasons, each a fifth less, through the age curve.
export function dynastyFactor(pos, age) {
  if (!age) return 1;
  let s = 0;
  let w = 0;
  for (let y = 0; y < 3; y++) {
    const d = 0.8 ** y;
    s += d * ageFactor(pos, age + y);
    w += d;
  }
  return s / w;
}

// ADP → points per game, fitted per position on the players who have both (used only when a
// player has no projection, e.g. before Sleeper posts next season's numbers).
function adpCurve(rows) {
  const fit = {};
  for (const pos of POS) {
    const xs = rows.filter((r) => r.pos === pos && r.adp && r.projPpg > 0).map((r) => [Math.log(r.adp), r.projPpg]);
    if (xs.length < 5) continue;
    const mx = avg(xs.map((x) => x[0]));
    const my = avg(xs.map((x) => x[1]));
    const b = xs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / (xs.reduce((s, [x]) => s + (x - mx) ** 2, 0) || 1);
    fit[pos] = (adp) => Math.max(0, my + b * (Math.log(adp) - mx));
  }
  return fit;
}

export function ppgFor(p, { prior = {}, curve = {} } = {}) {
  const proj = p.proj && p.proj.pts > 0 ? p.proj.pts / Math.max(1, Math.min(SEASON_GAMES, p.proj.gp || SEASON_GAMES)) : null;
  const L = p.last && p.last.gp >= DRAFT_BLEND.minGames ? p.last : null;
  const usage = L && p.pos !== 'K' && p.pos !== 'DEF' ? xpGame(p.pos, L.line) : null;
  const last = L ? L.line.pts : null;
  const moved = !!(L && L.team && p.team && L.team !== p.team);
  const w = moved ? DRAFT_BLEND.moved : DRAFT_BLEND.same;
  const parts = [];
  let v;
  if (proj != null && last != null) {
    const u = usage ?? last;
    v = w.proj * proj + w.usage * u + w.last * last;
    parts.push(['projection', proj, w.proj], ['last-season volume', u, w.usage], ['last-season results', last, w.last]);
  } else if (proj != null) {
    v = proj;
    parts.push(['projection', proj, 1]);
  } else if (last != null) {
    // no projection yet: last season, pulled toward a typical starter for a small sample
    const x = usage != null ? 0.5 * usage + 0.5 * last : last;
    const g = L.gp;
    v = (g * x + 4 * (prior[p.pos] || x)) / (g + 4);
    parts.push(['last season (no projection yet)', x, 1]);
  } else if (p.adp && curve[p.pos]) {
    v = curve[p.pos](p.adp);
    parts.push(['ADP (no projection or history)', v, 1]);
  } else v = 0;
  return { ppg: v, proj, usage, last, moved, parts };
}

// ---------- values ----------
export function starterSlots(slots) {
  return slots.filter((s) => !NON_STARTER.has(s));
}

// board: /api/draft/board; news: { [pid]: [headline...] } (optional)
export function buildDraftValues(board, news = {}, now = Date.now()) {
  const players = Object.values(board.pool);
  const pre = players.map((p) => ({ ...p, projPpg: p.proj && p.proj.pts > 0 ? p.proj.pts / Math.max(1, Math.min(SEASON_GAMES, p.proj.gp || SEASON_GAMES)) : 0 }));
  const prior = {};
  for (const pos of POS) {
    const xs = pre.filter((p) => p.pos === pos && p.projPpg > 0).map((p) => p.projPpg).sort((a, b) => b - a);
    prior[pos] = avg(xs.slice(0, board.order.teams * 2)) ?? 8;
  }
  const curve = adpCurve(pre);

  const rows = [];
  for (const p of pre) {
    const base = ppgFor(p, { prior, curve });
    const camp = campSignals(news[p.id] || [], p, now);
    const health = PRESEASON_HEALTH[p.inj] ?? 1;
    const dyn = board.dynasty ? dynastyFactor(p.pos, p.age) : 1;
    const ppg = base.ppg * camp.factor * dyn;
    const games = Math.min(SEASON_GAMES, p.proj?.gp || SEASON_GAMES) * health;
    const adv = p.last && p.last.gp >= 4 && p.pos !== 'K' && p.pos !== 'DEF' ? advancedOf(p.pos, [{ ...p.last.line }], 1) : null;
    rows.push({ pid: p.id, n: p.n, pos: p.pos, team: p.team, age: p.age, exp: p.exp, inj: p.inj, body: p.body, adp: p.adp, depth: p.depth, dpos: p.dpos, rank: p.rank,
      ppg, base, camp, health, dyn, games, adv, usageScore: adv ? benchUsage(p.pos, adv)?.score ?? null : null });
  }

  // Replacement level: every team's starting slots filled league-wide, flex spots by the best left.
  const starters = starterSlots(board.slots);
  const nT = board.order.teams;
  const byPos = {};
  for (const pos of POS) byPos[pos] = rows.filter((r) => r.pos === pos).sort((a, b) => b.ppg - a.ppg);
  const taken = {};
  for (const pos of POS) taken[pos] = starters.filter((s) => s === pos).length * nT;
  for (const flex of starters.filter((s) => FLEX_OK[s])) {
    // one flex slot per team: give each to whichever eligible position has the best player left
    for (let t = 0; t < nT; t++) {
      let best = null;
      for (const pos of FLEX_OK[flex]) {
        const r = byPos[pos][taken[pos]];
        if (r && (!best || r.ppg > best.ppg)) best = r;
      }
      if (best) taken[best.pos]++;
    }
  }
  const rep = {};
  for (const pos of POS) rep[pos] = byPos[pos][taken[pos]]?.ppg ?? 0;

  for (const r of rows) r.vorp = Math.max(0, (r.ppg - rep[r.pos]) * r.games);
  const maxV = Math.max(...rows.map((r) => r.vorp), 1);
  for (const r of rows) r.value = round1((r.vorp / maxV) * 100);
  rows.sort((a, b) => b.vorp - a.vorp || b.ppg - a.ppg || (a.adp ?? 999) - (b.adp ?? 999));
  const posN = {};
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.posRank = posN[r.pos] = (posN[r.pos] || 0) + 1;
  });
  // ADP stand-in where Sleeper has none: the player's value rank
  for (const r of rows) r.adpOrRank = r.adp ?? r.rank + nT;

  // Tiers by position: a new tier where the value drops by a tenth or 2.5 points.
  for (const pos of POS) {
    let tier = 1;
    let prev = null;
    for (const r of rows.filter((x) => x.pos === pos)) {
      if (prev != null && prev - r.value >= Math.max(2.5, 0.1 * prev)) tier++;
      r.tier = tier;
      prev = r.value;
    }
  }

  // Auction: dollars in proportion to value above replacement, after a dollar for every roster spot.
  if (board.order.type === 'auction' && board.order.budget) {
    const spots = board.slots.filter((s) => s !== 'IR' && s !== 'TAXI').length * nT;
    const pool = rows.slice(0, spots);
    const total = pool.reduce((s, r) => s + r.vorp, 0) || 1;
    const surplus = board.order.budget * nT - spots;
    for (const r of rows) r.dollars = r.vorp > 0 ? Math.max(1, Math.round(1 + (surplus * r.vorp) / total)) : 1;
  }

  const by = Object.fromEntries(rows.map((r) => [r.pid, r]));
  return { rows, by, rep, maxV, prior };
}

// ---------- survival ----------
function phi(z) {
  // standard normal CDF (Abramowitz-Stegun 7.1.26)
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
// Chance a player still on the board now is still there at pick `at`.
export function survive(adp, now, at) {
  if (at <= now) return 1;
  const sd = SPREAD.a + SPREAD.b * adp;
  const gone = (k) => phi((k - 0.5 - adp) / sd);
  const left = 1 - gone(now);
  if (left <= 1e-6) return Math.max(0, Math.min(1, 0.5 ** ((at - now) / 2))); // already well past ADP
  return Math.max(0, Math.min(1, (1 - gone(at)) / left));
}

// ---------- rosters and needs ----------
export function rosterFill(slots, pids, V) {
  const starters = starterSlots(slots);
  const open = starters.slice();
  const filled = [];
  const bench = [];
  const mine = pids.map((id) => V.by[id] || { pid: id, pos: null, value: 0 }).sort((a, b) => b.value - a.value);
  for (const r of mine) {
    let i = open.indexOf(r.pos);
    if (i < 0) i = open.findIndex((s) => FLEX_OK[s]?.includes(r.pos) && s !== 'SUPER_FLEX');
    if (i < 0) i = open.findIndex((s) => s === 'SUPER_FLEX' && FLEX_OK[s].includes(r.pos));
    if (i >= 0) filled.push({ slot: open.splice(i, 1)[0], pid: r.pid });
    else bench.push(r.pid);
  }
  return { open, filled, bench };
}
// How much a player at `pos` adds to this roster right now (0..1).
export function needWeight(pos, fill, { superflex = false, picksLeft = 99 } = {}) {
  const { open } = fill;
  if (pos === 'K' || pos === 'DEF') {
    if (!open.includes(pos)) return 0;
    // kickers and defenses only in the last picks, one per open spot
    const kd = open.filter((s) => s === 'K' || s === 'DEF').length;
    return picksLeft <= kd ? 1 : 0.02;
  }
  if (open.includes(pos)) return 1;
  if (open.some((s) => s !== 'SUPER_FLEX' && FLEX_OK[s]?.includes(pos))) return 0.9;
  if (open.includes('SUPER_FLEX') && FLEX_OK.SUPER_FLEX.includes(pos)) return pos === 'QB' ? 0.95 : 0.7;
  if (pos === 'QB') return superflex ? BENCH.QB_SF : BENCH.QB;
  return BENCH[pos] ?? 0.3;
}

// ---------- expected best at a position at a later pick ----------
function expectedBest(avail, pos, now, at, take = 12) {
  const list = avail.filter((r) => r.pos === pos).slice(0, take);
  let pNone = 1;
  let e = 0;
  for (const r of list) {
    const s = survive(r.adpOrRank, now, at);
    e += r.value * s * pNone;
    pNone *= 1 - s;
  }
  return { value: e, pNone };
}

// ---------- the recommendation ----------
// live: { picks, traded, slotToRoster, status }; me: roster id
export function recommend(board, V, live, me, { count = 6 } = {}) {
  const order = board.order;
  const s2r = live.slotToRoster || board.slotToRoster || null;
  const picks = live.picks || [];
  const traded = live.traded || [];
  const now = currentPick(picks, order);
  const taken = new Set(picks.map((p) => String(p.pid)));
  const avail = V.rows.filter((r) => !taken.has(String(r.pid)));
  const superflex = starterSlots(board.slots).filter((s) => s === 'QB' || s === 'SUPER_FLEX').length >= 2;

  const rosters = {};
  for (const pk of picks) (rosters[ridOfPick(pk, s2r)] ||= []).push(String(pk.pid));
  const mine = rosters[me] || [];
  const fill = rosterFill(board.slots, mine, V);
  const myNext = now ? picksOf(me, order, s2r, traded, now) : [];
  const onClock = now != null && myNext[0] === now;
  const target = myNext[0] ?? null; // the pick we are planning for (now, when on the clock)
  const after = myNext[1] ?? null; // the pick after that
  const picksLeft = myNext.length;

  // what the board looks like when we pick
  const atTarget = (r) => (target ? survive(r.adpOrRank, now, target) : 1);
  const nextExp = {};
  for (const pos of POS) nextExp[pos] = after ? expectedBest(avail, pos, target ?? now, after) : { value: 0, pNone: 1 };

  const cands = avail.slice(0, 80).map((r) => {
    const need = needWeight(r.pos, fill, { superflex, picksLeft });
    const vona = Math.max(0, r.value - nextExp[r.pos].value);
    const there = atTarget(r);
    const score = need * (r.value + VONA_WEIGHT * vona + PPG_TIEBREAK * r.ppg);
    return { r, need, vona, there, score: score * (onClock ? 1 : there) };
  });
  cands.sort((a, b) => b.score - a.score);
  const top = cands.slice(0, count).map((c) => ({ ...c, why: reasons(c, { V, avail, nextExp, after, target, now, fill, board }) }));

  // players to wait on: valuable, but likely still there next time
  const wait = after ? cands.filter((c) => c.need >= 0.6 && c.r.value >= (top[0]?.r.value || 0) * 0.5 && survive(c.r.adpOrRank, target ?? now, after) >= 0.7).slice(0, 4).map((c) => ({ r: c.r, there: survive(c.r.adpOrRank, target ?? now, after) })) : [];

  return {
    now, onClock, target, after, myNext, picksLeft, fill, mine, rosters, top, wait,
    runs: runs(picks, V), before: teamsBefore({ order, s2r, traded, rosters, board, V, from: now, to: target }),
    tierEnd: tierWatch(avail, fill, { superflex, picksLeft }),
    status: live.status,
  };
}

function pctText(x) {
  return x >= 0.99 ? '>99%' : x <= 0.01 ? '<1%' : `${Math.round(x * 100)}%`;
}
function reasons(c, { V, avail, nextExp, after, target, now, fill, board }) {
  const { r } = c;
  const out = [];
  out.push(`Value ${r.value.toFixed(1)} (#${r.rank} overall, ${r.pos}${r.posRank}, tier ${r.tier})`);
  if (c.need >= 1) out.push(`Fills an open ${r.pos} starting spot`);
  else if (c.need >= 0.9) out.push(`Fills an open flex spot`);
  else if (c.need < 0.5) out.push(`Bench depth only: your ${r.pos} spots are full`);
  if (after) {
    const s = survive(r.adpOrRank, target ?? now, after);
    const nx = nextExp[r.pos];
    if (s < 0.35) out.push(`Won't last: ${pctText(s)} chance he is there at your next pick (#${after})`);
    if (c.vona >= 5) out.push(`Best ${r.pos} likely left at #${after} is worth about ${nx.value.toFixed(1)}: taking him now gains ${c.vona.toFixed(1)}`);
  }
  if (target && target > now && c.there < 0.5) out.push(`Only ${pctText(c.there)} likely to reach your pick at #${target}`);
  const sameTier = avail.filter((x) => x.pos === r.pos && x.tier === r.tier).length;
  if (sameTier === 1) out.push(`Last ${r.pos} in his tier`);
  if (r.adp && now && now - r.adp >= Math.max(8, r.adp * 0.2)) out.push(`Falling: ADP ${Math.round(r.adp)}, now pick ${now}`);
  for (const s of r.camp.signals.slice(0, 2)) out.push(`${s.kind === 'role up' ? 'Camp +' : s.kind === 'healthy' ? 'Health +' : 'Camp −'}: ${s.title}${s.speculative ? ' (reported, not confirmed)' : ''}`);
  if (r.inj) out.push(`Sleeper lists him ${r.inj}${r.body ? ` (${r.body})` : ''}: valued at ${Math.round(r.health * 100)}% of a season`);
  if (r.base.moved) out.push(`New team (was ${board.pool[r.pid]?.last?.team || 'elsewhere'}): last year's role counts less`);
  const xp = r.adv?.m?.xpGap;
  if (xp && xp.v >= XP_GAP) out.push(`Scored ${xp.v.toFixed(1)} a game above what his volume supports last year: touchdown luck may fade`);
  else if (xp && xp.v <= -XP_GAP) out.push(`Scored ${(-xp.v).toFixed(1)} a game below his volume last year: room to bounce back`);
  if (r.exp === 0) out.push('Rookie: projection only, no NFL history');
  if (board.dynasty && r.dyn !== 1) out.push(`Dynasty age curve: ${r.dyn > 1 ? '+' : ''}${Math.round((r.dyn - 1) * 100)}% at age ${r.age}`);
  return out;
}

// Position runs: four or more of the last eight picks at one position.
export function runs(picks, V, last = 8) {
  const recent = picks.slice().sort((a, b) => a.no - b.no).slice(-last);
  const c = {};
  for (const pk of recent) {
    const pos = pk.pos || V.by[pk.pid]?.pos;
    if (pos) c[pos] = (c[pos] || 0) + 1;
  }
  return Object.entries(c).filter(([, k]) => k >= Math.ceil(last / 2)).map(([pos, k]) => ({ pos, k, of: recent.length }));
}

// The teams picking between now and our pick, and which starting spots they still have open.
export function teamsBefore({ order, s2r, traded, rosters, board, V, from, to }) {
  if (!from || !to || to <= from) return { picks: 0, need: {} };
  const need = {};
  const seen = new Set();
  for (let no = from; no < to; no++) {
    const rid = ownerAt(no, order, s2r, traded).rid;
    if (seen.has(rid)) continue;
    seen.add(rid);
    const f = rosterFill(board.slots, rosters[rid] || [], V);
    for (const pos of new Set(f.open.filter((s) => POS.includes(s)))) need[pos] = (need[pos] || 0) + 1;
  }
  return { picks: to - from, teams: seen.size, need };
}

// For each position we still need: how many players are left in the best tier available.
function tierWatch(avail, fill, opts) {
  const out = [];
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    if (needWeight(pos, fill, opts) < 0.6) continue;
    const list = avail.filter((r) => r.pos === pos);
    if (!list.length) continue;
    const t = list[0].tier;
    const inTier = list.filter((r) => r.tier === t);
    const nextTier = list.find((r) => r.tier > t);
    out.push({ pos, tier: t, left: inTier.length, best: list[0], drop: nextTier ? list[0].value - nextTier.value : null });
  }
  return out;
}

// ---------- after the draft: how each team did, by value drafted ----------
export function grades(board, V, live) {
  const s2r = live.slotToRoster || board.slotToRoster || null;
  const by = {};
  for (const pk of live.picks || []) {
    const rid = ridOfPick(pk, s2r);
    const r = V.by[pk.pid];
    const g = (by[rid] ||= { rid, value: 0, steals: [], n: 0 });
    g.n++;
    if (!r) continue;
    g.value += r.value;
    if (r.adp && !pk.keeper && pk.no - r.adp >= 12) g.steals.push({ pid: pk.pid, by: Math.round(pk.no - r.adp) });
  }
  return Object.values(by).sort((a, b) => b.value - a.value);
}
