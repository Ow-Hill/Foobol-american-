// Roster model tests: lineup solver, start/sit, fallbacks, waiver drops, season sim.
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../public/js/model.js';
import { buildPlayerNews, latestAdverse } from '../public/js/playernews.js';

const pl = (id, pos, team, proj, extra = {}) => ({ id, n: `Player ${id.toUpperCase()}`, pos, team, depth: 1, inj: null, hist: [], proj: { pts: proj }, trend: null, own: 1, ...extra });

// Hand-checkable league. Optimal lineup for team 1 (r3 is Out):
// QB qa 20 · RB r1 18, r2 12 · WR w1 16, w2 14 · TE t1 9 · FLEX w3 11 · SUPER_FLEX qb 15 = 115
function league(over = {}) {
  const players = {
    qa: pl('qa', 'QB', 'BUF', 20), qb: pl('qb', 'QB', 'KC', 15),
    r1: pl('r1', 'RB', 'DET', 18), r2: pl('r2', 'RB', 'SF', 12), r3: pl('r3', 'RB', 'MIA', 9, { inj: 'Out' }), r4: pl('r4', 'RB', 'NYJ', 7),
    w1: pl('w1', 'WR', 'CIN', 16), w2: pl('w2', 'WR', 'DAL', 14), w3: pl('w3', 'WR', 'LAR', 11),
    t1: pl('t1', 'TE', 'BAL', 9), t2: pl('t2', 'TE', 'TEN', 4),
    x1: pl('x1', 'QB', 'PHI', 22, { own: 2 }), x2: pl('x2', 'RB', 'ATL', 17, { own: 2 }),
    w4: pl('w4', 'WR', 'CHI', 2), r5: pl('r5', 'RB', 'CAR', 1),
    fa: pl('fa', 'RB', 'GB', 13, { own: null, trend: { add: { n: 5000, rank: 2 } } }),
    ...over,
  };
  const mine = ['qa', 'qb', 'r1', 'r2', 'r3', 'r4', 'r5', 'w1', 'w2', 'w3', 'w4', 't1', 't2']; // 13 = full roster
  const W = 6;
  const matchups = {};
  for (let w = 1; w <= 14; w++) {
    matchups[w] = [
      { rid: 1, mid: 1, pts: w < W ? 110 + w : 0, starters: [], players: [], pp: {} },
      { rid: 2, mid: 1, pts: w < W ? 100 + w : 0, starters: [], players: [], pp: {} },
      { rid: 3, mid: 2, pts: w < W ? 95 : 0, starters: [], players: [], pp: {} },
      { rid: 4, mid: 2, pts: w < W ? 90 : 0, starters: [], players: [], pp: {} },
    ];
  }
  return {
    meta: { week: W, tz: 'America/Toronto', builtAt: Date.now(), playoffWeeks: [15, 16, 17], leagueId: 'x' },
    league: {
      name: 'Model test',
      rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN', 'BN', 'BN', 'BN'],
      settings: { reserve_slots: 1, playoff_week_start: 15, playoff_teams: 2, trade_deadline: 11, num_teams: 4, waiver_day_of_week: 2, reserve_allow_out: 1 },
      scoring: {},
    },
    teams: [
      // current starters put r3 (Out) at RB2 and r2 on the bench
      { id: 1, owner: 'me', name: 'Me', isMe: true, w: 4, l: 1, players: mine, starters: ['qa', 'r1', 'r3', 'w1', 'w2', 't1', 'w3', 'qb'], reserve: [], taxi: [] },
      { id: 2, owner: 'two', name: 'Two', w: 3, l: 2, players: ['x1', 'x2'], starters: ['x1', 'x2', '0', '0', '0', '0', '0', '0'], reserve: [], taxi: [] },
      { id: 3, owner: 'three', name: 'Three', w: 2, l: 3, players: [], starters: [], reserve: [], taxi: [] },
      { id: 4, owner: 'four', name: 'Four', w: 1, l: 4, players: [], starters: [], reserve: [], taxi: [] },
    ],
    players,
    schedule: { [W]: { games: [], byes: [] } },
    matchups,
    transactions: [],
    picks: [],
    notes: [],
    articles: [],
    playerNews: { items: [], perPlayer: {}, degraded: false, disabled: false },
  };
}

test('solver: best legal lineup, Out players excluded, QB only in SUPER_FLEX', () => {
  const M = buildModel(league(), 1, Date.now());
  const opt = M.lineup(M.me).opt;
  const by = Object.fromEntries(opt.slots.map((s, i) => [`${s.slot}${i}`, s.pid]));
  assert.equal(opt.total, 115);
  assert.ok(!opt.slots.some((s) => s.pid === 'r3'), 'Out player never starts');
  assert.equal(by.FLEX6, 'w3');
  assert.equal(by.SUPER_FLEX7, 'qb');
  for (const s of opt.slots) assert.ok(M.slotEligible(s.slot, M.P(s.pid).pos), `${s.pid} legal in ${s.slot}`);
});

test('swaps: the Out starter is replaced by the best bench RB', () => {
  const M = buildModel(league(), 1, Date.now());
  const sw = M.swaps();
  assert.ok(sw.some((s) => s.start === 'r2' && s.bench === 'r3'), JSON.stringify(sw.map((s) => [s.start, s.bench])));
});

test('start/sit bands: health first, then the projection gap', () => {
  const M = buildModel(league(), 1, Date.now());
  const out = M.startSit('r3', 'r4');
  assert.equal(out.pick, 'r4');
  assert.equal(out.band, 'clear');
  assert.equal(M.startSit('w1', 'w3').band, 'clear'); // gap 5
  assert.equal(M.startSit('w2', 'w3').band, 'lean'); // gap 3
  assert.equal(M.startSit('w2', 'w3').pick, 'w2');
});

test('fallback: never an Out player, questionable discounted', () => {
  const M = buildModel(league(), 1, Date.now());
  assert.equal(M.fallbackFor('RB', ['r3']), 'r2');
  const M2 = buildModel(league({ r2: pl('r2', 'RB', 'SF', 12, { inj: 'Questionable' }) }), 1, Date.now());
  // 12 × 0.75 = 9 still beats r4's 7
  assert.equal(M2.fallbackFor('RB', ['r3']), 'r2');
  const M3 = buildModel(league({ r2: pl('r2', 'RB', 'SF', 12, { inj: 'Out' }) }), 1, Date.now());
  assert.equal(M3.fallbackFor('RB', ['r3']), 'r4');
});

test('waiver plan: suggested drops are never in the best lineup', () => {
  const M = buildModel(league(), 1, Date.now());
  const plan = M.waiverPlan();
  const starters = new Set(M.lineup(M.me).opt.slots.map((s) => s.pid));
  const all = [...plan.tier1, ...plan.groups.risers, ...plan.groups.lottery, ...plan.groups.cuffs, ...plan.streams.DEF, ...plan.streams.K];
  const fa = all.find((c) => c.id === 'fa');
  assert.ok(fa, 'the trending free agent who upgrades FLEX is suggested');
  assert.equal(fa.drop.pid, 'r5', 'drops the lowest-value bench player');
  for (const c of all) if (c.drop?.pid) assert.ok(!starters.has(c.drop.pid), `drop ${c.drop.pid} is a starter`);
});

test('season sim is deterministic for a seed and odds are probabilities', () => {
  const M = buildModel(league(), 1, Date.now());
  const a = M.runSim({ n: 500, seed: 7 });
  const b = M.runSim({ n: 500, seed: 7 });
  assert.deepEqual(a.res[1], b.res[1]);
  for (const id of [1, 2, 3, 4]) {
    assert.ok(a.res[id].playoff >= 0 && a.res[id].playoff <= 1);
  }
  const sum = [1, 2, 3, 4].reduce((s, id) => s + a.res[id].playoff, 0);
  assert.ok(Math.abs(sum - 2) < 1e-9, `two playoff spots, got ${sum}`);
  assert.ok(a.res[1].playoff > a.res[4].playoff, 'the best team makes it more often');
});

test('waiver day comes from league settings', () => {
  const M = buildModel(league(), 1, Date.now());
  assert.equal(M.waiverDayName(), 'Tuesday');
});

test('a player outside the snapshot resolves without throwing', () => {
  const M = buildModel(league(), 1, Date.now());
  assert.equal(M.P('nobody').missing, true);
});

test('the latest dated status decides, not any status in the last week', () => {
  const snap = league();
  const now = Date.now();
  snap.changes = {
    r2: [
      { at: now - 48 * 3600e3, field: 'inj', from: null, to: 'Out' },
      { at: now - 2 * 3600e3, field: 'inj', from: 'Out', to: null },
    ],
  };
  const M = buildModel(snap, 1, now);
  const res = buildPlayerNews(M);
  const items = res.byPid.get('r2');
  assert.equal(items.length, 2);
  assert.equal(items.find((x) => x.time === now - 2 * 3600e3).better, true);
  assert.equal(latestAdverse(res.byPid, 'r2'), false, 'cleared player is not still treated as out');
  snap.changes.r2.pop();
  const res2 = buildPlayerNews(buildModel(snap, 1, now));
  assert.equal(latestAdverse(res2.byPid, 'r2'), true);
});

test('refresh timing follows the football clock', async () => {
  const { ttlFor } = (await import('../lib/playernews.js')).default;
  const MIN = 60e3;
  // Sunday 2026-11-15 13:00 ET kickoff
  const kick = Date.parse('2026-11-15T18:00:00Z');
  const p = { cold: true, kick };
  assert.equal(ttlFor(p, kick - 60 * MIN), 2 * MIN, 'inactives window');
  assert.equal(ttlFor(p, kick + 60 * MIN), 5 * MIN, 'in game');
  assert.equal(ttlFor(p, kick - 20 * 60 * MIN), 5 * MIN, 'game eve');
  assert.equal(ttlFor(p, kick + 10 * 60 * MIN), 15 * MIN, 'post-game');
  // Thursday 15:00 ET, practice report window, game three days away
  assert.equal(ttlFor(p, Date.parse('2026-11-12T20:00:00Z')), 5 * MIN, 'practice window');
  // Tuesday 15:00 ET, quiet day
  assert.equal(ttlFor(p, Date.parse('2026-11-10T20:00:00Z')), 30 * MIN, 'quiet day');
  assert.equal(ttlFor({ hot: true }, Date.now()), 3 * MIN, 'no kickoff known: flat TTL');
});

test('tiebreak: equal projections, the softer matchup vs position wins', () => {
  const snap = league({
    w2: pl('w2', 'WR', 'DAL', 11), // now equal to w3 (11)
  });
  const t = Date.now() + 3 * 86400e3;
  // this week: DAL vs T01 (soft vs WR), LAR vs T08 (tough vs WR); same kickoff, no lines
  snap.schedule[6].games = [
    { home: { t: 'DAL' }, away: { t: 'T01' }, date: new Date(t).toISOString(), state: 'pre' },
    { home: { t: 'LAR' }, away: { t: 'T08' }, date: new Date(t).toISOString(), state: 'pre' },
  ];
  // 8 defenses over 3 weeks; T01 allows the most to WRs, T08 the least
  snap.results = {};
  for (let w = 1; w <= 3; w++) {
    snap.results[w] = {};
    for (let i = 1; i <= 8; i++) {
      snap.results[w][`O${i}`] = `T0${i}`;
      snap.results[w][`T0${i}`] = `O${i}`;
      snap.players[`o${i}`] = { id: `o${i}`, n: `Opp WR ${i}`, pos: 'WR', team: `O${i}`, hist: [1, 2, 3].map((wk) => ({ w: wk, pts: 30 - i * 3 })), own: null, proj: { pts: 0 } };
    }
  }
  const M = buildModel(snap, 1, Date.now());
  const ss = M.startSit('w2', 'w3');
  assert.equal(ss.band, 'toss');
  assert.equal(ss.pick, 'w2');
  assert.ok(ss.why.some((x) => /Position matchup/.test(x)), ss.why.join(' | '));
});
