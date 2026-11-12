// The news scanner against its hand-labelled headlines (backtest/news-golden.json), plus the
// clause rule, the status-change log's official fields, headline lag, wind, ranges, the season
// sim's use of this week's lineups, waiver scoring and the slipping-label flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { classify, focusText } from '../public/js/playernews.js';
import { buildModel } from '../public/js/model.js';
import { rangeFor, FIRST_BACK } from '../public/js/fitted.js';
import { newsEval } from '../backtest/news-eval.mjs';

const require = createRequire(import.meta.url);
const tmp = (name) => path.join(os.tmpdir(), `${name}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

test('news scanner: every labelled headline is read correctly', () => {
  const r = newsEval();
  const misses = r.tables[1].rows;
  assert.equal(misses.length, 0, misses.map((m) => m.join(' | ')).join('\n'));
  assert.ok(r.fit.heldoutN >= 25 && r.fit.freshN >= 40);
});

test('clause rule: another player\'s news is not pinned on the named player', () => {
  const others = ['malik willis', 'rhamondre stevenson', 'deebo samuel', 'christian kirk', 'treveyon henderson', 'aj brown'];
  assert.equal(classify('Malik Willis on IR, Kyle McCord in line to start at QB for Dolphins', '', 'search', null, 'Kyle McCord', others).status, null);
  assert.equal(classify('Malik Willis on IR, Kyle McCord in line to start at QB for Dolphins', '', 'search', null, 'Malik Willis', others).status, 'IR');
  // a list of names shares the predicate
  assert.equal(classify('Mike Evans, Deebo Samuel, Christian Kirk ruled out', '', 'search', null, 'Mike Evans', others).status, 'Out');
  // a team clause is someone else's news
  assert.equal(classify('A.J. Brown limited in return to practice, Patriots rule out three', '', 'search', null, 'A.J. Brown', others).status, null);
  // without a name the whole headline counts (old behaviour)
  assert.equal(classify('Malik Willis on IR, Kyle McCord in line to start', '', 'search').status, 'IR');
  assert.equal(focusText('Kyle McCord takes over', 'Kyle McCord', others), 'Kyle McCord takes over');
});

test('status log: official status and practice changes are logged, a new week\'s report is not a change', () => {
  const { statusLog } = require('../lib/snapshot.js');
  const file = tmp('status');
  const pl = (off) => ({ a: { id: 'a', pos: 'WR', team: 'BUF', inj: null, depth: 1, off } });
  const t0 = Date.now();
  statusLog(pl({ status: null, prac: 'LP' }), {}, false, {}, 10, t0, true, file);
  const r1 = statusLog(pl({ status: 'Questionable', prac: 'DNP' }), {}, false, {}, 10, t0 + 1000, true, file);
  const fields = r1.changes.a.map((c) => c.field).sort();
  assert.deepEqual(fields, ['off', 'prac']);
  assert.equal(r1.changes.a.find((c) => c.field === 'prac').to, 'DNP');
  // next week the report starts empty: no "Questionable -> none" change
  const r2 = statusLog(pl({}), {}, false, {}, 11, t0 + 2000, true, file);
  assert.equal(r2.changes.a.length, 2);
  // the report not read this build: nothing changes either way
  const r3 = statusLog(pl({}), {}, false, {}, 11, t0 + 3000, false, file);
  assert.equal(r3.changes.a.length, 2);
  fs.rmSync(file, { force: true });
});

test('headline lag: first headline after an official change, missing ones counted', () => {
  const { headlineLag } = require('../lib/snapshot.js');
  const H = 3600000;
  const now = 100 * H;
  const changes = {
    a: [{ at: 10 * H, field: 'off', from: null, to: 'Out' }],
    b: [{ at: 20 * H, field: 'inj', from: null, to: 'Questionable' }],
    c: [{ at: 99 * H, field: 'es', from: null, to: 'Out' }],
    d: [{ at: 30 * H, field: 'depth', from: 1, to: 2 }],
  };
  const items = [{ pid: 'a', time: 13 * H }, { pid: 'a', time: 9.5 * H }, { pid: 'x', alsoPids: ['a'], time: 30 * H }];
  const r = headlineLag(changes, items, now);
  assert.equal(r.found, 1);
  assert.equal(r.medianMs, 0, 'a headline up to 2h before the feed counts as on time');
  assert.equal(r.missed, 1);
  assert.equal(r.pending, 1);
  assert.equal(r.n, 2);
});

test('wind: outdoor games get the forecast at kickoff, domes and far-off games do not', async () => {
  const { addWind, coords } = require('../lib/weather.js');
  assert.ok(coords('Highmark Stadium'));
  assert.equal(coords('Caesars Superdome'), null);
  const now = Date.parse('2026-11-15T12:00:00Z');
  const hours = Array.from({ length: 144 }, (_, i) => new Date(now + i * 3600000).toISOString().slice(0, 16));
  const fetch = async () => ({ hourly: { time: hours, wind_speed_10m: hours.map((_, i) => (i === 6 ? 19.4 : 5)), wind_gusts_10m: hours.map(() => 30) } });
  const games = [
    { date: '2026-11-15T18:00Z', venue: { name: 'Lambeau Field', indoor: false } },
    { date: '2026-11-15T18:00Z', venue: { name: 'Lucas Oil Stadium', indoor: true } },
    { date: '2026-11-29T18:00Z', venue: { name: 'Soldier Field', indoor: false } },
  ];
  const n = await addWind(games, { now, fetch });
  assert.equal(n, 1);
  assert.deepEqual(games[0].wind, { mph: 19, gust: 30 });
  assert.ok(!games[1].wind && !games[2].wind);
  const { windTxt } = await import('../public/js/views/lineup.js');
  assert.match(windTxt({ pos: 'QB', game: { wind: { mph: 19, gust: 30 } } }), /wind 19 mph.*-2 pts/);
  assert.equal(windTxt({ pos: 'QB', game: { wind: { mph: 9, gust: 12 } } }), '');
});

// ---------- model: ranges, first game back, season sim ----------
const pl = (id, pos, team, proj, extra = {}) => ({ id, n: `Player ${id}`, pos, team, depth: 1, inj: null, hist: [], proj: { pts: proj }, trend: null, own: 1, ...extra });
function league() {
  const W = 6;
  const players = { qa: pl('qa', 'QB', 'BUF', 20), r1: pl('r1', 'RB', 'DET', 15), w1: pl('w1', 'WR', 'CIN', 12), x1: pl('x1', 'QB', 'PHI', 10, { own: 2 }), x2: pl('x2', 'RB', 'ATL', 8, { own: 2 }), x3: pl('x3', 'WR', 'SF', 7, { own: 2 }) };
  const results = {};
  for (let w = 1; w < W; w++) results[w] = { BUF: 'X', DET: 'X', CIN: 'X', PHI: 'X', ATL: 'X', SF: 'X' };
  const matchups = {};
  for (let w = 1; w <= 14; w++) matchups[w] = [{ rid: 1, mid: 1, pts: w < W ? 100 : 0 }, { rid: 2, mid: 1, pts: w < W ? 100 : 0 }];
  return {
    meta: { week: W, tz: 'America/Toronto', builtAt: Date.now(), playoffWeeks: [15, 16, 17], leagueId: 'x' },
    league: { name: 'T', rosterPositions: ['QB', 'RB', 'WR', 'BN'], settings: { reserve_slots: 0, playoff_week_start: 15, playoff_teams: 2, trade_deadline: 11, num_teams: 2, waiver_day_of_week: 2 }, scoring: {} },
    teams: [
      { id: 1, owner: 'me', name: 'Me', isMe: true, w: 2, l: 3, t: 0, pf: 500, players: ['qa', 'r1', 'w1'], starters: ['qa', 'r1', 'w1'], reserve: [], taxi: [] },
      { id: 2, owner: 'two', name: 'Two', w: 3, l: 2, t: 0, pf: 500, players: ['x1', 'x2', 'x3'], starters: ['x1', 'x2', 'x3'], reserve: [], taxi: [] },
    ],
    players, schedule: { [W]: { games: [], byes: [] } }, results, matchups, transactions: [], picks: [], notes: [], articles: [], playerNews: { items: [], perPlayer: {}, degraded: false, disabled: false },
  };
}

test('ranges come from the projection and typical misses; posture is no longer a tiebreak', () => {
  const M = buildModel(league(), 1, Date.now());
  const r = rangeFor('RB', 15);
  assert.equal(M.P('r1').floor, r[0]);
  assert.equal(M.P('r1').rangeBasis, 'projection');
  assert.ok(r[0] < 15 && r[1] > 15);
  assert.equal(rangeFor('K', 0), null);
});

test('first game back after missing 2-3 games is worth 86% of the projection', () => {
  const snap = league();
  // r1 played weeks 1-3, missed 4-5 (his team played)
  snap.players.r1.hist = [1, 2, 3].map((w) => ({ w, pts: 15, att: 15, tgt: 2 }));
  snap.players.w1.hist = [1, 2, 3, 4].map((w) => ({ w, pts: 12, att: 0, tgt: 8 })); // missed one game: no discount
  const M = buildModel(snap, 1, Date.now());
  assert.equal(M.P('r1').missedRun, 2);
  assert.ok(Math.abs(M.val('r1') - 15 * FIRST_BACK[2]) < 1e-9);
  assert.equal(M.val('w1'), 12);
});

test('season sim: this week uses each team\'s projected lineup', () => {
  const run = (mine) => {
    const snap = league();
    for (let w = 1; w < 6; w++) {
      snap.matchups[w][0].pts = 100 + (w % 2) * 12;
      snap.matchups[w][1].pts = 100 + ((w + 1) % 2) * 12;
    }
    Object.assign(snap.players.qa.proj, { pts: mine[0] });
    Object.assign(snap.players.r1.proj, { pts: mine[1] });
    Object.assign(snap.players.w1.proj, { pts: mine[2] });
    const res = buildModel(snap, 1, Date.now()).runSim({ n: 8000, seed: 3 }).res;
    return res[1].wins - 2 - (res[2].wins - 3);
  };
  // same season averages; only this week's projected lineup differs (47 vs 25, then 25 vs 25)
  const strong = run([20, 15, 12]);
  const even = run([10, 8, 7]);
  // a 22-point edge with the measured 48-point spread wins cdf(22/48) = 68% instead of 50%:
  // +0.18 wins for me and -0.18 for them, a 0.35 swing in the gap
  assert.ok(strong - even > 0.25 && strong - even < 0.45, `difference ${strong - even}`);
});

test('call log: waiver suggestions are scored over two weeks; a label below its backtest rate is flagged', async () => {
  const { recordCalls } = require('../lib/calls.js');
  const file = tmp('calls');
  // hand-written log: 12 "clear" calls that went 3-9 (expected ~70%), and one waiver call
  const db = { 4: {} };
  for (let i = 0; i < 12; i++) db[4][`s${i}|b${i}`] = { kind: 'swap', start: `s${i}`, bench: `b${i}`, band: 'clear', gap: 5, rate: 70, at: 1 };
  db[4]['fa|qa'] = { kind: 'waiver', start: 'fa', bench: 'qa', band: 'tier 3', gap: 2, rate: null, at: 1 };
  fs.writeFileSync(file, JSON.stringify(db));
  const snap = league();
  snap.meta.week = 7;
  for (let i = 0; i < 12; i++) {
    snap.players[`s${i}`] = pl(`s${i}`, 'WR', 'BUF', 0, { hist: [{ w: 4, pts: i < 3 ? 20 : 5 }] });
    snap.players[`b${i}`] = pl(`b${i}`, 'WR', 'KC', 0, { hist: [{ w: 4, pts: 10 }] });
  }
  snap.players.fa = pl('fa', 'RB', 'NYJ', 0, { own: null, hist: [{ w: 4, pts: 9 }, { w: 5, pts: 14 }] });
  snap.players.qa.hist = [{ w: 4, pts: 10 }, { w: 5, pts: 6 }];
  const r = await recordCalls(snap, 1, { file, now: Date.now(), dryRun: true });
  assert.equal(r.byBand.clear.n, 12);
  assert.equal(r.byBand.waiver.hit, 1, 'add scored 23 over two weeks vs 16');
  assert.equal(r.flags.length, 1);
  assert.equal(r.flags[0].band, 'clear');
  assert.equal(Math.round(r.flags[0].seen * 100), 25);
  fs.rmSync(file, { force: true });
});
