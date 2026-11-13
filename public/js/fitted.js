// Every number here was measured, not chosen. Each block names the backtest experiment it came
// from (docs/backtest-report.md, tables in docs/backtest/). Fitted on 2022-2024, checked on
// 2025-2026. test/fitted.test.mjs fails if a value drifts from the saved results.
// Re-run `npm run backtest` after a season and update from the new tables.

// E2: how often the higher-projected player outscored the other, by projection gap (hold-out).
// group: 'skill' (RB/WR/TE, also across FLEX), 'QB', 'K', 'DEF'
export const GAP_WIN = {
  skill: [[0, 0.52], [1, 0.56], [2, 0.59], [3, 0.63], [4, 0.68], [5, 0.69], [6, 0.74], [8, 0.78], [10, 0.85]],
  QB: [[0, 0.53], [1, 0.59], [2, 0.58], [3, 0.63], [4, 0.64], [5, 0.69], [6, 0.73], [8, 0.84]],
  K: [[0, 0.52], [1, 0.58], [2, 0.67]],
  DEF: [[0, 0.54], [1, 0.58], [2, 0.66], [3, 0.72]],
};
// Gap (points) at which a call earns its label: Lean = about 3 in 5, Clear = about 2 in 3.
export const BANDS = { skill: { lean: 2, clear: 4 }, QB: { lean: 3, clear: 5 }, K: { lean: 1.5, clear: 99 }, DEF: { lean: 1, clear: 2.5 } };
export const gapGroup = (posA, posB) => (posA === 'QB' && posB === 'QB' ? 'QB' : posA === 'K' && posB === 'K' ? 'K' : posA === 'DEF' && posB === 'DEF' ? 'DEF' : 'skill');
export function gapWinRate(gap, group = 'skill') {
  const t = GAP_WIN[group] || GAP_WIN.skill;
  let v = t[0][1];
  for (const [lo, w] of t) if (gap >= lo) v = w;
  return v;
}

// E3: in toss-ups the higher implied team total only helped when the totals were 4+ apart (54.5%);
// the softer position matchup won exactly 50% and is no longer a tiebreak.
export const IMPLIED_GAP_MIN = 4;

// E4: official Questionable tag, skill players averaging 6+ points, 2022-2026.
// play = chance he plays; prod = share of his own average he scores when he does.
export const Q_PLAY = { FP: 0.9, LP: 0.68, DNP: 0.55, unknown: 0.7 };
export const Q_PLAY_QB = 0.42; // Questionable quarterbacks sat far more often than other positions
// A Questionable player who does play has scored 90-92% of his projection (both periods), and
// those who missed the last practice about a tenth less again.
export const Q_PROD = 0.91;
export const Q_PROD_DNP = 0.8;
export const DOUBTFUL_PLAY = 0.01;
export function playChance(pos, tag, prac) {
  if (tag === 'Questionable') {
    if (pos === 'QB') return prac === 'FP' ? 0.8 : Q_PLAY_QB;
    return Q_PLAY[prac] ?? Q_PLAY.unknown;
  }
  if (tag === 'Doubtful') return DOUBTFUL_PLAY;
  if (!tag || tag === 'Probable') return 1;
  return 0;
}
export const playingHurt = (tag, prac) => (tag === 'Questionable' ? (prac === 'DNP' ? Q_PROD_DNP : Q_PROD) : 1);

// E5: teammate estimates, scored against what similar players did with no news.
export const RIPPLE = {
  // RB out: each remaining back gains base + share * (his share of the remaining backs' carries
  // x the missing back's carries) + next * the missing back's carries for the lead remaining back.
  // The old rule (half his share plus half of everything to the next man) ran about twice too high.
  rb: { base: 0.6, share: 0.31, next: 0.05 },
  // WR/TE out: far smaller than the old 0.75 / 0.25 rule; most of the vacated targets do not
  // land on any one teammate.
  wr: { share: 0.13, next: 0.1 },
  // QB out: the top target held his expected scoring (99%), the others scored 89%.
  qb: { top: 0, rest: -0.1 },
  // With/without splits from one or two games ran 3-4x too large; weight them n / (n + k).
  obsShrink: 4,
  // A returning back took back about 40% of what the split suggested; returning receivers
  // showed no measurable effect on teammates' targets.
  returnRb: 0.4,
  // Share of estimates that moved the predicted way (chance level in brackets).
  hit: { 'rb-carries': [0.67, 0.43], 'rb-return': [0.77, 0.5], 'wr-targets': [0.43, 0.37], 'qb-catchers': [0.52, 0.5], 'qb-backup': [0.58, 0.34] },
};

// E7: win probability. The season-average method said 75% when the side won 59%.
export const WIN = {
  lineupSd: 48, // spread of (actual - projected) score gap between two lineups, as fitted
  meanShrink: 0.6, // pull each team's scoring average this far from the league mean (1 = none)
};

// E9: when a lead back is out, the back with the most recent work led the backfield 78% of the
// time vs 71% for the depth-chart backup; when the two disagreed recent work was right 55% to 25%.
export const NEXT_MAN_BY_WORK = true;

// E10: outdoor games with 15+ mph wind, actual minus projected points.
export const WIND = { mph: 15, QB: -2.0, K: -1.3, TE: -1.0, WR: -0.7, RB: -0.7 };

// E11: share of the remaining games actually played, relative to a healthy player, times
// production when back. Old values were 0.97 / 0.92 / 0.85 / 0.5.
export const ROS_HEALTH = {
  Questionable: 0.83,
  Doubtful: 0.68,
  Out: 0.62,
  // On injured reserve / off the report, by team games already missed
  IR: [[0, 0.22], [2, 0.27], [4, 0.08]],
};
export function rosHealth(tag, missed = 0) {
  if (!tag) return 1;
  if (tag === 'Questionable' || tag === 'Doubtful' || tag === 'Out') return ROS_HEALTH[tag];
  let v = ROS_HEALTH.IR[0][1];
  for (const [lo, w] of ROS_HEALTH.IR) if (missed >= lo) v = w;
  return v;
}

// E1 / E11 / E12: points a player's volume normally produces (league scoring), per game.
// pts = b0 + sum(coef * stat). Fitted on 2022-2024 player-games.
// `air` is Sleeper's rec_air_yd, which is air yards on completed catches (receiving yards minus
// yards after the catch), so this is volume plus downfield yardage. It deliberately leaves out
// touchdowns and yards after the catch, the two noisiest parts of a stat line.
export const XP = {
  QB: { b0: 2.0, passAtt: 0.344, att: 0.613, rzAtt: 1.303 },
  RB: { b0: -0.43, att: 0.565, rzAtt: 0.764, tgt: 1.319, air: 0.083, rzTgt: 1.034 },
  WR: { b0: -0.09, tgt: 0.667, air: 0.175, rzTgt: 1.188, att: 1.351 },
  TE: { b0: 0.21, tgt: 0.806, air: 0.168, rzTgt: 1.732 },
};
export function xpGame(pos, h) {
  const m = XP[pos];
  if (!m || !h) return null;
  let v = m.b0;
  for (const k in m) if (k !== 'b0') v += m[k] * (h[k] || 0);
  return Math.max(0, v);
}
// E11: rest-of-season points per game. Half the old value blend, half volume-based, beat the old blend
// at every position on 2025 (QB 3.08 vs 3.43, RB 2.96 vs 3.15, WR 2.83 vs 2.93, TE 2.28 vs 2.45).
export const VALUE_USAGE_WEIGHT = 0.5;

// E12: next four weeks from the last four games: a + t * points + x * volume-expected points.
export const NEXT4 = { QB: { a: 5.1, t: 0.33, x: 0.4 }, RB: { a: 2.43, t: 0.32, x: 0.44 }, WR: { a: 2.77, t: 0.36, x: 0.34 }, TE: { a: 3.55, t: 0.22, x: 0.38 } };
// Players 4+ a game above their volume-expected points dropped about 4 a game over the next month (about 1 more
// than an ordinary hot streak); 4+ below gained 1-4.
export const BUY_SELL_GAP = 4;

// E14: first game back from an absence, as a share of scoring before it; games two and three.
export const RETURN_PROD = { first: 0.78, next: 0.92, longFirst: 0.77, longNext: 0.81 };

// E15: this league's 2025 and 2026 drafts. Season points above a replacement player, by round.
export const PICK_POINTS = { 1: 141, 2: 82, 3: 60 };
// Share of fantasy value kept the following season (players averaging 9+), by position and age.
export const KEEP = {
  QB: [[0, 0.83], [26, 0.75], [30, 0.7]],
  RB: [[0, 0.94], [24, 0.78], [26, 0.74]],
  WR: [[0, 0.92], [24, 0.86], [27, 0.76]],
  TE: [[0, 0.89], [27, 0.87], [30, 0.78]],
};
export function keepShare(pos, age) {
  const t = KEEP[pos];
  if (!t) return 0.8;
  let v = t[0][1];
  for (const [lo, w] of t) if ((age || 26) >= lo) v = w;
  return v;
}

// E13: accepted trades in this league are rarely even on the site's values: the median deal had
// the smaller side at 45% of the larger, a quarter were under 34%. (Measured with the current
// value formula; docs/backtest/results-current.json.)
export const TRADE_BALANCE = { p25: 0.34, median: 0.45, p75: 0.8 };

// E16: 25th-75th percentile range as a share of the projection, by position and projection band
// (bands: 0-5, 5-8, 8-11, 11-14, 14-18, 18+). The last-six-games range held the actual score only
// 35% of the time (target 50%); this one 49.5% on 2025-26.
export const RANGE_BANDS = [0, 5, 8, 11, 14, 18];
export const RANGE = {
  QB: { 3: [0.66, 1.32], 4: [0.7, 1.34], 5: [0.71, 1.21] },
  RB: { 1: [0.47, 1.42], 2: [0.49, 1.42], 3: [0.65, 1.42], 4: [0.61, 1.39], 5: [0.6, 1.23] },
  WR: { 1: [0.29, 1.48], 2: [0.44, 1.37], 3: [0.56, 1.36], 4: [0.61, 1.28], 5: [0.64, 1.27] },
  TE: { 1: [0.48, 1.65], 2: [0.5, 1.45], 3: [0.63, 1.45], 4: [0.52, 0.98] },
  K: { 1: [0.59, 1.43], 2: [0.6, 1.31] },
  DEF: { 1: [0.47, 1.56], 2: [0.6, 1.47] },
};
export function rangeFor(pos, proj) {
  const t = RANGE[pos];
  if (!t || !(proj > 0)) return null;
  let b = RANGE_BANDS.length - 1;
  while (b > 0 && proj < RANGE_BANDS[b]) b--;
  // use the nearest band with enough history (lower first, then higher)
  let r = null;
  for (let k = b; k >= 0 && !r; k--) r = t[k];
  for (let k = b + 1; k < 6 && !r; k++) r = t[k];
  return r ? [proj * r[0], proj * r[1]] : null;
}
// E16: picking the higher recent floor (when favoured) or ceiling (when the underdog) did no
// better than keeping the higher projection, so that tiebreak step is gone.
export const POSTURE_TIEBREAK = false;

// E14b: first game back after missing 2-3 games, players scored 86% of their projection in both
// periods; after 1 or 4+ games the projection already allowed for it.
export const FIRST_BACK = { 1: 1, 2: 0.86, 3: 0.86, 4: 1 };

// E17: expert consensus (FantasyPros weekly rankings). Rank becomes points as a + b * ln(rank),
// fitted per position on 2022-24. Averaging it 50/50 with Sleeper's projection beat Sleeper alone
// on 2022-24 at QB, WR, K and DEF; on 2025-26 it held for QB, WR and K (not DEF), so those three
// use it. RB and TE stay on Sleeper alone.
export const CONSENSUS = {
  positions: ['QB', 'WR', 'K'],
  weight: 0.5,
  curve: { QB: [26.37, -3.902], RB: [23.621, -3.843], WR: [24.092, -3.817], TE: [15.633, -2.553], K: [9.108, -0.466], DEF: [11.909, -1.488] },
};
export function consensusPoints(pos, ecr) {
  const c = CONSENSUS.curve[pos];
  return c && ecr > 0 ? Math.max(0, c[0] + c[1] * Math.log(ecr)) : null;
}
