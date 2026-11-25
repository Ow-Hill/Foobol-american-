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

test('tiebreak: position matchup no longer decides (it won 50% in the backtest); a 4+ implied-total gap does', () => {
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
  assert.ok(!ss.why.some((x) => /Position matchup/.test(x)), ss.why.join(' | '));
  assert.ok(ss.why.some((x) => /No tiebreak separates/.test(x)), ss.why.join(' | '));
  // a small gap in implied totals is not a reason either
  snap.schedule[6].games[0].home.imp = 23;
  snap.schedule[6].games[1].home.imp = 21;
  assert.ok(!buildModel(snap, 1, Date.now()).startSit('w2', 'w3').why.some((x) => /Game environment/.test(x)));
  // four points or more is
  snap.schedule[6].games[0].home.imp = 27;
  const big = buildModel(snap, 1, Date.now()).startSit('w2', 'w3');
  assert.equal(big.pick, 'w2');
  assert.ok(big.why.some((x) => /Game environment/.test(x)), big.why.join(' | '));
});

test('labels carry the measured win rate, with smaller cut-offs for K and DEF', () => {
  const snap = league({
    k1: pl('k1', 'K', 'BUF', 9.6), k2: pl('k2', 'K', 'KC', 8),
    d1: pl('d1', 'DEF', 'DET', 9), d2: pl('d2', 'DEF', 'SF', 6.4),
  });
  const M = buildModel(snap, 1, Date.now());
  const skill = M.startSit('w1', 'w3'); // 16 vs 11
  assert.equal(skill.band, 'clear');
  assert.ok(skill.rate >= 68 && skill.rate <= 70, String(skill.rate));
  const lean = M.startSit('w2', 'w3'); // 14 vs 11
  assert.equal(lean.band, 'lean');
  assert.equal(lean.rate, 63);
  assert.match(lean.why[0], /won 63% of the time/);
  assert.equal(M.startSit('k1', 'k2').band, 'lean', 'a 1.6-point kicker gap is already a lean');
  assert.equal(M.startSit('d1', 'd2').band, 'clear', 'a 2.6-point defense gap is a clear call');
  assert.equal(M.startSit('qa', 'qb').band, 'clear'); // 20 vs 15 = 5
  assert.equal(M.startSit('qa', 'x1').band, 'toss'); // 20 vs 22 = 2, under the QB lean line of 3
});

test('Questionable: discounted when he plays, chance to play from practice status, swap when you cannot wait', () => {
  const soon = new Date(Date.now() + 2 * 86400e3).toISOString();
  const later = new Date(Date.now() + 2 * 86400e3 + 8 * 3600e3).toISOString();
  const snap = league({ r1: pl('r1', 'RB', 'DET', 18, { inj: 'Questionable', prac: 'Limited' }) });
  // DET (r1) plays late; SF (r2, the fallback, on the bench) plays early
  snap.schedule[6].games = [
    { home: { t: 'DET' }, away: { t: 'T1' }, date: later, state: 'pre' },
    { home: { t: 'SF' }, away: { t: 'T2' }, date: soon, state: 'pre' },
  ];
  snap.teams[0].starters = ['qa', 'r1', 'r4', 'w1', 'w2', 't1', 'w3', 'qb'];
  const M = buildModel(snap, 1, Date.now());
  assert.equal(M.P('r1').prac, 'LP');
  assert.equal(M.P('r1').playChance, 0.68);
  assert.ok(Math.abs(M.val('r1') - 18 * 0.91) < 1e-9, 'a Questionable player who plays scores about 91% of his projection');
  const q = M.qCall('r1', 'RB');
  assert.equal(q.fb, 'r2');
  assert.equal(q.canWait, false, 'the fallback kicks off before inactives are out');
  assert.equal(q.swapNow, true, '12 beats 16.4 x 68% = 11.1');
  assert.ok(M.problems().some((x) => x.pid === 'r1' && /cannot wait/.test(x.body)));
  // a full practice week changes the call
  snap.players.r1.prac = 'Full';
  const M2 = buildModel(snap, 1, Date.now());
  assert.equal(M2.P('r1').playChance, 0.9);
  assert.equal(M2.qCall('r1', 'RB').swapNow, false);
  // a Questionable quarterback is a different animal
  snap.players.qa.inj = 'Questionable';
  assert.equal(buildModel(snap, 1, Date.now()).P('qa').playChance, 0.42);
});

test('win probability: projected lineups use the measured 48-point spread; averages are pulled toward the league', () => {
  const M = buildModel(league(), 1, Date.now());
  const p = M.winProb(1, 2, [120, 110]);
  assert.ok(Math.abs(p - 0.5826) < 0.005, String(p)); // cdf(10 / 48)
  const prof = M.profiles();
  const means = [1, 2, 3, 4].map((id) => prof[id].mean);
  const lm = means.reduce((s, x) => s + x, 0) / 4;
  // raw team 1 average is 113 (weeks 1-5: 111..115); it must sit 40% closer to the league mean
  assert.ok(Math.abs(prof[1].mean - lm) < Math.abs(113 - lm), 'shrunk toward the league mean');
});

test('next man up: recent work first, depth chart only as the tiebreak', () => {
  const H = (att) => [1, 2, 3].map((w) => ({ w, pts: att, att, tgt: 0 }));
  const snap = league({
    r1: pl('r1', 'RB', 'DET', 18, { depth: 1 }),
    n1: pl('n1', 'RB', 'DET', 3, { depth: 2, own: null, hist: H(2) }),
    n2: pl('n2', 'RB', 'DET', 5, { depth: 3, own: null, hist: H(9) }),
  });
  const M = buildModel(snap, 1, Date.now());
  assert.deepEqual(M.nextManUp('r1').map((x) => x.id), ['n2', 'n1']);
});
