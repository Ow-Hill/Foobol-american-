// Which free agents get a news scan (lib/snapshot.js freeAgentScan).
const test = require('node:test');
const assert = require('node:assert/strict');
const { freeAgentScan } = require('../lib/snapshot.js');

const p = (id, pos, team, proj, extra = {}) => ({ id, n: 'P' + id, pos, team, own: null, inj: null, depth: null, proj: { pts: proj }, next: { pts: proj }, ...extra });

test('a backup whose starter is out is scanned first, then the best projections', () => {
  const players = {
    s1: p('s1', 'RB', 'AAA', 0, { own: 3, depth: 1, inj: 'IR' }), // rostered starter, on IR
    b2: p('b2', 'RB', 'AAA', 2, { depth: 2 }), // free-agent backup: the opening
    w1: p('w1', 'WR', 'BBB', 11),
    w2: p('w2', 'WR', 'CCC', 7),
    lo: p('lo', 'TE', 'DDD', 1),
    hurt: p('hurt', 'WR', 'EEE', 12, { inj: 'Out' }),
    mine: p('mine', 'WR', 'FFF', 20, { own: 1 }),
    k: p('k', 'K', 'GGG', 9),
  };
  assert.deepEqual(freeAgentScan(players, 10), ['b2', 'w1', 'w2']);
  assert.deepEqual(freeAgentScan(players, 2), ['b2', 'w1']);
});

test('a questionable starter does not open the job', () => {
  const players = { s1: p('s1', 'RB', 'AAA', 10, { own: 3, depth: 1, inj: 'Questionable' }), b2: p('b2', 'RB', 'AAA', 2, { depth: 2 }) };
  assert.deepEqual(freeAgentScan(players), []);
});
