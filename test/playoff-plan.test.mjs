// Weeks after next: Sleeper's per-week projections (`ahead`), the playoff lineup plan, the
// kicker/defense stash, and drops that keep playoff starters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../public/js/model.js';
import { league, NOW } from './fixtures/league.mjs';

const game = (home, away, date) => ({ home: { t: home }, away: { t: away }, date, state: 'pre', completed: false });
const pl = (id, n, pos, team, proj, extra = {}) => ({ id, n, pos, team, inj: null, proj: { pts: proj }, next: { pts: proj }, hist: [], own: null, depth: null, exp: 4, ...extra });

// Weeks 12-17 scheduled; AAA and CCC are on bye in Week 15.
function withFuture(s) {
  s.meta.playoffWeeks = [15, 16, 17];
  const all = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH'];
  for (let wk = 12; wk <= 17; wk++) {
    const byes = wk === 15 ? ['AAA', 'CCC'] : [];
    const teams = all.filter((t) => !byes.includes(t));
    const games = [];
    for (let i = 0; i + 1 < teams.length; i += 2) games.push(game(teams[i], teams[i + 1], `2026-12-${String(wk + 1).padStart(2, '0')}T18:00:00Z`));
    s.schedule[wk] = { byes, games };
  }
}

test('val reads Sleeper projections for weeks after next, and 0 without one', () => {
  const M = buildModel(league((s) => {
    withFuture(s);
    s.players['1005'].ahead = { 12: 13.5, 15: 9 };
  }), 1, NOW);
  assert.equal(M.val('1005', 12), 13.5);
  assert.equal(M.val('1005', 15), 9);
  assert.equal(M.val('1005', 16), 0);
});

test('the bye look-ahead uses the week-after-next projection when the snapshot has one', () => {
  const s0 = league((s) => {
    withFuture(s);
    for (const id of Object.keys(s.players)) s.players[id].ahead = { 12: 1 };
  });
  const M = buildModel(s0, 1, NOW);
  const wk12 = M.lookahead().find((r) => r.wk === 12);
  assert.ok(wk12.total > 0 && wk12.total <= 6, `every player projects 1 in Week 12, got ${wk12.total}`);
  // older snapshot without `ahead`: falls back to next week's numbers (old behaviour)
  const M2 = buildModel(league(withFuture), 1, NOW);
  assert.ok(M2.lookahead().find((r) => r.wk === 12).total > 20);
});

test('weekPts: defenses use that week\'s projection, skill players their per-game value, byes 0', () => {
  const M = buildModel(league((s) => {
    withFuture(s);
    s.players['9001'] = pl('9001', 'Bees D', 'DEF', 'DDD', 6, { ahead: { 15: 11, 16: 2 }, own: 1 });
    s.teams[0].players.push('9001');
    s.players['1005'].ahead = { 15: 40 };
  }), 1, NOW);
  assert.equal(M.V.weekPts('9001', 15), 11);
  assert.equal(M.V.weekPts('9001', 16), 2);
  assert.equal(M.V.weekPts('1003', 15), 0, 'Cook (AAA) is on bye in Week 15');
  assert.notEqual(M.V.weekPts('1005', 15), 40, 'skill players do not use far-out weekly projections');
  assert.ok(M.V.weekPts('1005', 15) > 0);
});

test('a playoff-week plan fills byes from the bench', () => {
  const M = buildModel(league(withFuture), 1, NOW);
  const p15 = M.V.weekPlan(M.me, 15);
  const ids = p15.slots.map((x) => x.pid);
  assert.ok(!ids.includes('1003') && !ids.includes('1004'), 'AAA and CCC players sit on their bye');
  assert.ok(ids.includes('1006') === false, 'Fox (CCC) is on bye too');
  assert.ok(p15.total > 0);
});

test('drops keep a bench player who starts a playoff week', () => {
  const s = league((s) => {
    withFuture(s);
    // fill the roster to its 12-spot max with four low bench players
    s.players['1009'] = pl('1009', 'Ike Iris', 'WR', 'BBB', 1, { own: 1 });
    s.players['1010'] = pl('1010', 'Jay Jett', 'RB', 'DDD', 0.6, { own: 1 });
    s.players['1012'] = pl('1012', 'Lee Lark', 'WR', 'FFF', 3, { own: 1 });
    s.players['1013'] = pl('1013', 'Mo Moss', 'WR', 'EEE', 2, { own: 1 });
    s.teams[0].players.push('1009', '1010', '1012', '1013');
  });
  const M = buildModel(s, 1, NOW);
  const p15 = M.V.weekPlan(M.me, 15).slots.map((x) => x.pid);
  assert.ok(p15.includes('1010'), 'with Cook and Dash on bye, Jett is the Week 15 RB');
  const d = M.dropFor({ id: '5001', p: M.P('5001') });
  assert.notEqual(d.pid, '1010', 'Jett starts in the playoffs, so he is not the drop');
  assert.equal(d.pid, '1009');
});

// ---------------------------------------------------------------- season sim

function seasonLeague(s) {
  withFuture(s);
  for (let wk = 11; wk <= 14; wk++) s.matchups[wk] = s.matchups[10].map((m) => ({ ...m }));
  // nine played weeks of scores so every team has a spread
  for (let wk = 1; wk <= 9; wk++) s.matchups[wk] = s.matchups[10].map((m) => ({ ...m, pts: 100 + (((wk * 7 + m.rid * 13) % 21) - 10) }));
  for (const id of Object.keys(s.players)) s.players[id].ahead = Object.fromEntries([12, 13, 14, 15, 16, 17].map((wk) => [wk, s.players[id].proj?.pts || 0]));
}

test('season sim: a division winner makes the playoffs even with a worse record', () => {
  const s = league((s) => {
    seasonLeague(s);
    s.league.settings.playoff_teams = 2;
    s.league.settings.divisions = 2;
    s.teams.forEach((t, i) => {
      t.division = i < 2 ? 1 : 2;
      t.w = i < 2 ? 9 : 1;
      t.l = i < 2 ? 1 : 9;
    });
  });
  const r = buildModel(s, 1, NOW).sim().res;
  assert.ok(r[3].playoff + r[4].playoff > 0.99, 'one of the division 2 teams always gets in');
  assert.ok(r[1].playoff + r[2].playoff < 1.01);
  // without divisions the 1-9 teams have no path
  const s2 = league((x) => { seasonLeague(x); x.league.settings.playoff_teams = 2; x.teams.forEach((t, i) => { t.w = i < 2 ? 9 : 1; t.l = i < 2 ? 1 : 9; }); });
  const r2 = buildModel(s2, 1, NOW).sim().res;
  assert.ok(r2[3].playoff + r2[4].playoff < 0.01);
});

test('season sim: injuries on a roster lower that team\'s odds in later weeks', () => {
  const healthy = buildModel(league(seasonLeague), 1, NOW).sim().res;
  const hurt = buildModel(league((s) => {
    seasonLeague(s);
    for (const id of ['2001', '2002', '2003']) s.players[id].inj = 'IR';
  }), 1, NOW).sim().res;
  assert.ok(hurt[2].wins < healthy[2].wins - 0.3, `rival wins ${healthy[2].wins.toFixed(2)} -> ${hurt[2].wins.toFixed(2)}`);
});

test('season sim: in the playoffs, finished rounds use the real scores', () => {
  // Six teams, Week 16. Seeds by record: 1..6 = rosters 1..6. Round 1 (Week 15): 3 v 6 and 4 v 5.
  // Roster 6 really beat roster 3, and roster 5 beat roster 4.
  const s = league((s) => {
    seasonLeague(s);
    s.meta.week = 16;
    s.league.settings.playoff_teams = 6;
    for (const [id, team] of [[5, 'GGG'], [6, 'HHH']]) {
      const pid = `${id}001`;
      s.players[pid] = pl(pid, `Q ${id}`, 'QB', team, 15, { own: id });
      s.teams.push({ ...s.teams[2], id, owner: 'team' + id, name: 'team' + id, players: [pid], starters: [pid, '0', '0', '0', '0', '0'], reserve: [], taxi: [] });
    }
    s.teams.forEach((t, i) => ((t.w = 12 - i), (t.l = 2 + i), (t.pf = 1500 - 10 * i)));
    for (let wk = 1; wk <= 14; wk++) s.matchups[wk] = [1, 2, 3, 4, 5, 6].map((rid) => ({ rid, mid: Math.ceil(rid / 2), pts: 100 }));
    s.matchups[15] = [
      { rid: 3, mid: 1, pts: 80 }, { rid: 6, mid: 1, pts: 120 },
      { rid: 4, mid: 2, pts: 90 }, { rid: 5, mid: 2, pts: 95 },
      { rid: 1, mid: null, pts: 0 }, { rid: 2, mid: null, pts: 0 },
    ];
    s.matchups[16] = [{ rid: 1, mid: 1, pts: 0 }, { rid: 5, mid: 1, pts: 0 }, { rid: 2, mid: 2, pts: 0 }, { rid: 6, mid: 2, pts: 0 }];
  });
  const r = buildModel(s, 1, NOW).sim().res;
  assert.equal(r[3].title, 0, 'roster 3 lost in Week 15');
  assert.equal(r[4].title, 0, 'roster 4 lost in Week 15');
  assert.ok(r[6].title > 0 && r[5].title > 0, 'the real round-1 winners can still win it');
});
