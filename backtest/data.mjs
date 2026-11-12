// Loads the cached history (see fetch.mjs) and rebuilds what the site would have known before any
// given week: players in the same shape as the live snapshot, the official injury report, the
// schedule with closing lines. Nothing here reads a later week than the one asked for
// (test/backtest.test.mjs checks that).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, SEASONS } from './fetch.mjs';

const require = createRequire(import.meta.url);
const { makeScorer } = require('../lib/sources.js');

export { SEASONS };
export const TRAIN = [2022, 2023, 2024];
export const TEST = [2025, 2026];
export const SKILL = ['QB', 'RB', 'WR', 'TE'];

const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const exists = (f) => fs.existsSync(path.join(DIR, f));

// ---------- small stats kit ----------
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export const sd = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)) : NaN;
};
export const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
export const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
export const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
export const pct = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 10 : null);
export function pearson(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    a += (x[i] - mx) * (y[i] - my);
    b += (x[i] - mx) ** 2;
    c += (y[i] - my) ** 2;
  }
  return b && c ? a / Math.sqrt(b * c) : NaN;
}
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
  const out = new Array(a.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}
export const spearman = (x, y) => pearson(ranks(x), ranks(y));
// deterministic generator so every run prints the same intervals
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 90% interval of a statistic, resampling whole groups (weeks) so correlated rows stay together
export function bootCI(groups, stat, n = 300, seed = 11) {
  const keys = Object.keys(groups);
  if (keys.length < 3) return [NaN, NaN];
  const rand = rng(seed);
  const vals = [];
  for (let b = 0; b < n; b++) {
    const rows = [];
    for (let i = 0; i < keys.length; i++) for (const r of groups[keys[Math.floor(rand() * keys.length)]]) rows.push(r);
    const v = stat(rows);
    if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(vals.length * 0.05)], vals[Math.floor(vals.length * 0.95)]];
}
// least squares with a small ridge; X rows are feature arrays (no intercept column needed)
export function ols(X, y, ridge = 1e-6) {
  const n = X.length;
  const k = X[0].length + 1;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = [1, ...X[i]];
    for (let p = 0; p < k; p++) {
      b[p] += row[p] * y[i];
      for (let q = 0; q < k; q++) A[p][q] += row[p] * row[q];
    }
  }
  for (let p = 1; p < k; p++) A[p][p] += ridge * n;
  for (let p = 0; p < k; p++) {
    let piv = p;
    for (let q = p + 1; q < k; q++) if (Math.abs(A[q][p]) > Math.abs(A[piv][p])) piv = q;
    [A[p], A[piv]] = [A[piv], A[p]];
    [b[p], b[piv]] = [b[piv], b[p]];
    const d = A[p][p] || 1e-12;
    for (let q = p; q < k; q++) A[p][q] /= d;
    b[p] /= d;
    for (let q = 0; q < k; q++) {
      if (q === p) continue;
      const f = A[q][p];
      if (!f) continue;
      for (let c = p; c < k; c++) A[q][c] -= f * A[p][c];
      b[q] -= f * b[p];
    }
  }
  return b; // [intercept, ...coefs]
}
export const predict = (beta, x) => beta[0] + sum(x.map((v, i) => v * beta[i + 1]));

// ---------- CSV ----------
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ---------- identity ----------
const TEAM_FIX = { LA: 'LAR', WSH: 'WAS', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
export const fixTeam = (t) => TEAM_FIX[t] || t || null;
export const nameKey = (n) =>
  String(n || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z]/g, '');

let _players;
export function playersDb() {
  return (_players ||= read('players.json'));
}
let _league;
export function leagueChain() {
  return (_league ||= read('league.json'));
}
export const leagueNow = () => leagueChain()[0];
let _score;
export const score = (stats) => (_score ||= makeScorer(leagueNow().scoring))(stats || {});

let _games;
function gamesAll() {
  if (_games) return _games;
  _games = {};
  for (const g of parseCsv(fs.readFileSync(path.join(DIR, 'games.csv'), 'utf8'))) {
    if (g.game_type !== 'REG') continue;
    const s = Number(g.season);
    if (!SEASONS.includes(s)) continue;
    const wk = Number(g.week);
    const home = fixTeam(g.home_team);
    const away = fixTeam(g.away_team);
    const total = g.total_line === '' || g.total_line === 'NA' ? null : Number(g.total_line);
    const spread = g.spread_line === '' || g.spread_line === 'NA' ? null : Number(g.spread_line); // + = home favoured
    const imp = (sign) => (total != null && spread != null ? (total + sign * spread) / 2 : null);
    const kick = g.gameday ? `${g.gameday}T${g.gametime || '13:00'}:00-05:00` : null;
    const wind = g.wind === '' || g.wind === 'NA' ? null : Number(g.wind);
    const temp = g.temp === '' || g.temp === 'NA' ? null : Number(g.temp);
    const base = { total, roof: g.roof || null, wind, temp, kick, played: g.result !== '' && g.result !== 'NA' };
    const w = ((_games[s] ||= {})[wk] ||= {});
    w[home] = { ...base, opp: away, home: true, imp: imp(1), oppImp: imp(-1), spread: spread == null ? null : -spread, score: Number(g.home_score), oppScore: Number(g.away_score) };
    w[away] = { ...base, opp: home, home: false, imp: imp(-1), oppImp: imp(1), spread, score: Number(g.away_score), oppScore: Number(g.home_score) };
  }
  return _games;
}

// ---------- one season ----------
const seasonCache = {};
export function loadSeason(season) {
  if (seasonCache[season]) return seasonCache[season];
  const weeks = {};
  let lastWeek = 0;
  for (let wk = 1; wk <= 18; wk++) {
    if (!exists(`sl-stats-${season}-${wk}.json`)) break;
    const rows = new Map();
    for (const r of read(`sl-proj-${season}-${wk}.json`)) {
      rows.set(r.id, { id: r.id, pos: r.pos, n: r.n, team: fixTeam(r.team), opp: fixTeam(r.opp), proj: score(r.s), projStats: r.s, played: false, pts: 0 });
    }
    let any = false;
    for (const r of read(`sl-stats-${season}-${wk}.json`)) {
      const s = r.s;
      const played = (s.gp || 0) > 0 || (s.off_snp || 0) > 0;
      if (!played) continue;
      any = true;
      const cur = rows.get(r.id) || { id: r.id, pos: r.pos, n: r.n, team: fixTeam(r.team), opp: fixTeam(r.opp), proj: null };
      Object.assign(cur, {
        team: fixTeam(r.team) || cur.team,
        opp: fixTeam(r.opp) || cur.opp,
        played: true,
        pts: score(s),
        snp: s.tm_off_snp && s.off_snp != null ? Math.round((s.off_snp / s.tm_off_snp) * 100) : null,
        att: s.rush_att || 0,
        tgt: s.rec_tgt || 0,
        rec: s.rec || 0,
        air: s.rec_air_yd || 0,
        rzTgt: s.rec_rz_tgt || 0,
        rzAtt: s.rush_rz_att || 0,
        passAtt: s.pass_att || 0,
        recYd: s.rec_yd || 0,
        rushYd: s.rush_yd || 0,
        td: (s.rec_td || 0) + (s.rush_td || 0),
        passTd: s.pass_td || 0,
        stats: s,
      });
      rows.set(r.id, cur);
    }
    if (!any) break; // week not played yet
    weeks[wk] = rows;
    lastWeek = wk;
  }
  const games = gamesAll()[season] || {};
  const db = playersDb();
  // official injury report (final game status + last practice status), keyed by Sleeper id
  const byGsis = {};
  const byName = {};
  for (const p of Object.values(db)) {
    if (p.gsis) byGsis[p.gsis] = p.id;
    (byName[nameKey(p.n) + '|' + p.pos] ||= []).push(p.id);
  }
  const inj = {};
  let unmatched = 0;
  let total = 0;
  if (exists(`injuries_${season}.csv`)) {
    for (const r of parseCsv(fs.readFileSync(path.join(DIR, `injuries_${season}.csv`), 'utf8'))) {
      if (r.game_type !== 'REG' || !SKILL.includes(r.position)) continue;
      total++;
      const wk = Number(r.week);
      let pid = byGsis[r.gsis_id];
      if (!pid) {
        const c = (byName[nameKey(r.full_name) + '|' + r.position] || []).filter((id) => {
          for (let w = Math.max(1, wk - 6); w <= Math.min(18, wk + 2); w++) if (weeks[w]?.get(id)?.team === fixTeam(r.team)) return true;
          return false;
        });
        pid = c.length === 1 ? c[0] : (byName[nameKey(r.full_name) + '|' + r.position] || []).length === 1 ? byName[nameKey(r.full_name) + '|' + r.position][0] : null;
      }
      if (!pid) {
        unmatched++;
        continue;
      }
      const prac = /Full/.test(r.practice_status) ? 'FP' : /Limited/.test(r.practice_status) ? 'LP' : /Did Not/.test(r.practice_status) ? 'DNP' : null;
      (inj[wk] ||= new Map()).set(pid, { status: r.report_status || null, prac, injury: (r.report_primary_injury || r.practice_primary_injury || '').trim() || null, team: fixTeam(r.team) });
    }
  }
  const out = {
    season,
    weeks,
    lastWeek,
    games,
    inj,
    injMatch: { total, unmatched },
    game: (team, wk) => games[wk]?.[team] || null,
    isBye: (team, wk) => !!team && !!games[wk] && !games[wk][team],
  };
  return (seasonCache[season] = out);
}

// Usage-based depth: rank within team and position on the last three games' work.
function depthRanks(list) {
  const by = {};
  for (const p of list) if (p.team && SKILL.includes(p.pos)) (by[p.team + '|' + p.pos] ||= []).push(p);
  for (const g of Object.values(by)) {
    const u = (p) => {
      const h = p.hist.slice(-3);
      if (!h.length) return -1;
      return p.pos === 'QB' ? (p.hist[p.hist.length - 1].passAtt || 0) * 10 + mean(h.map((x) => x.passAtt || 0)) : mean(h.map((x) => x.att + x.tgt));
    };
    g.sort((a, b) => u(b) - u(a)).forEach((p, i) => (p.depth = i + 1));
  }
}

// Players as the site would have seen them before week W of a season.
// opts.throughWeek: test hook, must never exceed W-1 for hist.
export function asOf(season, W) {
  const S = loadSeason(season);
  const players = {};
  const db = playersDb();
  for (let wk = 1; wk < W; wk++) {
    const rows = S.weeks[wk];
    if (!rows) continue;
    for (const r of rows.values()) {
      if (!r.played) continue;
      const p = (players[r.id] ||= { id: r.id, n: r.n, pos: r.pos, team: r.team, hist: [], inj: null, proj: null, own: null, trend: null, age: db[r.id]?.age ? db[r.id].age - (SEASONS[SEASONS.length - 1] - season) : null });
      p.team = r.team || p.team;
      p.hist.push({ w: wk, pts: r.pts, snp: r.snp, att: r.att, tgt: r.tgt, rec: r.rec, air: r.air, rzTgt: r.rzTgt, rzAtt: r.rzAtt, passAtt: r.passAtt, recYd: r.recYd, rushYd: r.rushYd, td: r.td, passTd: r.passTd, team: r.team, opp: r.opp });
    }
  }
  const cur = S.weeks[W];
  const report = S.inj[W] || new Map();
  if (cur) {
    for (const r of cur.values()) {
      if (r.proj == null) continue; // a stats-only row carries nothing known before kickoff
      const p = (players[r.id] ||= { id: r.id, n: r.n, pos: r.pos, team: r.team, hist: [], inj: null, proj: null, own: null, trend: null, age: null });
      if (r.team) p.team = r.team;
      p.proj = { pts: r.proj, opp: r.opp };
    }
  }
  for (const [pid, rep] of report) {
    const p = players[pid];
    if (!p) continue;
    p.inj = rep.status;
    p.prac = rep.prac;
    p.body = rep.injury;
  }
  // Not on the report, no projection, team is playing, and he played last week: Sleeper would show
  // him on IR or ruled out early. Marked as a proxy so results can be split.
  for (const p of Object.values(players)) {
    if (p.inj || p.proj || !p.hist.length || S.isBye(p.team, W)) continue;
    p.inj = 'IR';
    p.injProxy = true;
  }
  // A different team than his last game: the site would see a recent team change.
  const kick = Math.min(...Object.values(S.games[W] || {}).map((x) => new Date(x.kick).getTime()).filter(Number.isFinite));
  for (const p of Object.values(players)) {
    const last = p.hist[p.hist.length - 1];
    if (p.proj && last && last.team && p.team && last.team !== p.team && last.w >= W - 3 && Number.isFinite(kick)) {
      p.tchg = kick - 4 * 86400000;
      p.prevTeam = last.team;
    }
  }
  depthRanks(Object.values(players));
  return players;
}

// What actually happened in week W (only for scoring a prediction afterwards).
export function actual(season, W) {
  return loadSeason(season).weeks[W] || new Map();
}

// Position pools that matter for lineup decisions in a 10-team league.
export const POOL = { QB: 24, RB: 40, WR: 56, TE: 20, K: 16, DEF: 16 };
export function relevant(players, pos, by = (p) => p.proj?.pts || 0) {
  return Object.values(players)
    .filter((p) => p.pos === pos && by(p) > 0)
    .sort((a, b) => by(b) - by(a))
    .slice(0, POOL[pos]);
}

// A league-shaped snapshot for running buildModel on a historical week.
// teams: [{ id, owner, players, starters, reserve }]; pastScores: { week: { rid: pts } }
export function synthSnap(season, W, { teams, lg = leagueNow(), pastScores = {}, pairs = {}, playersOverride = null } = {}) {
  const S = loadSeason(season);
  const players = playersOverride || asOf(season, W);
  const owner = {};
  for (const t of teams) for (const id of t.players) owner[id] = t.id;
  for (const p of Object.values(players)) p.own = owner[p.id] ?? null;
  const schedule = {};
  const lastWk = lg.settings.playoff_week_start + 2;
  for (let wk = W; wk <= Math.min(18, lastWk); wk++) {
    const g = S.games[wk] || {};
    const games = Object.entries(g)
      .filter(([, x]) => x.home)
      .map(([home, x]) => ({ id: `${season}-${wk}-${home}`, date: x.kick, state: 'pre', completed: false, detail: null, home: { t: home, score: null, imp: x.imp }, away: { t: x.opp, score: null, imp: x.oppImp }, spread: null }));
    const playing = new Set(Object.keys(g));
    const all = new Set(Object.values(players).map((p) => p.team).filter(Boolean));
    schedule[wk] = { games, byes: [...all].filter((t) => !playing.has(t)) };
  }
  const results = {};
  for (let wk = Math.max(1, W - 6); wk < W; wk++) {
    const g = S.games[wk];
    if (g) results[wk] = Object.fromEntries(Object.entries(g).map(([t, x]) => [t, x.opp]));
  }
  const matchups = {};
  for (let wk = 1; wk <= lg.settings.playoff_week_start - 1; wk++) {
    matchups[wk] = teams.map((t, i) => ({ rid: t.id, mid: pairs[wk]?.[t.id] ?? Math.floor(i / 2) + 1, pts: wk < W ? pastScores[wk]?.[t.id] ?? 0 : 0, starters: [], players: [], pp: {} }));
  }
  const first = Math.min(...Object.values(S.games[W] || {}).map((x) => new Date(x.kick).getTime()).filter(Number.isFinite));
  return {
    snap: {
      meta: { week: W, season: String(season), tz: 'America/Toronto', builtAt: first, playoffWeeks: [15, 16, 17], leagueId: 'backtest' },
      league: { name: 'Backtest', rosterPositions: lg.positions, settings: lg.settings, scoring: lg.scoring },
      teams: teams.map((t) => ({ w: 0, l: 0, name: 'Team ' + t.id, reserve: [], taxi: [], ...t })),
      players,
      schedule,
      results,
      matchups,
      transactions: [],
      picks: [],
      notes: [],
      articles: [],
      playerNews: { items: [], perPlayer: {}, degraded: false, disabled: false },
    },
    now: Number.isFinite(first) ? first - 6 * 3600000 : Date.now(),
  };
}
