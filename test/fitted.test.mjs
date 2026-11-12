// The measured constants, the live call log, the official-report source and the backtest's own
// guard rails. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as F from '../public/js/fitted.js';
import { buildModel } from '../public/js/model.js';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'backtest', 'results-before.json'), 'utf8')).experiments;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('fitted.js matches the saved backtest results it cites', () => {
  // E5: share constants (results are the engine before the refit, which is where they were fitted)
  near(F.RIPPLE.rb.share, results.E5.fit.rb.coef[1], 0.01, 'RB share');
  near(F.RIPPLE.rb.next, results.E5.fit.rb.coef[2], 0.01, 'RB next');
  near(F.RIPPLE.rb.base, results.E5.fit.rb.coef[0], 0.05, 'RB base');
  near(F.RIPPLE.wr.share, results.E5.fit.wr.coef[1], 0.01, 'WR share');
  near(F.RIPPLE.wr.next, results.E5.fit.wr.coef[2], 0.01, 'WR next');
  near(1 + F.RIPPLE.qb.rest, results.E5.fit.qb.rest.ratio, 0.02, 'QB out, secondary catchers');
  near(1 + F.RIPPLE.qb.top, results.E5.fit.qb.top.ratio, 0.02, 'QB out, top target');
  // E4: Questionable play rates
  const q = results.E4.fit.questionableByPractice;
  near(F.Q_PLAY.FP, q.FP.play, 0.01, 'Q full practice');
  near(F.Q_PLAY.LP, q.LP.play, 0.01, 'Q limited');
  near(F.Q_PLAY.DNP, q.DNP.play, 0.01, 'Q no practice');
  near(F.Q_PLAY_QB, results.E4.fit.questionableByPosition.QB.play, 0.01, 'Q quarterbacks');
  near(F.Q_PLAY.unknown, results.E4.fit.status.Questionable.play, 0.01, 'Q overall');
  // E7: spread and shrink
  assert.equal(F.WIN.lineupSd, results.E7.fit.sd);
  near(F.WIN.meanShrink, results.E7.fit.siteShrink.pooled, 0.001, 'mean shrink');
  // E2: label cut-offs for skill positions are where the win rate crossed 60% and 67%
  assert.equal(F.BANDS.skill.lean, results.E2.fit['RB / WR / TE (same position)'].lean);
  assert.equal(F.BANDS.skill.clear, results.E2.fit['RB / WR / TE (same position)'].clear);
  // E11: health, relative to a healthy player (share of games x production)
  const h = results.E11.fit.health;
  const rel = (k) => (h[k].share / h.Healthy.share) * (h[k].prod / h.Healthy.prod);
  near(F.ROS_HEALTH.Questionable, rel('Questionable'), 0.03, 'ROS Questionable');
  near(F.ROS_HEALTH.Out, rel('Out (official), first or second week'), 0.03, 'ROS Out');
  near(F.ROS_HEALTH.IR[0][1], rel('Off the report, just went down'), 0.03, 'ROS IR new');
  near(F.ROS_HEALTH.IR[2][1], rel('Off the report, missed 4+ (long-term IR)'), 0.03, 'ROS IR long');
  // E12 and E15
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    near(F.NEXT4[pos].t, results.E12.fit[pos].TX[1], 0.01, `next4 points weight ${pos}`);
    near(F.NEXT4[pos].x, results.E12.fit[pos].TX[2], 0.01, `next4 usage weight ${pos}`);
  }
  for (const r of [1, 2, 3]) near(F.PICK_POINTS[r], results.E15.fit.rounds[r].aboveReplacement, 1, `pick round ${r}`);
  // measured with the current value formula, so it is checked against the current results
  const cur = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'backtest', 'results-current.json'), 'utf8')).experiments;
  near(F.TRADE_BALANCE.median, cur.E13.fit.balance.median, 0.001, 'trade balance');
  near(F.TRADE_BALANCE.p25, cur.E13.fit.balance.p25, 0.001, 'trade balance p25');
});

test('helpers: gap win rate, play chance, rest-of-season health, expected points', () => {
  assert.equal(F.gapWinRate(0.5), 0.52);
  assert.equal(F.gapWinRate(4.2), 0.68);
  assert.equal(F.gapWinRate(2, 'DEF'), 0.66);
  assert.equal(F.gapGroup('RB', 'WR'), 'skill');
  assert.equal(F.gapGroup('K', 'K'), 'K');
  assert.equal(F.playChance('WR', 'Questionable', 'DNP'), 0.55);
  assert.equal(F.playChance('QB', 'Questionable', 'LP'), 0.42);
  assert.equal(F.playChance('RB', 'Doubtful', null), 0.01);
  assert.equal(F.playChance('RB', 'Out', null), 0);
  assert.equal(F.playChance('RB', null, null), 1);
  assert.equal(F.rosHealth(null), 1);
  assert.equal(F.rosHealth('IR', 0), 0.22);
  assert.equal(F.rosHealth('IR', 5), 0.08);
  assert.equal(F.rosHealth('PUP', 3), 0.27);
  assert.ok(F.xpGame('WR', { tgt: 10, air: 100, rzTgt: 1 }) > F.xpGame('WR', { tgt: 5, air: 40 }));
  assert.equal(F.xpGame('K', { tgt: 1 }), null);
  assert.equal(F.keepShare('RB', 22), 0.94);
  assert.equal(F.keepShare('RB', 27), 0.74);
});

// ---------- trade values ----------
const H = (n, row) => Array.from({ length: n }, (_, i) => ({ w: i + 1, snp: 70, rec: 0, att: 0, tgt: 0, air: 0, rzTgt: 0, rzAtt: 0, passAtt: 0, ...row }));
function valueLeague() {
  const pl = (id, pos, team, proj, extra = {}) => ({ id, n: `P ${id}`, pos, team, depth: 1, inj: null, hist: [], proj: { pts: proj }, trend: null, own: 1, ...extra });
  const players = {
    hot: pl('hot', 'WR', 'CIN', 15, { hist: H(5, { pts: 20, tgt: 6, air: 50 }) }), // 20 a game where his volume supports ~13
    cold: pl('cold', 'WR', 'DAL', 12, { hist: H(5, { pts: 8, tgt: 11, air: 60, rzTgt: 1 }), own: 2 }),
    even: pl('even', 'WR', 'LAR', 12, { hist: H(5, { pts: 12, tgt: 8, air: 38 }) }),
    ir: pl('ir', 'RB', 'DET', 0, { inj: 'IR', hist: H(2, { pts: 18, att: 18, tgt: 3 }) }),
    q: pl('q', 'RB', 'SF', 14, { inj: 'Questionable', hist: H(5, { pts: 14, att: 15, tgt: 3 }) }),
    qb: pl('qb', 'QB', 'BUF', 20, { hist: H(5, { pts: 20, passAtt: 34, att: 5 }) }),
    te: pl('te', 'TE', 'BAL', 9, { hist: H(5, { pts: 9, tgt: 6, air: 45 }) }),
    rb2: pl('rb2', 'RB', 'NYJ', 9, { hist: H(5, { pts: 9, att: 11, tgt: 2 }), own: 2 }),
  };
  const W = 6;
  const results = {};
  for (let w = 1; w < W; w++) results[w] = { CIN: 'X', DAL: 'X', LAR: 'X', DET: 'X', SF: 'X', BUF: 'X', BAL: 'X', NYJ: 'X' };
  const matchups = {};
  for (let w = 1; w <= 14; w++) matchups[w] = [{ rid: 1, mid: 1, pts: w < W ? 120 : 0 }, { rid: 2, mid: 1, pts: w < W ? 100 : 0 }, { rid: 3, mid: 2, pts: w < W ? 95 : 0 }, { rid: 4, mid: 2, pts: w < W ? 90 : 0 }];
  return {
    meta: { week: W, tz: 'America/Toronto', builtAt: Date.now(), playoffWeeks: [15, 16, 17], leagueId: 'x' },
    league: { name: 'Values', rosterPositions: ['QB', 'RB', 'WR', 'WR', 'TE', 'BN', 'BN', 'BN'], settings: { reserve_slots: 1, playoff_week_start: 15, playoff_teams: 2, trade_deadline: 11, num_teams: 4, waiver_day_of_week: 2, reserve_allow_out: 1 }, scoring: {} },
    teams: [
      { id: 1, owner: 'me', name: 'Me', isMe: true, w: 5, l: 0, t: 0, pf: 600, players: ['hot', 'even', 'ir', 'q', 'qb', 'te'], starters: ['qb', 'q', 'hot', 'even', 'te'], reserve: ['ir'], taxi: [] },
      { id: 2, owner: 'two', name: 'Two', w: 2, l: 3, t: 0, pf: 500, players: ['cold', 'rb2'], starters: [], reserve: [], taxi: [] },
      { id: 3, owner: 'three', name: 'Three', w: 2, l: 3, t: 0, pf: 475, players: [], starters: [], reserve: [], taxi: [] },
      { id: 4, owner: 'four', name: 'Four', w: 1, l: 4, t: 0, pf: 450, players: [], starters: [], reserve: [], taxi: [] },
    ],
    players, schedule: { [W]: { games: [], byes: [] } }, results, matchups, transactions: [], picks: [], notes: [], articles: [],
    playerNews: { items: [], perPlayer: {}, degraded: false, disabled: false },
  };
}

test('trade values: measured health, buy/sell signal, pick and keeper values, playoff weeks by odds', () => {
  const M = buildModel(valueLeague(), 1, Date.now());
  const V = M.V;
  // an IR player who has missed 3 team games is worth about a quarter of healthy, not half
  assert.equal(V.missedGames('ir'), 3);
  assert.equal(V.avail('ir'), 0.27);
  assert.equal(V.avail('q'), 0.83);
  assert.equal(V.avail('hot'), 1);
  // signals
  assert.equal(V.signal('hot').tag, 'Sell');
  assert.equal(V.signal('cold').tag, 'Buy');
  assert.equal(V.signal('even').tag, 'Hold');
  assert.match(V.signal('hot').why, /normally produce 12\.\d/);
  // value leans on usage: the hot receiver's points per game is pulled below his 20-point average
  assert.ok(V.ppg('hot') < 18 && V.ppg('hot') > 11, String(V.ppg('hot')));
  assert.ok(V.ppg('cold') > 10, 'and the cold one above his 8');
  // picks in value units, ordered by round; a keeper is net of the first-round pick he costs
  assert.ok(V.pickValue(1) > V.pickValue(2) && V.pickValue(2) > V.pickValue(3) && V.pickValue(3) > 0);
  assert.equal(V.pickValue(9), 0);
  const k = V.keeperValue('hot');
  assert.ok(k && k.share === 0.86 && typeof k.net === 'number');
  // playoff weeks count 1.5 x that team's chance of being there
  const mine = V.weeksFor(1).find((x) => x.wk === 15).w;
  const theirs = V.weeksFor(4).find((x) => x.wk === 15).w;
  assert.ok(mine > theirs, `leader ${mine} vs last place ${theirs}`);
  assert.ok(mine <= 1.5 && theirs >= 0);
  assert.equal(V.weeksFor(1).find((x) => x.wk === 10).w, 1);
});

// ---------- live call log ----------
test('call log: stores this week\'s calls once, scores them after the games', async () => {
  const { recordCalls } = require('../lib/calls.js');
  const file = path.join(os.tmpdir(), `calls-${process.pid}-${Date.now()}.json`);
  const snap = valueLeague();
  // even (12) sits on the bench behind a weaker starter: the site will say start him
  snap.players.weak = { id: 'weak', n: 'P weak', pos: 'WR', team: 'CHI', depth: 1, inj: null, hist: [], proj: { pts: 5 }, own: 1 };
  snap.teams[0].players.push('weak');
  snap.teams[0].starters = ['qb', 'q', 'hot', 'weak', 'te'];
  const now = Date.now();
  const first = await recordCalls(snap, 1, { file, now });
  assert.equal(first.total, 0);
  assert.equal(first.open, 1);
  const again = await recordCalls(snap, 1, { file, now: now + 1000 });
  assert.equal(again.open, 1, 'the same call is not stored twice');
  // next week: even scored 14, weak scored 3
  snap.meta.week = 7;
  snap.schedule[7] = { games: [], byes: [] };
  snap.players.even.hist.push({ w: 6, pts: 14, tgt: 8, att: 0, air: 60 });
  snap.players.weak.hist.push({ w: 6, pts: 3, tgt: 2, att: 0, air: 10 });
  const scored = await recordCalls(snap, 1, { file, now: now + 7 * 86400e3 });
  assert.equal(scored.total, 1);
  assert.equal(scored.rows[0].result, 'hit');
  assert.equal(scored.hitRate, 1);
  assert.equal(scored.byBand[scored.rows[0].band].hit, 1);
  fs.rmSync(file, { force: true });
});

// ---------- official report source ----------
test('official report: parsed, matched by name + position + team, most severe status wins', () => {
  const NV = require('../lib/nflverse.js');
  const rows = NV.parseCsv('season,team,week,position,full_name,report_status,practice_status\n2026,LA,10,WR,"Smith, Jr. Test",Questionable,Limited Participation in Practice\n');
  assert.equal(rows[0].full_name, 'Smith, Jr. Test');
  const players = { a: { id: 'a', n: 'A.J. Brown', pos: 'WR', team: 'NE' }, b: { id: 'b', n: 'A.J. Brown', pos: 'WR', team: 'PHI' } };
  const n = NV.attach(players, { 'ajbrown|WR|NE': { status: 'Out', prac: 'DNP', injury: 'Knee' } });
  assert.equal(n, 1);
  assert.equal(players.a.off.prac, 'DNP');
  assert.ok(!players.b.off, 'same name on another team is not matched');
  // Sleeper still says Questionable; the official report says Out: the model treats him as out
  const snap = valueLeague();
  snap.players.q.off = { status: 'Out', prac: 'DNP', injury: 'Knee' };
  const M = buildModel(snap, 1, Date.now());
  assert.equal(M.P('q').eff, 'Out');
  assert.equal(M.val('q'), 0);
});

// ---------- backtest guard rails (only when the history has been downloaded) ----------
test('backtest: the as-of builder never reads the week it is predicting', async (t) => {
  if (!fs.existsSync(path.join(root, 'data', 'bt', 'sl-stats-2024-6.json'))) return t.skip('history not downloaded (npm run backtest fetches it)');
  const D = await import('../backtest/data.mjs');
  const P = D.asOf(2024, 6);
  let rows = 0;
  for (const p of Object.values(P)) for (const h of p.hist) {
    rows++;
    assert.ok(h.w < 6, `${p.n} carries week ${h.w}`);
  }
  assert.ok(rows > 1000);
  // players who got hurt in week 6 itself look healthy beforehand
  const actual = D.actual(2024, 6);
  assert.ok([...actual.values()].some((r) => r.played));
  assert.deepEqual(D.TRAIN.filter((s) => D.TEST.includes(s)), [], 'fit and hold-out seasons do not overlap');
});
