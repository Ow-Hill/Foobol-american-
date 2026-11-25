// "Lineup locks soon" alerts: Saturday/Christmas heads-ups and hurt starters near kickoff.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkAlerts, lockItems, kickoffSoon } = require('../lib/alerts');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rm-lock-')), 'state.json');
const SAT_KICK = Date.parse('2026-12-19T21:30:00Z'); // Saturday 4:30 PM in Toronto
const XMAS_KICK = Date.parse('2026-12-25T18:00:00Z'); // Friday, Christmas, 1:00 PM
const SUN_KICK = Date.parse('2026-12-20T18:00:00Z');

function snap({ kick = SAT_KICK, inj = null, off = null, notes = [] } = {}) {
  return {
    meta: { tz: 'America/Toronto', week: 15 },
    league: { name: 'Test League', rosterPositions: ['QB', 'RB', 'FLEX', 'BN', 'BN'] },
    teams: [
      { isMe: true, players: ['q', 'r', 'w', 'b1', 'b2'], starters: ['q', 'r', 'w'], reserve: [], taxi: [] },
      { players: ['z'], starters: ['z'], reserve: [] },
    ],
    players: {
      q: { n: 'Quinn Arm', pos: 'QB', team: 'AAA', proj: { pts: 20 } },
      r: { n: 'Rex Runner', pos: 'RB', team: 'AAA', proj: { pts: 14 }, inj, off: off ? { status: off } : null },
      w: { n: 'Wes Wide', pos: 'WR', team: 'CCC', proj: { pts: 12 } },
      b1: { n: 'Bo Bench', pos: 'RB', team: 'CCC', proj: { pts: 9 } },
      b2: { n: 'Cal Late', pos: 'RB', team: 'DDD', proj: { pts: 11 }, inj: 'Out' },
      z: { n: 'Rival Guy', pos: 'QB', team: 'AAA', proj: { pts: 20 } },
    },
    notes,
    schedule: {
      15: {
        games: [
          { home: { t: 'AAA' }, away: { t: 'BBB' }, date: new Date(kick).toISOString(), state: 'pre' },
          { home: { t: 'CCC' }, away: { t: 'DDD' }, date: new Date(SUN_KICK).toISOString(), state: 'pre' },
        ],
      },
    },
  };
}

test('lock alerts: a Saturday game gets one heads-up naming your starters in it', () => {
  const items = lockItems(snap(), {}, { now: SAT_KICK - 60 * 60000 });
  assert.equal(items.length, 1);
  assert.match(items[0].text, /^Saturday game: Quinn Arm, Rex Runner lock at Sat 4:30 PM/);
  assert.equal(items[0].urgent, false);
  // too early, and after kickoff: nothing
  assert.equal(lockItems(snap(), {}, { now: SAT_KICK - 3 * 3600000 }).length, 0);
  assert.equal(lockItems(snap(), {}, { now: SAT_KICK + 60000 }).length, 0);
});

test('lock alerts: Christmas is called Christmas, a normal Sunday gets no heads-up', () => {
  const x = lockItems(snap({ kick: XMAS_KICK }), {}, { now: XMAS_KICK - 30 * 60000 });
  assert.match(x[0].text, /^Christmas game/);
  assert.equal(lockItems(snap({ kick: SUN_KICK }), {}, { now: SUN_KICK - 30 * 60000 }).length, 0);
});

test('lock alerts: an Out starter is urgent and names a healthy bench player who still plays', () => {
  const items = lockItems(snap({ kick: SUN_KICK - 3600000, off: 'Out' }), {}, { now: SUN_KICK - 2 * 3600000 });
  const hurt = items.find((i) => i.urgent);
  assert.ok(hurt);
  // Bo Bench (healthy, later game) beats Cal Late (Out)
  assert.match(hurt.text, /Rex Runner \(RB, RB\) is Out and locks .*Swap in Bo Bench \(9\.0 proj/);
});

test('lock alerts: Questionable from ESPN counts and says to check inactives', () => {
  const items = lockItems(snap({ notes: [{ pid: 'r', status: 'Questionable' }] }), {}, { now: SAT_KICK - 60 * 60000 });
  const q = items.find((i) => /Questionable/.test(i.text));
  assert.ok(q && !q.urgent);
  assert.match(q.text, /Check inactives ~90 min before kickoff\. Backup: Bo Bench\./);
});

test('lock alerts: sent once, even during quiet hours', async () => {
  const file = tmp();
  const calls = [];
  const fakeFetch = async (url, init) => (calls.push(init), { ok: true, status: 200 });
  const cfg = { ntfy: 'http://ntfy.test/t', quietHours: [0, 23] };
  const now = SAT_KICK - 60 * 60000;
  const r1 = await checkAlerts(snap(), cfg, { now, file, fetch: fakeFetch });
  assert.equal(r1.sent, 1);
  assert.match(calls[0].headers.Title, /lineup locks soon/);
  const r2 = await checkAlerts(snap(), cfg, { now: now + 5 * 60000, file, fetch: fakeFetch });
  assert.equal(r2.skipped, 'quiet hours');
});

test('kickoffSoon: true near a kickoff or during games, false midweek', () => {
  assert.equal(kickoffSoon(snap(), SAT_KICK - 60 * 60000), true);
  assert.equal(kickoffSoon(snap(), SAT_KICK - 2 * 86400000), false);
  const s = snap();
  s.schedule[15].games[0].state = 'in';
  assert.equal(kickoffSoon(s, SAT_KICK + 3600000), true);
  assert.equal(kickoffSoon(null), true);
});
