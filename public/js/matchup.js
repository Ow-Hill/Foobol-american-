// Matchup strength: fantasy points each defense allowed to each position over the last six
// finished weeks, scored with this league's settings (history points are already league-scored).
// Counts the fantasy-relevant players in the snapshot, attributed to their current NFL team,
// so a player traded mid-season is credited to his new team's opponents.
const POS = ['QB', 'RB', 'WR', 'TE'];
const memo = new WeakMap();

export function buildMatchups(snap) {
  if (memo.has(snap)) return memo.get(snap);
  const results = snap.results || {};
  const weeks = Object.keys(results).map(Number);
  // allowed[def][pos][week] = points
  const allowed = {};
  for (const p of Object.values(snap.players || {})) {
    if (!POS.includes(p.pos) || !p.team) continue;
    for (const h of p.hist || []) {
      const opp = results[h.w]?.[p.team];
      if (!opp) continue;
      const d = ((allowed[opp] ||= {})[p.pos] ||= {});
      d[h.w] = (d[h.w] || 0) + (h.pts || 0);
    }
  }
  const teams = new Set();
  for (const w of weeks) for (const t of Object.keys(results[w])) teams.add(t);
  const byDef = {};
  for (const t of teams) {
    byDef[t] = {};
    for (const pos of POS) {
      // weeks this defense actually played, so a bye is not counted as zero allowed
      const played = weeks.filter((w) => results[w][t]);
      const vals = played.map((w) => allowed[t]?.[pos]?.[w] || 0);
      byDef[t][pos] = { avg: vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null, games: vals.length };
    }
  }
  // rank 1 = allowed the most (softest matchup)
  for (const pos of POS) {
    const list = [...teams].filter((t) => byDef[t][pos].avg != null && byDef[t][pos].games >= 2).sort((a, b) => byDef[b][pos].avg - byDef[a][pos].avg);
    list.forEach((t, i) => {
      byDef[t][pos].rank = i + 1;
      byDef[t][pos].of = list.length;
    });
  }
  const res = { byDef, weeks: weeks.sort((a, b) => a - b), teams: teams.size };
  memo.set(snap, res);
  return res;
}

// { rank, of, avg, label, tier } for a player's opponent this week, or null.
export function matchupFor(M, pid) {
  const p = M.P(pid);
  if (!POS.includes(p.pos) || !p.game?.opp) return null;
  const d = buildMatchups(M.snap).byDef[p.game.opp]?.[p.pos];
  if (!d || !d.rank) return null;
  const third = d.of / 3;
  const tier = d.rank <= third ? 'soft' : d.rank > 2 * third ? 'tough' : 'neutral';
  const ord = (n) => {
    const t = n % 100;
    if (t >= 11 && t <= 13) return n + 'th';
    return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  };
  const nth = (n, word) => (n === 1 ? `${word}` : `${ord(n)}-${word}`);
  const label = tier === 'soft'
    ? `${nth(d.rank, 'most')} pts allowed to ${p.pos}`
    : tier === 'tough'
      ? `${nth(d.of - d.rank + 1, 'fewest')} pts allowed to ${p.pos}`
      : `mid-pack vs ${p.pos}`;
  return { ...d, tier, label, opp: p.game.opp };
}
