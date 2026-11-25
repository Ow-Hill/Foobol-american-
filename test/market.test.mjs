// Trade-market values (Dynasty Dealer) and the Sleeper trade crawler used to calibrate trade value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { similar, slimTrade } from '../backtest/fetch-market.mjs';
import { buildModel } from '../public/js/model.js';
import { league, NOW } from './fixtures/league.mjs';

const require = createRequire(import.meta.url);
const market = require('../lib/market.js');

test('market values: any wrapper, scaled 0-100 with the top player 100, junk rows skipped', () => {
  const by = market.parse({ players: [{ sleeper_id: '7', base_value: 4000 }, { sleeper_id: 9, base_value: 8000 }, { name: 'no id', base_value: 1 }, { sleeper_id: '3', base_value: 0 }] });
  assert.deepEqual(Object.keys(by).sort(), ['7', '9']);
  assert.equal(by['9'].v, 100);
  assert.equal(by['9'].rank, 1);
  assert.equal(by['7'].v, 50);
  assert.deepEqual(market.parse(null), {});
});

test('market values attach by Sleeper id and show on the model', () => {
  const s = league((x) => (x.meta.market = { n: 1, at: 0, source: market.SOURCE.name, url: market.SOURCE.url }));
  const n = market.attach(s.players, { by: { 1003: { v: 88, rank: 2 } } });
  assert.equal(n, 1);
  const M = buildModel(s, 1, NOW);
  assert.equal(M.V.market('1003'), 88);
  assert.equal(M.V.market('1004'), null);
  assert.equal(M.V.marketSum(['1003', '1004']), 88);
  assert.equal(M.V.marketSum(['1004']), null);
  assert.equal(M.V.marketSource().url, 'https://www.dynastydealer.com');
});

test('trade crawler keeps only leagues shaped like this one', () => {
  const lg = (over = {}) => ({ total_rosters: 10, roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF', 'BN'], scoring_settings: { rec: 1 }, settings: { type: 1 }, ...over });
  assert.equal(similar(lg()), true);
  assert.equal(similar(lg({ total_rosters: 12 })), true);
  assert.equal(similar(lg({ total_rosters: 14 })), false);
  assert.equal(similar(lg({ roster_positions: ['QB', 'SUPER_FLEX', 'RB'] })), false);
  assert.equal(similar(lg({ roster_positions: ['QB', 'QB', 'RB'] })), false);
  assert.equal(similar(lg({ scoring_settings: { rec: 0.5 } })), false);
  assert.equal(similar(lg({ settings: { type: 2 } })), false, 'dynasty');
  assert.equal(similar(null), false);
  const t = slimTrade({ leg: 7, created: 5, roster_ids: [1, 2], adds: { a: 1, b: 2 }, draft_picks: [{ season: '2027', round: 2, owner_id: 1, previous_owner_id: 2 }] }, 'L', '2026');
  assert.deepEqual(t, { lid: 'L', season: 2026, leg: 7, created: 5, rids: [1, 2], adds: { a: 1, b: 2 }, picks: [{ s: 2027, r: 2, to: 1, from: 2 }] });
});

test('trade value curve: k = 1 is the old formula; k > 1 prices one star above two halves', () => {
  const M = buildModel(league(), 1, NOW);
  const V = M.V;
  for (const id of ['1003', '1005', '1006']) assert.ok(Math.abs(V.tv(id) - (V.value(id) + 0.4 * V.ppg(id))) < 1e-9);
  const flat = { k: 1, ppgCredit: 0 };
  const steep = { k: 2, ppgCredit: 0 };
  const star = '1003'; // value 100
  const two = ['1004', '1006']; // 60 + 53.3
  assert.ok(V.tvCurve(star, flat) < two.reduce((t, id) => t + V.tvCurve(id, flat), 0));
  assert.ok(V.tvCurve(star, steep) > two.reduce((t, id) => t + V.tvCurve(id, steep), 0));
});
