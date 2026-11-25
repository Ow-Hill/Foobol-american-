// Waiver scanner tests: news typing + usage stats + lineup gain -> ranked, explained advice.
// Fixture: test/fixtures/league.mjs (Week 10, Owen = roster 1). Headlines are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../public/js/model.js';
import { classify, buildPlayerNews } from '../public/js/playernews.js';
import { waiverIntel, usageOf, newsSignals } from '../public/js/waiverintel.js';
import { buildDecisions } from '../public/js/decision.js';
import { league, NOW } from './fixtures/league.mjs';

const H = 3600000;
const headline = (pid, title, hoursAgo = 6, src = 'ESPN') => ({ id: `g${pid}${hoursAgo}${title.length}`, pid, title, src, time: NOW - hoursAgo * H });

function scan(mutate, items = []) {
  const s = league(mutate);
  s.articles = [];
  s.playerNews = { items, degraded: false, disabled: false, perPlayer: {} };
  const M = buildModel(s, 1, NOW);
  const news = buildPlayerNews(M);
  return { M, news, I: waiverIntel(M, M.waiverPlan(), news) };
}
const row = (I, id) => I.byId.get(id);
const hist = (rows) => rows.map(([pts, snp, att, tgt], i) => ({ w: i + 1, pts, snp, att, tgt, rec: 0 }));

// ---------------------------------------------------------------- classification

test('classify types role, camp, trade and practice news', () => {
  assert.equal(classify('Sam Sierra named the starter with Cook on IR', '', 'search').role, 'up');
  assert.equal(classify('Ray Romeo benched after drops, losing snaps to rookie', '', 'search').role, 'down');
  assert.ok(classify('Sam Sierra impresses at training camp', '', 'search').cats.includes('camp'));
  assert.ok(classify('Bills traded Tom Tango to the Jets', '', 'search').cats.includes('trade'));
  const lp = classify('Cy Cook (ankle) limited in practice Wednesday', '', 'search');
  assert.equal(lp.practice, 'LP');
  assert.ok(lp.cats.includes('injury'));
  assert.equal(classify('Ray Romeo scores twice in win', '', 'search').role, null);
});

test('newsSignals keeps the strongest signal per kind, decays with age and halves rumours', () => {
  const fresh = newsSignals([{ time: NOW, tier: 1, posture: 'reported', role: 'up', cats: ['depth'], title: 'x' }], NOW);
  const old = newsSignals([{ time: NOW - 6 * 24 * H, tier: 1, posture: 'reported', role: 'up', cats: ['depth'], title: 'x' }], NOW);
  const rumour = newsSignals([{ time: NOW, tier: 1, posture: 'speculative', role: 'up', cats: ['depth'], title: 'x' }], NOW);
  assert.ok(fresh.net > old.net, 'older news counts less');
  assert.ok(Math.abs(rumour.net - fresh.net / 2) < 1e-9, 'rumour counts half');
  assert.equal(rumour.onlySpeculative, true);
  const twice = newsSignals([
    { time: NOW, tier: 1, posture: 'reported', role: 'up', cats: ['depth'], title: 'a' },
    { time: NOW, tier: 1, posture: 'reported', role: 'up', cats: ['depth'], title: 'b' },
  ], NOW);
  assert.equal(twice.net, fresh.net, 'two copies of one role headline do not add up');
});

// ---------------------------------------------------------------- stats

test('usageOf reads snaps, touches and targets over the last 3 games against the games before', () => {
  const s = league();
  s.players['5003'].hist = hist([[4, 40, 0, 2], [5, 42, 0, 3], [9, 70, 0, 7], [12, 78, 0, 8], [14, 85, 0, 9]]);
  const M = buildModel(s, 1, NOW);
  const u = usageOf(M.P('5003'));
  assert.equal(u.snap, 85);
  assert.equal(u.tgt3, 8);
  assert.equal(u.tgtPrior, 2.5);
  assert.ok(u.snapTrend > 5);
});

test('a free agent with a growing role outranks an identical one whose role is flat', () => {
  const { I } = scan((s) => {
    s.players['5003'].hist = hist([[6, 50, 0, 4], [6, 50, 0, 4], [6, 50, 0, 4], [6, 50, 0, 4], [6, 50, 0, 4]]);
    s.players['5004'] = { ...s.players['5003'], id: '5004', n: 'Uri Uniform', hist: hist([[3, 35, 0, 2], [4, 38, 0, 2], [7, 60, 0, 6], [8, 72, 0, 7], [9, 80, 0, 8]]) };
  });
  assert.ok(row(I, '5004').score > row(I, '5003').score);
  assert.ok(row(I, '5004').reasons.some((r) => r.kind === 'usage' && /targets\/g last 3 \(was/.test(r.text)));
});

// ---------------------------------------------------------------- news + stats together

test('a teammate on IR turns the next-man-up into a Tier 1 claim with the reason named', () => {
  const { I } = scan((s) => {
    s.players['1003'].inj = 'IR';
    s.players['1003'].hist = hist([[15], [16], [14]]);
  });
  const r = row(I, '5002');
  assert.equal(r.takeover, true);
  assert.equal(r.tier, 1);
  assert.equal(r.verdict, 'claim');
  assert.match(r.reasons[0].text, /Cy Cook .* is listed IR — Sam Sierra is next up/);
  assert.equal(I.claims[0].id, '5002');
});

test('a headline can open the role before the injury tag catches up', () => {
  const { I } = scan((s) => (s.players['1003'].hist = hist([[15], [16], [14]])), [headline('1003', 'Cy Cook placed on injured reserve with ankle sprain')]);
  const r = row(I, '5002');
  assert.equal(r.verdict, 'claim');
  assert.match(r.reasons[0].text, /reported IR .*ESPN, 6h ago/);
});

test('a one-week Out is a short-term opening, not a priority claim', () => {
  const { I } = scan((s) => {
    s.players['1003'].inj = 'Out';
    s.players['1003'].hist = hist([[15], [16], [14]]);
  });
  const r = row(I, '5002');
  assert.equal(r.takeover, false);
  assert.notEqual(r.verdict, 'claim');
  assert.ok(r.risks.some((x) => /Short-term opening/.test(x.text)));
});

test('a rumoured teammate injury is a watch, never a claim', () => {
  const { I } = scan((s) => (s.players['1003'].hist = hist([[15], [16], [14]])), [headline('1003', 'Cy Cook reportedly could be headed to IR, per sources')]);
  const r = row(I, '5002');
  assert.equal(r.takeover, false);
  assert.equal(r.verdict, 'watch');
  assert.match(r.trigger, /practice report/);
});

test('bad news on the candidate himself overrides good stats: the tier-1 riser becomes avoid', () => {
  const base = scan();
  assert.equal(row(base.I, '5001').verdict, 'claim', 'Ray Romeo is the stats-only Tier 1 riser');
  const { I } = scan(null, [headline('5001', 'Ray Romeo ruled out for Sunday with hamstring injury')]);
  const r = row(I, '5001');
  assert.equal(r.verdict, 'avoid');
  assert.ok(r.risks.some((x) => x.kind === 'injury' && /Reported Out/.test(x.text)));
  assert.ok(!I.claims.some((x) => x.id === '5001'));
});

test('role news lifts a player and a rumour-only story is flagged unconfirmed', () => {
  const plain = scan();
  const up = scan(null, [headline('5003', 'Tom Tango named the starter, expected to see expanded role')]);
  assert.ok(row(up.I, '5003').score > row(plain.I, '5003').score);
  assert.ok(row(up.I, '5003').reasons.some((x) => x.kind === 'role'));
  const rumour = scan(null, [headline('5003', 'Tom Tango linked to trade talks, per a source', 6, 'Some Blog')]);
  const r = row(rumour.I, '5003');
  assert.ok(r.risks.some((x) => x.kind === 'speculative'));
  assert.ok(r.reasons.some((x) => x.kind === 'trade' && /unconfirmed/.test(x.text)));
  assert.equal(r.confidence, 'low');
});

test('board is ordered by verdict then score and every board row names a drop', () => {
  const { I } = scan((s) => {
    s.players['1003'].inj = 'IR';
    s.players['1003'].hist = hist([[15], [16], [14]]);
  });
  const rank = { claim: 0, 'claim-if-need': 1, watch: 2, 'free-agency': 3, pass: 4, avoid: 5 };
  for (let i = 1; i < I.board.length; i++) {
    const a = I.board[i - 1], b = I.board[i];
    assert.ok(rank[a.verdict] < rank[b.verdict] || (a.verdict === b.verdict && (a.takeover > b.takeover || (a.takeover === b.takeover && a.score >= b.score))));
  }
  for (const r of I.board) assert.ok(r.drop && r.drop.text);
  assert.ok(I.board.every((r) => r.p.pos !== 'K' && r.p.pos !== 'DEF'), 'K/DEF stay in the stream tables');
});

test('the decision brief claims what the scanner claims and quotes its reason', () => {
  const s = league((x) => {
    x.players['1003'].inj = 'IR';
    x.players['1003'].hist = hist([[15], [16], [14]]);
  });
  s.articles = [];
  s.playerNews = { items: [], perPlayer: {} };
  const M = buildModel(s, 1, NOW);
  const d = buildDecisions(M, buildPlayerNews(M)).decisions.filter((x) => x.kind === 'waiver' && /^Claim/.test(x.title));
  assert.ok(d.some((x) => /Sam Sierra/.test(x.title) && x.because.some((b) => /next up/.test(b))));
});
