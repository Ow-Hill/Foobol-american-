// Live check for the waiver scanner. Builds a real snapshot (needs Sleeper, so run it on your own
// computer, not the cloud sandbox) and reports:
//   1. which advanced Sleeper stat fields actually arrive (share of game rows that carry each one),
//   2. the scanner board for your roster, with each pick's reasons.
// Usage: node scripts/check-scanner.mjs [rosterId]   (writes docs/backtest/scanner-check.md too)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../public/js/model.js';
import { buildPlayerNews } from '../public/js/playernews.js';
import { waiverIntel, VERDICT_LABEL } from '../public/js/waiverintel.js';

const require = createRequire(import.meta.url);
const { buildSnapshot } = require('../lib/snapshot.js');
const cfg = require('../config.json');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// fields the scanner reads, by where they come from
export const FIELDS = {
  'Sleeper feed': ['snp', 'att', 'tgt', 'rec', 'air', 'rzTgt', 'rzAtt', 'passAtt', 'sack', 'passYd', 'passTd', 'passAir', 'passRz', 'passRtg', 'rushYd', 'rushTd', 'recYd', 'recTd'],
  'Computed in the snapshot': ['tgtSh', 'attSh', 'airSh', 'routesEst'],
};
const POS_OF = { passAtt: 'QB', sack: 'QB', passYd: 'QB', passTd: 'QB', passAir: 'QB', passRz: 'QB', passRtg: 'QB' };

// Share of game rows that carry each field, among players at the positions that use it.
export function fieldCoverage(players) {
  const out = {};
  for (const [src, keys] of Object.entries(FIELDS)) {
    for (const k of keys) {
      let rows = 0;
      let has = 0;
      for (const p of Object.values(players)) {
        if (!['QB', 'RB', 'WR', 'TE'].includes(p.pos)) continue;
        if (POS_OF[k] && p.pos !== POS_OF[k]) continue;
        for (const h of p.hist || []) {
          rows++;
          if (h[k] != null) has++;
        }
      }
      out[k] = { src, rows, has, share: rows ? has / rows : 0 };
    }
  }
  return out;
}

async function main() {
  const rid = Number(process.argv[2] || cfg.defaultRosterId);
  console.log('Building a live snapshot (Sleeper, ESPN, news)...');
  const snap = await buildSnapshot();
  const cov = fieldCoverage(snap.players);
  const M = buildModel(snap, rid, Date.now());
  const I = waiverIntel(M, M.waiverPlan(), buildPlayerNews(M));
  let md = `# Scanner live check\n\nRun ${new Date().toISOString()} for roster ${rid}, Week ${M.W}.\n\n## Stat fields that arrived\n\n| Field | Source | Rows with it | Share |\n| --- | --- | --- | --- |\n`;
  for (const [k, v] of Object.entries(cov)) md += `| ${k} | ${v.src} | ${v.has} / ${v.rows} | ${Math.round(v.share * 100)}% |\n`;
  const missing = Object.entries(cov).filter(([, v]) => v.rows && v.share === 0).map(([k]) => k);
  md += `\nNever sent: ${missing.length ? missing.join(', ') : 'none'}.\n\n## Scanner board\n\n${I.scanned} free agents scanned, ${I.withNews} with news.\n\n`;
  for (const r of I.board) {
    md += `- **${r.p.n}** (${r.p.pos}, ${r.p.team}) — ${VERDICT_LABEL[r.verdict]}, score ${r.score}, T${r.tier}, ${r.confidence} confidence\n`;
    for (const x of r.reasons) md += `  - + ${x.kind}: ${x.text}\n`;
    for (const x of r.risks) md += `  - − ${x.kind}: ${x.text}\n`;
  }
  fs.mkdirSync(path.join(root, 'docs', 'backtest'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'backtest', 'scanner-check.md'), md);
  console.log(md);
  console.log('wrote docs/backtest/scanner-check.md');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
