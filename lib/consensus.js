// Expert consensus rankings for this week (FantasyPros ECR via dynastyprocess/data, refreshed
// daily). In the 2022-2026 backtest, averaging Sleeper's projection 50/50 with the consensus
// (rank turned into points) beat Sleeper alone at QB, WR and K (E17); public/js/fitted.js holds
// the curve and the positions. Best effort: any failure means Sleeper alone, never a broken page.
const fs = require('fs');
const path = require('path');
const { memo } = require('./sources');

const BASE = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files';
const PAGE = { qb: 'QB', 'ppr-rb': 'RB', 'ppr-wr': 'WR', 'ppr-te': 'TE', k: 'K', dst: 'DEF' };
const TEAM_FIX = { JAC: 'JAX', LA: 'LAR', WSH: 'WAS', LVR: 'LV' };
const DATA = path.join(__dirname, '..', 'data');

function parseCsv(text) {
  const { parseCsv: p } = require('./nflverse');
  return p(text);
}
async function getText(url, ms = 30000) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ff-roster-monitor/1.0' }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// FantasyPros id -> Sleeper id, cached on disk for a week
const idMap = () =>
  memo('ecr:ids', 24 * 3600 * 1000, async () => {
    const file = path.join(DATA, 'fp-to-sleeper.json');
    try {
      if (Date.now() - fs.statSync(file).mtimeMs < 7 * 86400000) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    const map = {};
    for (const r of parseCsv(await getText(`${BASE}/db_playerids.csv`, 60000))) {
      if (r.fantasypros_id && r.fantasypros_id !== 'NA' && r.sleeper_id && r.sleeper_id !== 'NA') map[r.fantasypros_id] = r.sleeper_id;
    }
    try {
      fs.mkdirSync(DATA, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(map));
    } catch {}
    return map;
  });

// { sleeperId: { ecr, sd, pos, at } } for this week; {} when unavailable or stale.
async function weeklyConsensus(now = Date.now()) {
  return memo('ecr:weekly', 3 * 3600 * 1000, async () => {
    const [text, map] = await Promise.all([getText(`${BASE}/fp_latest_weekly.csv`), idMap()]);
    const out = {};
    for (const r of parseCsv(text)) {
      const pos = PAGE[r.page];
      if (!pos) continue;
      const at = Date.parse(r.scrape_date);
      if (!(now - at < 6 * 86400000)) continue; // last week's rankings are not this week's
      const pid = pos === 'DEF' ? TEAM_FIX[r.team] || r.team : map[r.fantasypros_id];
      if (!pid) continue;
      out[pid] = { ecr: Number(r.ecr), sd: Number(r.sd), pos, at };
    }
    return out;
  });
}

// Adds p.ecr to matching players. Returns how many matched.
function attach(players, ecr) {
  let n = 0;
  for (const p of Object.values(players)) {
    const e = ecr[p.id];
    if (e && e.pos === p.pos) {
      p.ecr = e;
      n++;
    }
  }
  return n;
}

module.exports = { weeklyConsensus, attach };
