// Alerts and ripple calibration. Run with: npm test
// Both write to a throwaway temp directory, never the live data/ cache.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkAlerts, pending, inQuiet } = require('../lib/alerts');
const { calibrate, score } = require('../lib/calibration');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rm-test-')), 'state.json');
const NOW = Date.parse('2026-11-12T18:00:00Z'); // Thursday 13:00 ET

function snap(changes) {
  return {
    meta: { tz: 'America/Toronto' },
    league: { name: 'Test League' },
    teams: [{ isMe: true, players: ['a', 'b', 'c'], starters: ['a', 'b'], reserve: ['c'] }, { players: ['z'], starters: ['z'], reserve: [] }],
    players: { a: { n: 'Alpha Back', pos: 'RB' }, b: { n: 'Beta Wideout', pos: 'WR' }, c: { n: 'Gamma End', pos: 'TE' }, z: { n: 'Rival Guy', pos: 'QB' } },
    changes,
  };
}

test('alerts: starter getting worse is urgent, rivals and stale changes are ignored', () => {
  const s = snap({
    a: [{ at: NOW - 3600e3, field: 'inj', from: 'Questionable', to: 'Out' }],
    b: [{ at: NOW - 20 * 3600e3, field: 'inj', from: null, to: 'Questionable' }], // older than 12h
    c: [{ at: NOW - 600e3, field: 'inj', from: 'IR', to: null }],
    z: [{ at: NOW - 600e3, field: 'inj', from: null, to: 'Out' }],
  });
  const items = pending(s, {}, { now: NOW });
  assert.equal(items.length, 2);
  assert.equal(items[0].urgent, true);
  assert.match(items[0].text, /Alpha Back \(RB, starter\): Sleeper status Questionable → Out/);
  assert.match(items[1].text, /Gamma End \(TE, IR\): Sleeper status IR → no tag/);
  assert.equal(pending(s, {}, { now: NOW, scope: 'starters' }).length, 1);
});

test('alerts: sent once, batched, never on a stale snapshot or in quiet hours', async () => {
  const file = tmp();
  const calls = [];
  const fakeFetch = async (url, init) => (calls.push({ url, init }), { ok: true, status: 200 });
  const s = snap({ a: [{ at: NOW - 3600e3, field: 'inj', from: 'Questionable', to: 'Out' }], b: [{ at: NOW - 60e3, field: 'depth', from: 1, to: 2 }] });
  const cfg = { webhook: 'http://hook.test/x', format: 'discord' };
  const r1 = await checkAlerts(s, cfg, { now: NOW, file, fetch: fakeFetch });
  assert.equal(r1.sent, 2);
  assert.equal(calls.length, 1, 'one batched message');
  assert.match(JSON.parse(calls[0].init.body).content, /2 roster updates[\s\S]*Questionable → Out[\s\S]*depth chart #1 → #2/);
  const r2 = await checkAlerts(s, cfg, { now: NOW + 60e3, file, fetch: fakeFetch });
  assert.equal(r2.sent, 0, 'de-duplicated');
  assert.equal((await checkAlerts({ ...s, meta: { staleSince: 1 } }, cfg, { now: NOW, file: tmp(), fetch: fakeFetch })).skipped, 'stale snapshot');
  assert.equal(await checkAlerts(s, {}, { now: NOW }).then((r) => r.skipped), 'not configured');
});

test('alerts: a failed send is retried next build', async () => {
  const file = tmp();
  const s = snap({ a: [{ at: NOW - 60e3, field: 'inj', from: null, to: 'Out' }] });
  const bad = await checkAlerts(s, { ntfy: 'http://ntfy.test/t' }, { now: NOW, file, fetch: async () => ({ ok: false, status: 500 }) });
  assert.equal(bad.sent, 0);
  let headers = null;
  const ok = await checkAlerts(s, { ntfy: 'http://ntfy.test/t' }, { now: NOW, file, fetch: async (u, init) => ((headers = init.headers), { ok: true }) });
  assert.equal(ok.sent, 1);
  assert.equal(headers.Priority, '4');
});

test('quiet hours wrap midnight in the league time zone', () => {
  assert.equal(inQuiet(Date.parse('2026-11-12T04:00:00Z'), 'America/Toronto', [23, 7]), true); // 23:00 ET
  assert.equal(inQuiet(Date.parse('2026-11-12T18:00:00Z'), 'America/Toronto', [23, 7]), false); // 13:00 ET
});

test('calibration scoring: right direction is a hit, small moves are flat', () => {
  const hist = [1, 2, 3].map((w) => ({ w, tgt: 5, att: 0, pts: 10 })).concat([{ w: 4, tgt: 9, att: 0, pts: 18 }]);
  assert.deepEqual(score({ dir: 'up', tgt: 3, att: 0 }, { hist }, 4), { metric: 'tgt', est: 3, actual: 4, result: 'hit', err: 1 });
  assert.equal(score({ dir: 'down', pct: -0.2 }, { hist }, 4).result, 'miss');
  const flat = [1, 2, 3].map((w) => ({ w, tgt: 5, att: 0, pts: 10 })).concat([{ w: 4, tgt: 5.3, att: 0, pts: 10 }]);
  assert.equal(score({ dir: 'up', tgt: 2 }, { hist: flat }, 4).result, 'flat');
  assert.equal(score({ dir: 'up', tgt: 2 }, { hist }, 5), null, 'did not play');
});

test('calibration: records this week, scores it after the games', async () => {
  const file = tmp();
  const H = (n, tgt) => Array.from({ length: n }, (_, i) => ({ w: i + 1, tgt, att: 0, pts: tgt * 1.5 }));
  const players = {
    wr1: { id: 'wr1', n: 'Top', pos: 'WR', team: 'BUF', depth: 1, inj: 'Out', hist: H(5, 9) },
    wr2: { id: 'wr2', n: 'Second', pos: 'WR', team: 'BUF', depth: 1, dpos: 'RWR', hist: H(5, 6) },
    te1: { id: 'te1', n: 'End', pos: 'TE', team: 'BUF', depth: 1, hist: H(5, 4) },
  };
  const wk6 = await calibrate(players, 6, { file, now: NOW });
  assert.equal(wk6.total, 0, 'nothing scored before the games');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Object.keys(stored['6']).length >= 2);
  // Week 6 is played: wr1 sat, wr2 saw 10 targets, te1 saw 3.
  players.wr2.hist.push({ w: 6, tgt: 10, att: 0, pts: 15 });
  players.te1.hist.push({ w: 6, tgt: 3, att: 0, pts: 4 });
  const wk7 = await calibrate(players, 7, { file, now: NOW + 7 * 86400e3 });
  const byPid = Object.fromEntries(wk7.rows.map((r) => [r.pid, r]));
  assert.equal(byPid.wr2.result, 'hit');
  assert.equal(byPid.te1.result, 'miss');
  assert.equal(wk7.byKind.out.n, 2);
  assert.equal(wk7.hitRate, 0.5);
});
