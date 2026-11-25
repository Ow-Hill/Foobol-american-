// Offseason trades: once the deadline passes, a deal can only move keeper slots and draft picks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../public/js/model.js';
import { buildKeeperMarket } from '../public/js/keepertrade.js';
import { league, NOW } from './fixtures/league.mjs';

// Owen (roster 1) has two keeper-quality players, Cy Cook and Ed Echo; nobody else has one.
const twoKeepers = (s) => {
  for (const [id, pts] of [['1003', 36], ['1005', 32]]) {
    const p = s.players[id];
    Object.assign(p, { age: 24, gp: 8, proj: { pts }, next: { pts }, hist: Array.from({ length: 8 }, (_, i) => ({ w: i + 1, pts })) });
  }
};
const model = (mutate) => buildModel(league(mutate), 1, NOW);

test('a second keeper-quality player is worth nothing to his team and his keeper value to a team without one', () => {
  const M = model(twoKeepers);
  const K = buildKeeperMarket(M);
  const me = K.byTeam[1];
  assert.equal(me.keepers.length, 2);
  assert.equal(me.slot, me.keepers[0].v, 'one keeper per team: only the best counts');
  const spare = me.keepers[1];
  const d = K.evaluate(2, [spare.id], []);
  assert.equal(d.mine.delta, 0, 'giving away the spare costs Owen nothing next season');
  assert.equal(d.theirs.delta, spare.v, 'he becomes their keeper');
  assert.equal(d.surplus, spare.v);
});

test('picks only split the value a deal creates', () => {
  const M = model(twoKeepers);
  const K = buildKeeperMarket(M);
  const spare = K.byTeam[1].keepers[1].id;
  const theirFirst = K.byTeam[2].picks.find((p) => p.round === 1).key;
  const a = K.evaluate(2, [spare], []);
  const b = K.evaluate(2, [spare], [theirFirst]);
  assert.equal(a.surplus, b.surplus);
  assert.ok(Math.abs(b.mine.delta + b.theirs.delta - a.surplus) < 1e-9);
  assert.equal(b.mine.picks, K.valueOf(theirFirst));
});

test('the search sells the spare to a team without a keeper, good for both', () => {
  const M = model(twoKeepers);
  const K = buildKeeperMarket(M);
  const deals = K.search();
  assert.ok(deals.length > 0);
  for (const x of deals) {
    assert.ok(x.fair.mine.delta >= 0 && x.fair.theirs.delta >= 0, 'both sides come out ahead');
    assert.ok(x.ask.mine.delta >= x.fair.mine.delta - 3.01, 'the opening ask is never much worse for Owen than the fair price');
    assert.ok(x.ask.theirs.delta >= 0);
  }
  assert.ok(deals.some((x) => x.fair.get.some((k) => K.isPick(k))), 'Owen is paid in picks');
});

test('a counter to a giveaway asks for picks back; a deal that destroys value has no pick fix', () => {
  const M = model(twoKeepers);
  const K = buildKeeperMarket(M);
  const spare = K.byTeam[1].keepers[1].id;
  const c = K.counter(2, [spare], []);
  assert.ok(c.fair.get.some((k) => K.isPick(k)));
  assert.ok(c.fair.mine.delta > 0 && c.fair.theirs.delta >= 0);
  // Owen's keeper to a team that already keeps someone better: worth nothing there, so no
  // package of picks makes it work for both.
  const R = buildKeeperMarket(model((x) => {
    twoKeepers(x);
    Object.assign(x.players['2002'], { age: 23, gp: 8, proj: { pts: 45 }, next: { pts: 45 }, hist: Array.from({ length: 8 }, (_, i) => ({ w: i + 1, pts: 45 })) });
  }));
  assert.equal(R.byTeam[2].keepers[0].id, '2002');
  const bad = R.counter(2, ['1003'], []);
  assert.ok(bad.core.surplus < 0);
  assert.equal(bad.fair, null);
});

test('three drafts of picks, later ones worth a little less, traded picks follow their owner', () => {
  const M = model((s) => {
    twoKeepers(s);
    s.picks = [{ season: '2028', round: 1, roster_id: 2, owner_id: 1 }];
  });
  const K = buildKeeperMarket(M);
  const mine = K.byTeam[1].picks;
  assert.deepEqual([...new Set(mine.map((p) => p.season))], [2027, 2028, 2029]);
  const p27 = mine.find((p) => p.season === 2027 && p.round === 1);
  const p28 = mine.find((p) => p.season === 2028 && p.round === 1 && p.orig === 1);
  assert.ok(p27 && p28 && p28.v < p27.v);
  assert.ok(mine.some((p) => p.season === 2028 && p.round === 1 && p.orig === 2), "Owen owns rival's 2028 first");
  assert.ok(!K.byTeam[2].picks.some((p) => p.season === 2028 && p.round === 1), 'and the rival no longer does');
  assert.match(K.label('pk:2028:1:2'), /rival's/);
});

test('the offseason page renders before and after the deadline, and Trade lab points to it after', async () => {
  const { render } = await import('../public/js/views/offseason.js');
  const before = render(model(twoKeepers), { ui: {} });
  assert.match(before, /Offseason trades/);
  assert.match(before, /Deals that work for both teams/);
  const after = model((s) => {
    twoKeepers(s);
    s.meta.week = 12;
  });
  assert.equal(after.deadlinePassed, true);
  const ui = { offseason: { partner: 2, give: [K0(after)], get: [] } };
  const html = render(after, { ui });
  assert.match(html, /trade deadline has passed/);
  assert.match(html, /Fair counter|as fair as picks/);
  const lab = await import('../public/js/views/trades.js');
  assert.match(lab.render(after, { ui: {} }), /#\/offseason/);
});
const K0 = (M) => buildKeeperMarket(M).byTeam[1].keepers[1].id;
