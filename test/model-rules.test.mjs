// League-rule tests for public/js/model.js, run against the fixture in test/fixtures/league.mjs.
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, canon, sevOf } from '../public/js/model.js';
import { league, NOW, DAY_MS } from './fixtures/league.mjs';

const model = (mutate, { now = NOW, rid = 1 } = {}) => buildModel(league(mutate), rid, now);
const slotOf = (lineup, slot) => lineup.slots.filter((s) => s.slot === slot).map((s) => s.pid);
const byTitle = (problems, re) => problems.filter((p) => re.test(p.title));

// ---------------------------------------------------------------- status severity

test('canon normalises Sleeper and ESPN status labels', () => {
  assert.equal(canon('injured reserve'), 'IR');
  assert.equal(canon(' out '), 'Out');
  assert.equal(canon('SUSPENDED'), 'Sus');
  assert.equal(canon('questionable'), 'Questionable');
  assert.equal(canon('Active'), null);
  assert.equal(canon('Healthy'), null);
  assert.equal(canon(''), null);
  assert.equal(canon(null), null);
});

test('severity order: IR/PUP/Sus > Out/NA/DNR/COV > Doubtful > Questionable > Probable > healthy', () => {
  const order = ['IR', 'Out', 'Doubtful', 'Questionable', 'Probable', null];
  for (let i = 1; i < order.length; i++) assert.ok(sevOf(order[i - 1]) > sevOf(order[i]), `${order[i - 1]} > ${order[i]}`);
  assert.equal(sevOf('PUP'), sevOf('IR'));
  assert.equal(sevOf('Sus'), sevOf('IR'));
  for (const s of ['NA', 'DNR', 'COV']) assert.equal(sevOf(s), sevOf('Out'));
});

test('availability follows severity: Doubtful and worse sit, Questionable is a game-time call', () => {
  const M = model((s) => {
    s.players['1004'].inj = 'Doubtful';
    s.players['1006'].inj = 'Questionable';
    s.players['1002'].inj = 'Probable';
  });
  assert.equal(M.P('1004').avail, 'out');
  assert.equal(M.val('1004'), 0);
  assert.equal(M.P('1006').avail, 'q');
  // measured in the backtest (fitted.js): a Questionable player still plays but scores a little less
  assert.ok(M.val('1006') > 6 && M.val('1006') < 8, 'questionable players keep most of their projection');
  assert.equal(M.P('1002').avail, 'ok');
});

test('a player whose team is on bye is unavailable and worth nothing this week', () => {
  const M = model((s) => (s.players['1005'].team = 'GGG'));
  assert.equal(M.P('1005').avail, 'bye');
  assert.equal(M.val('1005'), 0);
  assert.equal(M.canStartNow('1005'), false);
});

// ---------------------------------------------------------------- injury conflicts

test('conflict: ESPN more severe than Sleeper -> ESPN wins', () => {
  const M = model((s) => {
    s.players['1005'].inj = 'Questionable';
    s.notes.push({ pid: '1005', status: 'Out', date: '2026-11-22T12:00:00Z' });
  });
  const p = M.P('1005');
  assert.equal(p.sl, 'Questionable');
  assert.equal(p.es, 'Out');
  assert.equal(p.eff, 'Out');
  assert.equal(p.conflict, true);
  assert.equal(p.avail, 'out');
});

test('conflict: Sleeper more severe than ESPN -> Sleeper wins', () => {
  const M = model((s) => {
    s.players['1005'].inj = 'Out';
    s.notes.push({ pid: '1005', status: 'Questionable', date: '2026-11-22T12:00:00Z' });
  });
  const p = M.P('1005');
  assert.equal(p.eff, 'Out');
  assert.equal(p.conflict, true);
});

test('agreeing or healthy sources are not a conflict', () => {
  const M = model((s) => {
    s.players['1005'].inj = 'Questionable';
    s.notes.push({ pid: '1005', status: 'Questionable', date: '2026-11-22T12:00:00Z' });
    s.notes.push({ pid: '1006', status: 'Active', date: '2026-11-22T12:00:00Z' });
  });
  assert.equal(M.P('1005').conflict, false);
  assert.equal(M.P('1006').conflict, false);
  assert.equal(M.P('1006').eff, null);
  assert.equal(M.P('1001').es, undefined, 'no ESPN note at all');
});

test('only the newest ESPN note for a player counts', () => {
  const M = model((s) => {
    s.notes.push({ pid: '1005', status: 'Out', date: '2026-11-18T12:00:00Z' });
    s.notes.push({ pid: '1005', status: 'Questionable', date: '2026-11-22T12:00:00Z' });
  });
  assert.equal(M.P('1005').es, 'Questionable');
  assert.equal(M.P('1005').eff, 'Questionable');
});

// ---------------------------------------------------------------- lineup / flex eligibility

test('slot eligibility for every flex type', () => {
  const M = model();
  const cases = {
    FLEX: ['RB', 'WR', 'TE'],
    SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    WRRB_FLEX: ['RB', 'WR'],
    REC_FLEX: ['WR', 'TE'],
    QB: ['QB'],
    TE: ['TE'],
  };
  for (const [slot, ok] of Object.entries(cases)) {
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
      assert.equal(M.slotEligible(slot, pos), ok.includes(pos), `${pos} in ${slot}`);
    }
  }
});

test('the fixture lineup is already optimal', () => {
  const M = model();
  const l = M.lineup(M.me);
  assert.deepEqual(l.opt.slots.map((s) => s.pid), ['1001', '1003', '1005', '1007', '1004', '1002']);
  assert.equal(l.opt.total, 81);
  assert.deepEqual(l.bench, ['1006']);
  assert.deepEqual(l.ir, ['1008']);
  assert.deepEqual(M.swaps(), []);
});

test('solver fills fixed slots first and never puts a QB in FLEX', () => {
  const M = model();
  const opt = M.solve(['1001', '1002', '1003']);
  assert.deepEqual(slotOf(opt, 'QB'), ['1001']);
  assert.deepEqual(slotOf(opt, 'RB'), ['1003']);
  assert.deepEqual(slotOf(opt, 'FLEX'), [null], 'QB is not FLEX-eligible');
  assert.deepEqual(slotOf(opt, 'SUPER_FLEX'), ['1002']);
});

test('injured and bye players are left out of the optimal lineup', () => {
  const M = model((s) => {
    s.players['1005'].inj = 'Out';
    s.players['1002'].team = 'GGG'; // bye
  });
  const opt = M.lineup(M.me).opt;
  assert.deepEqual(slotOf(opt, 'WR'), ['1006']);
  assert.ok(!opt.slots.some((s) => s.pid === '1005' || s.pid === '1002'));
});

test('players whose game has started are frozen in place', () => {
  // Fox moves to BBB (already kicked off) and projects 30, but can no longer be subbed in.
  const M = model((s) => {
    s.players['1006'].team = 'BBB';
    s.players['1006'].proj.pts = 30;
    s.schedule[10].games[0].state = 'in';
  });
  assert.equal(M.P('1006').locked, true);
  assert.equal(M.P('1005').locked, true, 'starter in the same game is locked too');
  const opt = M.lineup(M.me).opt;
  assert.ok(!opt.slots.some((s) => s.pid === '1006'));
  assert.deepEqual(slotOf(opt, 'WR'), ['1005'], 'locked starter keeps his slot');
});

test('a game counts as locked once kickoff time passes even if state is still pre', () => {
  const M = model(null, { now: Date.parse('2026-11-29T18:30:00Z') });
  assert.equal(M.P('1001').locked, true);
  assert.equal(M.P('1004').locked, false, 'later game still open');
});

test('swap calls: Clear at 4+, Lean at 2-4, Fix when the starter is out', () => {
  const clear = model((s) => (s.players['1006'].proj.pts = 13.5)).swaps();
  assert.equal(clear.length, 1);
  assert.equal(clear[0].start, '1006');
  assert.equal(clear[0].bench, '1004');
  assert.equal(clear[0].call, 'Clear');

  const lean = model((s) => (s.players['1006'].proj.pts = 11.5)).swaps();
  assert.equal(lean[0].call, 'Lean');

  const fix = model((s) => (s.players['1005'].inj = 'Out')).swaps();
  assert.equal(fix[0].start, '1006');
  assert.equal(fix[0].bench, '1005');
  assert.equal(fix[0].call, 'Fix');
  assert.equal(fix[0].band, 'hard');
});

test('toss-ups break on health first', () => {
  const rows = model((s) => {
    s.players['1004'].inj = 'Questionable';
    s.players['1006'].proj.pts = 10;
  }).swaps();
  assert.equal(rows[0].call, 'Toss-up');
  assert.equal(rows[0].tb.reasons[0].step, 'Health');
  assert.equal(rows[0].keep, false, 'start the healthy bench player');
});

test('startSit: a dead player always loses, otherwise the projection gap sets the band', () => {
  const M = model();
  const r = M.startSit('1005', '1006');
  assert.equal(r.pick, '1005');
  assert.equal(r.band, 'clear');

  const out = model((s) => (s.players['1005'].inj = 'Out')).startSit('1005', '1006');
  assert.equal(out.pick, '1006');
  assert.equal(out.band, 'clear');
  assert.match(out.why[0], /is listed Out/);

  const lean = model((s) => (s.players['1006'].proj.pts = 11)).startSit('1005', '1006');
  assert.equal(lean.band, 'lean');
  assert.equal(lean.pick, '1005');
});

test('empty starting slot is critical and names the bench fix when there is one', () => {
  // Golf drops out of the lineup but stays on the bench, so he is the fix.
  const fixable = model((s) => (s.teams[0].starters[3] = '0')).problems();
  const [p] = byTitle(fixable, /TE slot is empty/);
  assert.equal(p.sev, 'critical');
  assert.match(p.body, /move Golf into TE/);

  // With no TE on the roster at all, the only fix is a claim.
  const none = model((s) => {
    s.teams[0].starters[3] = '0';
    s.teams[0].players = s.teams[0].players.filter((id) => id !== '1007');
  }).problems();
  const [q] = byTitle(none, /TE slot is empty/);
  assert.match(q.body, /Nobody on your roster fits TE/);
});

test('a starter listed Out is critical and names the bench replacement', () => {
  const probs = model((s) => (s.players['1005'].inj = 'Out')).problems();
  assert.equal(probs[0].sev, 'critical', 'critical problems sort first');
  const [p] = byTitle(probs, /Echo is listed Out/);
  assert.match(p.body, /start Fy Fox/);
});

// ---------------------------------------------------------------- IR rules

test('IR eligibility follows the league settings; Questionable and healthy never qualify', () => {
  const M = model();
  for (const s of ['IR', 'PUP', 'Out', 'Doubtful', 'Sus', 'NA', 'DNR', 'COV']) assert.equal(M.irAllowed(s), true, s);
  for (const s of ['Questionable', 'Probable', null]) assert.equal(M.irAllowed(s), false, String(s));

  const strict = model((s) => {
    s.league.settings.reserve_allow_out = 0;
    s.league.settings.reserve_allow_doubtful = 0;
  });
  assert.equal(strict.irAllowed('Out'), false);
  assert.equal(strict.irAllowed('Doubtful'), false);
  assert.equal(strict.irAllowed('IR'), true, 'IR is always allowed');
});

test('a legal IR stash raises no problem and does not lock waivers', () => {
  const M = model();
  assert.equal(byTitle(M.problems(), /Hotel/).length, 0);
  assert.equal(M.waiverPlan().locked, false);
});

test('a player activated while on IR is critical and locks claims', () => {
  const M = model((s) => (s.players['1008'].inj = null));
  const [p] = byTitle(M.problems(), /Hotel is on IR but tagged healthy/);
  assert.equal(p.sev, 'critical');
  assert.equal(M.waiverPlan().locked, true);
});

test('a Questionable tag on IR is illegal and the injury row says move him off', () => {
  const M = model((s) => (s.players['1008'].inj = 'Questionable'));
  assert.equal(byTitle(M.problems(), /on IR but tagged Questionable/).length, 1);
  const row = M.injuryRows().find((r) => r.pid === '1008');
  assert.equal(row.where, 'ir');
  assert.equal(row.action.t, 'Move off IR now');
  assert.equal(row.action.bad, true);
});

test('IR legality uses the Sleeper tag; an ESPN upgrade only warns', () => {
  const M = model((s) => s.notes.push({ pid: '1008', status: 'Questionable', date: '2026-11-22T12:00:00Z' }));
  const probs = M.problems();
  assert.equal(byTitle(probs, /on IR but tagged/).length, 0);
  const [w] = byTitle(probs, /ESPN shows Questionable, Sleeper still shows IR/);
  assert.equal(w.sev, 'warn');
  assert.equal(M.waiverPlan().locked, false);
});

test('an IR-eligible bench player is flagged only while an IR slot is open', () => {
  const open = model((s) => (s.players['1006'].inj = 'Out'));
  assert.equal(byTitle(open.problems(), /Fox can move to IR/).length, 1);
  assert.equal(open.injuryRows().find((r) => r.pid === '1006').action.t, 'Move to IR');

  const full = model((s) => {
    s.players['1006'].inj = 'Out';
    s.players['1009'] = { id: '1009', n: 'Ike Ir', pos: 'WR', team: 'DDD', inj: 'IR', proj: { pts: 0 }, hist: [], own: 1 };
    s.teams[0].players.push('1009');
    s.teams[0].reserve.push('1009');
  });
  assert.equal(full.irSlots, 2);
  assert.equal(byTitle(full.problems(), /Fox can move to IR/).length, 0);
  // IR full, so he holds a bench spot: a free agent worth more for the rest of the season makes
  // him a cut candidate (one value for hold-or-cut).
  const fox = full.injuryRows().find((r) => r.pid === '1006');
  assert.equal(fox.action.t, 'Cut candidate');
  assert.match(fox.action.d, /Ray Romeo/);
  assert.ok(fox.value < full.bestFreeAgent().value);
});

test('nextManUp lists the healthy backups behind a player and who owns them', () => {
  const M = model();
  const [b] = M.nextManUp('1003');
  assert.equal(b.id, '5002');
  assert.equal(b.ownerLabel, 'Free agent');
});

// ---------------------------------------------------------------- waivers

test('roster and IR capacity', () => {
  const M = model();
  assert.equal(M.maxRoster, 12, '10 roster positions + 2 IR');
  const { open } = M.waiverPlan();
  assert.deepEqual(open, { spots: 4, ir: 1, max: 12 });
});

test('waivers run on the configured day; on that day the next run is a week out', () => {
  const mon = model();
  assert.equal(mon.nextWaiverRun() - NOW, 1 * DAY_MS, 'Monday -> Tuesday');
  const tueNow = NOW + DAY_MS;
  const tue = model(null, { now: tueNow });
  assert.equal(tue.nextWaiverRun() - tueNow, 7 * DAY_MS, 'Tuesday -> next Tuesday');
  const wed = model((s) => (s.league.settings.waiver_day_of_week = 3));
  assert.equal(wed.nextWaiverRun() - NOW, 2 * DAY_MS, 'Monday -> Wednesday');
});

test('a rising free agent who upgrades the lineup is a tier-1 riser with no drop needed', () => {
  const plan = model().waiverPlan();
  const r = plan.groups.risers.find((c) => c.id === '5001');
  assert.ok(r, 'Romeo is a riser');
  assert.equal(r.impact, 3, 'replaces Dash (9) in FLEX with 12');
  assert.ok(r.why.includes('scoring up'));
  assert.ok(r.why.includes('lineup upgrade'));
  assert.equal(r.tier, 1);
  assert.equal(r.drop.none, true);
  assert.match(r.drop.text, /4 open roster spots \(8\/12\)/);
});

test('an available handcuff for a starting RB is offered as insurance (tier 4)', () => {
  const plan = model().waiverPlan();
  const c = plan.groups.cuffs.find((x) => x.id === '5002');
  assert.ok(c);
  assert.equal(c.of, '1003');
  assert.equal(c.tier, 4);
  assert.ok(plan.needs.some((n) => n.label === 'Insurance'));
});

test('with a full roster the drop is the weakest bench piece, protecting the 2nd TE', () => {
  const M = model((s) => {
    const extra = [
      ['1010', 'QB', 2],
      ['1011', 'WR', 1],
      ['1012', 'RB', 3],
      ['1013', 'TE', 0.5],
    ];
    for (const [id, pos, pts] of extra) {
      s.players[id] = { id, n: 'Bench ' + id, pos, team: 'DDD', inj: null, proj: { pts }, hist: [], own: 1 };
      s.teams[0].players.push(id);
    }
  });
  assert.equal(M.me.players.length, 12);
  const r = M.waiverPlan().groups.risers.find((c) => c.id === '5001');
  // Ranked by rest-of-season value (VALUE_RULES.dropByValue): the third QB is worth nothing in a
  // one-QB league, so he goes before the bench WR; the 2nd TE is still protected.
  assert.equal(r.drop.pid, '1010', 'third QB has no value above replacement');
  assert.notEqual(r.drop.pid, '1013', 'TE 1013 projects less but is only the 2nd TE');
});

test('a starter on bye creates a claim need; an empty slot a bench player can fill does not', () => {
  const bye = model((s) => (s.players['1005'].team = 'GGG')).waiverPlan();
  const n = bye.needs.find((x) => /Echo is on bye/.test(x.label));
  assert.equal(n.claim, true);

  const empty = model((s) => (s.teams[0].starters[1] = '0')).waiverPlan();
  const e = empty.needs.find((x) => x.label === 'Empty RB slot');
  assert.equal(e.claim, false);
});

test('rival drops: recent, rival-only, and flagged while still in the waiver clear window', () => {
  const M = model((s) => {
    s.players['5004'] = { id: '5004', n: 'Uri Uniform', pos: 'WR', team: 'EEE', inj: null, proj: { pts: 7 }, hist: [], own: null };
    s.players['5005'] = { id: '5005', n: 'Vic Victor', pos: 'WR', team: 'EEE', inj: null, proj: { pts: 7 }, hist: [], own: null };
    s.transactions.push(
      { type: 'free_agent', created: NOW - DAY_MS, rids: [2], adds: null, drops: { 5003: 2 }, picks: [] },
      { type: 'free_agent', created: NOW - DAY_MS, rids: [1], adds: null, drops: { 5004: 1 }, picks: [] },
      { type: 'free_agent', created: NOW - 8 * DAY_MS, rids: [2], adds: null, drops: { 5005: 2 }, picks: [] },
    );
  });
  const drops = M.waiverPlan().rivalDrops;
  assert.deepEqual(drops.map((d) => d.id), ['5003'], 'own drops and week-old drops are ignored');
  assert.equal(drops[0].inClear, true);
  assert.equal(drops[0].clearsAt, NOW - DAY_MS + 2 * DAY_MS);
});

// ---------------------------------------------------------------- trades

test('trade deadline is the end of the deadline week (last kickoff + 3.5h); accept-by is the same moment', () => {
  const M = model();
  assert.equal(M.deadlineWeek, 11);
  assert.equal(M.deadlineAt, Date.parse('2026-12-06T21:25:00Z') + 3.5 * 3600 * 1000);
  assert.equal(M.acceptBy, M.deadlineAt);
  assert.equal(M.deadlinePassed, false);

  const after = model((s) => (s.meta.week = 11), { now: Date.parse('2026-12-07T01:00:00Z') });
  assert.equal(after.deadlinePassed, true);
  const during = model((s) => (s.meta.week = 11), { now: Date.parse('2026-12-04T02:00:00Z') });
  assert.equal(during.deadlinePassed, false, 'trades stay open after the Thursday game');
  const later = model((s) => (s.meta.week = 12));
  assert.equal(later.deadlinePassed, true);
});

test('evalTrade scores both lineups before and after', () => {
  const M = model();
  const r = M.evalTrade(2, ['1006'], ['2002']); // Fox (bench WR, 8) for Juliet (RB, 12)
  assert.equal(r.mine.before, 81);
  assert.equal(r.mine.after, 84, 'Juliet takes FLEX from Dash');
  assert.equal(r.mine.delta, 3);
  assert.equal(r.theirs.before, 71);
  assert.equal(r.theirs.after, 64, 'their RB falls to Oscar (5)');
  assert.equal(r.theirs.delta, -7);
  assert.equal(r.rosterAfter, 8);
  assert.equal(r.rosterMax, 12);
});

test('evalTrade never counts the partner\'s IR stash in their lineup', () => {
  const M = model((s) => {
    s.players['2008'] = { id: '2008', n: 'Wes Whiskey', pos: 'RB', team: 'EEE', inj: 'Questionable', proj: { pts: 30 }, hist: [], own: 2 };
    s.teams[1].players.push('2008');
    s.teams[1].reserve.push('2008');
  });
  const r = M.evalTrade(2, [], []);
  assert.equal(r.theirs.before, 71);
  assert.equal(r.theirs.after, 71);
});

test('picksOwned splits own, sold and acquired future picks', () => {
  const M = model((s) => {
    s.picks = [
      { season: '2027', round: 1, roster_id: 1, owner_id: 2 },
      { season: '2027', round: 2, roster_id: 3, owner_id: 1 },
    ];
  });
  const p = M.picksOwned(1);
  assert.deepEqual(p.own, [{ season: 2027, round: 2 }, { season: 2027, round: 3 }]);
  assert.deepEqual(p.sold, [{ season: 2027, round: 1, to: 2 }]);
  assert.deepEqual(p.acquired, [{ season: 2027, round: 2, from: 3 }]);
});

test('tradeLog keeps only trades, newest first', () => {
  const M = model((s) => {
    s.transactions.push(
      { type: 'trade', created: 1, rids: [1, 2], adds: { 1006: 2 }, drops: { 1006: 1 }, picks: [] },
      { type: 'waiver', created: 3, rids: [1], adds: { 5001: 1 }, drops: null, picks: [] },
      { type: 'trade', created: 2, rids: [3, 4], adds: {}, drops: {}, picks: [] },
    );
  });
  assert.deepEqual(M.tradeLog().map((t) => t.created), [2, 1]);
});

test('wire feed describes adds and drops in plain words', () => {
  const M = model((s) => {
    s.transactions.push({ type: 'waiver', created: 5, rids: [1], adds: { 5001: 1 }, drops: { 1006: 1 }, picks: [] });
  });
  const [item] = M.wireItems();
  assert.equal(item.kind, 'add');
  assert.equal(item.mine, true);
  assert.equal(item.text, 'owen added Ray Romeo and dropped Fy Fox');
});

test('wire feed names traded draft picks by season and round', () => {
  const M = model((s) => {
    s.transactions.push({
      type: 'trade', created: 5, rids: [1, 2], adds: { 2002: 1, 1006: 2 }, drops: { 2002: 2, 1006: 1 },
      picks: [{ s: '2027', r: 1, from: 1, orig: 1, to: 2 }],
    });
  });
  const [item] = M.wireItems();
  assert.match(item.text, /rival gets .*2027 R1/);
});

// ---------------------------------------------------------------- locked bench players
// Fy Fox (bench WR, CCC) has already played: Sleeper will not let him into the lineup.
const foxPlayed = (s) => (s.schedule[10].games[1].state = 'post');

test('an Out starter is not told to swap in a bench player whose game has already started', () => {
  const M = model((s) => {
    foxPlayed(s);
    s.players['1005'].inj = 'Out';
  });
  assert.equal(M.P('1006').locked, true);
  const [p] = byTitle(M.problems(), /Ed Echo is listed Out/);
  assert.ok(p, 'the Out starter is still flagged');
  assert.doesNotMatch(p.body, /Fy Fox/);
  const row = M.injuryRows().find((r) => r.pid === '1005');
  assert.doesNotMatch(row.action.d, /Fy Fox/);
});

test('a Questionable starter gets no fallback whose game has already started', () => {
  const M = model((s) => {
    foxPlayed(s);
    s.players['1005'].inj = 'Questionable';
  });
  assert.equal(M.fallbackFor('WR', ['1005']), undefined);
  assert.equal(M.qCall('1005', 'WR').fb, undefined);
});

test('a bench player whose game has not started is still a fallback', () => {
  const M = model((s) => (s.players['1005'].inj = 'Out'));
  assert.equal(M.fallbackFor('WR', ['1005']), '1006');
});

// ---------------------------------------------------------------- K/DEF drops
// Full roster (12 = 10 slots + 2 IR) with one defense: adding a defense drops the old one.
const fullWithDef = (s) => {
  const add = (id, n, pos, team, proj) => (s.players[id] = { id, n, pos, team, inj: null, proj: { pts: proj }, next: { pts: proj }, hist: [], own: 1, depth: null, exp: 4 });
  add('1009', 'Old Defense', 'DEF', 'CCC', 5);
  add('1010', 'Ike Ida', 'WR', 'BBB', 6);
  add('1011', 'Jay Jet', 'RB', 'BBB', 6);
  add('1012', 'Kit Kay', 'WR', 'AAA', 6);
  s.teams[0].players.push('1009', '1010', '1011', '1012');
  s.players['5009'] = { id: '5009', n: 'New Defense', pos: 'DEF', team: 'EEE', inj: null, proj: { pts: 9 }, next: { pts: 9 }, hist: [], own: null, depth: null, exp: 4 };
};

test('adding a defense with a full roster drops your current defense, not a skill player', () => {
  const M = model(fullWithDef);
  assert.equal(M.me.players.length, M.maxRoster);
  const d = M.dropFor({ id: '5009', p: M.P('5009') });
  assert.equal(d.pid, '1009');
});

test('adding a skill player still never drops your only defense', () => {
  const M = model(fullWithDef);
  const d = M.dropFor({ id: '5001', p: M.P('5001') });
  assert.ok(d.pid && d.pid !== '1009', `dropped ${d.pid}`);
});
