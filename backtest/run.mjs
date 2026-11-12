// Runs every experiment and writes docs/backtest/results-<label>.json and docs/backtest/tables-<label>.md.
// Usage: NODE_USE_ENV_PROXY=1 node backtest/run.mjs [label] [--fetch]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './data.mjs';
import * as A from './experiments-a.mjs';
import * as B from './experiments-b.mjs';
import { fetchAll } from './fetch.mjs';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) || 'current';
if (args.includes('--fetch')) await fetchAll();

const ORDER = [A.e1, A.e2, A.e3, A.e4, A.e5, A.e6, B.e7, B.e8, B.e9, A.e10, B.e11, B.e12, B.e13, B.e14, B.e15];
const out = { label, generated: new Date().toISOString().slice(0, 10), seasons: D.SEASONS, train: D.TRAIN, test: D.TEST, coverage: {}, experiments: {} };
for (const s of D.SEASONS) {
  const S = D.loadSeason(s);
  out.coverage[s] = { weeks: S.lastWeek, injuryRows: S.injMatch.total, injuryUnmatched: S.injMatch.unmatched };
}
let md = `# Backtest tables (${label})\n\nGenerated ${out.generated} by \`npm run backtest\`. Seasons ${D.SEASONS[0]}-${D.SEASONS[D.SEASONS.length - 1]}; constants are fitted on ${D.TRAIN.join(', ')} and judged on ${D.TEST.join(', ')}.\n`;
for (const fn of ORDER) {
  const t = Date.now();
  const r = fn();
  out.experiments[r.id] = { title: r.title, findings: r.findings, fit: r.fit, tables: r.tables };
  md += `\n## ${r.id}. ${r.title}\n\n${r.findings.map((f) => `- ${f}`).join('\n')}\n`;
  for (const tb of r.tables) {
    md += `\n${tb.caption}\n\n| ${tb.head.join(' | ')} |\n| ${tb.head.map(() => '---').join(' | ')} |\n${tb.rows.map((row) => `| ${row.map((c) => (c == null ? '' : c)).join(' | ')} |`).join('\n')}\n`;
  }
  console.log(`${r.id} done in ${Date.now() - t} ms`);
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'backtest');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `results-${label}.json`), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(dir, `tables-${label}.md`), md);
console.log(`wrote docs/backtest/results-${label}.json and tables-${label}.md`);
