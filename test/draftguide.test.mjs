// Live draft guide: draft order, values in the draft's own scoring, survival odds, roster needs,
// camp news nudges and the pick recommendation, on a synthetic 10-team draft.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  slotAt, ownerAt, currentPick, picksOf, buildDraftValues, survive, rosterFill, needWeight, recommend, campSignals, runs, ppgFor, grades, dynastyFactor,
} from '../public/js/draftguide.js';
import { board as fixture, players, projRows, SCORING } from './fixtures/draft.mjs';

const require = createRequire(import.meta.url);
const DL = require('../lib/draftlive.js');

const pick = (no, pid, b) => {
  const o = ownerAt(no, b.order, b.slotToRoster, []);
  return { no, round: o.round, slot: o.slot, rid: o.rid, pid, pos: b.pool[pid]?.pos };
};
// everyone takes the best ADP left, which is how most of a real draft goes
function adpDraft(b, upto, skip = () => false) {
  const left = Object.values(b.pool).sort((a, c) => a.adp - c.adp);
  const picks = [];
  for (let no = 1; no <= upto; no++) {
    const i = left.findIndex((p) => !skip(no, p));
    picks.push(pick(no, left.splice(i, 1)[0].id, b));
  }
  return picks;
}

test('snake, linear and third-round-reversal orders', () => {
  const snake = { type: 'snake', teams: 10, rounds: 15, reversal: 0 };
  assert.deepEqual([1, 10, 11, 20, 21].map((n) => slotAt(n, snake).slot), [1, 10, 10, 1, 1]);
  const lin = { type: 'linear', teams: 10, rounds: 15, reversal: 0 };
  assert.deepEqual([1, 10, 11, 20].map((n) => slotAt(n, lin).slot), [1, 10, 1, 10]);
  const rr = { type: 'snake', teams: 10, rounds: 15, reversal: 3 };
  // rounds 1 → , 2 ←, 3 ← (reversal), 4 →
  assert.deepEqual([1, 11, 21, 31].map((n) => slotAt(n, rr).slot), [1, 10, 10, 1]);
});

test('traded picks change who owns a pick, and my pick list follows', () => {
  const order = { type: 'snake', teams: 10, rounds: 3, reversal: 0 };
  const s2r = { 1: 11, 2: 12, 3: 13, 4: 14, 5: 15, 6: 16, 7: 17, 8: 18, 9: 19, 10: 20 };
  const traded = [{ round: 2, rid: 11, owner: 15 }];
  assert.equal(ownerAt(20, order, s2r, traded).rid, 15); // round 2, slot 1 belonged to roster 11
  assert.deepEqual(picksOf(15, order, s2r, traded), [5, 16, 20, 25]);
  assert.deepEqual(picksOf(11, order, s2r, traded), [1, 21]);
});

test('current pick skips numbers already used by keepers', () => {
  const order = { type: 'snake', teams: 4, rounds: 3, reversal: 0 };
  assert.equal(currentPick([{ no: 1 }, { no: 2 }, { no: 7 }], order), 3);
  assert.equal(currentPick(Array.from({ length: 12 }, (_, i) => ({ no: i + 1 })), order), null);
});

test('values: 0-100, best player 100, replacement from the draft slots', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  assert.equal(V.rows[0].value, 100);
  for (const r of V.rows) assert.ok(r.value >= 0 && r.value <= 100);
  // 10 teams x 1 QB: the 11th QB is replacement, so QB11 and below are worth 0
  assert.equal(V.by.QB11.value, 0);
  assert.ok(V.by.QB1.value > 0);
  // the first ten picks by value hold no kicker or defense
  assert.ok(V.rows.slice(0, 10).every((r) => r.pos !== 'K' && r.pos !== 'DEF'));
});

test('superflex makes quarterbacks worth more', () => {
  const one = buildDraftValues(fixture());
  const sf = buildDraftValues(fixture({ slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN'] }));
  assert.ok(sf.by.QB5.value > one.by.QB5.value, `${sf.by.QB5.value} vs ${one.by.QB5.value}`);
});

test('survival: near 1 for a player far down the board, small for one past his ADP soon', () => {
  assert.ok(survive(60, 10, 20) > 0.95);
  assert.ok(survive(15, 10, 20) < 0.3);
  assert.equal(survive(15, 10, 10), 1);
  // a player already past his ADP is still more likely gone soon than not
  assert.ok(survive(5, 20, 30) < 0.5);
});

test('roster fill: dedicated spots, then flex, then bench', () => {
  const V = buildDraftValues(fixture());
  const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN'];
  const f = rosterFill(slots, ['RB1', 'RB2', 'RB3', 'RB4'], V);
  assert.deepEqual(f.filled.map((x) => x.slot).sort(), ['FLEX', 'RB', 'RB']);
  assert.deepEqual(f.bench, ['RB4']);
  assert.equal(needWeight('RB', f), 0.6);
  assert.equal(needWeight('WR', f), 1);
  assert.equal(needWeight('K', f, { picksLeft: 8 }), 0.02);
  assert.equal(needWeight('K', f, { picksLeft: 2 }), 1);
});

test('recommendation on the clock at pick 1 is a top-valued player, never K or DEF', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  const rec = recommend(b, V, { picks: [], traded: [], slotToRoster: b.slotToRoster, status: 'drafting' }, 1);
  assert.equal(rec.now, 1);
  assert.ok(rec.onClock);
  assert.deepEqual(rec.myNext.slice(0, 3), [1, 20, 21]);
  assert.ok(rec.top[0].r.rank <= 3, `top pick rank ${rec.top[0].r.rank}`);
  assert.ok(rec.top.every((c) => c.r.pos !== 'K' && c.r.pos !== 'DEF'));
  assert.ok(rec.top[0].why.length >= 2);
});

test('after taking a QB, the guide stops pushing quarterbacks in a 1QB league', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  // slot 5: picks 5, 16, 25, 36...
  const picks = adpDraft(b, 15, (no, p) => (no === 5 ? p.pos !== 'QB' : false));
  assert.equal(picks[4].pos, 'QB');
  const rec = recommend(b, V, { picks, traded: [], slotToRoster: b.slotToRoster }, 5);
  assert.equal(rec.now, 16);
  assert.ok(rec.onClock);
  assert.notEqual(rec.top[0].r.pos, 'QB');
  assert.ok(rec.fill.filled.some((x) => x.slot === 'QB'));
});

test('kickers and defenses come in the last picks', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  // slot 1 owns picks 140 and 141 at the end of a 15-round, 10-team snake. Fill everyone's roster
  // by ADP but never give slot 1 a kicker or defense, then look at slot 1's last two picks.
  const picks = adpDraft(b, 139, (no, p) => ownerAt(no, b.order, b.slotToRoster).rid === 1 && (p.pos === 'K' || p.pos === 'DEF'));
  const rec = recommend(b, V, { picks, traded: [], slotToRoster: b.slotToRoster }, 1);
  assert.equal(rec.now, 140);
  assert.equal(rec.picksLeft, 2);
  assert.ok(['K', 'DEF'].includes(rec.top[0].r.pos), `got ${rec.top[0].r.pos}`);
});

test('position run is flagged', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  const picks = ['RB1', 'RB2', 'RB3', 'RB4', 'RB5', 'WR1', 'WR2', 'QB1'].map((pid, i) => pick(i + 1, pid, b));
  assert.deepEqual(runs(picks, V).map((r) => r.pos), ['RB']);
});

test('camp news: role up raises, holdout and surgery lower, capped, stale counts half', () => {
  const now = Date.parse('2027-08-15T12:00:00Z');
  const d = (days) => now - days * 86400000;
  const up = campSignals([{ title: 'RB 7 running with the first team at Bills camp', time: d(1) }], { n: 'RB 7' }, now);
  assert.ok(up.net > 0);
  const hold = campSignals([{ title: 'WR 3 holdout continues as contract dispute drags on with Jets', time: d(2) }], { n: 'WR 3' }, now);
  assert.ok(hold.net < 0);
  const hurt = campSignals([{ title: 'TE 2 to undergo knee surgery, Chiefs say', time: d(1) }], { n: 'TE 2' }, now);
  assert.ok(hurt.net <= -0.08 + 1e-9);
  const stale = campSignals([{ title: 'TE 2 to undergo knee surgery, Chiefs say', time: d(12) }], { n: 'TE 2' }, now);
  assert.ok(stale.net > hurt.net);
  const many = campSignals(Array.from({ length: 9 }, (_, i) => ({ title: `TE 2 to undergo surgery after tear ${i}`, time: d(1) })), { n: 'TE 2' }, now);
  assert.ok(many.net >= -0.15 - 1e-9);
  assert.equal(many.signals.length, 2); // one story told many times counts at most twice
  assert.equal(campSignals([{ title: 'TE 2 scores twice in Chiefs win', time: d(1) }], { n: 'TE 2' }, now).signals.length, 0);
});

test('camp news moves the value', () => {
  const b = fixture();
  const now = Date.parse('2027-08-15T12:00:00Z');
  const base = buildDraftValues(b, {}, now);
  const hurt = buildDraftValues(b, { RB3: [{ title: 'RB 3 to undergo surgery on torn hamstring, Bills say', time: now - 3600e3 }] }, now);
  assert.ok(hurt.by.RB3.value < base.by.RB3.value);
});

test('points per game: projection blended with last season usage; new team leans on projection', () => {
  const p = { pos: 'WR', team: 'AAA', proj: { pts: 170, gp: 17 }, last: { gp: 16, team: 'AAA', line: { pts: 14, tgt: 9, air: 70, rzTgt: 1, att: 0 } } };
  const a = ppgFor(p);
  assert.ok(a.ppg > 10 && a.ppg < 14, String(a.ppg));
  assert.equal(a.parts.length, 3);
  const moved = ppgFor({ ...p, team: 'BBB' });
  assert.ok(moved.moved);
  assert.ok(Math.abs(moved.ppg - 10) < Math.abs(a.ppg - 10));
  // rookie: projection only
  assert.equal(ppgFor({ pos: 'RB', proj: { pts: 170, gp: 17 } }).ppg, 10);
});

test('dynasty factor favours youth', () => {
  assert.ok(dynastyFactor('RB', 22) > 1);
  assert.ok(dynastyFactor('RB', 29) < 0.9);
});

test('auction drafts get dollar values that spend the league budget', () => {
  const b = fixture({ type: 'auction' });
  const V = buildDraftValues(b);
  assert.ok(V.rows[0].dollars > 40, String(V.rows[0].dollars));
  const spots = b.slots.length * b.order.teams;
  const spent = V.rows.slice(0, spots).reduce((s, r) => s + r.dollars, 0);
  assert.ok(Math.abs(spent - 200 * b.order.teams) / (200 * b.order.teams) < 0.05, String(spent));
});

test('grades add up value drafted per team', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  const picks = adpDraft(b, 20);
  const g = grades(b, V, { picks });
  assert.equal(g.length, 10);
  assert.ok(g[0].value >= g[9].value);
});

// ---------- server side: pool in the draft's own scoring ----------
test('buildPool scores projections with league scoring and picks the right ADP column', () => {
  const pl = players();
  const rows = projRows(pl);
  const draft = { metadata: { scoring_type: 'ppr' }, settings: { teams: 10 } };
  const league = { scoring_settings: SCORING, roster_positions: ['QB', 'RB', 'WR', 'BN'] };
  const pool = DL.buildPool({ draft, league, players: pl, projRows: rows, statRows: [] });
  assert.equal(Math.round(pool.QB1.proj.pts), 380);
  assert.equal(pool.QB1.adpKey, 'adp_ppr');
  assert.deepEqual(DL.rosterSlots(draft, league), ['QB', 'RB', 'WR', 'BN']);
});

test('buildPool turns last season totals into a per-game line with team shares', () => {
  const pl = { 9: { id: '9', n: 'Test Wr', pos: 'WR', team: 'AAA' }, 8: { id: '8', n: 'Other Wr', pos: 'WR', team: 'AAA' } };
  const statRows = [
    { player_id: '9', team: 'AAA', stats: { gp: 16, rec_tgt: 160, rec: 100, rec_yd: 1200, rec_td: 8, rec_air_yd: 900, rec_rz_tgt: 20, off_snp: 900, tm_off_snp: 1000 } },
    { player_id: '8', team: 'AAA', stats: { gp: 16, rec_tgt: 240, rec_air_yd: 600 } },
  ];
  const pool = DL.buildPool({ draft: { metadata: { scoring_type: 'half_ppr' } }, league: null, players: pl, projRows: [], statRows });
  const l = pool['9'].last.line;
  assert.equal(pool['9'].last.gp, 16);
  assert.equal(l.tgt, 10);
  assert.equal(l.tgtSh, 0.4);
  assert.equal(l.snp, 90);
  // half PPR default scoring: 100*0.5 + 1200*0.1 + 8*6 = 218 → 13.63 per game
  assert.equal(l.pts, 13.63);
});

test('mock drafts: slots from draft settings, scoring from scoring_type, superflex ADP', () => {
  const draft = { metadata: { scoring_type: '2qb' }, settings: { slots_qb: 1, slots_rb: 2, slots_wr: 2, slots_te: 1, slots_flex: 1, slots_super_flex: 1, slots_bn: 5 } };
  assert.equal(DL.rosterSlots(draft, null).length, 13);
  assert.ok(DL.isSuperflex(draft, null));
  assert.equal(DL.adpKeys(draft, null)[0], 'adp_2qb');
  assert.equal(DL.scoringFor({ metadata: { scoring_type: 'std' } }, null).rec, 0);
});

// ---------- practice drafts, next season's league ----------
import { botPick, practicePick, rng } from '../public/js/draftguide.js';

test('practice: bots fill a sensible roster, kickers and defenses last, one each', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  const rand = rng(7);
  const picks = [];
  while (picks.length < b.order.teams * b.order.rounds) {
    const no = currentPick(picks, b.order);
    const rid = ownerAt(no, b.order, b.slotToRoster).rid;
    picks.push(practicePick(b, V, picks, botPick(b, V, picks, rid, rand)));
  }
  assert.equal(new Set(picks.map((p) => p.pid)).size, picks.length);
  for (let rid = 1; rid <= 10; rid++) {
    const mine = picks.filter((p) => p.rid === rid);
    const c = (pos) => mine.filter((p) => p.pos === pos).length;
    assert.equal(c('K'), 1, `team ${rid} kickers`);
    assert.equal(c('DEF'), 1, `team ${rid} defenses`);
    assert.ok(c('QB') >= 1 && c('QB') <= 2, `team ${rid} QBs ${c('QB')}`);
    assert.ok(c('TE') >= 1 && c('TE') <= 2);
    assert.ok(mine.slice(0, 10).every((p) => p.pos !== 'K' && p.pos !== 'DEF'), `team ${rid} took K/DEF early`);
  }
  // early picks follow ADP closely
  const first10 = picks.slice(0, 10).map((p) => V.by[p.pid].adp);
  assert.ok(Math.max(...first10) <= 20, String(first10));
});

test('practice: the same seed gives the same draft', () => {
  const b = fixture();
  const V = buildDraftValues(b);
  const run = (seed) => {
    const rand = rng(seed);
    const picks = [];
    for (let i = 0; i < 30; i++) {
      const rid = ownerAt(currentPick(picks, b.order), b.order, b.slotToRoster).rid;
      picks.push(practicePick(b, V, picks, botPick(b, V, picks, rid, rand)));
    }
    return picks.map((p) => p.pid).join();
  };
  assert.equal(run(3), run(3));
});

test("next season's league is found through previous_league_id", () => {
  const leagues = [
    { league_id: 'L27', previous_league_id: 'L26' },
    { league_id: 'X27', previous_league_id: 'X26' },
    { league_id: 'L28', previous_league_id: 'L27' },
  ];
  assert.deepEqual(DL.renewedFrom(leagues, 'L26').map((l) => l.league_id), ['L27', 'L28']);
});

test('practice draft settings: format from the id, bench fills the rounds', async () => {
  const d = await DL.practiceDraft('practice-12-16-2qb').catch((e) => e);
  // /state/nfl is unreachable in tests, so the season falls back to the clock; the rest is fixed
  assert.equal(d.settings.teams, 12);
  assert.equal(d.settings.slots_super_flex, 1);
  assert.equal(DL.rosterSlots(d, null).length, 16);
  assert.equal(DL.adpKeys(d, null)[0], 'adp_2qb');
});
