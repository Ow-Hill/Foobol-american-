// Ripple engine + news classifier/scoring tests. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRipple } from '../public/js/ripple.js';
import { classify, buildPlayerNews } from '../public/js/playernews.js';
import { buildModel } from '../public/js/model.js';

// hist rows for weeks 1..n with fixed usage; `skip` = weeks he did not play
const H = (n, tgt, att, skip = []) =>
  Array.from({ length: n }, (_, i) => i + 1)
    .filter((w) => !skip.includes(w))
    .map((w) => ({ w, pts: tgt + att * 0.6, snp: 70, tgt, att, rec: Math.round(tgt * 0.6) }));

function team(over = {}) {
  const base = {
    qb1: { id: 'qb1', n: 'Alpha Passer', pos: 'QB', team: 'BUF', depth: 1, inj: null, hist: H(5, 0, 3) },
    qb2: { id: 'qb2', n: 'Backup Passer', pos: 'QB', team: 'BUF', depth: 2, inj: null, hist: [] },
    wr1: { id: 'wr1', n: 'Top Wideout', pos: 'WR', dpos: 'LWR', team: 'BUF', depth: 1, inj: null, hist: H(5, 9, 0) },
    wr2: { id: 'wr2', n: 'Second Wideout', pos: 'WR', dpos: 'RWR', team: 'BUF', depth: 1, inj: null, hist: H(5, 6, 0) },
    wr3: { id: 'wr3', n: 'Depth Wideout', pos: 'WR', dpos: 'LWR', team: 'BUF', depth: 2, inj: null, hist: H(5, 1, 0) },
    te1: { id: 'te1', n: 'Tight End', pos: 'TE', team: 'BUF', depth: 1, inj: null, hist: H(5, 4, 0) },
    rb1: { id: 'rb1', n: 'Lead Back', pos: 'RB', team: 'BUF', depth: 1, inj: null, hist: H(5, 3, 15) },
    rb2: { id: 'rb2', n: 'Handcuff Back', pos: 'RB', team: 'BUF', depth: 2, inj: null, hist: H(5, 1, 5) },
    rb3: { id: 'rb3', n: 'Third Back', pos: 'RB', team: 'BUF', depth: 3, inj: null, hist: H(5, 0, 1) },
  };
  for (const k in over) base[k] = { ...base[k], ...over[k] };
  return base;
}
const of = (r, pid) => r.byPid.get(pid) || [];

test('WR1 out: vacated targets go to the other pass catchers, next man up gets the bump', () => {
  const r = buildRipple(team({ wr1: { inj: 'Out' } }), { W: 6 });
  const wr2 = of(r, 'wr2')[0];
  const te1 = of(r, 'te1')[0];
  const wr3 = of(r, 'wr3')[0];
  assert.equal(wr2.dir, 'up');
  assert.equal(te1.dir, 'up');
  assert.ok(wr2.tgt > te1.tgt, 'larger current share inherits more');
  assert.ok(wr3 && wr3.tgt >= 2, 'same-slot next man up gets the 25% bump');
  const total = r.effects.filter((e) => e.src === 'wr1').reduce((s, e) => s + (e.tgt || 0), 0);
  assert.ok(Math.abs(total - 9) <= 1.2, `redistributed ~9 targets, got ${total}`);
  assert.ok(!of(r, 'wr1').length, 'no effect on the injured player himself');
});

test('RB1 out: the handcuff gets most of the carries', () => {
  const r = buildRipple(team({ rb1: { inj: 'IR' } }), { W: 6 });
  const rb2 = of(r, 'rb2')[0];
  const rb3 = of(r, 'rb3')[0];
  assert.equal(rb2.dir, 'up');
  assert.ok(rb2.att > 9, `handcuff gets most of 15 carries, got ${rb2.att}`);
  assert.ok(!rb3 || rb3.att < rb2.att);
});

test('QB out: backup starts, every pass catcher is downgraded, the top target least', () => {
  const r = buildRipple(team({ qb1: { inj: 'Out' } }), { W: 6 });
  assert.equal(of(r, 'qb2')[0].dir, 'up');
  assert.equal(of(r, 'qb2')[0].starts, true);
  const wr1 = of(r, 'wr1')[0];
  const wr2 = of(r, 'wr2')[0];
  assert.equal(wr1.dir, 'down');
  assert.equal(wr2.dir, 'down');
  assert.ok(Math.abs(wr1.pct) < Math.abs(wr2.pct), 'alpha loses the least');
});

test('Observed with/without split replaces the heuristic', () => {
  // WR1 missed week 3; WR2 saw 11 targets that week vs 6 otherwise.
  const t = team({ wr1: { inj: 'Out', hist: H(5, 9, 0, [3]) } });
  t.wr2.hist = H(5, 6, 0).map((h) => (h.w === 3 ? { ...h, tgt: 11 } : h));
  const r = buildRipple(t, { W: 6 });
  const e = of(r, 'wr2')[0];
  assert.equal(e.observed, true);
  assert.equal(e.tgt, 5);
});

test('Star returns: the fill-in loses what he gained', () => {
  // WR1 missed weeks 4-5 (team played), now healthy; WR2 got 10 targets in those games.
  const t = team({ wr1: { hist: H(3, 9, 0) } });
  t.wr2.hist = H(5, 6, 0).map((h) => (h.w >= 4 ? { ...h, tgt: 10 } : h));
  const r = buildRipple(t, { W: 6 });
  const e = of(r, 'wr2').find((x) => x.kind === 'return');
  assert.ok(e, 'return effect present');
  assert.equal(e.dir, 'down');
  assert.equal(e.tgt, -4);
});

test('Long-term absence is already priced into teammates usage', () => {
  const r = buildRipple(team({ wr1: { inj: 'IR', hist: H(3, 9, 0) } }), { W: 6 });
  assert.ok(!r.effects.some((e) => e.src === 'wr1' && e.kind === 'out'));
});

test('Trade: new team same-position players lose share, old team gains', () => {
  const t = team();
  t.new1 = { id: 'new1', n: 'New Arrival', pos: 'WR', team: 'BUF', prevTeam: 'MIA', depth: 1, tchg: Date.now() - 86400000, hist: H(5, 8, 0) };
  t.mia1 = { id: 'mia1', n: 'Dolphin Wideout', pos: 'WR', team: 'MIA', depth: 1, hist: H(5, 5, 0) };
  t.mia2 = { id: 'mia2', n: 'Dolphin End', pos: 'TE', team: 'MIA', depth: 1, hist: H(5, 3, 0) };
  const r = buildRipple(t, { W: 6 });
  assert.equal(of(r, 'wr2').find((e) => e.kind === 'trade-in').dir, 'down');
  assert.equal(of(r, 'mia1').find((e) => e.kind === 'trade-out').dir, 'up');
  assert.equal(of(r, 'mia2').find((e) => e.kind === 'trade-out').dir, 'up');
});

test('Line movement: a 3-point drop flags the offense, a 1-point wiggle does not', () => {
  const r = buildRipple(team(), { W: 6, lines: { BUF: { open: 27.5, now: 24.5 }, MIA: { open: 21, now: 22 } } });
  const ev = r.effects.filter((e) => e.kind === 'line-move');
  assert.ok(ev.length >= 4);
  assert.ok(ev.every((e) => e.dir === 'down' && e.conf === 'toss'));
  assert.ok(of(r, 'wr1').some((e) => e.kind === 'line-move'));
  assert.ok(!of(r, 'qb2').some((e) => e.kind === 'line-move'), 'backup without a role is not flagged');
});

test('Teams on bye produce no events', () => {
  const r = buildRipple(team({ wr1: { inj: 'Out' } }), { W: 6, isBye: (t) => t === 'BUF' });
  assert.equal(r.effects.length, 0);
});

test('classifier: health wording is not speculation, performance is not injury', () => {
  assert.equal(classify('Josh Allen expected to play Sunday', '', 'search').posture, 'reported');
  assert.equal(classify('Josh Allen expected to play Sunday', '', 'search').better, true);
  assert.equal(classify('According to the team, X is questionable', '', 'search').posture, 'reported');
  assert.equal(classify('Per sources, Bills interested in trading for X', '', 'search').posture, 'speculative');
  assert.ok(!classify('Puka Nacua broke out for 150 yards', '', 'search').cats.includes('injury'));
  assert.ok(!classify('He broke a tackle for a 40-yard TD', '', 'search').cats.includes('injury'));
  assert.ok(classify('Receiver broke his ankle', '', 'search').cats.includes('injury'));
  assert.ok(classify('Back suffers torn ACL', '', 'search').cats.includes('injury'));
  assert.equal(classify('Rookie takes over as lead back', '', 'search').roleDir, 'up');
  assert.equal(classify('Veteran demoted to backup role', '', 'search').roleDir, 'down');
});

// ---------- end-to-end: model + engine on a tiny league ----------
function league() {
  const players = {};
  for (const p of Object.values(team())) players[p.id] = { ...p, own: null, proj: { pts: 0 }, trend: null };
  // My roster: wr2, rb1, te1. Rival (2): qb1, wr1. Free agents: rb2, wr3, qb2, rb3.
  players.wr2.own = 1; players.rb1.own = 1; players.te1.own = 1;
  players.qb1.own = 2; players.wr1.own = 2;
  players.wr2.proj = { pts: 12 }; players.rb1.proj = { pts: 14 }; players.te1.proj = { pts: 8 };
  players.rb2.proj = { pts: 5 }; players.wr3.proj = { pts: 3 }; players.qb1.proj = { pts: 20 }; players.wr1.proj = { pts: 15 };
  players.rb1.inj = 'Out';
  return {
    meta: { week: 6, tz: 'America/Toronto', builtAt: Date.now(), playoffWeeks: [15, 16, 17] },
    league: { name: 'Test', rosterPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN'], settings: { reserve_slots: 1, playoff_week_start: 15, trade_deadline: 11, num_teams: 2 }, scoring: {} },
    teams: [
      { id: 1, owner: 'me', name: 'Me', isMe: true, w: 3, l: 2, players: ['wr2', 'rb1', 'te1'], starters: ['0', 'rb1', 'wr2', 'te1', '0'], reserve: [], taxi: [] },
      { id: 2, owner: 'rival', name: 'Rival', w: 4, l: 1, players: ['qb1', 'wr1'], starters: ['qb1', '0', 'wr1', '0', '0'], reserve: [], taxi: [] },
    ],
    players,
    schedule: { 6: { games: [], byes: [] } },
    matchups: { 6: [{ rid: 1, mid: 1, starters: [] }, { rid: 2, mid: 1, starters: [] }] },
    transactions: [],
    picks: [],
    notes: [],
    articles: [],
    playerNews: { items: [], perPlayer: {}, degraded: false, disabled: false },
  };
}

test('engine: my RB out lifts the free-agent handcuff on the Wire, capped below act', () => {
  const M = buildModel(league(), 1, Date.now());
  const res = buildPlayerNews(M);
  const rb2 = res.items.filter((i) => i.pId === 'rb2' && i.kind === 'ripple');
  assert.ok(rb2.length, 'handcuff gets a ripple item');
  assert.ok(rb2[0].scores.wire >= 35, `visible on the Wire (score ${rb2[0].scores.wire})`);
  assert.ok(rb2[0].scores.wire <= 74, 'an estimate never reaches act');
});

test('engine: a free agent getting hurt ranks below a free agent getting a role', () => {
  const snap = league();
  const now = Date.now();
  snap.playerNews.items = [
    { id: 'g1', pid: 'wr3', time: now - 3600e3, title: 'Depth Wideout ruled out for Week 6', src: 'ESPN' },
    { id: 'g2', pid: 'rb3', time: now - 3600e3, title: 'Third Back takes over as lead back', src: 'ESPN' },
  ];
  const M = buildModel(snap, 1, now);
  const res = buildPlayerNews(M);
  const hurt = res.items.find((i) => i.id === 'g1');
  const role = res.items.find((i) => i.id === 'g2');
  assert.ok(role.scores.wire > hurt.scores.wire, `role ${role.scores.wire} > hurt ${hurt.scores.wire}`);
});

test('engine: rival news ranks higher when he is this week’s opponent starter', () => {
  const snap = league();
  const now = Date.now();
  snap.playerNews.items = [{ id: 'g3', pid: 'wr1', time: now - 3600e3, title: 'Top Wideout limited in practice', src: 'ESPN' }];
  const withOpp = buildPlayerNews(buildModel(snap, 1, now)).items.find((i) => i.id === 'g3').scores.league;
  const snap2 = league();
  snap2.playerNews.items = snap.playerNews.items;
  snap2.matchups[6] = [{ rid: 1, mid: 1, starters: [] }, { rid: 2, mid: 2, starters: [] }];
  const noOpp = buildPlayerNews(buildModel(snap2, 1, now)).items.find((i) => i.id === 'g3').scores.league;
  assert.ok(withOpp > noOpp, `${withOpp} > ${noOpp}`);
});

test('matchup strength: points allowed by position, ranked softest first, byes not counted', async () => {
  const { buildMatchups } = await import('../public/js/matchup.js');
  const P = (id, pos, team, pts) => ({ id, pos, team, hist: [1, 2, 3].map((w) => ({ w, pts })) });
  const snap = {
    // weeks 1-3: BUF plays MIA every week; KC plays NYJ in weeks 1-2, KC on bye week 3
    results: { 1: { BUF: 'MIA', MIA: 'BUF', KC: 'NYJ', NYJ: 'KC' }, 2: { BUF: 'MIA', MIA: 'BUF', KC: 'NYJ', NYJ: 'KC' }, 3: { BUF: 'MIA', MIA: 'BUF' } },
    players: {
      a: P('a', 'RB', 'BUF', 20), // MIA allows 20 to RBs
      b: P('b', 'RB', 'KC', 8), // NYJ allows 8 (weeks 1-2 only)
      c: P('c', 'RB', 'MIA', 12),
      d: { id: 'd', pos: 'RB', team: 'NYJ', hist: [1, 2].map((w) => ({ w, pts: 4 })) },
    },
  };
  const m = buildMatchups(snap);
  assert.equal(m.byDef.MIA.RB.avg, 20);
  assert.equal(m.byDef.NYJ.RB.avg, 8);
  assert.equal(m.byDef.KC.RB.games, 2, 'bye week not counted as a zero');
  assert.equal(m.byDef.KC.RB.avg, 4);
  assert.equal(m.byDef.MIA.RB.rank, 1);
  assert.equal(m.byDef.KC.RB.rank, 4);
});
