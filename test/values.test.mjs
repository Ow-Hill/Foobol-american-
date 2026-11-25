// One player value across the site: drops, waivers, injuries, tiebreaks and the scanner all read
// the same rest-of-season value from values.js (M.V).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../public/js/model.js';
import { scanCandidate } from '../public/js/waiverintel.js';
import { league, NOW } from './fixtures/league.mjs';

const model = (mutate) => buildModel(league(mutate), 1, NOW);
const fullRoster = (s) => {
  for (const [id, pos, pts] of [['1010', 'QB', 2], ['1011', 'WR', 1], ['1012', 'RB', 3], ['1013', 'TE', 0.5]]) {
    s.players[id] = { id, n: 'Bench ' + id, pos, team: 'DDD', inj: null, proj: { pts }, hist: [], own: 1 };
    s.teams[0].players.push(id);
  }
};

test('values build from the league fixture: 0-100, best player 100, everyone ranked', () => {
  const M = model();
  assert.ok(M.V.rows.length > 10);
  assert.equal(M.V.rows[0].value, 100);
  for (const r of M.V.rows) assert.ok(r.value >= 0 && r.value <= 100, `${r.pid} value ${r.value}`);
  assert.equal(M.valueOf('1003'), M.V.value('1003'));
  assert.equal(M.valueOf(null), 0);
});

test('the drop is the lowest-value bench player and carries its value', () => {
  const M = model(fullRoster);
  const d = M.dropFor({ id: '5001' });
  assert.ok(d.pid);
  assert.equal(d.value, M.valueOf(d.pid));
  const bench = M.lineup(M.me).bench.filter((id) => !['1013'].includes(id));
  assert.ok(bench.every((id) => M.valueOf(id) >= d.value), 'nobody droppable is worth less');
});

test('waiver cards carry value and net value after the drop', () => {
  const M = model(fullRoster);
  const r = M.waiverPlan().groups.risers.find((c) => c.id === '5001');
  assert.equal(r.value, M.valueOf('5001'));
  assert.equal(r.net, r.value - M.valueOf(r.drop.pid));
  // open roster spot: nothing is dropped, so the whole value is the gain
  const open = model().waiverPlan().groups.risers.find((c) => c.id === '5001');
  assert.equal(open.net, open.value);
});

test('a Tier 2 add worth less than the player it drops falls to Tier 3; Tier 1 is untouched', () => {
  const M = model();
  const p = M.P('5001');
  const base = { id: '5001', p, group: 'riser', drop: { pid: '1004' } };
  assert.equal(M.tierFor({ ...base, impact: 1.5, net: 4 }), 2);
  assert.equal(M.tierFor({ ...base, impact: 1.5, net: -4 }), 3);
  assert.equal(M.tierFor({ ...base, impact: 1.5, net: -4, drop: { none: true } }), 2, 'no drop, no cost');
  assert.equal(M.tierFor({ ...base, impact: 5, net: -20 }), 1);
});

test('a bench player out with IR full is a cut candidate when a free agent is worth more', () => {
  const M = model((s) => {
    s.players['1006'].inj = 'Out';
    s.players['1009'] = { id: '1009', n: 'Ike Ir', pos: 'WR', team: 'DDD', inj: 'IR', proj: { pts: 0 }, hist: [], own: 1 };
    s.teams[0].players.push('1009');
    s.teams[0].reserve.push('1009');
  });
  const fa = M.bestFreeAgent();
  assert.equal(M.snap.players[fa.pid].own, null);
  const row = M.injuryRows().find((r) => r.pid === '1006');
  assert.equal(row.action.t, 'Cut candidate');
  assert.ok(row.value < fa.value);
});

test('start/sit: rest-of-season value is the last tiebreak', () => {
  const M = model((s) => {
    for (const id of ['1004', '1006']) delete s.players[id].game;
  });
  const va = M.valueOf('1004');
  const vb = M.valueOf('1006');
  const tb = M.tiebreakFor('1004', '1006');
  if (Math.abs(va - vb) >= 5) {
    assert.equal(tb.reasons.at(-1).step, 'Rest-of-season value');
    assert.equal(tb.pick, va > vb ? 'start' : 'bench');
  } else assert.equal(tb.reasons.at(-1).step, 'No tiebreak separates them');
});

test('scanner gain counts rest-of-season value even with no lineup gain this week', () => {
  const M = model();
  const p = M.P('5001');
  const none = scanCandidate(M, { id: '5001', p, impact: 0, impactNext: 0, value: 0, net: 0 }, new Map());
  const big = scanCandidate(M, { id: '5001', p, impact: 0, impactNext: 0, value: 40, net: 20 }, new Map());
  assert.equal(none.parts.gain, 0);
  assert.equal(big.parts.gain, 1);
  assert.ok(big.score > none.score);
  assert.ok(big.reasons.some((r) => r.kind === 'value'));
});
