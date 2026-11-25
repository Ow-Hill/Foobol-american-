// Live check of the draft guide against real Sleeper data. Run on the home computer (the cloud
// cannot reach Sleeper):  npm run check-draft [-- <draft link or ID>]
// With no argument it uses the newest draft of the league in config.json.
// Writes docs/draft-check.md: which fields Sleeper sent, how many players got values, and a replay
// of the draft showing what the guide would have recommended at each of your picks.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { buildDraftValues, recommend } from '../public/js/draftguide.js';

const require = createRequire(import.meta.url);
const DL = require('../lib/draftlive.js');
const S = require('../lib/sources.js');
const cfg = require('../config.json');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

const arg = process.argv[2];
const call = async (p, q = {}) => {
  const u = new URL('http://x' + p);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const r = await DL.handle(u, cfg);
  if (r.status !== 200) throw new Error(r.body.error);
  return r.body;
};

let id = arg ? (String(arg).match(/(\d{10,})/) || [])[1] : null;
if (!id) {
  const home = await call('/api/draft/find');
  id = home.home[0]?.id;
  if (!id) throw new Error('No draft found for the configured league; pass a draft link');
}
const out = [];
const say = (s = '') => (out.push(s), console.log(s));
say(`# Draft guide live check\n\nRun ${new Date().toISOString()} on draft ${id}.\n`);

const board = await call('/api/draft/board', { id });
const live = await call('/api/draft/live', { id });
say(`- Draft: ${board.draft.name}, ${board.draft.season}, ${board.order.teams} teams, ${board.order.rounds} rounds, ${board.order.type}, status ${live.status}`);
say(`- Slots: ${board.slots.join(', ')}`);
say(`- Season projections rows: ${board.sources.projections}; last-season rows: ${board.sources.lastSeason}`);

// raw field check on the projection and stats feeds
const posQ = S.POS.map((p) => `position%5B%5D=${p}`).join('&');
const proj = await S.getJson(`https://api.sleeper.com/projections/nfl/${board.sources.season}?season_type=regular&${posQ}`, 60000).catch(() => []);
const stats = await S.getJson(`https://api.sleeper.com/stats/nfl/${board.sources.lastSeasonYear}?season_type=regular&${posQ}`, 60000).catch(() => []);
const has = (rows, k) => rows.filter((r) => r.stats && r.stats[k] != null).length;
say(`\n## Fields Sleeper sent\n`);
say(`| Feed | Field | Rows with it |\n|---|---|---|`);
for (const k of [...board.adpKeys, 'gp', 'pts_ppr']) say(`| projections ${board.sources.season} | ${k} | ${has(proj, k)} of ${proj.length} |`);
for (const k of ['gp', 'rec_tgt', 'rec_air_yd', 'rec_rz_tgt', 'rush_rz_att', 'off_snp', 'tm_off_snp', 'pass_att']) say(`| stats ${board.sources.lastSeasonYear} | ${k} | ${has(stats, k)} of ${stats.length} |`);

const V = buildDraftValues(board, {});
const withAdp = V.rows.filter((r) => r.adp).length;
say(`\n- Players valued: ${V.rows.length} (${withAdp} with ADP). Top 10: ${V.rows.slice(0, 10).map((r) => `${r.n} ${r.pos} ${r.value}`).join(', ')}`);

// replay: at each of my picks, what would the guide have said?
const me = Number(process.argv[3]) || (() => {
  const s2r = live.slotToRoster || board.slotToRoster || {};
  for (const [slot, nm] of Object.entries(board.names || {})) if (nm.owner && cfg.username && nm.owner.toLowerCase() === cfg.username.toLowerCase()) return Number(s2r[slot] ?? slot);
  return null;
})();
if (me != null && live.picks.length) {
  say(`\n## Replay for roster ${me}\n`);
  say(`| Pick | You took | Value | Guide's top 3 (value) | Took a top-3 pick? |\n|---|---|---|---|---|`);
  let hits = 0;
  let n = 0;
  for (const pk of live.picks.slice().sort((a, b) => a.no - b.no)) {
    const rid = Number(pk.rid ?? board.slotToRoster?.[pk.slot] ?? pk.slot);
    if (rid !== me || pk.keeper) continue;
    const rec = recommend(board, V, { ...live, picks: live.picks.filter((p) => p.no < pk.no) }, me);
    const top = rec.top.slice(0, 3);
    const hit = top.some((c) => String(c.r.pid) === String(pk.pid));
    hits += hit ? 1 : 0;
    n++;
    say(`| ${pk.no} | ${V.by[pk.pid]?.n || pk.n} | ${V.by[pk.pid]?.value ?? '–'} | ${top.map((c) => `${c.r.n} (${c.r.value})`).join(', ')} | ${hit ? 'yes' : 'no'} |`);
  }
  say(`\nYour pick was in the guide's top 3 at ${hits} of ${n} picks. Values use today's projections, so a finished draft is judged with hindsight: read this as a smoke test, not a grade.`);
}

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'draft-check.md'), out.join('\n') + '\n');
console.log('\nWrote docs/draft-check.md');
