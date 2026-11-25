// Synthetic Sleeper draft for the live draft guide tests: 10 teams, 15 rounds, 1QB PPR-style slots.
// Players are made up ("QB 1", "RB 7"...): projections fall with rank, ADP follows the projection.
export const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
const COUNTS = { QB: 32, RB: 70, WR: 80, TE: 30, K: 20, DEF: 20 };
// season points for the best player at each position and how fast it falls
const TOP = { QB: 380, RB: 330, WR: 320, TE: 230, K: 150, DEF: 140 };
const FALL = { QB: 0.03, RB: 0.035, WR: 0.03, TE: 0.06, K: 0.01, DEF: 0.01 };

export function players() {
  const out = {};
  const teams = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH'];
  for (const [pos, n] of Object.entries(COUNTS)) {
    for (let i = 1; i <= n; i++) {
      const id = `${pos}${i}`;
      out[id] = { id, n: `${pos} ${i}`, pos, team: teams[i % teams.length], age: 26, exp: 4, inj: null, depth: i <= 2 ? 1 : 2, rank: i * 5 };
    }
  }
  return out;
}

export function projRows(pl = players()) {
  const rows = [];
  for (const p of Object.values(pl)) {
    const i = Number(p.id.replace(/\D/g, ''));
    const pts = TOP[p.pos] * Math.exp(-FALL[p.pos] * (i - 1));
    rows.push({ player_id: p.id, team: p.team, stats: { pts_ppr: pts, gp: 17, _pts: pts } });
  }
  // ADP: overall order of projected points above a rough replacement, like a real market
  const repl = { QB: 250, RB: 140, WR: 150, TE: 110, K: 130, DEF: 125 };
  const order = rows.slice().sort((a, b) => b.stats._pts - repl[pl[b.player_id].pos] - (a.stats._pts - repl[pl[a.player_id].pos]));
  order.forEach((r, k) => {
    const pos = pl[r.player_id].pos;
    // kickers and defenses go late in every real draft
    r.stats.adp_ppr = pos === 'K' || pos === 'DEF' ? 130 + k / 4 : k + 1;
  });
  return rows;
}

// The test scorer: the fixture carries points in `_pts`.
export const SCORING = { _pts: 1 };

export function board({ teams = 10, rounds = 15, type = 'snake', reversal = 0, slots = SLOTS, dynasty = false } = {}) {
  const pl = players();
  const rows = projRows(pl);
  const pool = {};
  for (const r of rows) {
    const p = pl[r.player_id];
    pool[p.id] = { ...p, proj: { pts: r.stats._pts, gp: 17 }, adp: r.stats.adp_ppr, last: null };
  }
  const s2r = Object.fromEntries(Array.from({ length: teams }, (_, i) => [i + 1, i + 1]));
  return { draft: { id: 'd1', season: '2027', status: 'drafting', type }, order: { type, teams, rounds, reversal, budget: type === 'auction' ? 200 : null }, slots, slotToRoster: s2r, pool, dynasty, names: {} };
}
