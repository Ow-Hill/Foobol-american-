// Playoff tools: who to root for, scouting the playoff opponent, the live game-day read, and the
// calendar reminders for Saturday and Christmas games.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../public/js/model.js';
import { rooting, scout, gameLeft, liveChance, live } from '../public/js/playoffs.js';
import { league, NOW } from './fixtures/league.mjs';

const pl = (id, n, pos, team, proj, extra = {}) => ({ id, n, pos, team, inj: null, proj: { pts: proj }, next: { pts: proj }, hist: [], own: null, depth: null, exp: 4, ...extra });
const game = (home, away, date, state = 'pre', extra = {}) => ({ home: { t: home }, away: { t: away }, date, state, completed: false, ...extra });

// Six teams, six playoff spots' worth of bracket (top 4 here), weeks 10-14 left, history weeks 1-9.
function sixTeams(s) {
  s.league.settings.playoff_teams = 6;
  const zeros = ['0', '0', '0', '0', '0'];
  const extra = [
    [5, 'fifth', 'HHH'],
    [6, 'sixth', 'GGG'],
    [7, 'seventh', 'FFF'],
    [8, 'eighth', 'EEE'],
  ];
  for (const [id, owner, team] of extra) {
    const pid = `${id}001`;
    s.players[pid] = { ...pl(pid, `QB ${owner}`, 'QB', team, 14), own: id };
    s.teams.push({ id, owner, name: owner, w: 5, l: 4, t: 0, pf: 900, pa: 900, wp: id, players: [pid], starters: [pid, ...zeros], reserve: [], taxi: [] });
  }
  // records: owen and rival on the bubble
  const rec = { 1: [4, 5], 2: [6, 3], 3: [6, 3], 4: [5, 4], 5: [5, 4], 6: [4, 5], 7: [3, 6], 8: [3, 6] };
  for (const t of s.teams) [t.w, t.l] = rec[t.id];
  // history: varied weekly scores so every team has a spread
  for (let wk = 1; wk <= 9; wk++) {
    s.matchups[wk] = s.teams.map((t, i) => ({ rid: t.id, mid: Math.floor(i / 2) + 1, pts: 90 + ((t.id * 7 + wk * 13) % 40) }));
  }
  const pairs = [[[1, 2], [3, 4], [5, 6], [7, 8]], [[1, 3], [2, 4], [5, 7], [6, 8]], [[1, 4], [2, 3], [5, 8], [6, 7]], [[1, 5], [2, 6], [3, 7], [4, 8]], [[1, 6], [2, 5], [3, 8], [4, 7]]];
  pairs.forEach((week, i) => {
    s.matchups[10 + i] = week.flatMap(([a, b], j) => [{ rid: a, mid: j + 1, pts: 0 }, { rid: b, mid: j + 1, pts: 0 }]);
  });
}

test('rooting guide: other teams’ games only, each with your odds under both results', () => {
  const M = buildModel(league(sixTeams), 1, NOW);
  const base = M.runSim({ n: 3000, track: 1 });
  const r = rooting(M, base);
  assert.ok(r.games.length > 0, 'some games matter');
  for (const g of r.games) {
    assert.notEqual(g.want, 1);
    assert.notEqual(g.other, 1);
    assert.ok(g.ifWant >= g.ifOther);
    assert.ok(Math.abs(g.swing - (g.ifWant - g.ifOther)) < 1e-9);
    assert.ok(g.wk >= 10 && g.wk <= 14);
  }
  // the two bubble teams just ahead of you: you want them to lose
  const rivalGames = r.games.filter((g) => g.other === 2 || g.other === 4 || g.other === 5);
  assert.ok(rivalGames.length > 0);
  assert.ok(r.tie.share >= 0 && r.tie.share <= 1);
  assert.ok(r.pfRank >= 1 && r.pfRank <= 8);
});

test('rooting guide: the simulation still sums to the same playoff odds with tracking on', () => {
  const M = buildModel(league(sixTeams), 1, NOW);
  const a = M.runSim({ n: 2000, seed: 7 });
  const b = M.runSim({ n: 2000, seed: 7, track: 1 });
  assert.equal(a.res[1].playoff, b.res[1].playoff);
  for (const g of Object.values(b.path.games)) assert.ok(g.madeA + g.madeB <= 2000 && g.madeA <= g.aWin);
});

test('scouting: names likely playoff opponents and free agents that help them most', () => {
  const M = buildModel(league((s) => {
    sixTeams(s);
    // a free-agent tight end who would start for the rival
    s.players['5004'] = pl('5004', 'Uli Uniform', 'TE', 'BBB', 9, { own: null, ppg: 9 });
  }), 1, NOW);
  const base = M.runSim({ n: 3000, track: 1 });
  const sc = scout(M, base);
  assert.ok(sc, 'a scouting report');
  assert.ok([15, 16].includes(sc.wk));
  assert.ok(sc.opps.length >= 1 && sc.opps.length <= 2);
  for (const o of sc.opps) {
    assert.notEqual(o.t.id, 1);
    for (const b of o.blocks) {
      assert.equal(M.P(b.id).own ?? null, null, 'only free agents');
      assert.ok(b.gain >= 1.5);
    }
  }
});

test('scouting in the playoffs uses the opponent Sleeper set, and skips teams without a game', () => {
  const s0 = league((s) => {
    sixTeams(s);
    s.meta.week = 15;
    s.matchups[15] = [{ rid: 1, mid: 1, pts: 0 }, { rid: 3, mid: 1, pts: 0 }, { rid: 2, mid: null, pts: 0 }, { rid: 4, mid: null, pts: 0 }];
  });
  const M = buildModel(s0, 1, NOW);
  assert.equal(M.opp.id, 3);
  const M2 = buildModel(s0, 2, NOW);
  assert.equal(M2.opp, null, 'two eliminated teams are not paired');
  const sc = scout(M, { path: null, n: 1 });
  assert.equal(sc.wk, 15);
  assert.equal(sc.opps[0].t.id, 3);
});

test('live: share of a game left from quarter and clock', () => {
  assert.equal(gameLeft({ state: 'pre' }), 1);
  assert.equal(gameLeft({ state: 'post', completed: true }), 0);
  assert.equal(gameLeft({ state: 'in', period: 1, clock: 900 }), 1);
  assert.equal(gameLeft({ state: 'in', period: 3, clock: 450 }), 0.375);
  assert.equal(gameLeft({ state: 'in', period: 5, clock: 300 }), 0);
  assert.equal(gameLeft(null), 0);
});

test('live: win chance follows the projected finish and tightens as games end', () => {
  const side = (pts, rem, full) => ({ pts, rem, full });
  assert.equal(liveChance(side(100, 0, 100), side(90, 0, 100)), 1);
  assert.equal(liveChance(side(90, 0, 100), side(100, 0, 100)), 0);
  const early = liveChance(side(10, 100, 110), side(0, 100, 100));
  const late = liveChance(side(100, 10, 110), side(90, 10, 100));
  assert.ok(early > 0.5 && late > early, `early ${early} late ${late}`);
});

test('live: scores from Sleeper, the rest projected, and an Out starter flagged for a swap', () => {
  const M = buildModel(league((s) => {
    s.schedule[10].games[0] = game('AAA', 'BBB', '2026-11-23T15:00:00Z', 'in', { period: 3, clock: 450 });
    s.players['1007'].inj = 'Out'; // Gus Golf (TE, CCC game not started)... he plays for AAA
    s.players['1007'].team = 'CCC';
    s.players['1006'].pos = 'TE'; // a bench TE to swap in
    s.matchups[10] = [
      { rid: 1, mid: 1, pts: 30, starters: ['1001', '1003', '1005', '1007', '1004', '1002'], pp: { 1001: 18, 1003: 12, 1005: 0 } },
      { rid: 2, mid: 1, pts: 0, starters: ['2001', '2002', '2003', '2004', '2005', '2006'], pp: {} },
      { rid: 3, mid: 2, pts: 0 },
      { rid: 4, mid: 2, pts: 0 },
    ];
  }), 1, NOW);
  const L = live(M);
  assert.equal(L.me.pts, 30);
  const qb = L.me.rows.find((r) => r.pid === '1001');
  assert.equal(qb.state, 'live');
  assert.ok(Math.abs(qb.rem - 20 * 0.375) < 1e-9);
  assert.equal(L.swaps.length, 1);
  assert.equal(L.swaps[0].out, '1007');
  assert.equal(L.swaps[0].inn, '1006');
  assert.ok(L.chance > 0 && L.chance < 1);
});

test('calendar: Saturday and Christmas game days get their own reminders, Sunday and Thursday do not', async () => {
  const { earlySlates } = await import('../public/js/views/season.js');
  const M = buildModel(league((s) => {
    s.schedule[15] = { byes: [], games: [
      game('AAA', 'BBB', '2026-12-19T21:30:00Z'), // Sat 4:30 PM Toronto
      game('CCC', 'DDD', '2026-12-20T01:15:00Z'), // Sat 8:15 PM Toronto
      game('EEE', 'FFF', '2026-12-20T18:00:00Z'), // Sunday
    ] };
    s.schedule[17] = { byes: [], games: [game('AAA', 'CCC', '2026-12-25T18:00:00Z'), game('BBB', 'DDD', '2026-12-25T01:15:00Z')] }; // Christmas; Thu night Dec 24
  }), 1, NOW);
  const ev = earlySlates(M);
  assert.deepEqual(ev.map((e) => [e.label, e.wk, e.games]), [['Saturday', 15, 2], ['Christmas', 17, 1]]);
  assert.equal(ev[0].first, Date.parse('2026-12-19T21:30:00Z'));
});
