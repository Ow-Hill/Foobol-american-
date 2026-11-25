// A small, fully deterministic league snapshot shaped like lib/snapshot.js output.
// Week 10, Monday noon in Toronto. Owen is roster 1, facing roster 2.
// Each test clones it with league() and changes only what it needs.

export const NOW = Date.parse('2026-11-23T17:00:00Z'); // Mon 12:00 ET
const DAY = 86400000;

const pl = (id, n, pos, team, proj, extra = {}) => ({
  id, n, pos, team, inj: null, proj: { pts: proj }, next: { pts: proj }, hist: [], own: null, depth: null, exp: 4, ...extra,
});

function base() {
  const players = {};
  const add = (p, own) => (players[p.id] = { ...p, own });

  // Roster 1 (me): optimal lineup is the current lineup.
  add(pl('1001', 'Al Alpha', 'QB', 'AAA', 20), 1);
  add(pl('1002', 'Bo Bravo', 'QB', 'BBB', 16), 1);
  add(pl('1003', 'Cy Cook', 'RB', 'AAA', 15, { depth: 1 }), 1);
  add(pl('1004', 'Di Dash', 'RB', 'CCC', 9), 1);
  add(pl('1005', 'Ed Echo', 'WR', 'BBB', 14), 1);
  add(pl('1006', 'Fy Fox', 'WR', 'CCC', 8), 1);
  add(pl('1007', 'Gus Golf', 'TE', 'AAA', 7), 1);
  add(pl('1008', 'Hal Hotel', 'RB', 'DDD', 0, { inj: 'IR' }), 1);

  // Roster 2 (opponent)
  add(pl('2001', 'Ian India', 'QB', 'EEE', 18), 2);
  add(pl('2002', 'Jo Juliet', 'RB', 'EEE', 12), 2);
  add(pl('2003', 'Kai Kilo', 'WR', 'DDD', 11), 2);
  add(pl('2004', 'Lu Lima', 'TE', 'DDD', 6), 2);
  add(pl('2005', 'Max Mike', 'WR', 'EEE', 10), 2);
  add(pl('2006', 'Ned Nov', 'QB', 'FFF', 14), 2);
  add(pl('2007', 'Oz Oscar', 'RB', 'DDD', 5), 2);

  add(pl('3001', 'Pat Papa', 'QB', 'FFF', 15), 3);
  add(pl('4001', 'Quin Quebec', 'QB', 'GGG', 15), 4);

  // Free agents
  add(pl('5001', 'Ray Romeo', 'WR', 'FFF', 12, { hist: [3, 4, 5, 12, 13, 14].map((pts) => ({ pts })) }), null);
  add(pl('5002', 'Sam Sierra', 'RB', 'AAA', 4, { depth: 2 }), null); // Cook's handcuff
  add(pl('5003', 'Tom Tango', 'WR', 'EEE', 5, { hist: [8, 8, 8].map((pts) => ({ pts })) }), null);

  const team = (id, owner, players, starters, reserve = []) => ({
    id, owner, name: owner, w: 5, l: 4, t: 0, pf: 900, pa: 900, wp: id, players, starters, reserve, taxi: [],
  });
  const zeros = ['0', '0', '0', '0', '0'];

  const game = (home, away, date, state = 'pre') => ({ home: { t: home }, away: { t: away }, date, state, completed: false });

  return {
    meta: { week: 10, season: '2026', tz: 'America/Toronto' },
    league: {
      rosterPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN', 'BN', 'BN', 'BN'],
      settings: {
        trade_deadline: 11, waiver_type: 0, waiver_clear_days: 2, waiver_day_of_week: 2,
        reserve_slots: 2, taxi_slots: 0, playoff_teams: 4, playoff_week_start: 15, draft_rounds: 3,
        reserve_allow_out: 1, reserve_allow_doubtful: 1, reserve_allow_sus: 1,
        reserve_allow_na: 1, reserve_allow_dnr: 1, reserve_allow_cov: 1,
      },
    },
    teams: [
      team(1, 'owen', ['1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008'], ['1001', '1003', '1005', '1007', '1004', '1002'], ['1008']),
      team(2, 'rival', ['2001', '2002', '2003', '2004', '2005', '2006', '2007'], ['2001', '2002', '2003', '2004', '2005', '2006']),
      team(3, 'third', ['3001'], ['3001', ...zeros]),
      team(4, 'fourth', ['4001'], ['4001', ...zeros]),
    ],
    players,
    schedule: {
      10: {
        byes: ['GGG', 'HHH'],
        games: [
          game('AAA', 'BBB', '2026-11-29T18:00:00Z'),
          game('CCC', 'DDD', '2026-11-29T21:25:00Z'),
          game('EEE', 'FFF', '2026-11-30T01:20:00Z'),
        ],
      },
      11: {
        byes: ['FFF'],
        games: [
          game('AAA', 'CCC', '2026-12-04T01:15:00Z'), // Thursday night: earliest kickoff = deadline
          game('BBB', 'DDD', '2026-12-06T18:00:00Z'),
          game('EEE', 'GGG', '2026-12-06T21:25:00Z'),
        ],
      },
    },
    matchups: {
      10: [
        { rid: 1, mid: 1, pts: 0 },
        { rid: 2, mid: 1, pts: 0 },
        { rid: 3, mid: 2, pts: 0 },
        { rid: 4, mid: 2, pts: 0 },
      ],
    },
    transactions: [],
    picks: [],
    notes: [],
  };
}

export const league = (mutate) => {
  const s = base();
  if (mutate) mutate(s);
  return s;
};
export const DAY_MS = DAY;
