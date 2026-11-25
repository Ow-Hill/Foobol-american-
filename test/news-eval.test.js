// Golden-set evaluation for the news matcher (P5.4). Run with: npm test
// Prints precision@10, recall and coverage, with and without same-name disambiguation.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { filterItems } = require('../lib/playernews');
const golden = require(path.join(__dirname, 'fixtures', 'news-golden.json'));

const NOW = Date.UTC(2026, 10, 25, 12);

function evaluate(overrides = {}) {
  let kept = 0;
  let keptRelevant = 0;
  let totalRelevant = 0;
  let withNews = 0;
  let covered = 0;
  const misses = [];
  for (const g of golden.players) {
    const p = { n: g.n, pos: g.pos, team: g.team, ...overrides };
    const raw = g.headlines.map((h) => ({ ...h, time: NOW - h.hoursAgo * 3600e3, url: null, domain: null }));
    const label = new Map(g.headlines.map((h) => [h.title, h.relevant]));
    const top = filterItems(p, raw, NOW).slice(0, 10);
    const good = top.filter((it) => label.get(it.title)).length;
    const rel = g.headlines.filter((h) => h.relevant).length;
    kept += top.length;
    keptRelevant += good;
    totalRelevant += rel;
    if (rel) {
      withNews++;
      if (good) covered++;
    }
    for (const it of top) if (!label.get(it.title)) misses.push(`FP  ${g.n}: ${it.title}`);
    const keptTitles = new Set(top.map((it) => it.title));
    for (const h of g.headlines) if (h.relevant && !keptTitles.has(h.title)) misses.push(`FN  ${g.n}: ${h.title}`);
  }
  return {
    precision: kept ? keptRelevant / kept : 1,
    recall: totalRelevant ? keptRelevant / totalRelevant : 1,
    coverage: withNews ? covered / withNews : 1,
    misses,
  };
}

const fmt = (x) => x.toFixed(3);

test('golden set: precision@10 >= 0.8 and coverage >= 80%', () => {
  const base = evaluate({ collision: false });
  const now = evaluate();
  console.log(`# news-eval players=${golden.players.length}`);
  console.log(`# without disambiguation  precision@10=${fmt(base.precision)} recall=${fmt(base.recall)} coverage=${fmt(base.coverage)}`);
  console.log(`# with disambiguation     precision@10=${fmt(now.precision)} recall=${fmt(now.recall)} coverage=${fmt(now.coverage)}`);
  for (const m of now.misses) console.log(`#   ${m}`);
  assert.ok(now.precision >= 0.8, `precision@10 ${fmt(now.precision)} < 0.8`);
  assert.ok(now.coverage >= 0.8, `coverage ${fmt(now.coverage)} < 0.8`);
  assert.ok(now.precision >= base.precision, 'disambiguation must not lower precision');
});
