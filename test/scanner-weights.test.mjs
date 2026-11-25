// Scanner weights: the tunable score, the backtest helpers that fit it (E22), and the live check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCAN_WEIGHTS, scoreFrom } from '../public/js/waiverintel.js';
import { addTeamShares } from '../backtest/data.mjs';
import { weightGrid, scanEval } from '../backtest/experiments-b.mjs';
import { fieldCoverage } from '../scripts/check-scanner.mjs';

test('scan weights sum to 1 and scoreFrom matches the hand formula', () => {
  const total = Object.values(SCAN_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const parts = { gain: 0.5, usageEff: 0.4, trend: 0.2, newsPart: 0.35, market: 0.3, health: 1 };
  const hand = Math.round(100 * (0.3 * 0.5 + 0.2 * 0.4 + 0.15 * 0.6 + 0.25 * 0.35 + 0.1 * 0.3));
  assert.equal(scoreFrom(parts), hand);
  assert.equal(scoreFrom({ ...parts, health: 0.35 }), Math.round(0.35 * hand));
});

test('backtest team shares and routes match the live snapshot rules', () => {
  const rows = new Map([
    ['a', { played: true, team: 'X', stats: { rec_tgt: 9, rush_att: 0, rec_air_yd: 90, off_snp: 60, tm_off_snp: 65 } }],
    ['b', { played: true, team: 'X', stats: { rec_tgt: 3, rush_att: 18, rec_air_yd: -5, off_snp: 40, tm_off_snp: 65 } }],
    ['q', { played: true, team: 'X', stats: { pass_att: 36, pass_sack: 3, off_snp: 65, tm_off_snp: 65 } }],
    ['z', { played: false, team: 'X', stats: { rec_tgt: 50 } }],
  ]);
  addTeamShares(rows);
  assert.equal(rows.get('a').tgtSh, 0.75);
  assert.equal(rows.get('b').attSh, 1);
  assert.equal(rows.get('a').airSh, 1, 'negative air yards count as zero');
  assert.equal(rows.get('a').routesEst, 36); // 60 snaps x 39/65 dropbacks
  assert.equal(rows.get('z').tgtSh, undefined, 'a row that did not play is left alone');
});

test('weight grid: every combination sums to 1 and no weight passes 0.6', () => {
  const g = weightGrid(0.1);
  assert.ok(g.length > 100);
  for (const w of g) {
    assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(Object.values(w).every((x) => x <= 0.6 + 1e-9));
  }
});

test('scanEval scores the top pick per team-week and counts ties against the rule', () => {
  const card = (gain, usageEff, gain3) => ({ gain, usageEff, trend: 0, newsPart: 0, market: 0, health: 1, gain3 });
  const rows = [
    { cards: [card(1, 0, 10), card(0, 1, -5)] },
    { cards: [card(0, 1, 8), card(0.5, 0, 2)] },
  ];
  const gainOnly = scanEval(rows, { gain: 1, usage: 0, trend: 0, news: 0, market: 0 });
  assert.equal(gainOnly.top, (10 + 2) / 2);
  const usageOnly = scanEval(rows, { gain: 0, usage: 1, trend: 0, news: 0, market: 0 });
  assert.equal(usageOnly.top, (-5 + 8) / 2);
  const tie = scanEval([{ cards: [card(0, 0, 9), card(0, 0, 1)] }], { gain: 1, usage: 0, trend: 0, news: 0, market: 0 });
  assert.equal(tie.top, 1);
});

test('live check: field coverage counts only the positions that use a field', () => {
  const cov = fieldCoverage({
    1: { pos: 'QB', hist: [{ passAtt: 30, passRtg: 95 }, { passAtt: 28 }] },
    2: { pos: 'WR', hist: [{ tgt: 7, tgtSh: 0.2, air: 60 }, { tgt: 5 }] },
    3: { pos: 'K', hist: [{ tgt: 0 }] },
  });
  assert.equal(cov.passRtg.rows, 2);
  assert.equal(cov.passRtg.share, 0.5);
  assert.equal(cov.tgtSh.rows, 4);
  assert.equal(cov.tgtSh.has, 1);
  assert.equal(cov.rzTgt.share, 0);
});
