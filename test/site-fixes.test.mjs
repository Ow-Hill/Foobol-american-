// Small fixes from the "keep improving the site" pass (2026-11-25): pick lists, the post-deadline
// Season page and the starter-takeover cap. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../public/js/model.js';
import { league, NOW } from './fixtures/league.mjs';

const model = (mutate) => buildModel(league(mutate), 1, NOW);

test('a traded 2028 pick no longer hides next year\'s own picks', () => {
  const M = model((s) => (s.picks = [{ season: '2028', round: 2, roster_id: 1, owner_id: 3 }]));
  const p = M.picksOwned(1);
  assert.deepEqual(p.own.filter((x) => x.season === 2027).map((x) => x.round), [1, 2, 3]);
  assert.deepEqual(p.own.filter((x) => x.season === 2028).map((x) => x.round), [1, 3]);
  assert.deepEqual(p.sold, [{ season: 2028, round: 2, to: 3 }]);
});

test('with no traded picks, next season\'s picks are listed', () => {
  const p = model((s) => (s.picks = [])).picksOwned(1);
  assert.deepEqual(p.own.map((x) => `${x.season}-${x.round}`), ['2027-1', '2027-2', '2027-3']);
});

test('after the trade deadline the Season page talks about the playoff push, not the deadline', async () => {
  const { render } = await import('../public/js/views/season.js');
  const M = model((s) => (s.meta.playoffWeeks = [15, 16, 17]));
  M.deadlinePassed = true;
  const html = render(M, { ui: {} });
  assert.match(html, /Playoff push \(through Week 14\)/);
  assert.doesNotMatch(html, /before the Week \d+ deadline/);
  assert.doesNotMatch(html, /Trade ideas/);
  M.deadlinePassed = false;
  assert.match(render(M, { ui: {} }), /Trade-deadline push/);
});
