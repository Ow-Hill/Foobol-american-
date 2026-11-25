# Backtest tables (current)

Generated 2026-11-17 by `npm run backtest`. Seasons 2022-2026; constants are fitted on 2022, 2023, 2024 and judged on 2025, 2026.

## E1. How accurate are the numbers the engine ranks on?

- QB: Sleeper's projection misses by 6.23 points on average; the best alternative (Projection 75% + usage 25%) misses by 6.22 (0.01 better).
- RB: Sleeper's projection misses by 6.19 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 6.19 (no better).
- WR: Sleeper's projection misses by 5.86 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 5.86 (no better).
- TE: Sleeper's projection misses by 5.33 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 5.33 (no better).
- K: Sleeper's projection misses by 3.94 points on average; the best alternative (Fitted blend of all) misses by 3.92 (0.02 better).
- DEF: Sleeper's projection misses by 4.55 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 4.55 (no better).

Hold-out seasons 2025-2026, players who played, weeks 4-17. Lower miss is better; rank correlation is how well the method ordered players within a week.

| Position | Method | Avg miss (pts) | Bias | Weekly rank corr. | n |
| --- | --- | --- | --- | --- | --- |
| QB | Sleeper projection (what the site uses) | 6.23 | -0.42 | 0.303 | 481 |
| QB | Season average | 6.7 | -0.01 | 0.186 | 481 |
| QB | Last 3 games | 6.91 | 0 | 0.172 | 481 |
| QB | Trade-value blend (values.js) | 6.28 | -0.24 | 0.261 | 481 |
| QB | Volume-based expected points | 6.6 | 1.49 | 0.151 | 481 |
| QB | Projection 75% + usage 25% | 6.22 | 0.06 | 0.288 | 481 |
| QB | Fitted blend of all | 6.26 | -0.32 | 0.278 | 481 |
| RB | Sleeper projection (what the site uses) | 6.19 | -0.05 | 0.467 | 812 |
| RB | Season average | 6.46 | 0.85 | 0.395 | 812 |
| RB | Last 3 games | 6.87 | 0.28 | 0.333 | 812 |
| RB | Trade-value blend (values.js) | 6.24 | 0.2 | 0.447 | 812 |
| RB | Volume-based expected points | 6.38 | 0.69 | 0.393 | 812 |
| RB | Projection 100% + usage 0% | 6.19 | -0.05 | 0.467 | 812 |
| RB | Fitted blend of all | 6.3 | -0.48 | 0.463 | 812 |
| WR | Sleeper projection (what the site uses) | 5.86 | -0.61 | 0.396 | 1138 |
| WR | Season average | 6.17 | -0.18 | 0.315 | 1138 |
| WR | Last 3 games | 6.53 | -0.38 | 0.282 | 1138 |
| WR | Trade-value blend (values.js) | 5.92 | -0.46 | 0.374 | 1138 |
| WR | Volume-based expected points | 6.24 | -0.36 | 0.322 | 1138 |
| WR | Projection 100% + usage 0% | 5.86 | -0.61 | 0.396 | 1138 |
| WR | Fitted blend of all | 5.86 | -0.56 | 0.392 | 1138 |
| TE | Sleeper projection (what the site uses) | 5.33 | -0.45 | 0.313 | 412 |
| TE | Season average | 5.63 | -0.52 | 0.213 | 412 |
| TE | Last 3 games | 6.16 | -0.86 | 0.147 | 412 |
| TE | Trade-value blend (values.js) | 5.47 | -0.54 | 0.262 | 412 |
| TE | Volume-based expected points | 5.61 | -0.2 | 0.188 | 412 |
| TE | Projection 100% + usage 0% | 5.33 | -0.45 | 0.313 | 412 |
| TE | Fitted blend of all | 5.41 | -0.83 | 0.31 | 412 |
| K | Sleeper projection (what the site uses) | 3.94 | -0.03 | 0.108 | 330 |
| K | Season average | 4.08 | -0.35 | 0.176 | 330 |
| K | Last 3 games | 4.53 | -0.34 | 0.073 | 330 |
| K | Trade-value blend (values.js) | 3.97 | -0.15 | 0.138 | 330 |
| K | Projection 100% + average 0% | 3.94 | -0.03 | 0.108 | 330 |
| K | Fitted blend of all | 3.92 | 0.47 | 0.004 | 330 |
| DEF | Sleeper projection (what the site uses) | 4.55 | 0.3 | 0.183 | 336 |
| DEF | Season average | 5.09 | 0.73 | -0.036 | 336 |
| DEF | Last 3 games | 5.44 | 0.68 | -0.023 | 336 |
| DEF | Trade-value blend (values.js) | 4.71 | 0.48 | 0.038 | 336 |
| DEF | Projection 100% + average 0% | 4.55 | 0.3 | 0.183 | 336 |
| DEF | Fitted blend of all | 4.63 | -0.45 | 0.156 | 336 |

## E2. Are Clear / Lean / Toss-up honest?

- RB / WR / TE (same position): a 2-3 point edge won 59.4% of the time, a 4-5 point edge 68%, 10+ 85.9%.
- FLEX (RB vs WR vs TE): a 2-3 point edge won 59.2% of the time, a 4-5 point edge 67.7%, 10+ 85.3%.
- QB: a 2-3 point edge won 57.9% of the time, a 4-5 point edge 64.2%, 10+ 88.9%.
- K: a 2-3 point edge won 68.4% of the time, a 4-5 point edge null%, 10+ null%.
- DEF: a 2-3 point edge won 65.8% of the time, a 4-5 point edge 88.9%, 10+ null%.

RB / WR / TE (same position): how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.5 | 19660 | 51.3 | 8900 | 50.5-52.4 |
| 1-2 | 57.4 | 17569 | 56.3 | 7869 | 55.1-57.7 |
| 2-3 | 60.5 | 15127 | 59.4 | 6591 | 58.2-60.5 |
| 3-4 | 64.1 | 13042 | 62.7 | 5771 | 61-64.2 |
| 4-5 | 67.8 | 10906 | 68 | 5133 | 66.7-70.1 |
| 5-6 | 70.6 | 8413 | 68 | 4255 | 65.9-70.4 |
| 6-8 | 75.3 | 10569 | 74 | 6141 | 73-75.7 |
| 8-10 | 80.2 | 5573 | 76.9 | 3637 | 75.7-78.9 |
| 10-+ | 83.9 | 3899 | 85.9 | 4025 | 84-88.4 |

FLEX (RB vs WR vs TE): how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.9 | 47797 | 51.3 | 23137 | 50.8-51.8 |
| 1-2 | 56.4 | 45029 | 55.9 | 20868 | 55.3-56.8 |
| 2-3 | 60.6 | 40121 | 59.2 | 18189 | 58-60.3 |
| 3-4 | 63.8 | 34592 | 63.2 | 15678 | 61.9-64.6 |
| 4-5 | 68.1 | 29509 | 67.7 | 13543 | 66.5-69.2 |
| 5-6 | 70.6 | 23661 | 68.9 | 10905 | 67.3-70.8 |
| 6-8 | 74.5 | 30645 | 74.1 | 16227 | 73-75.7 |
| 8-10 | 79.4 | 15899 | 78 | 9668 | 76.8-79.7 |
| 10-+ | 83.5 | 11186 | 85.3 | 10881 | 83.5-87.7 |

QB: how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 52.2 | 2543 | 52.7 | 1318 | 50.4-55 |
| 1-2 | 58.3 | 2101 | 59 | 1251 | 56.1-62.9 |
| 2-3 | 58.3 | 1858 | 57.9 | 992 | 54.8-60.9 |
| 3-4 | 61.8 | 1417 | 63.8 | 770 | 59.5-69.6 |
| 4-5 | 68.2 | 1103 | 64.2 | 575 | 59.7-69.1 |
| 5-6 | 71.1 | 836 | 69.1 | 376 | 63-76.7 |
| 6-8 | 74.3 | 1099 | 73.9 | 391 | 66.4-79.1 |
| 8-10 | 82.3 | 479 | 82.3 | 96 | 75.5-88.5 |
| 10-+ | 87 | 138 | 88.9 | 18 | 77.8-100 |

K: how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.9 | 3374 | 52 | 1813 | 48.9-55.1 |
| 1-2 | 49.7 | 1140 | 58.2 | 457 | 51-65.8 |
| 2-3 | 56.6 | 182 | 68.4 | 79 | 52.4-80.9 |
| 3-4 | 0 | 6 | 100 | 1 | 100-100 |
| 4-5 |  | 0 |  | 0 | null-null |
| 5-6 |  | 0 |  | 0 | null-null |
| 6-8 |  | 0 |  | 0 | null-null |
| 8-10 |  | 0 |  | 0 | null-null |
| 10-+ |  | 0 |  | 0 | null-null |

DEF: how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.8 | 2544 | 54.6 | 1254 | 52-56.6 |
| 1-2 | 60.7 | 1540 | 57 | 834 | 52.9-62.3 |
| 2-3 | 63.8 | 547 | 65.8 | 260 | 55.4-74 |
| 3-4 | 71.4 | 98 | 72 | 25 | 40-86.7 |
| 4-5 | 66.7 | 30 | 88.9 | 9 | 75-100 |
| 5-6 | 66.7 | 15 | 94.4 | 18 | 88.9-100 |
| 6-8 |  | 0 |  | 0 | null-null |
| 8-10 |  | 0 |  | 0 | null-null |
| 10-+ |  | 0 |  | 0 | null-null |

## E3. Does each tiebreak step pick the winner?

- In toss-ups (projections within 2 points), the higher implied team total won 52.2% (54.3% when 4+ apart); the softer position matchup won 49.8%; the untagged player beat a Questionable one 55.1% of the time counting sit-outs as zero.

Same-position pairs projected within 2 points of each other. 50% = coin flip.

| Tiebreak | Win % 2022-24 | pairs | Win % 2025-26 | pairs |
| --- | --- | --- | --- | --- |
| Keep the higher projection (what happens with no tiebreak) | 54.4 | 41873 | 53.9 | 19338 |
| Health: pick the player with no tag over a Questionable one (sat out = 0) | 52.6 | 5725 | 55.1 | 1954 |
| Health: same, only when both ended up playing | 52.5 | 5705 | 55.1 | 1954 |
| Game environment: pick the higher implied team total | 50.7 | 40470 | 52.2 | 18692 |
| Game environment: only when the totals differ by 4+ | 51.5 | 17233 | 54.3 | 8528 |
| Position matchup: pick the softer opponent (site rule) | 51 | 24914 | 49.8 | 11576 |

## E4. What does an injury tag really mean?

- Fantasy-relevant Questionable players played 69.7% of the time and scored 84.7% of their own average when they did, so a Questionable tag is worth about 59% of a normal week. Doubtful: played 1%.
- Practice status moves it a lot: FP 89.6% played, LP 68.4% played, DNP 54.2% played.
- None of the Questionable players who sat out still has a projection in Sleeper's stored numbers: the archive keeps the final pre-kickoff version, after inactives were announced. Any replay that uses it already "knows" who sat.
- When Questionable players did play, they scored -1.13 points vs their projection on average (-1.13 in 2022-24, -1.12 in 2025-26; 90.3% and 90.7% of the projection).

Official game-status report, skill players averaging 6+ points, 2022-2026.

| Tag | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Questionable | 881 | 69.7 | 70.3 | 68.2 | 0.85 | 0.95 | 0.59 |
| Doubtful | 100 | 1 | 1.1 | 0 | 0.51 | 0.77 | 0.01 |
| Out | 633 | 0 | 0 | 0 |  |  |  |

Questionable only, by final practice status of the week.

| Last practice | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FP | 134 | 89.6 | 87.5 | 94.7 | 0.84 | 0.99 | 0.75 |
| LP | 602 | 68.4 | 69.7 | 65.1 | 0.87 | 0.95 | 0.59 |
| DNP | 131 | 54.2 | 55.4 | 50 | 0.76 | 0.91 | 0.41 |

Questionable only, by position.

| Position | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 115 | 41.7 | 46.5 | 27.6 | 0.86 | 1 | 0.36 |
| RB | 220 | 70.9 | 70.7 | 71.4 | 0.9 | 0.95 | 0.64 |
| WR | 441 | 74.6 | 75.1 | 73.3 | 0.82 | 0.96 | 0.61 |
| TE | 105 | 77.1 | 76.5 | 78.4 | 0.86 | 0.9 | 0.66 |

Questionable only, by injury.

| Injury | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ankle | 129 | 69.8 | 68.4 | 73.5 | 0.79 | 0.9 | 0.55 |
| Knee | 127 | 65.4 | 64.8 | 66.7 | 0.82 | 0.9 | 0.54 |
| Groin/hip/quad | 114 | 70.2 | 72.1 | 64.3 | 0.93 | 1 | 0.65 |
| Back/ribs/core | 92 | 78.3 | 79.4 | 75 | 0.92 | 1.03 | 0.72 |
| Hamstring | 92 | 59.8 | 56.7 | 68 | 0.86 | 0.95 | 0.51 |
| Shoulder | 79 | 65.8 | 64.9 | 68.2 | 0.87 | 1.03 | 0.57 |
| Other | 76 | 67.1 | 73.1 | 54.2 | 0.67 | 0.83 | 0.45 |
| Foot/toe | 65 | 76.9 | 86.7 | 55 | 0.88 | 0.99 | 0.67 |
| Illness/rest | 50 | 78 | 78.8 | 76.5 | 0.81 | 0.88 | 0.63 |
| Concussion | 33 | 63.6 | 60.7 | 80 | 0.89 | 1.15 | 0.57 |

Questionable only, position and practice status together.

| Position + practice | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WR LP | 289 | 74.7 | 75.8 | 72 | 0.82 | 0.96 | 0.61 |
| RB LP | 143 | 69.9 | 69.8 | 70.3 | 0.94 | 0.95 | 0.66 |
| QB LP | 91 | 36.3 | 42.6 | 17.4 | 0.9 | 1 | 0.33 |
| TE LP | 79 | 79.7 | 80.8 | 77.8 | 0.9 | 0.88 | 0.72 |
| WR DNP | 78 | 59 | 61.7 | 50 | 0.75 | 0.92 | 0.44 |
| WR FP | 68 | 91.2 | 88 | 100 | 0.89 | 0.99 | 0.81 |
| RB FP | 38 | 89.5 | 88.9 | 90.9 | 0.84 | 0.98 | 0.76 |
| RB DNP | 34 | 52.9 | 51.9 | 57.1 | 0.72 | 0.89 | 0.38 |

## E5. Were the teammate (ripple) estimates right?

- 1697 teammate estimates scored against what the same players would have been expected to do with no news. Overall: right direction 56%, wrong 30.8%; pure chance would be 44.1%.
- Running back out → carries for the remaining backs: right 67.1%, wrong 28.8%, chance 42.9%. This is the one strong rule.
- Receiver or tight end out → targets for teammates: WR right 47.8%, wrong 38.8%, chance 37.2%; TE right 54.5%, wrong 32.5%, chance 37.2%. The average estimate was +1.19 targets; the average real change was 0.64.
- Quarterback out → pass catchers down: right 53.5%, wrong 29%, chance 49.7%. Top target scored 98.9% of his expected points (site assumes 90%), the others 88.9% (site assumes 80%).
- Confidence labels: lean 65.1% right (n=476), toss 52.5% right (n=1221). 
- "Seen this season" evidence vs the share rule: Share rule (heuristic): 55.7% right, average miss 4.28; Seen this season (with/without split): 53% right, average miss 2.93.
- Refit, WR/TE out: a teammate gains 0.126 of his proportional share of the vacated targets, plus 0.104 of all of them if he is the next man up (site: 0.75 and 0.25). On 2025-26 the refit misses by 1.67 targets vs 1.77 for the site rule and 1.65 for "no change".
- Refit, RB out: remaining backs gain 0.313 of their proportional share of the vacated carries, and the lead remaining back an extra 0.047 of all of them. Refit misses by 3.49 carries vs 4.44 (site rule) and 4.14 ("no change").

By rule. "Right" means the player moved the predicted way by more than half a target or carry (1.5 points for percentage estimates) relative to his expected level with no news. "Chance" is how often a similar player on a quiet team moved that way anyway.

| Rule | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| out QB → pass catchers (points) | 744 | 53.5 | 29 | 49.7 | 50.6 | 247 | -0.77 | -0.86 | 4.49 | 4.66 |
| out WR → targets | 345 | 47.8 | 38.8 | 37.2 | 49.1 | 159 | 1.19 | 0.64 | 2.4 | 2.34 |
| out RB → carries | 295 | 67.1 | 28.8 | 42.9 | 70.6 | 102 | 3.28 | 3.2 | 4.2 | 5.05 |
| out QB → backup QB starts | 117 | 57.3 | 29.1 | 33.8 | 57.8 | 45 |  |  |  |  |
| out TE → targets | 77 | 54.5 | 32.5 | 37.2 | 42.9 | 21 | 1.2 | 1.09 | 2.19 | 2.3 |
| return RB → carries | 47 | 74.5 | 23.4 | 49.6 | 69.2 | 13 | -3.53 | -2.83 | 3.64 | 4.61 |

By the confidence label the site shows.

| Label | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lean | 476 | 65.1 | 28.6 | 41.2 | 66.3 | 163 | 2.34 | 2.44 | 4.12 | 4.99 |
| toss | 1221 | 52.5 | 31.7 | 45.3 | 50.3 | 451 | -0.12 | -0.36 | 3.67 | 3.78 |

Out events: this-season with/without evidence vs the share rule.

| Basis | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Share rule (heuristic) | 962 | 55.7 | 29.1 | 47.6 | 55.5 | 335 | -0.05 | -0.02 | 4.28 | 4.58 |
| Seen this season (with/without split) | 506 | 53 | 36.8 | 39.1 | 50.3 | 195 | 1.89 | 1.23 | 2.93 | 3.05 |

Out events: by size of the estimate.

| Size | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estimate 3+ a game | 154 | 78.6 | 18.8 | 42.8 | 81.4 | 59 | 4.5 | 4.97 | 4.55 | 6.13 |
| Estimate 1.5-3 | 202 | 53.5 | 39.1 | 40.6 | 57.5 | 73 | 2.03 | 1.11 | 3.4 | 3.45 |
| Estimate under 1.5 | 368 | 48.1 | 38.6 | 37.5 | 45.7 | 151 | 1.02 | 0.68 | 2.35 | 2.29 |

Out events (non-QB): by how much work the missing player had.

| Missing player | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Missing player had 14+ touches/targets a game | 165 | 66.7 | 29.1 | 42.5 | 66.1 | 62 | 3.46 | 3.37 | 4.25 | 5.2 |
| 8-14 | 261 | 56.3 | 33 | 40.3 | 59.1 | 93 | 2.17 | 1.9 | 3.38 | 3.67 |
| under 8 | 298 | 50 | 38.9 | 37.2 | 49.2 | 128 | 1.14 | 0.63 | 2.25 | 2.24 |

Out events: how the absence was known.

| Source | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Not on report (IR / early rule-out) | 795 | 51.4 | 34.5 | 46.2 | 51.6 | 277 | 0.25 | -0.06 | 4.03 | 4.09 |
| Official Out / Doubtful | 673 | 58.7 | 28.5 | 42.9 | 55.7 | 253 | 1.05 | 0.96 | 3.55 | 4 |

Why a baseline is needed: similar players on teams with no news, change vs their own last three games (raw) and vs the fitted expectation (adjusted).

| Measure | n | Raw: up % | Raw: down % | Adjusted: up % | Adjusted: down % |
| --- | --- | --- | --- | --- | --- |
| Targets | 5666 | 34.5 | 51.7 | 37.2 | 48 |
| Carries | 1925 | 39.3 | 53 | 42.9 | 49.6 |
| Points | 6219 | 32.9 | 49.9 | 33.8 | 49.7 |

## E6. Does matchup strength predict anything?

- Against a player's own average, the site's matchup number has a correlation of 0.061 with over/under-performance (soft vs tough third: 1.67 points). Best variant: "Raw, season to date" at 0.063 (1.38 points).
- Against Sleeper's projection the same number is worth 0.018 correlation (0.64 points soft vs tough): some signal is left after the projection.
- By position (best variant, vs own average): QB 0.186, RB 0.042, WR 0.02, TE 0.062.

How a player did relative to (a) his own season average and (b) Sleeper's projection, against the opponent's rating. Tier gap = soft third minus tough third, in points. Hold-out 2025-26 unless marked.

| Matchup measure | Pos | Corr. vs own average | Tier gap vs own average | Corr. vs projection 2022-24 | Corr. vs projection | Tier gap vs projection | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Raw points allowed, last 6 weeks (site today) | QB | 0.167 | 4.54 | 0.024 | 0.055 | 1.62 | 441 |
| Raw points allowed, last 6 weeks (site today) | RB | 0.092 | 2.16 | 0.062 | 0.033 | 0.78 | 737 |
| Raw points allowed, last 6 weeks (site today) | WR | -0.005 | 0.43 | 0.015 | -0.009 | 0.17 | 1037 |
| Raw points allowed, last 6 weeks (site today) | TE | 0.048 | 1.19 | 0.016 | 0.009 | 0.69 | 374 |
| Raw points allowed, last 6 weeks (site today) | ALL | 0.061 | 1.67 | 0.03 | 0.018 | 0.64 | 2589 |
| Raw, season to date | QB | 0.186 | 4.38 | 0.045 | 0.056 | 1.33 | 441 |
| Raw, season to date | RB | 0.042 | 0.89 | 0.069 | -0.018 | -0.45 | 737 |
| Raw, season to date | WR | 0.02 | 0.66 | 0.012 | 0.014 | 0.35 | 1037 |
| Raw, season to date | TE | 0.062 | 1.02 | 0.03 | 0.018 | 0.37 | 374 |
| Raw, season to date | ALL | 0.063 | 1.38 | 0.036 | 0.013 | 0.3 | 2589 |
| Schedule-adjusted, last 6 weeks | QB | 0.137 | 2.85 | 0.021 | 0.055 | 1.07 | 441 |
| Schedule-adjusted, last 6 weeks | RB | 0.052 | 1 | 0.043 | -0.009 | -0.51 | 737 |
| Schedule-adjusted, last 6 weeks | WR | 0.008 | 0.29 | 0.034 | 0.003 | 0.16 | 1037 |
| Schedule-adjusted, last 6 weeks | TE | -0.019 | -0.95 | 0.003 | -0.044 | -1.09 | 374 |
| Schedule-adjusted, last 6 weeks | ALL | 0.041 | 0.8 | 0.03 | 0.003 | -0.03 | 2589 |
| Schedule-adjusted, season to date | QB | 0.15 | 3.64 | 0.022 | 0.055 | 1.35 | 441 |
| Schedule-adjusted, season to date | RB | -0.001 | -0.23 | 0.05 | -0.06 | -1.36 | 737 |
| Schedule-adjusted, season to date | WR | 0.022 | 0.14 | 0.011 | 0.012 | -0.19 | 1037 |
| Schedule-adjusted, season to date | TE | 0.023 | 0.2 | 0.028 | -0.008 | -0.26 | 374 |
| Schedule-adjusted, season to date | ALL | 0.039 | 0.68 | 0.026 | -0.004 | -0.26 | 2589 |
| Schedule-adjusted + shrunk, season to date | QB | 0.15 | 3.61 | 0.021 | 0.055 | 1.37 | 441 |
| Schedule-adjusted + shrunk, season to date | RB | 0 | -0.13 | 0.05 | -0.059 | -1.27 | 737 |
| Schedule-adjusted + shrunk, season to date | WR | 0.023 | 0.16 | 0.011 | 0.013 | -0.17 | 1037 |
| Schedule-adjusted + shrunk, season to date | TE | 0.021 | 0.08 | 0.028 | -0.01 | -0.4 | 374 |
| Schedule-adjusted + shrunk, season to date | ALL | 0.04 | 0.69 | 0.026 | -0.003 | -0.23 | 2589 |

## E7. Is the win probability any good?

- The site's current win probability scores 0.235 over both seasons against 0.25 for a coin flip, barely better than guessing. It is overconfident: when it gave a side 70-80%, that side won 73.4% of the time.
- Best spread for the projected-lineup method: 37.5 points fitted on 2025, 55 on 2026, 48 on both. The season-average method is best pulled 20% of the way to 50/50.
- Measured directly, the gap between two teams' actual and projected scores has a spread of 35.6 points. On the 74 real matchups alone: site today 0.239, projected lineups 0.215.

Brier score: 0.25 is a coin flip, lower is better. Every pair of teams in each regular-season week from Week 4 (the real matchups are too few to test on their own). Anything fitted is fitted on the other season.

| Method | Brier 2025 | Picked winner % 2025 | games | Brier 2026 | Picked winner % 2026 | games | Brier, both |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coin flip | 0.25 | 50.6 | 308 | 0.25 | 50.7 | 270 | 0.25 |
| Site today: season scoring averages | 0.234 | 62.7 | 308 | 0.237 | 59.6 | 270 | 0.235 |
| Site today, pulled toward 50% (strength fitted on the other season) | 0.233 | 62.7 | 308 | 0.237 | 59.6 | 270 | 0.235 |
| Projected lineups (spread fitted on the other season) | 0.231 | 63 | 308 | 0.235 | 61.9 | 270 | 0.233 |
| Projected lineups, spread 48 points (fitted on both) | 0.23 | 63 | 308 | 0.232 | 61.9 | 270 | 0.231 |

Site today: when it said X%, how often did that side win? (both seasons)

| Stated chance | games | Average stated | Actually won |
| --- | --- | --- | --- |
| 50-60% | 269 | 54.9 | 56.9 |
| 60-70% | 199 | 64.8 | 60.3 |
| 70-80% | 94 | 74 | 73.4 |
| 80-100% | 16 | 82.7 | 75 |

Projected lineups with a 48-point spread, same check.

| Stated chance | games | Average stated | Actually won |
| --- | --- | --- | --- |
| 50-60% | 292 | 54.7 | 56.2 |
| 60-70% | 207 | 64.8 | 66.7 |
| 70-80% | 72 | 74.5 | 73.6 |
| 80-100% | 7 | 82.7 | 85.7 |

## E8. Would the site's lineup have beaten the one actually set?

- Across 208 team-weeks the site's lineup scored 2.36 points a week more than the lineup the manager set (90% range 0.74 to 4.21). For your team: 4.84 (0.26 to 9.4).
- Managers reached 87.5% of the perfect lineup, the site 89.2%.
- Blending in the expert consensus (QB, WR, K) changed the site's lineup in 50 of 208 team-weeks and moved its score by 0.57 points a week on average (90% range 0.15 to 1.09); where it changed something, it scored more 60% of the time.
- Managers started 0.05 players a week who did not play; the site lineup 0.01. Caveat: Sleeper's stored projections are the final pre-kickoff ones, so the site lineup here knows about Sunday-morning inactives. It is what the site would say if checked 90 minutes before each game, not on Tuesday.
- Check on the scorer: my re-scored lineup totals differ from Sleeper's official ones by 0.15 points a week on average.

Every team-week in this league, Weeks 2-17 of 2025 and 2026 to date. "Site lineup" is the best legal lineup by the site's own rules, from that week's roster, built before kickoff.

| Team-weeks | n | Lineup actually set | Site lineup | Perfect lineup | Site minus actual | 90% range | Site better % | Site worse % | Actual as % of perfect | Site as % of perfect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All teams, 2025-2026 | 208 | 135.1 | 137.4 | 154.3 | 2.36 | 0.74 to 4.21 | 38 | 28.4 | 87.5 | 89.2 |
| All teams, 2025 | 128 | 135.6 | 138.7 | 157.2 | 3.05 | 0.77 to 5.46 | 39.1 | 29.7 | 86.1 | 88.2 |
| All teams, 2026 | 80 | 134.1 | 135.4 | 149.7 | 1.24 | 0.08 to 2.29 | 36.3 | 26.3 | 89.9 | 90.7 |
| Your team | 24 | 150 | 154.9 | 166.8 | 4.84 | 0.26 to 9.4 | 45.8 | 25 | 90.2 | 93 |
| Your team, 2026 | 8 | 146.2 | 149.8 | 163.2 | 3.59 | -4.62 to 10.86 | 50 | 25 | 90.2 | 92.4 |
| All teams, site lineup with expert consensus blended in | 208 | 135.1 | 138 | 154.3 | 2.93 | 1.3 to 4.98 | 39.4 | 27.4 | 87.5 | 89.6 |

2026 by manager: points per week left on the table against the site lineup.

| Manager | weeks | Actual | Site lineup | Site minus actual | Actual as % of perfect | Starters who did not play, per week |
| --- | --- | --- | --- | --- | --- | --- |
| Thisowenguy | 8 | 146.2 | 149.8 | 3.59 | 90.2 | 0 |
| HyperFire12 | 8 | 127 | 129.9 | 2.86 | 92.7 | 0 |
| andbums | 8 | 129.1 | 131.5 | 2.34 | 88.5 | 0.13 |
| MWrighter38 | 8 | 125.1 | 127.4 | 2.24 | 89.5 | 0 |
| ColinHill | 8 | 143.1 | 145 | 1.95 | 91.1 | 0 |
| CadeCermak | 8 | 146.4 | 147.5 | 1.13 | 88.4 | 0 |
| JohnTerno | 8 | 110.3 | 111.1 | 0.74 | 88.5 | 0 |
| JamesKnowsBalls | 8 | 136.9 | 137.4 | 0.46 | 90.5 | 0 |
| ARY3R | 8 | 144 | 143.6 | -0.47 | 89.1 | 0 |
| Jackblacknine | 8 | 133.1 | 130.6 | -2.46 | 90.1 | 0.25 |

## E9. Is "next man up" the right pickup when a lead back is out?

- In 90 cases the depth-chart backup led the backfield 71.1% of the time and scored 12.9 points; the back with the most recent work led 77.8% and scored 13.1. A replacement-level back scored 8.1.
- They named the same player 77.8% of the time. When they disagreed (20 cases), the depth chart was right 25% and recent work 55%.

Lead running backs (12+ carries and targets a game) ruled out, 2022-2024, teams with at least two other backs.

| Pick | Cases | Led the backfield that week % | Points scored | A replacement-level RB scored |
| --- | --- | --- | --- | --- |
| Next on the official depth chart | 90 | 71.1 | 12.9 | 8.1 |
| Most recent work (carries + targets, last 3 games) | 90 | 77.8 | 13.1 | 8.1 |
| When the two disagree: depth chart | 20 | 25 |  |  |
| When the two disagree: recent work | 20 | 55 |  |  |

## E10. Game environment: betting lines and wind

- A team's implied total explains its skill-position fantasy output with correlation 0.411 (each implied point is worth about 2.6 team fantasy points).
- After Sleeper's projection, the implied total adds 0.035 correlation (high-total vs low-total teams: 0.83 points per player); against a player's own average it adds 0.022.
- Wind 15+ mph outdoors vs calm, relative to projection: QB -1.98, WR -0.74, TE -1.05, RB -0.7, K -1.28 points.

Outdoor games: actual minus projected points, calm (under 10 mph) vs windy (15+ mph).

| Position | Calm: actual - projection | n | Windy: actual - projection | n | Difference |
| --- | --- | --- | --- | --- | --- |
| QB | 0.4 | 533 | -1.58 | 84 | -1.98 |
| WR | -0.22 | 1253 | -0.96 | 183 | -0.74 |
| TE | 0.56 | 429 | -0.49 | 67 | -1.05 |
| RB | 0.34 | 904 | -0.36 | 145 | -0.7 |
| K | -0.23 | 343 | -1.5 | 49 | -1.28 |

## E11. Do trade values predict the rest of the season?

- QB: the site's value misses rest-of-season points per game by 3.07; best method is "Half site value, half volume-based" at 3.02.
- RB: the site's value misses rest-of-season points per game by 2.73; best method is "Site value today (values.js)" at 2.73.
- WR: the site's value misses rest-of-season points per game by 2.67; best method is "Site value today (values.js)" at 2.67.
- TE: the site's value misses rest-of-season points per game by 2.11; best method is "Half site value, half volume-based" at 2.1.
- Health factors are far from what the site assumes: Questionable: played 79.5% of remaining games (site assumes 97%); Doubtful: played 58.1% of remaining games (site assumes 92%); Out (official), first or second week: played 58% of remaining games (site assumes 85%); Out, already missed 2+: played 56.6% of remaining games (site assumes 85%); Off the report, just went down: played 22.9% of remaining games (site assumes 50%); Off the report, missed 2-3: played 28.7% of remaining games (site assumes 50%); Off the report, missed 4+ (long-term IR): played 8.6% of remaining games (site assumes 50%).

Predicting a player's points per game from that week to Week 17, taken at Weeks 4-11. Hold-out season 2025; healthy players who went on to play 3+ games.

| Position | Method | Avg miss (pts/game) | Bias | Rank corr. | n |
| --- | --- | --- | --- | --- | --- |
| QB | Site value today (values.js) | 3.07 | -0.7 | 0.46 | 180 |
| QB | Season average | 3.82 | -1.48 | 0.383 | 180 |
| QB | Last 3 games | 4.43 | -1.85 | 0.393 | 180 |
| QB | This week's projection | 4.81 | 0.44 | 0.309 | 180 |
| QB | Volume-based expected points | 3.07 | 0.19 | 0.426 | 180 |
| QB | Half site value, half volume-based | 3.02 | -0.26 | 0.454 | 180 |
| QB | Season average + volume (fitted) | 3.33 | -1.26 | 0.397 | 180 |
| QB | Fitted blend of all | 3.29 | -1.22 | 0.394 | 180 |
| RB | Site value today (values.js) | 2.73 | 0.57 | 0.843 | 289 |
| RB | Season average | 3.28 | 0.15 | 0.794 | 289 |
| RB | Last 3 games | 3.87 | -0.22 | 0.739 | 289 |
| RB | This week's projection | 3.84 | 0.93 | 0.673 | 289 |
| RB | Volume-based expected points | 3.13 | 0.58 | 0.811 | 289 |
| RB | Half site value, half volume-based | 2.79 | 0.57 | 0.832 | 289 |
| RB | Season average + volume (fitted) | 3.06 | 0.94 | 0.805 | 289 |
| RB | Fitted blend of all | 3.01 | 0.74 | 0.809 | 289 |
| WR | Site value today (values.js) | 2.67 | -0.92 | 0.819 | 399 |
| WR | Season average | 3.28 | -1.16 | 0.76 | 399 |
| WR | Last 3 games | 3.51 | -1.29 | 0.773 | 399 |
| WR | This week's projection | 3.56 | 0.04 | 0.649 | 399 |
| WR | Volume-based expected points | 2.96 | -0.82 | 0.772 | 399 |
| WR | Half site value, half volume-based | 2.77 | -0.87 | 0.802 | 399 |
| WR | Season average + volume (fitted) | 2.92 | -0.58 | 0.772 | 399 |
| WR | Fitted blend of all | 2.91 | -0.65 | 0.772 | 399 |
| TE | Site value today (values.js) | 2.11 | 0.16 | 0.879 | 160 |
| TE | Season average | 2.63 | -0.1 | 0.836 | 160 |
| TE | Last 3 games | 3.06 | -0.44 | 0.801 | 160 |
| TE | This week's projection | 2.84 | 0.66 | 0.695 | 160 |
| TE | Volume-based expected points | 2.28 | 0.38 | 0.827 | 160 |
| TE | Half site value, half volume-based | 2.1 | 0.27 | 0.859 | 160 |
| TE | Season average + volume (fitted) | 2.67 | -0.39 | 0.836 | 160 |
| TE | Fitted blend of all | 2.63 | -0.46 | 0.848 | 160 |

Health: share of the remaining games (to Week 17) actually played, by status when the value was taken. Players averaging 7+ points.

| Status at the time | n | Games played % | 2022-24 | 2025 | Points per game when back vs before | Site assumes |
| --- | --- | --- | --- | --- | --- | --- |
| Healthy | 3071 | 86.7 | 86.3 | 87.6 | 0.94 | 1 |
| Questionable | 228 | 79.5 | 81.1 | 73.5 | 0.86 | 0.97 |
| Doubtful | 26 | 58.1 | 59.2 | 45 | 1.03 | 0.92 |
| Out (official), first or second week | 123 | 58 | 59.8 | 54.1 | 0.9 | 0.85 |
| Out, already missed 2+ | 33 | 56.6 | 55.4 | 58.1 | 0.89 | 0.85 |
| Off the report, just went down | 111 | 22.9 | 24.4 | 18.7 | 0.77 | 0.5 |
| Off the report, missed 2-3 | 84 | 28.7 | 31.9 | 17.9 | 0.73 | 0.5 |
| Off the report, missed 4+ (long-term IR) | 40 | 8.6 | 8 | 9.7 | 0.75 | 0.5 |

## E12. Do buy-low / sell-high signals work?

- QB: usage carries weight 0.4 next to 0.33 for recent points. Players running 4+ above their usage dropped 3.65 a game over the next month (0.75 more than an ordinary hot streak). Players 4+ below gained 3.98 (0.77 beyond the usual).
- RB: usage carries weight 0.44 next to 0.32 for recent points. Players running 4+ above their usage dropped 4.23 a game over the next month (0.83 more than an ordinary hot streak). Players 4+ below gained 1.77 (2.21 beyond the usual).
- WR: usage carries weight 0.34 next to 0.36 for recent points. Players running 4+ above their usage dropped 3.78 a game over the next month (0.75 more than an ordinary hot streak). Players 4+ below gained 0.8 (1.57 beyond the usual).
- TE: usage carries weight 0.38 next to 0.22 for recent points. Players running 4+ above their usage dropped 4.77 a game over the next month (1.85 more than an ordinary hot streak). 

Next four weeks' points per game predicted from the last four games' points (T) and what the usage in those games would normally produce (X). Weights fitted 2022-24; misses on 2025-26.

| Position | Weight on recent points | Weight on usage | Miss: assume he keeps scoring the same | Miss: recent points, regressed | Miss: points + usage | Miss: + season average and snap trend | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 0.33 | 0.4 | 4.68 | 4.18 | 4.18 | 4.08 | 359 |
| RB | 0.32 | 0.44 | 4.27 | 4.06 | 3.88 | 3.77 | 564 |
| WR | 0.36 | 0.34 | 4.13 | 3.83 | 3.72 | 3.74 | 797 |
| TE | 0.22 | 0.38 | 3.86 | 3.54 | 3.44 | 3.35 | 365 |

What happened next to players scoring well above or below their usage. "Beyond the usual pull-back" removes the ordinary drift back to average that any hot or cold player shows.

| Position | Group | n | Last 4: points | Last 4: usage says | Next 4: points | Change | Beyond the usual pull-back | Same, 2025-26 | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QB | Scoring 4+ a game above usage | 223 | 23.4 | 17 | 19.7 | -3.65 | -0.75 | -1.45 | 92 |
| QB | Within 4 of usage | 738 | 16.6 | 16.5 | 17.1 | 0.51 | -0.13 | -0.27 | 232 |
| QB | Scoring 4+ a game below usage | 103 | 11.7 | 17.1 | 15.7 | 3.98 | 0.77 | 0.25 | 35 |
| RB | Scoring 4+ a game above usage | 182 | 19.5 | 13.3 | 15.2 | -4.23 | -0.83 | -0.27 | 65 |
| RB | Within 4 of usage | 1383 | 12.6 | 12.4 | 11.9 | -0.67 | 0.16 | 0.35 | 477 |
| RB | Scoring 4+ a game below usage | 83 | 11.5 | 16.5 | 13.3 | 1.77 | 2.21 | 4.4 | 22 |
| WR | Scoring 4+ a game above usage | 139 | 18 | 12.6 | 14.2 | -3.78 | -0.75 | -1.45 | 36 |
| WR | Within 4 of usage | 2283 | 11.7 | 11.7 | 10.8 | -0.92 | -0.15 | -0.44 | 747 |
| WR | Scoring 4+ a game below usage | 56 | 11.7 | 16.6 | 12.5 | 0.8 | 1.57 | 1.71 | 14 |
| TE | Scoring 4+ a game above usage | 46 | 14.7 | 8.6 | 9.9 | -4.77 | -1.85 | -1.59 | 12 |
| TE | Within 4 of usage | 908 | 10.4 | 10 | 9.5 | -0.94 | -0.08 | -0.42 | 352 |

## E13. Would the site have called this league's real trades right?

- 50 two-team trades with players on both sides, 31 of them from Week 4 on. Where one side clearly won in hindsight (19 trades), the side the site valued higher was the side that won 47.4% of the time; correlation between the site's value gap and the delivered gap: -0.091.
- Accepted player-only trades were rarely even on the site's numbers: the median deal had the smaller side at 54% of the larger, and a quarter were below 37%. The finder's "within 15%" fairness test would have called most real, accepted trades unfair.

The twelve most lopsided trades in hindsight. "Value then" is the site's trade value on the day; "Delivered" is points above a replacement player from the trade to Week 17.

| Season | Week | Side A got | Value then | Delivered | Side B got | Value then | Delivered | Site picked the right side |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | 13 | Jackblacknine: Michael Pittman Jr. + Jameson Williams + Michael Wilson | 20.3 | 80.7 | CadeCermak: George Pickens | 54.2 | 19.4 | no |
| 2026 | 8 | CadeCermak: James Cook III | 52.8 | 22.8 | HyperFire12: Chuba Hubbard + Michael Wilson + Jonah Coleman | 49.7 | 72.1 | no |
| 2025 | 5 | Jackblacknine: George Pickens | 30.5 | 79.8 | CadeCermak: Emeka Egbuka | 22.6 | 30.7 | yes |
| 2026 | 4 | JamesKnowsBalls: Drake London | 34.1 | 27.7 | JohnTerno: Alvin Kamara + DK Metcalf + Jameson Williams | 11.5 | 76.1 | no |
| 2025 | 7 | ColinHill: Omarion Hampton | 12.3 | 14.6 | CadeCermak: George Kittle | 22 | 61.5 | yes |
| 2025 | 4 | ARY3R: James Cook III | 38.6 | 88.5 | Thisowenguy: CeeDee Lamb | 15.1 | 43.1 | yes |
| 2026 | 5 | Thisowenguy: A.J. Brown | 4.4 | 0 | andbums: D'Andre Swift | 33.3 | 43.8 | yes |
| 2025 | 14 | Thisowenguy: Javonte Williams | 38.5 | 6.1 | CadeCermak: Chris Olave | 34.7 | 46.6 | no |
| 2026 | 6 | CadeCermak: Player 5850 | 0 | 43.8 | HyperFire12: Josh Downs | 4.3 | 5.3 | no |
| 2025 | 12 | CMC_and_Bums: Kyle Pitts Sr. + Zay Flowers | 12.2 | 69.8 | CadeCermak: Jameson Williams | 4.8 | 33.4 | yes |
| 2025 | 8 | Jackblacknine: Daniel Jones | 7.3 | 4.5 | CadeCermak: Brock Purdy | 11.7 | 40.6 | yes |
| 2025 | 8 | ARY3R: Travis Kelce + J.K. Dobbins | 8.7 | 38.2 | CMC_and_Bums: Alvin Kamara | 4.7 | 2.3 | yes |

What accepted trades in this league look like.

| Measure | Value |
| --- | --- |
| Trades with players on both sides | 50 |
| Shapes | 1-for-1: 25, 2-for-2: 4, 3-for-3: 2, 1-for-2: 12, 2-for-3: 4, 1-for-3: 3 |
| Included draft picks | 0 |
| Smaller side as a share of the larger (site value), player-only trades: 10th / 25th / median / 75th percentile | 0.19 / 0.37 / 0.54 / 0.78 |
| Most frequent partners | CadeCermak / Jackblacknine (5); CMC_and_Bums / CadeCermak (4); CMC_and_Bums / Thisowenguy (4); Thisowenguy / andbums (3); CadeCermak / HyperFire12 (3) |

## E14. How long are players out, and what are they worth when they return?

- After one missed game, 31.4% were back the next game; after three, 23.5%. 38.1% of players who had missed four games returned at all that season.
- First game back: missed 1 game → 82% of prior scoring, missed 2-3 → 81% of prior scoring, missed 4+ → 77% of prior scoring. Games two and three back: 92%, 94%, 81%.

Skill players averaging 8+ points who missed at least one game, 2022-2026.

| Games missed so far | Cases | Back the very next game % | Back at all that season % | If back: more games missed, on average |
| --- | --- | --- | --- | --- |
| 1 | 512 | 31.4 | 65.6 | 2.2 |
| 2 | 315 | 23.5 | 55.6 | 2.2 |
| 3 | 204 | 23.5 | 49.5 | 2.1 |
| 4 | 139 | 15.8 | 38.1 | 2.1 |
| 5 | 94 | 19.1 | 33 | 1.9 |
| 6 | 67 | 7.5 | 19.4 | 2.1 |

Production after returning, against the four games before the absence.

| Absence | n | First game back (share of before) | Snap share, first game back | Games 2-3 back | n |
| --- | --- | --- | --- | --- | --- |
| Missed 1 game | 161 | 0.82 | 0.91 | 0.92 | 111 |
| Missed 2-3 | 122 | 0.81 | 0.88 | 0.94 | 90 |
| Missed 4+ | 53 | 0.77 | 0.78 | 0.81 | 36 |

By status on the first report after the injury.

| Status the first week out | Cases | Games missed, average | Missed exactly one game % | Returned that season % |
| --- | --- | --- | --- | --- |
| Not on report | 152 | 4.2 | 14.5 | 42.8 |
| Out | 220 | 2.7 | 27.3 | 69.5 |
| Questionable | 106 | 1.5 | 61.3 | 86.8 |
| Doubtful | 34 | 2.7 | 41.2 | 76.5 |

## E14b. Does the projection already allow for a player's first game back?

- Players who played the week before scored 100.2% of their projection; first game back after one missed game 96.2%, after 2-3 86.4%, after 4+ 105.1%. Only the 2-3-game group fell short in both periods, so those players are now valued at 85.6% of projection in their first game back; the other groups are inconsistent between periods and get no extra discount. The projection itself sits at 90.1-80.9% of pre-absence scoring for returning players.

Skill players averaging 7+ points before the absence. Actual points as a share of the projection.

| Situation | n | Projection as % of pre-absence scoring | Actual / projection 2022-24 | Actual / projection 2025-26 | n |
| --- | --- | --- | --- | --- | --- |
| Played last week | 8847 | 93.3 | 101.9 | 96.9 | 2878 |
| Back after 1 game out | 163 | 90.1 | 89.8 | 107.3 | 58 |
| Back after 2-3 | 124 | 94.1 | 87.2 | 84.3 | 32 |
| Back after 4+ | 46 | 80.9 | 104.7 | 106.3 | 13 |

## E15. What are keepers and draft picks worth?

- Value kept year to year: QB 25 or younger 83%, QB 26-29 75%, QB 30-33 71%, QB 34+ 73%, RB 23 or younger 95%, RB 24-25 78%, RB 26-27 75%, RB 28+ 75%, WR 23 or younger 92%, WR 24-26 86%, WR 27-29 78%, WR 30+ 85%.
- Draft picks in this league: round 1 returned 146.9 season points above replacement, round 2 81.8, round 3 62.5; by round 6 it is 19.3.

Players averaging 9+ points one season: what they did the next (2022→23 through 2025→26 to date). "Kept" counts a player who did not play as zero.

| Position | Age | n | Points per game, year 1 | Year 2 (if played) | Share of value kept | Held 85%+ of it % | Did not play 4+ games next year % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 25 or younger | 56 | 15.9 | 16.1 | 0.83 | 66.1 | 17.9 |
| QB | 26-29 | 53 | 16.8 | 18.1 | 0.75 | 52.8 | 30.2 |
| QB | 30-33 | 21 | 15.8 | 15.8 | 0.71 | 47.6 | 28.6 |
| QB | 34+ | 21 | 14.9 | 15.2 | 0.73 | 42.9 | 28.6 |
| RB | 23 or younger | 34 | 14.3 | 14.4 | 0.95 | 70.6 | 5.9 |
| RB | 24-25 | 57 | 13.3 | 11.4 | 0.78 | 45.6 | 8.8 |
| RB | 26-27 | 33 | 15.1 | 12.9 | 0.75 | 45.5 | 12.1 |
| RB | 28+ | 25 | 14.4 | 12.4 | 0.75 | 52 | 12 |
| TE | 24-26 | 18 | 11.8 | 10.3 | 0.87 | 50 | 0 |
| TE | 27-29 | 18 | 11.3 | 9.9 | 0.87 | 50 | 0 |
| TE | 30+ | 18 | 12.1 | 10.6 | 0.77 | 55.6 | 11.1 |
| WR | 23 or younger | 58 | 13.1 | 12.8 | 0.92 | 62.1 | 5.2 |
| WR | 24-26 | 86 | 13.9 | 12.8 | 0.86 | 53.5 | 7 |
| WR | 27-29 | 47 | 13.8 | 11.1 | 0.78 | 40.4 | 4.3 |
| WR | 30+ | 23 | 13.9 | 11.8 | 0.85 | 47.8 | 0 |

This league's drafts (2025 and 2026): what each round returned that season. Points above replacement are scaled to a 17-week season.

| Round | Picks | Points per game | Season points above a replacement player | Beat replacement % | Keepers taken here |
| --- | --- | --- | --- | --- | --- |
| 1 | 18 | 20 | 146.9 | 94.4 | 5 |
| 2 | 18 | 16.3 | 81.8 | 83.3 | 0 |
| 3 | 18 | 15.3 | 62.5 | 77.8 | 0 |
| 4 | 18 | 16.1 | 56.6 | 83.3 | 0 |
| 5 | 18 | 13.3 | 34.1 | 61.1 | 0 |
| 6 | 18 | 13 | 19.3 | 61.1 | 0 |
| 7 | 18 | 13 | 34.1 | 55.6 | 0 |
| 8 | 18 | 11.8 | 29.2 | 55.6 | 0 |
| 9 | 18 | 10.3 | 9.3 | 38.9 | 0 |
| 10 | 18 | 10.4 | 16.2 | 44.4 | 0 |
| 11 | 18 | 9.6 | 2.9 | 22.2 | 0 |
| 12 | 18 | 10.7 | 15.2 | 33.3 | 0 |
| 13 | 18 | 10.5 | 13.1 | 50 | 0 |
| 14 | 18 | 9.8 | 8.1 | 55.6 | 0 |
| 15 | 18 | 9.4 | 10.5 | 33.3 | 0 |
| 16 | 18 | 11.3 | 12.3 | 27.8 | 0 |

## E16. Floor and ceiling: are the ranges honest, and does playing for them help?

- The last-six-games range contained the actual score 35.2% of the time (target 50%); the projection-based range 49.4%. The projection-based range is better calibrated and is now the one shown.
- Posture tiebreak: the higher recent floor avoided a bust 59.4% vs 60.1% for the higher projection; the higher recent ceiling boomed 22.8% vs 23.1%. Recent floors and ceilings add nothing the projection does not, so the posture step is removed.

Hold-out 2025-26. A 25th-75th percentile range should contain the actual score 50% of the time, with 25% below it.

| Position | Last 6 games: inside % | below % | width | Projection-based: inside % | below % | width | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 33.3 | 34.3 | 7.7 | 47.2 | 27.7 | 10.3 | 481 |
| RB | 35 | 30.4 | 7.1 | 50 | 27.3 | 10.4 | 812 |
| WR | 33.9 | 33.7 | 7.1 | 48.4 | 26.5 | 9.8 | 1138 |
| TE | 35.4 | 36.7 | 6.7 | 51.9 | 26.5 | 9.1 | 412 |
| K | 40.3 | 32.4 | 5.1 | 48.5 | 26.4 | 6.3 | 330 |
| DEF | 37.5 | 28 | 5.8 | 52.1 | 27.1 | 7.7 | 336 |
| ALL | 35.2 | 32.7 | 6.8 | 49.4 | 26.9 | 9.4 | 3509 |

Toss-ups (same position, projections within 2): picking by recent floor or ceiling, against keeping the higher projection.

| Pick | Measure | Rate | Pairs |
| --- | --- | --- | --- |
| Higher projection | outscored the other | 53.7 | 15882 |
| Higher recent floor | outscored the other | 51.6 | 14146 |
| Higher recent ceiling | outscored the other | 50 | 14709 |
| Higher recent floor | avoided a bust (under 70% of projection) | 59.4 | 14146 |
| Higher projection | avoided a bust | 60.1 | 14146 |
| Higher recent ceiling | boomed (140%+ of projection) | 22.8 | 14709 |
| Higher projection | boomed | 23.1 | 14709 |

## E17. Does expert consensus beat Sleeper's projection, or improve it?

- Average miss, QB-TE on 2025-26: Sleeper alone 5.86, blended with consensus 5.83. Blend weights on Sleeper (fitted on 2022-24): QB 0%, RB 85%, WR 45%, TE 75%, K 0%, DEF 60%.
- Close calls: RB Sleeper 55%, consensus 55.5%, blend 55.2% (when they disagree the experts were right 50.9% of 984); WR Sleeper 53.4%, consensus 56.1%, blend 55.1% (when they disagree the experts were right 54.9% of 2289); TE Sleeper 52.3%, consensus 52.5%, blend 51.8% (when they disagree the experts were right 50.4% of 417).
- Early week: Wednesday's consensus missed by 5.91 vs 5.88 on Sunday (rank correlation 0.467 vs 0.487); 0.3% of Sunday's ranked players were not yet ranked on Wednesday.
- Rule chosen on 2022-24 alone: average Sleeper's projection 50/50 with the consensus at QB, WR, K, DEF; Sleeper alone at RB, TE. On 2025-26 the 50/50 average was no worse than Sleeper at QB, RB, WR, TE, K.

Hold-out 2025-26, Sunday and Monday games, players ranked by FantasyPros' weekly consensus and projected by Sleeper. Consensus rank is turned into points with a curve per position fitted on 2022-24.

| Position | Method | Avg miss (pts) | Bias | Weekly rank corr. | n |
| --- | --- | --- | --- | --- | --- |
| QB | Sleeper projection (site today) | 6.14 | -0.32 | 0.287 | 433 |
| QB | Expert consensus rank, as points | 6.12 | 0.35 | 0.291 | 433 |
| QB | Blend: 0% Sleeper / 100% consensus | 6.12 | 0.35 | 0.291 | 433 |
| QB | Half and half | 6.1 | 0.02 | 0.304 | 433 |
| QB | FantasyPros' own points (2024+) | 6.12 | 0.05 | 0.291 | 433 |
| RB | Sleeper projection (site today) | 6.09 | -0.2 | 0.457 | 725 |
| RB | Expert consensus rank, as points | 6.1 | 0.16 | 0.457 | 725 |
| RB | Blend: 85% Sleeper / 15% consensus | 6.07 | -0.15 | 0.458 | 725 |
| RB | Half and half | 6.05 | -0.02 | 0.464 | 725 |
| RB | FantasyPros' own points (2024+) | 6.02 | 0.31 | 0.459 | 725 |
| WR | Sleeper projection (site today) | 5.88 | -0.65 | 0.395 | 1009 |
| WR | Expert consensus rank, as points | 5.84 | -0.64 | 0.41 | 1009 |
| WR | Blend: 45% Sleeper / 55% consensus | 5.83 | -0.65 | 0.405 | 1009 |
| WR | Half and half | 5.83 | -0.65 | 0.405 | 1009 |
| WR | FantasyPros' own points (2024+) | 5.82 | -0.47 | 0.408 | 1009 |
| TE | Sleeper projection (site today) | 5.34 | -0.38 | 0.328 | 364 |
| TE | Expert consensus rank, as points | 5.26 | 0.36 | 0.325 | 364 |
| TE | Blend: 75% Sleeper / 25% consensus | 5.3 | -0.2 | 0.327 | 364 |
| TE | Half and half | 5.28 | -0.01 | 0.326 | 364 |
| TE | FantasyPros' own points (2024+) | 5.32 | -0.24 | 0.326 | 364 |
| K | Sleeper projection (site today) | 3.8 | 0.13 | 0.065 | 253 |
| K | Expert consensus rank, as points | 3.74 | 0.63 | 0.132 | 253 |
| K | Blend: 0% Sleeper / 100% consensus | 3.74 | 0.63 | 0.132 | 253 |
| K | Half and half | 3.76 | 0.38 | 0.107 | 253 |
| K | FantasyPros' own points (2024+) | 3.8 | 0.9 | 0.138 | 253 |
| DEF | Sleeper projection (site today) | 4.55 | 0.5 | 0.222 | 287 |
| DEF | Expert consensus rank, as points | 4.69 | -0.69 | 0.19 | 287 |
| DEF | Blend: 60% Sleeper / 40% consensus | 4.56 | 0.03 | 0.234 | 287 |
| DEF | Half and half | 4.57 | -0.09 | 0.228 | 287 |
| DEF | FantasyPros' own points (2024+) | 4.58 | 0.78 | 0.19 | 287 |

Close calls (Sleeper projections within 2 points of each other), 2025-26: how often each source picked the player who scored more. Last columns: only the pairs where Sleeper and the experts disagreed.

| Position | Sleeper % | Consensus % | Blend % | Pairs | Consensus right when they disagree % | Pairs |
| --- | --- | --- | --- | --- | --- | --- |
| RB | 55 | 55.5 | 55.2 | 3173 | 50.9 | 984 |
| WR | 53.4 | 56.1 | 55.1 | 8322 | 54.9 | 2289 |
| TE | 52.3 | 52.5 | 51.8 | 1676 | 50.4 | 417 |

Early week: the consensus as it stood on Wednesday vs Sunday morning, same players (2025-26).

| Version | Avg miss | Weekly rank corr. | n |
| --- | --- | --- | --- |
| Wednesday | 5.91 | 0.467 | 2524 |
| Sunday morning | 5.88 | 0.487 | 2524 |

## E18. A second volume model: ffopportunity expected points vs the site's own

- Rest of season: ffopportunity in place of the site's volume model did not do better (QB 3.5 vs 3.25, RB 3.15 vs 3.1, WR 3.48 vs 3.49, TE 2.83 vs 2.72).
- Next four weeks (buy/sell): QB 4.2 vs 4.2, RB 4 vs 3.99, WR 3.83 vs 3.86, TE 3.43 vs 3.4. No consistent gain.

Hold-out (2025 for rest of season, 2025-26 for next four weeks). Average miss in points per game; lower is better. Volume measures are averaged over the season so far (rest of season) or the last four games (next four).

| Position | Rest of season: season average | Half average, half site volume model | Half average, half ffopportunity | Fitted: average + both | n | Next 4: with site volume model | Next 4: with ffopportunity | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 3.87 | 3.25 | 3.5 | 3.31 | 218 | 4.2 | 4.2 | 356 |
| RB | 3.32 | 3.1 | 3.15 | 3.15 | 314 | 3.99 | 4 | 533 |
| WR | 3.74 | 3.49 | 3.48 | 3.4 | 489 | 3.86 | 3.83 | 743 |
| TE | 2.95 | 2.72 | 2.83 | 2.91 | 203 | 3.4 | 3.43 | 349 |

## E19. Does the experts' rest-of-season ranking improve trade values?

- QB: site value misses by 3.07, experts' ROS rank 3.08, half and half 2.99, fitted blend (0% site) 3.08.
- RB: site value misses by 3.06, experts' ROS rank 3.01, half and half 2.84, fitted blend (50% site) 2.84.
- WR: site value misses by 3, experts' ROS rank 2.77, half and half 2.8, fitted blend (45% site) 2.79.
- TE: site value misses by 2.7, experts' ROS rank 2.65, half and half 2.56, fitted blend (30% site) 2.56.
- Rule chosen on 2022-24 (blend where it beat the site value by more than 0.02 a game): QB blend, RB blend, WR blend, TE blend. Confirmed on 2025 at: RB, WR, TE.

Predicting points per game from that week to Week 17, taken at Weeks 4-11. Fitted on 2022-24, hold-out 2025; healthy players who went on to play 3+ games and had an expert ROS rank. Last column: rank correlation with points scored in Weeks 15-17 alone.

| Position | Method | Avg miss (pts/game) | Rank corr. | Rank corr., Weeks 15-17 | n |
| --- | --- | --- | --- | --- | --- |
| QB | Site value today | 3.07 | 0.46 | 0.367 | 180 |
| QB | Expert ROS rank, as points | 3.08 | 0.48 | 0.305 | 180 |
| QB | Half and half | 2.99 | 0.479 | 0.328 | 180 |
| QB | Fitted: 0% site | 3.08 | 0.48 | 0.305 | 180 |
| RB | Site value today | 3.06 | 0.795 | 0.618 | 282 |
| RB | Expert ROS rank, as points | 3.01 | 0.812 | 0.649 | 282 |
| RB | Half and half | 2.84 | 0.817 | 0.649 | 282 |
| RB | Fitted: 50% site | 2.84 | 0.817 | 0.649 | 282 |
| WR | Site value today | 3 | 0.739 | 0.582 | 352 |
| WR | Expert ROS rank, as points | 2.77 | 0.77 | 0.576 | 352 |
| WR | Half and half | 2.8 | 0.77 | 0.589 | 352 |
| WR | Fitted: 45% site | 2.79 | 0.774 | 0.594 | 352 |
| TE | Site value today | 2.7 | 0.655 | 0.41 | 125 |
| TE | Expert ROS rank, as points | 2.65 | 0.716 | 0.339 | 125 |
| TE | Half and half | 2.56 | 0.704 | 0.381 | 125 |
| TE | Fitted: 30% site | 2.56 | 0.715 | 0.364 | 125 |

## E20. Would the site's waiver suggestions have helped?

- The site's top waiver suggestion gained 8.8 lineup points over three weeks on average and helped 87.3% of the time. The best-projected free agent gained 5.1; managers' actual adds 9.5 (786 adds). Doing nothing: 0.
- By tier: Tier 1 (riser) 12.2 (n=7), Tier 2 (riser) 7.5 (n=28), Tier 3 (riser) 8.9 (n=131).
- Ranking candidates: best rule on 2025 was "Site order (tier, then impact)" (9.4), which gained 8.5 on 2026; the site's own order gained 9.4 and 8.5.

Every team-week, Weeks 3-14 of this league's 2025 and 2026 seasons. Gain = best-lineup points over the next three weeks with real scores, the add in and the suggested drop out, against the roster as it stood.

| Move | Team-weeks | Lineup points gained, next 3 weeks (avg) | 90% range | Helped % | Added 10+ points % |
| --- | --- | --- | --- | --- | --- |
| Site's top suggestion | 166 | 8.8 | 7 to 10.6 | 87.3 | 38.6 |
| Naive: best-projected free agent | 166 | 5.1 | 3.5 to 7.5 | 55.4 | 21.7 |
| Naive: best season average free agent | 148 | 7.2 | 4.3 to 10.1 | 58.8 | 31.8 |
| Managers' actual adds (each add) | 786 | 9.5 |  | 74.8 | 40.3 |
| Doing nothing | 166 | 0 |  | 0 | 0 |
| Injured stash (separately, over 8 weeks) | 148 | 1.7 |  | 13.5 | 12.2 |

Site suggestions by tier and group. Last column: how often the player the site said to drop then outscored the player it said to add.

| Tier | n | Avg gain | Helped % | Drop outscored the add % |
| --- | --- | --- | --- | --- |
| Tier 1 (riser) | 7 | 12.2 | 85.7 | 0 |
| Tier 2 (riser) | 28 | 7.5 | 85.7 | 11.1 |
| Tier 3 (riser) | 131 | 8.9 | 87.8 | 6.3 |

Which rule picks the best of the site's candidates? Average gain of the top pick, 2025 and 2026 separately.

| Ranking rule | 2025 avg gain | n | 2026 avg gain | n |
| --- | --- | --- | --- | --- |
| Site order (tier, then impact) | 9.4 | 96 | 8.5 | 70 |
| Impact this week only | 9.3 | 96 | 8.5 | 70 |
| Recent scoring (last 3) | 3 | 96 | 2 | 70 |
| Season average | 2.9 | 96 | 5 | 70 |
| Projection this week | 8.6 | 96 | 8.5 | 70 |
| Impact + 0.3 x last 3 | 3.7 | 96 | 4.2 | 70 |

## E20b. Waiver tiers on synthetic leagues, 2022-2025

- Current tiers on held-out 2025: tier 1 25.6 (n=49), tier 2 15 (n=56), tier 3 8.9 (n=605) points over three weeks.
- Best cut-offs on 2022-24: tier 1 at impact 2, tier 2 at 1.

10-team leagues drafted by projection; every team, Weeks 3-14 (480 team-weeks). Gain = best-lineup points over three weeks with real scores. Fit on 2022-24, checked on 2025.

| Rule | Top claim gain 2022-24 | Top claim gain 2025 | Tier 1 / 2 / 3 gain, 2025 | n |
| --- | --- | --- | --- | --- |
| Current (tier 1 at impact 3, tier 2 at 1) | 17.4 | 16.4 | 25.6 / 15 / 8.9 | 49 / 56 / 605 |
| Best on 2022-24 (tier 1 at 2, tier 2 at 1) | 17.4 | 16.4 | 23.3 / 12.7 / 8.9 | 72 / 33 / 605 |
| Projection only, no tiers | 14.3 | 14.4 |  |  |

## N1. News scanner: how well does it read headlines?

- Development set: 100% of 143 checks correct (71.3% before the fixes this set prompted, so this number is no longer independent).
- Second set, labelled after the first round of fixes: 76% of 31 checks were correct when first scored (status 74%: four of the five status misses were another player's news pinned on the named one). The clause rule and three more patterns were then added, so it is now 100% and also no longer independent.
- Second fresh set (live headlines from 13 Nov, labelled before scoring): 89.2% of 37 checks correct when first scored, status 100%. Its four misses (good-news practice wording, two opinion pieces) were then fixed; it now scores 100%.
- Fresh set (live headlines, labelled after every earlier fix): 78.3% of 46 checks correct when first scored. That is the honest number. Its ten misses were then fixed too, so it now scores 100%; the next batch of labelled headlines gives the next honest number.

71 labelled headlines for the classifier, 18 for the matcher (backtest/news-golden.json). Precision: when it says something, how often it is right. Recall: of the headlines that say something, how many it catches.

| Field | Cases | Correct % | Precision % | Recall % |
| --- | --- | --- | --- | --- |
| status | 71 | 100 | 100 | 100 |
| practice | 24 | 100 | 100 | 100 |
| speculative | 8 | 100 | 100 | 100 |
| injury | 12 | 100 | 100 | 100 |
| better | 10 | 100 | 100 | 100 |
| held-out status | 19 | 100 | 100 | 100 |
| held-out better | 6 | 100 | 100 | 100 |
| held-out practice | 2 | 100 | 100 | 100 |
| held-out injury | 4 | 100 | 100 | 100 |
| fresh status | 27 | 100 | 100 | 100 |
| fresh injury | 8 | 100 | 100 | 100 |
| fresh practice | 2 | 100 | 100 | 100 |
| fresh better | 5 | 100 | 100 | 100 |
| fresh speculative | 4 | 100 | 100 | 100 |
| fresh2 status | 20 | 100 |  |  |
| fresh2 speculative | 5 | 100 | 100 | 100 |
| fresh2 better | 3 | 100 | 100 | 100 |
| fresh2 injury | 8 | 100 | 100 | 100 |
| fresh2 practice | 1 | 100 | 100 | 100 |
| matcher | 18 | 100 | 100 | 100 |

Every miss (each is a test case to fix or a known limit).

| Field | Headline | Expected | Got |
| --- | --- | --- | --- |

