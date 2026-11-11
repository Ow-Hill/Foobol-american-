// Search-contract tests. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  headlineHit,
  nameTokens,
  parseRss,
  cleanTitle,
  queryFor,
  attachStories,
  relevant,
} = require('../lib/playernews');

test('name tokens normalise apostrophes, hyphens and suffixes', () => {
  assert.deepEqual(nameTokens("Ja'Marr Chase"), { first: 'jamarr', last: 'chase', all: ['jamarr', 'chase'] });
  assert.deepEqual(nameTokens("De'Von Achane"), { first: 'devon', last: 'achane', all: ['devon', 'achane'] });
  assert.deepEqual(nameTokens('Amon-Ra St. Brown'), { first: 'amon', last: 'brown', all: ['amon', 'ra', 'st', 'brown'] });
  assert.deepEqual(nameTokens('Marvin Harrison Jr.'), { first: 'marvin', last: 'harrison', all: ['marvin', 'harrison'] });
});

test('headline matching handles apostrophes, initials and middle names', () => {
  assert.equal(headlineHit("Ja'Marr Chase", "Ja'Marr Chase explodes for 120 yards"), true);
  assert.equal(headlineHit("De'Von Achane", "De'Von Achane expected to play"), true);
  assert.equal(headlineHit('A.J. Brown', 'AJ Brown wants out of New England'), true);
  assert.equal(headlineHit('A.J. Brown', 'A. Brown wants out of New England'), true);
  assert.equal(headlineHit('T.J. Hockenson', 'T.J. Hockenson limited in practice'), true);
  assert.equal(headlineHit('Amon-Ra St. Brown', 'Amon-Ra St. Brown practices in full'), true);
  assert.equal(headlineHit('Marvin Harrison Jr.', 'Marvin Harrison Jr. scores twice'), true);
});

test('surname-only headlines do not match a different first name', () => {
  assert.equal(headlineHit('James Cook', 'Dalvin Cook signs with the Bills'), false);
  assert.equal(headlineHit('James Cook', 'Cook signs with the Bills'), false);
});

test('team defenses match nickname and abbreviation forms', () => {
  assert.equal(headlineHit('Chicago Bears', 'Bears defense dominates', { pos: 'DEF', team: 'CHI' }), true);
  assert.equal(headlineHit('Chicago Bears', 'CHI D/ST forces turnovers', { pos: 'DEF', team: 'CHI' }), true);
  assert.equal(headlineHit('Chicago Bears', 'Chicago Bears offense struggles', { pos: 'DEF', team: 'CHI' }), false);
});

test('non-football lifestyle headlines are rejected', () => {
  const p = { n: 'Tyreek Hill', team: 'MIA' };
  assert.equal(relevant('Tyreek Hill paid $6.9 million for his mansion', p), false);
  assert.equal(relevant('Tyreek Hill trade update: Dolphins listening', p), true);
  assert.equal(relevant('Dolphins expect Tyreek Hill back at practice', p), true);
});

test('query is exact-name and seven days', () => {
  const url = queryFor({ n: 'Ja\'Marr Chase' });
  assert.match(decodeURIComponent(url), /"Ja'Marr Chase" NFL when:7d/);
});

test('RSS parser keeps publisher domain and cleans the outlet suffix', () => {
  const xml = `<rss><channel><item>
    <title>Chase erupts again - Yahoo Sports</title>
    <link>https://news.google.com/rss/articles/abc</link>
    <pubDate>Sun, 08 Nov 2026 12:00:00 GMT</pubDate>
    <source url="https://sports.yahoo.com">Yahoo Sports</source>
  </item></channel></rss>`;
  const [item] = parseRss(xml);
  assert.equal(item.title, 'Chase erupts again');
  assert.equal(item.src, 'Yahoo Sports');
  assert.equal(item.domain, 'sports.yahoo.com');
});

test('title cleaning keeps a legitimate subtitle', () => {
  assert.equal(cleanTitle('Chase erupts again - report', 'Yahoo Sports'), 'Chase erupts again - report');
  assert.equal(cleanTitle('Chase erupts again - Yahoo Sports', 'Yahoo Sports'), 'Chase erupts again');
});

test('the same story gets one storyId across players', () => {
  const items = [
    { pid: '1', time: 1000, title: 'Patriots acquire A.J. Brown in blockbuster trade' },
    { pid: '2', time: 1100, title: 'Patriots acquire A.J. Brown in blockbuster trade' },
  ];
  attachStories(items);
  assert.equal(items[0].storyId, items[1].storyId);
  assert.deepEqual(items[0].alsoPids, ['2']);
});

test('different players with similar injury wording are not merged', () => {
  const items = [
    { pid: '1', time: 1000, title: 'Michael Wilson out for the season with a neck injury' },
    { pid: '2', time: 1100, title: 'Michael Wilson no designation for Week 9' },
  ];
  attachStories(items);
  assert.notEqual(items[0].storyId, items[1].storyId);
});

test('same-name collisions are rejected, stories about the player are kept', () => {
  const qb = { n: 'Josh Allen', pos: 'QB', team: 'BUF' };
  assert.equal(relevant("Jaguars' Josh Allen records two sacks", qb), false);
  assert.equal(relevant('Edge rusher Josh Allen fined for hit', qb), false);
  assert.equal(relevant('Bills QB Josh Allen limited in practice', qb), true);
  assert.equal(relevant('Josh Allen throws 3 TDs vs Dolphins', qb), true);
  const wr = { n: 'Tyreek Hill', pos: 'WR', team: 'MIA' };
  assert.equal(relevant('Chiefs reunite with Tyreek Hill? Fantasy outlook', wr), true);
});

test('generic words alone no longer pass the NFL filter', () => {
  const qb = { n: 'Josh Allen', pos: 'QB', team: 'BUF' };
  assert.equal(relevant('Josh Allen and Hailee Steinfeld out at the Grammys', qb), false);
  assert.equal(relevant('Josh Allen returns after the bye', qb), true);
});
