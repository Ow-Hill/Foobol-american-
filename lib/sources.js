// Live data sources: Sleeper (league truth + projections + stats) and ESPN (injuries, news, schedule, odds).
const fs = require('fs');
const path = require('path');

const UA = { 'User-Agent': 'ff-roster-monitor/1.0' };
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const posQuery = POS.map((p) => `position%5B%5D=${p}`).join('&');
const DATA_DIR = path.join(__dirname, '..', 'data');

const cache = new Map();
async function memo(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  if (hit && hit.pending) return hit.pending;
  const pending = fn()
    .then((v) => {
      cache.set(key, { t: Date.now(), v });
      return v;
    })
    .catch((err) => {
      if (hit) {
        cache.set(key, { t: hit.t, v: hit.v, stale: true });
        return hit.v;
      }
      cache.delete(key);
      throw err;
    });
  cache.set(key, { ...(hit || { t: 0 }), pending });
  return pending;
}
function clearCache() {
  for (const [k, v] of cache) if (!k.startsWith('players:') && !k.startsWith('lgprev:')) cache.delete(k);
}

async function getJson(url, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const SL = 'https://api.sleeper.app/v1';
const sleeper = (p) => getJson(SL + p);

// ---------- Scoring: league settings x raw stat line ----------
function makeScorer(S) {
  return function score(stats) {
    let t = 0;
    for (const k in S) if (stats[k]) t += stats[k] * S[k];
    // Projections report 50+ FGs and FG misses in aggregate buckets
    if (stats.fgm_50p && stats.fgm_50_59 === undefined) t += stats.fgm_50p * (S.fgm_50_59 || 0);
    if (S.fgmiss && stats.fgmiss === undefined) {
      const m = (stats.fgmiss_0_19 || 0) + (stats.fgmiss_20_29 || 0) + (stats.fgmiss_30_39 || 0) + (stats.fgmiss_40_49 || 0) + (stats.fgmiss_50p || 0);
      t += m * S.fgmiss;
    }
    return Math.round(t * 100) / 100;
  };
}

// ---------- Sleeper player database (large; refreshed a few times a day) ----------
async function slimPlayers() {
  return memo('players:slim', 6 * 3600 * 1000, async () => {
    const file = path.join(DATA_DIR, 'players-slim-v2.json');
    try {
      const st = fs.statSync(file);
      if (Date.now() - st.mtimeMs < 6 * 3600 * 1000) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    const raw = await getJson(SL + '/players/nfl', 90000);
    const out = {};
    for (const id in raw) {
      const p = raw[id];
      const pos = p.position;
      if (!POS.includes(pos)) continue;
      out[id] = {
        id,
        n: pos === 'DEF' ? `${p.first_name} ${p.last_name}` : p.full_name || `${p.first_name} ${p.last_name}`,
        pos,
        team: p.team || null,
        age: p.age || null,
        exp: p.years_exp ?? null,
        inj: p.injury_status || null,
        body: p.injury_body_part || null,
        note: p.injury_notes || null,
        prac: p.practice_participation || null,
        espn: p.espn_id || null,
        depth: p.depth_chart_order ?? null,
        dpos: p.depth_chart_position || null,
        rank: p.search_rank ?? null,
        status: p.status || null,
        nu: p.news_updated || null,
      };
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(out));
    } catch {}
    return out;
  });
}

// ---------- Sleeper league ----------
const leagueCore = (id) =>
  memo('league:' + id, 60 * 1000, async () => {
    const [league, users, rosters, state] = await Promise.all([
      sleeper(`/league/${id}`),
      sleeper(`/league/${id}/users`),
      sleeper(`/league/${id}/rosters`),
      sleeper('/state/nfl'),
    ]);
    return { league, users, rosters, state };
  });

const matchups = (id, wk, current) => memo(`mu:${id}:${wk}`, current ? 60 * 1000 : 15 * 60 * 1000, () => sleeper(`/league/${id}/matchups/${wk}`));
const transactions = (id, wk, current) => memo(`tx:${id}:${wk}`, current ? 60 * 1000 : 15 * 60 * 1000, () => sleeper(`/league/${id}/transactions/${wk}`));
const tradedPicks = (id) => memo('picks:' + id, 10 * 60 * 1000, () => sleeper(`/league/${id}/traded_picks`));
const trending = (type) => memo('trend:' + type, 10 * 60 * 1000, () => sleeper(`/players/nfl/trending/${type}?lookback_hours=24&limit=40`));

// ---------- Sleeper projections & weekly stats ----------
const projections = (season, wk) =>
  memo(`proj:${season}:${wk}`, 5 * 60 * 1000, () => getJson(`https://api.sleeper.com/projections/nfl/${season}/${wk}?season_type=regular&${posQuery}`, 40000));
const weeklyStats = (season, wk) =>
  memo(`stats:${season}:${wk}`, 60 * 60 * 1000, () => getJson(`https://api.sleeper.com/stats/nfl/${season}/${wk}?season_type=regular&${posQuery}`, 40000));

// ---------- ESPN ----------
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const fixTeam = (t) => (t === 'WSH' ? 'WAS' : t);

const espnNews = () => memo('espn:news', 3 * 60 * 1000, () => getJson(`${ESPN}/news?limit=100`));
const espnInjuries = () => memo('espn:inj', 3 * 60 * 1000, () => getJson(`${ESPN}/injuries`));
const scoreboard = (wk, current) => memo(`espn:sb:${wk}`, current ? 60 * 1000 : 30 * 60 * 1000, () => getJson(`${ESPN}/scoreboard?week=${wk}&seasontype=2`));

function parseScoreboard(sb) {
  const games = [];
  for (const e of sb.events || []) {
    const c = e.competitions?.[0];
    if (!c) continue;
    const home = c.competitors.find((x) => x.homeAway === 'home');
    const away = c.competitors.find((x) => x.homeAway === 'away');
    const odds = c.odds?.[0];
    let hImp = null;
    let aImp = null;
    let spread = null;
    if (odds && odds.overUnder != null && odds.spread != null) {
      const ou = Number(odds.overUnder);
      const sp = Math.abs(Number(odds.spread));
      const awayFav = odds.awayTeamOdds?.favorite;
      const favImp = (ou + sp) / 2;
      const dogImp = (ou - sp) / 2;
      aImp = awayFav ? favImp : dogImp;
      hImp = awayFav ? dogImp : favImp;
      spread = { fav: awayFav ? fixTeam(away.team.abbreviation) : fixTeam(home.team.abbreviation), pts: sp, ou };
    }
    games.push({
      id: e.id,
      date: e.date,
      state: e.status?.type?.state || 'pre',
      completed: !!e.status?.type?.completed,
      detail: e.status?.type?.shortDetail || null,
      home: { t: fixTeam(home.team.abbreviation), score: home.score != null ? Number(home.score) : null, imp: hImp },
      away: { t: fixTeam(away.team.abbreviation), score: away.score != null ? Number(away.score) : null, imp: aImp },
      spread,
    });
  }
  return games;
}

module.exports = {
  sleeper, getJson, POS, memo, clearCache, makeScorer, slimPlayers, leagueCore, matchups, transactions, tradedPicks, trending,
  projections, weeklyStats, espnNews, espnInjuries, scoreboard, parseScoreboard, fixTeam,
};
