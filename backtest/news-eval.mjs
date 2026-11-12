// Scores the news classifier and the headline matcher against the hand-labelled set in
// news-golden.json. Headlines from past seasons are not archived, so this is the news scanner's
// test set going forward: add a case whenever a headline is misread.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { classify, focusText } from '../public/js/playernews.js';

const require = createRequire(import.meta.url);
const { relevant, headlineHit } = require('../lib/playernews.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(fs.readFileSync(path.join(here, 'news-golden.json'), 'utf8'));
// every NFL skill-player name (the site passes the names in its snapshot)
const db = path.join(here, '..', 'data', 'bt', 'players.json');
const slim = path.join(here, '..', 'data', 'players-slim-v2.json');
const src = fs.existsSync(db) ? JSON.parse(fs.readFileSync(db, 'utf8')) : fs.existsSync(slim) ? JSON.parse(fs.readFileSync(slim, 'utf8')) : {};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const SUF = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
const OTHERS = [...new Set(Object.values(src).filter((p) => p.pos !== 'DEF').map((p) => norm(p.n).split(' ').filter((w) => !SUF.has(w)).join(' ')))];
const SEVERE = new Set(['Out', 'IR', 'Sus', 'PUP', 'NA']);
const group = (s) => (!s ? 'none' : SEVERE.has(s) ? 'Out' : s);
const pct = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 10 : null);

export function newsEval() {
  const misses = [];
  const field = {};
  const tally = (name, truth, got) => {
    const f = (field[name] ||= { n: 0, right: 0, tp: 0, fp: 0, fn: 0 });
    f.n++;
    if (truth === got) f.right++;
    // precision / recall of saying "something" (any status, any practice, true)
    const t = truth != null && truth !== 'none' && truth !== false;
    const g = got != null && got !== 'none' && got !== false;
    if (t && g && truth === got) f.tp++;
    else {
      if (g) f.fp++;
      if (t) f.fn++;
    }
  };
  const runClassify = (list, prefix) => {
  for (const c of list) {
    const r = classify(c.t, '', 'headline', null, c.p, OTHERS);
    const checks = [['status', group(c.status), group(r.status)]];
    if ('practice' in c) checks.push(['practice', c.practice || 'none', r.practice === 'EST' ? 'none' : r.practice || 'none']);
    if ('better' in c) checks.push(['better', !!c.better, !!r.better]);
    if ('speculative' in c) checks.push(['speculative', !!c.speculative, r.posture === 'speculative']);
    if ('injury' in c) checks.push(['injury', !!c.injury, r.cats.includes('injury')]);
    for (const [name, truth, got] of checks) {
      tally(prefix + name, truth, got);
      if (truth !== got) misses.push({ field: prefix + name, title: c.t, expected: truth, got });
    }
  }
  };
  runClassify(G.classify, '');
  runClassify(G.heldout || [], 'held-out ');
  runClassify(G.fresh || [], 'fresh ');
  for (const c of G.match) {
    const got = headlineHit(c.p.n, c.t, c.p) && relevant(c.t, c.p);
    tally('matcher', c.about, got);
    if (got !== c.about) misses.push({ field: 'matcher', title: c.t, expected: c.about, got, player: c.p.n });
  }
  const rows = Object.entries(field).map(([k, f]) => [k, f.n, pct(f.right / f.n), pct(f.tp + f.fp ? f.tp / (f.tp + f.fp) : NaN), pct(f.tp + f.fn ? f.tp / (f.tp + f.fn) : NaN)]);
  const pick = (pre) => Object.entries(field).filter(([k]) => (pre ? k.startsWith(pre) : !k.startsWith('held-out ') && !k.startsWith('fresh ')));
  const frN = pick('fresh ').reduce((s, [, f]) => s + f.n, 0);
  const frRight = pick('fresh ').reduce((s, [, f]) => s + f.right, 0);
  const total = pick('').reduce((s, [, f]) => s + f.n, 0);
  const right = pick('').reduce((s, [, f]) => s + f.right, 0);
  const hoN = pick('held-out ').reduce((s, [, f]) => s + f.n, 0);
  const hoRight = pick('held-out ').reduce((s, [, f]) => s + f.right, 0);
  return {
    id: 'N1', title: 'News scanner: how well does it read headlines?',
    tables: [
      { caption: `${G.classify.length} labelled headlines for the classifier, ${G.match.length} for the matcher (backtest/news-golden.json). Precision: when it says something, how often it is right. Recall: of the headlines that say something, how many it catches.`, head: ['Field', 'Cases', 'Correct %', 'Precision %', 'Recall %'], rows },
      { caption: 'Every miss (each is a test case to fix or a known limit).', head: ['Field', 'Headline', 'Expected', 'Got'], rows: misses.map((m) => [m.field, m.title.replace(/\|/g, '/'), String(m.expected), String(m.got)]) },
    ],
    findings: [
      `Development set: ${pct(right / total)}% of ${total} checks correct (71.3% before the fixes this set prompted, so this number is no longer independent).`,
      `Second set, labelled after the first round of fixes: 76% of 31 checks were correct when first scored (status 74%: four of the five status misses were another player's news pinned on the named one). The clause rule and three more patterns were then added, so it is now ${pct(hoRight / hoN)}% and also no longer independent.`,
      ...(G.fresh?.length ? [`Fresh set (live headlines, labelled after every earlier fix): 78.3% of 46 checks correct when first scored. That is the honest number. Its ten misses were then fixed too, so it now scores ${pct(frRight / frN)}%; the next batch of labelled headlines gives the next honest number.`] : []),
    ],
    fit: { field, misses: misses.length, accuracy: right / total, heldout: hoN ? hoRight / hoN : null, heldoutN: hoN, heldoutFirst: 0.76, freshFirst: 0.783, fresh: frN ? frRight / frN : null, freshN: frN, before: 0.713 },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = newsEval();
  console.log(r.findings[0]);
  for (const row of r.tables[0].rows) console.log(row.join(' | '));
  for (const row of r.tables[1].rows) console.log(' -', row.join(' | '));
}
