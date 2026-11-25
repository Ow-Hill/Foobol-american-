// Advanced position stats for the waiver scanner (public/js/advstats.js). Synthetic game rows
// shaped like lib/snapshot.js hist entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { advancedOf, benchUsage, xpGame, BENCHMARKS, SOURCES } from '../public/js/advstats.js';
import { buildModel } from '../public/js/model.js';
import { buildPlayerNews } from '../public/js/playernews.js';
import { waiverIntel } from '../public/js/waiverintel.js';
import { league, NOW } from './fixtures/league.mjs';

const wr = (tgt, tgtSh, air, airSh, routesEst, recYd, pts, rzTgt = 0) => ({ pts, snp: 80, att: 0, tgt, rec: tgt * 0.6, tgtSh, air, airSh, routesEst, recYd, rzTgt });

test('WR line: shares, WOPR, routes and YPRR, with estimates marked', () => {
  const a = advancedOf('WR', [wr(9, 0.3, 80, 0.4, 35, 90, 18), wr(8, 0.28, 70, 0.35, 34, 80, 16), wr(10, 0.32, 90, 0.45, 36, 100, 20)]);
  assert.equal(a.games, 3);
  assert.equal(a.m.tgt.v, 9);
  assert.ok(Math.abs(a.m.tgtSh.v - 0.3) < 1e-9);
  assert.ok(Math.abs(a.m.wopr.v - (1.5 * 0.3 + 0.7 * 0.4)) < 1e-9);
  assert.equal(a.m.wopr.approx, true);
  assert.equal(a.m.routes.approx, true);
  assert.ok(Math.abs(a.m.yprr.v - 270 / 105) < 1e-9);
  assert.equal(a.m.tgtSh.approx, undefined, 'target share is computed exactly, not estimated');
});

test('fields the feed did not send are left out, never shown as zero', () => {
  const a = advancedOf('WR', [{ pts: 10, snp: 70, att: 0, tgt: 6, rec: 4 }]);
  assert.ok(a.m.tgt);
  for (const k of ['tgtSh', 'wopr', 'routes', 'yprr', 'air', 'xp', 'rzTgt']) assert.equal(a.m[k], undefined, k);
});

test('QB line: dropbacks, rushing points, red-zone attempts and expected points', () => {
  const g = { pts: 24, snp: 100, att: 7, passAtt: 32, sack: 3, rushYd: 40, rushTd: 1, passRz: 4, rzAtt: 2, passRtg: 98 };
  const a = advancedOf('QB', [g, g, g]);
  assert.equal(a.m.dropbacks.v, 35);
  assert.equal(a.m.rushPts.v, 10);
  assert.equal(a.m.rz.v, 6);
  assert.equal(a.m.rtg.v, 98);
  assert.ok(Math.abs(a.m.xp.v - xpGame('QB', g)) < 1e-9);
  assert.ok(Math.abs(a.m.xpGap.v - (24 - xpGame('QB', g))) < 1e-9);
});

test('benchmark usage: a Gibbs-sized workload scores 1, half of it about 0.5', () => {
  const b = BENCHMARKS.RB[0];
  const full = advancedOf('RB', [{ pts: 25, att: b.rushAtt, tgt: b.tgt, rec: 4, attSh: 0.65, rzAtt: 2, rzTgt: 1 }]);
  const half = advancedOf('RB', [{ pts: 10, att: b.rushAtt / 2, tgt: b.tgt / 2, rec: 2, attSh: 0.325, rzAtt: 1, rzTgt: 0.5 }]);
  assert.ok(Math.abs(benchUsage('RB', full).score - 1) < 1e-9);
  assert.ok(Math.abs(benchUsage('RB', half).score - 0.5) < 1e-9);
  assert.equal(benchUsage('RB', full).vs.find((x) => x.k === 'rushAtt').refName, 'Jahmyr Gibbs');
});

test('every position names its sources, and routes-based metrics are labelled estimates', () => {
  for (const pos of ['QB', 'RB', 'WR', 'TE']) assert.ok(Object.keys(SOURCES[pos]).length >= 5);
  assert.match(SOURCES.WR['Routes run'], /^estimate/);
  assert.match(SOURCES.WR['Yards per route run'], /^estimate/);
  assert.match(SOURCES.RB['Inside-10 / green-zone touches'], /^missing/);
});

function scanWith(hist) {
  const s = league((x) => (x.players['5003'].hist = hist));
  s.articles = [];
  s.playerNews = { items: [], perPlayer: {} };
  const M = buildModel(s, 1, NOW);
  return waiverIntel(M, M.waiverPlan(), buildPlayerNews(M)).byId.get('5003');
}

test('scanner: big target share beats the same points on thin volume', () => {
  const thin = scanWith([1, 2, 3, 4, 5].map(() => wr(3, 0.1, 20, 0.1, 30, 40, 12)));
  const big = scanWith([1, 2, 3, 4, 5].map(() => wr(9, 0.3, 80, 0.4, 35, 90, 12)));
  assert.ok(big.score > thin.score);
  assert.ok(big.reasons.some((r) => r.kind === 'volume' && /Smith-Njigba/.test(r.text)));
  assert.ok(thin.risks.some((r) => r.kind === 'volume'));
});

test('scanner: scoring far above volume is flagged to cool, far below is due to catch up', () => {
  const hot = scanWith([1, 2, 3].map(() => wr(3, 0.1, 20, 0.1, 30, 40, 22)));
  assert.ok(hot.risks.some((r) => r.kind === 'efficiency' && /likely to cool/.test(r.text)));
  const cold = scanWith([1, 2, 3].map(() => wr(10, 0.3, 100, 0.4, 35, 40, 4, 1)));
  assert.ok(cold.reasons.some((r) => r.kind === 'efficiency' && /due to catch up/.test(r.text)));
});
