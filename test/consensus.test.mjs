// Expert consensus: parsing, joining, the 50/50 blend in the projection, and the constants
// against the saved backtest results.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CONSENSUS, consensusPoints } from '../public/js/fitted.js';
import { buildModel } from '../public/js/model.js';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('consensus constants match the saved backtest (E17)', (t) => {
  const f = path.join(root, 'docs', 'backtest', 'results-current.json');
  const E = JSON.parse(fs.readFileSync(f, 'utf8')).experiments.E17;
  if (!E) return t.skip('backtest not run yet');
  for (const [pos, c] of Object.entries(CONSENSUS.curve)) {
    assert.ok(Math.abs(c[0] - E.fit.curve[pos][0]) < 0.01 && Math.abs(c[1] - E.fit.curve[pos][1]) < 0.01, pos);
  }
  // shipped only where the rule chosen on 2022-24 also held on 2025-26
  for (const pos of CONSENSUS.positions) assert.ok(E.fit.adopt[pos] && E.fit.confirmed[pos], pos);
  for (const pos of ['RB', 'TE', 'DEF']) assert.ok(!CONSENSUS.positions.includes(pos));
});

test('rank becomes points: lower rank, more points; never negative', () => {
  assert.ok(consensusPoints('WR', 1) > consensusPoints('WR', 12));
  assert.ok(Math.abs(consensusPoints('WR', 1) - 24.092) < 1e-9);
  assert.equal(consensusPoints('WR', 0), null);
  assert.ok(consensusPoints('TE', 500) >= 0);
});

test('projection: QB/WR/K average Sleeper with the experts; RB keeps Sleeper; both are exposed', () => {
  const pl = (id, pos, team, proj, ecr) => ({ id, n: id, pos, team, depth: 1, inj: null, hist: [], proj: { pts: proj }, own: 1, ...(ecr ? { ecr: { ecr, sd: 1, pos } } : {}) });
  const players = { w: pl('w', 'WR', 'CIN', 14, 5), r: pl('r', 'RB', 'DET', 15, 3), k: pl('k', 'K', 'DAL', 8, null) };
  const snap = {
    meta: { week: 6, tz: 'America/Toronto', builtAt: Date.now(), playoffWeeks: [15, 16, 17] },
    league: { name: 'T', rosterPositions: ['RB', 'WR', 'K', 'BN'], settings: { reserve_slots: 0, playoff_week_start: 15, playoff_teams: 2, trade_deadline: 11, num_teams: 2 }, scoring: {} },
    teams: [{ id: 1, owner: 'me', isMe: true, w: 0, l: 0, players: ['w', 'r', 'k'], starters: ['r', 'w', 'k'], reserve: [], taxi: [] }, { id: 2, owner: 'x', w: 0, l: 0, players: [], starters: [], reserve: [], taxi: [] }],
    players, schedule: { 6: { games: [], byes: [] } }, matchups: {}, transactions: [], picks: [], notes: [], articles: [], playerNews: { items: [] },
  };
  const M = buildModel(snap, 1, Date.now());
  const ew = consensusPoints('WR', 5);
  assert.ok(Math.abs(M.P('w').proj - (0.5 * 14 + 0.5 * ew)) < 1e-9);
  assert.equal(M.P('w').projSleeper, 14);
  assert.equal(M.P('w').blended, true);
  assert.equal(M.P('r').proj, 15, 'RB stays on Sleeper');
  assert.ok(M.P('r').projExperts > 0, 'but the experts are still shown');
  assert.equal(M.P('k').proj, 8, 'no consensus rank: Sleeper alone');
});

test('live consensus: rows joined to Sleeper ids, stale weeks and position mismatches dropped', async () => {
  const { attach } = require('../lib/consensus.js');
  const players = { 1: { id: '1', pos: 'WR' }, 2: { id: '2', pos: 'RB' }, BUF: { id: 'BUF', pos: 'DEF' } };
  const n = attach(players, { 1: { ecr: 4, sd: 1, pos: 'WR' }, 2: { ecr: 9, sd: 2, pos: 'WR' }, BUF: { ecr: 2, sd: 1, pos: 'DEF' } });
  assert.equal(n, 2);
  assert.equal(players[1].ecr.ecr, 4);
  assert.ok(!players[2].ecr, 'a WR rank is not attached to an RB');
});
