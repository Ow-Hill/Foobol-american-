// Expert consensus rankings (FantasyPros ECR, as archived daily by dynastyprocess/data) for every
// week 2022-now: an early-week version (last scrape before Wednesday night) and a final version
// (last scrape before Sunday's first kickoff). Reads a partial clone of the repository's history:
//   git clone --filter=blob:none --no-checkout https://github.com/dynastyprocess/data <dir>
// Usage: node backtest/fetch-ecr.mjs <dir>   (default ../dynastyprocess/hist)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DIR } from './fetch.mjs';
import { parseCsv, SEASONS, fixTeam } from './data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || path.join(here, '..', '..', 'dynastyprocess', 'hist'));
const FILE = 'files/fp_latest_weekly.csv';
const OUT = path.join(DIR, 'ecr');
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 1 << 28 }).toString();

// commit list, oldest first
const commits = git('log', '--format=%H %cI', '--', FILE).trim().split('\n').map((l) => {
  const [h, t] = l.split(' ');
  return { h, t: Date.parse(t) };
}).reverse();
const before = (ms) => {
  let best = null;
  for (const c of commits) if (c.t < ms) best = c;
  return best;
};

// Sunday of each regular-season week, from the games file
const games = parseCsv(fs.readFileSync(path.join(DIR, 'games.csv'), 'utf8')).filter((g) => g.game_type === 'REG' && SEASONS.includes(Number(g.season)));
const sundays = {};
for (const g of games) {
  if (g.weekday !== 'Sunday') continue;
  (sundays[g.season] ||= {})[g.week] = g.gameday;
}

const KEEP = ['page', 'scrape_date', 'fantasypros_id', 'player_name', 'pos', 'team', 'ecr', 'sd', 'best', 'worst', 'r2p_pts', 'player_opponent'];
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [season, weeks] of Object.entries(sundays)) {
  for (const [wk, day] of Object.entries(weeks)) {
    const sun = Date.parse(`${day}T17:00:00Z`); // 1 pm Eastern
    const versions = { final: before(sun - 15 * 60000), early: before(sun - 3.5 * 86400000) };
    for (const [kind, c] of Object.entries(versions)) {
      const f = path.join(OUT, `${season}-${wk}-${kind}.json`);
      if (!c || fs.existsSync(f)) continue;
      // a version older than 6 days belongs to the previous week
      if (sun - c.t > (kind === 'final' ? 2 : 6) * 86400000) continue;
      const rows = parseCsv(git('show', `${c.h}:${FILE}`)).filter((r) => ['qb', 'ppr-rb', 'ppr-wr', 'ppr-te', 'k', 'dst'].includes(r.page));
      const slim = rows.map((r) => Object.fromEntries(KEEP.map((k) => [k, r[k] ?? null])));
      fs.writeFileSync(f, JSON.stringify({ season: Number(season), week: Number(wk), kind, scrapedAt: new Date(c.t).toISOString(), rows: slim }));
      n++;
    }
  }
}
// ----- rest-of-season rankings, from the weekly-ish db_fpecr_latest.csv -----
const ROS_FILE = 'files/db_fpecr_latest.csv';
const ROS_PAGE = { '/nfl/rankings/ros-qb.php': 'QB', '/nfl/rankings/ros-ppr-rb.php': 'RB', '/nfl/rankings/ros-ppr-wr.php': 'WR', '/nfl/rankings/ros-ppr-te.php': 'TE', '/nfl/rankings/ros-k.php': 'K', '/nfl/rankings/ros-dst.php': 'DEF' };
const rosCommits = git('log', '--format=%H %cI', '--', ROS_FILE).trim().split('\n').map((l) => {
  const [h, t] = l.split(' ');
  return { h, t: Date.parse(t) };
}).reverse();
const blobCache = new Map();
let nRos = 0;
for (const [season, weeks] of Object.entries(sundays)) {
  for (const [wk, day] of Object.entries(weeks)) {
    if (Number(wk) < 3 || Number(wk) > 14) continue;
    const f = path.join(OUT, `ros-${season}-${wk}.json`);
    if (fs.existsSync(f)) continue;
    const sun = Date.parse(`${day}T17:00:00Z`);
    let c = null;
    for (const x of rosCommits) if (x.t < sun) c = x;
    if (!c || sun - c.t > 9 * 86400000) continue;
    if (!blobCache.has(c.h)) {
      const rows = parseCsv(git('show', `${c.h}:${ROS_FILE}`)).filter((r) => ROS_PAGE[r.fp_page]);
      blobCache.set(c.h, rows.map((r) => ({ pos: ROS_PAGE[r.fp_page], id: r.id, team: r.team || r.tm, player: r.player, ecr: r.ecr, sd: r.sd, scrape_date: r.scrape_date })));
    }
    const rows = blobCache.get(c.h);
    if (!rows.length) continue;
    fs.writeFileSync(f, JSON.stringify({ season: Number(season), week: Number(wk), scrapedAt: new Date(c.t).toISOString(), rows }));
    nRos++;
  }
}
console.log(`wrote ${nRos} rest-of-season versions`);

// FantasyPros id -> Sleeper id
const ids = parseCsv(fs.readFileSync(path.join(repo, '..', 'data', 'files', 'db_playerids.csv'), 'utf8'));
const map = {};
for (const r of ids) if (r.fantasypros_id && r.fantasypros_id !== 'NA' && r.sleeper_id && r.sleeper_id !== 'NA') map[r.fantasypros_id] = r.sleeper_id;
fs.writeFileSync(path.join(OUT, 'fp-to-sleeper.json'), JSON.stringify(map));
console.log(`wrote ${n} weekly versions, ${Object.keys(map).length} id links`);
