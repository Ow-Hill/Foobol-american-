# Backtest tables (before)

Generated 2026-11-12 by `npm run backtest`. Seasons 2022-2026; constants are fitted on 2022, 2023, 2024 and judged on 2025, 2026.

## E1. How accurate are the numbers the engine ranks on?

- QB: Sleeper's projection misses by 6.22 points on average; the best alternative (Projection 75% + usage 25%) misses by 6.2 (0.03 better).
- RB: Sleeper's projection misses by 6.14 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 6.14 (no better).
- WR: Sleeper's projection misses by 5.83 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 5.83 (no better).
- TE: Sleeper's projection misses by 5.33 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 5.33 (no better).
- K: Sleeper's projection misses by 4 points on average; the best alternative (Fitted blend of all) misses by 3.98 (0.01 better).
- DEF: Sleeper's projection misses by 4.56 points on average; the best alternative (Sleeper projection (what the site uses)) misses by 4.56 (no better).

Hold-out seasons 2025-2026, players who played, weeks 4-17. Lower miss is better; rank correlation is how well the method ordered players within a week.

| Position | Method | Avg miss (pts) | Bias | Weekly rank corr. | n |
| --- | --- | --- | --- | --- | --- |
| QB | Sleeper projection (what the site uses) | 6.22 | -0.48 | 0.295 | 457 |
| QB | Season average | 6.7 | -0.07 | 0.178 | 457 |
| QB | Last 3 games | 6.88 | -0.09 | 0.169 | 457 |
| QB | Trade-value blend (values.js) | 6.28 | -0.31 | 0.254 | 457 |
| QB | Usage-based expected points | 6.53 | 1.4 | 0.151 | 457 |
| QB | Projection 75% + usage 25% | 6.2 | -0.01 | 0.281 | 457 |
| QB | Fitted blend of all | 6.25 | -0.39 | 0.27 | 457 |
| RB | Sleeper projection (what the site uses) | 6.14 | -0.14 | 0.461 | 774 |
| RB | Season average | 6.41 | 0.77 | 0.39 | 774 |
| RB | Last 3 games | 6.82 | 0.2 | 0.332 | 774 |
| RB | Trade-value blend (values.js) | 6.18 | 0.12 | 0.441 | 774 |
| RB | Usage-based expected points | 6.32 | 0.63 | 0.391 | 774 |
| RB | Projection 100% + usage 0% | 6.14 | -0.14 | 0.461 | 774 |
| RB | Fitted blend of all | 6.25 | -0.56 | 0.456 | 774 |
| WR | Sleeper projection (what the site uses) | 5.83 | -0.64 | 0.395 | 1084 |
| WR | Season average | 6.15 | -0.19 | 0.312 | 1084 |
| WR | Last 3 games | 6.48 | -0.42 | 0.284 | 1084 |
| WR | Trade-value blend (values.js) | 5.88 | -0.49 | 0.373 | 1084 |
| WR | Usage-based expected points | 6.2 | -0.38 | 0.324 | 1084 |
| WR | Projection 100% + usage 0% | 5.83 | -0.64 | 0.395 | 1084 |
| WR | Fitted blend of all | 5.83 | -0.59 | 0.391 | 1084 |
| TE | Sleeper projection (what the site uses) | 5.33 | -0.32 | 0.331 | 392 |
| TE | Season average | 5.63 | -0.37 | 0.224 | 392 |
| TE | Last 3 games | 6.19 | -0.76 | 0.148 | 392 |
| TE | Trade-value blend (values.js) | 5.47 | -0.42 | 0.277 | 392 |
| TE | Usage-based expected points | 5.64 | -0.09 | 0.185 | 392 |
| TE | Projection 100% + usage 0% | 5.33 | -0.32 | 0.331 | 392 |
| TE | Fitted blend of all | 5.4 | -0.7 | 0.33 | 392 |
| K | Sleeper projection (what the site uses) | 4 | -0.01 | 0.096 | 314 |
| K | Season average | 4.09 | -0.31 | 0.18 | 314 |
| K | Last 3 games | 4.54 | -0.32 | 0.086 | 314 |
| K | Trade-value blend (values.js) | 4 | -0.12 | 0.142 | 314 |
| K | Projection 100% + average 0% | 4 | -0.01 | 0.096 | 314 |
| K | Fitted blend of all | 3.98 | 0.5 | -0.011 | 314 |
| DEF | Sleeper projection (what the site uses) | 4.56 | 0.25 | 0.186 | 320 |
| DEF | Season average | 5.11 | 0.71 | -0.026 | 320 |
| DEF | Last 3 games | 5.48 | 0.65 | -0.025 | 320 |
| DEF | Trade-value blend (values.js) | 4.74 | 0.44 | 0.039 | 320 |
| DEF | Projection 100% + average 0% | 4.56 | 0.25 | 0.186 | 320 |
| DEF | Fitted blend of all | 4.66 | -0.49 | 0.165 | 320 |

## E2. Are Clear / Lean / Toss-up honest?

- RB / WR / TE (same position): a 2-3 point edge won 59.2% of the time, a 4-5 point edge 68%, 10+ 85.1%.
- FLEX (RB vs WR vs TE): a 2-3 point edge won 59.2% of the time, a 4-5 point edge 67.6%, 10+ 84.7%.
- QB: a 2-3 point edge won 57.9% of the time, a 4-5 point edge 64.1%, 10+ 93.3%.
- K: a 2-3 point edge won 66.7% of the time, a 4-5 point edge null%, 10+ null%.
- DEF: a 2-3 point edge won 66.4% of the time, a 4-5 point edge 88.9%, 10+ null%.

RB / WR / TE (same position): how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.5 | 19660 | 51.6 | 8467 | 50.6-52.6 |
| 1-2 | 57.4 | 17569 | 56.4 | 7530 | 55-57.9 |
| 2-3 | 60.5 | 15127 | 59.2 | 6317 | 57.4-60.5 |
| 3-4 | 64.1 | 13042 | 62.9 | 5529 | 61-64.7 |
| 4-5 | 67.8 | 10906 | 68 | 4899 | 66.3-69.9 |
| 5-6 | 70.6 | 8413 | 68.1 | 4063 | 65.5-70.2 |
| 6-8 | 75.3 | 10569 | 74 | 5813 | 72.2-75.2 |
| 8-10 | 80.2 | 5573 | 77.3 | 3406 | 75.5-79.2 |
| 10-+ | 83.9 | 3899 | 85.1 | 3799 | 83-87.3 |

FLEX (RB vs WR vs TE): how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.9 | 47797 | 51.4 | 21993 | 51.1-51.9 |
| 1-2 | 56.4 | 45029 | 55.9 | 19912 | 55.1-56.8 |
| 2-3 | 60.6 | 40121 | 59.2 | 17400 | 58.1-60.2 |
| 3-4 | 63.8 | 34592 | 63.3 | 15002 | 61.9-65.3 |
| 4-5 | 68.1 | 29509 | 67.6 | 12917 | 66.2-69.1 |
| 5-6 | 70.6 | 23661 | 69 | 10428 | 67.2-70.7 |
| 6-8 | 74.5 | 30645 | 74.1 | 15350 | 72.6-75.5 |
| 8-10 | 79.4 | 15899 | 78 | 9133 | 76.6-79.7 |
| 10-+ | 83.5 | 11186 | 84.7 | 10320 | 83-86.8 |

QB: how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 52.2 | 2543 | 52.5 | 1276 | 50.3-55 |
| 1-2 | 58.3 | 2101 | 58.6 | 1198 | 55.2-62.1 |
| 2-3 | 58.3 | 1858 | 57.9 | 952 | 54.4-61.7 |
| 3-4 | 61.8 | 1417 | 63.4 | 729 | 58.2-68.2 |
| 4-5 | 68.2 | 1103 | 64.1 | 552 | 60-68.9 |
| 5-6 | 71.1 | 836 | 68.5 | 352 | 63.5-74.5 |
| 6-8 | 74.3 | 1099 | 73.3 | 356 | 66.8-79.6 |
| 8-10 | 82.3 | 479 | 84.1 | 82 | 77.1-92.3 |
| 10-+ | 87 | 138 | 93.3 | 15 | 90-100 |

K: how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.9 | 3374 | 51.6 | 1725 | 48.6-54.3 |
| 1-2 | 49.7 | 1140 | 57.9 | 444 | 50.2-65.7 |
| 2-3 | 56.6 | 182 | 66.7 | 75 | 49.3-80 |
| 3-4 | 0 | 6 | 100 | 1 | 100-100 |
| 4-5 |  | 0 |  | 0 | null-null |
| 5-6 |  | 0 |  | 0 | null-null |
| 6-8 |  | 0 |  | 0 | null-null |
| 8-10 |  | 0 |  | 0 | null-null |
| 10-+ |  | 0 |  | 0 | null-null |

DEF: how often the player with the higher Sleeper projection outscored the other, by size of the gap.

| Gap (pts) | Win % 2022-24 | pairs | Win % 2025-26 | pairs | 90% range |
| --- | --- | --- | --- | --- | --- |
| 0-1 | 51.8 | 2544 | 54.1 | 1201 | 51.4-56.6 |
| 1-2 | 60.7 | 1540 | 57.9 | 793 | 53.1-63 |
| 2-3 | 63.8 | 547 | 66.4 | 241 | 55.7-75.7 |
| 3-4 | 71.4 | 98 | 72 | 25 | 47.1-85 |
| 4-5 | 66.7 | 30 | 88.9 | 9 | 75-100 |
| 5-6 | 66.7 | 15 | 94.4 | 18 | 88.9-100 |
| 6-8 |  | 0 |  | 0 | null-null |
| 8-10 |  | 0 |  | 0 | null-null |
| 10-+ |  | 0 |  | 0 | null-null |

## E3. Does each tiebreak step pick the winner?

- In toss-ups (projections within 2 points), the higher implied team total won 52.4% (54.5% when 4+ apart); the softer position matchup won 50%; the untagged player beat a Questionable one 54% of the time counting sit-outs as zero.

Same-position pairs projected within 2 points of each other. 50% = coin flip.

| Tiebreak | Win % 2022-24 | pairs | Win % 2025-26 | pairs |
| --- | --- | --- | --- | --- |
| Keep the higher projection (what happens with no tiebreak) | 54.4 | 41873 | 54 | 18471 |
| Health: pick the player with no tag over a Questionable one (sat out = 0) | 52.6 | 5725 | 54 | 1835 |
| Health: same, only when both ended up playing | 52.5 | 5705 | 54 | 1835 |
| Game environment: pick the higher implied team total | 50.7 | 40470 | 52.4 | 17856 |
| Game environment: only when the totals differ by 4+ | 51.5 | 17233 | 54.5 | 8112 |
| Position matchup: pick the softer opponent (site rule) | 51 | 24914 | 50 | 11051 |

## E4. What does an injury tag really mean?

- Fantasy-relevant Questionable players played 69.7% of the time and scored 85% of their own average when they did, so a Questionable tag is worth about 59.2% of a normal week. Doubtful: played 1%.
- Practice status moves it a lot: FP 89.8% played, LP 68.3% played, DNP 55% played.
- None of the Questionable players who sat out still has a projection in Sleeper's stored numbers: the archive keeps the final pre-kickoff version, after inactives were announced. Any replay that uses it already "knows" who sat.
- When Questionable players did play, they scored -1.09 points vs their projection on average.

Official game-status report, skill players averaging 6+ points, 2022-2026.

| Tag | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Questionable | 868 | 69.7 | 70.3 | 68.1 | 0.85 | 0.96 | 0.59 |
| Doubtful | 100 | 1 | 1.1 | 0 | 0.51 | 0.77 | 0.01 |
| Out | 625 | 0 | 0 | 0 |  |  |  |

Questionable only, by final practice status of the week.

| Last practice | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FP | 128 | 89.8 | 87.5 | 96.9 | 0.85 | 1 | 0.76 |
| LP | 597 | 68.3 | 69.7 | 64.6 | 0.87 | 0.95 | 0.59 |
| DNP | 129 | 55 | 55.4 | 53.6 | 0.76 | 0.91 | 0.42 |

Questionable only, by position.

| Position | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 115 | 41.7 | 46.5 | 27.6 | 0.86 | 1 | 0.36 |
| RB | 216 | 71.3 | 70.7 | 73.1 | 0.9 | 0.96 | 0.64 |
| WR | 433 | 74.6 | 75.1 | 73.2 | 0.82 | 0.96 | 0.61 |
| TE | 104 | 76.9 | 76.5 | 77.8 | 0.87 | 0.9 | 0.67 |

Questionable only, by injury.

| Injury | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ankle | 127 | 69.3 | 68.4 | 71.9 | 0.8 | 0.91 | 0.55 |
| Knee | 125 | 64.8 | 64.8 | 64.7 | 0.83 | 0.89 | 0.54 |
| Groin/hip/quad | 112 | 71.4 | 72.1 | 69.2 | 0.93 | 1 | 0.66 |
| Hamstring | 91 | 59.3 | 56.7 | 66.7 | 0.86 | 0.96 | 0.51 |
| Back/ribs/core | 90 | 78.9 | 79.4 | 77.3 | 0.91 | 1.04 | 0.72 |
| Shoulder | 79 | 65.8 | 64.9 | 68.2 | 0.87 | 1.03 | 0.57 |
| Other | 74 | 67.6 | 73.1 | 54.5 | 0.68 | 0.83 | 0.46 |
| Foot/toe | 64 | 76.6 | 86.7 | 52.6 | 0.89 | 0.99 | 0.68 |
| Illness/rest | 50 | 78 | 78.8 | 76.5 | 0.81 | 0.88 | 0.63 |
| Concussion | 32 | 62.5 | 60.7 | 75 | 0.88 | 1.16 | 0.55 |

Questionable only, position and practice status together.

| Position + practice | n | Played % | 2022-24 | 2025-26 | Points vs own average when playing | Snap share vs usual | Expected share of normal output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WR LP | 285 | 74.7 | 75.8 | 71.8 | 0.81 | 0.96 | 0.61 |
| RB LP | 142 | 69.7 | 69.8 | 69.4 | 0.95 | 0.96 | 0.66 |
| QB LP | 91 | 36.3 | 42.6 | 17.4 | 0.9 | 1 | 0.33 |
| TE LP | 79 | 79.7 | 80.8 | 77.8 | 0.9 | 0.88 | 0.72 |
| WR DNP | 77 | 59.7 | 61.7 | 52.9 | 0.75 | 0.92 | 0.45 |
| WR FP | 65 | 90.8 | 88 | 100 | 0.9 | 1 | 0.81 |
| RB FP | 36 | 91.7 | 88.9 | 100 | 0.85 | 0.99 | 0.78 |
| RB DNP | 33 | 54.5 | 51.9 | 66.7 | 0.72 | 0.89 | 0.39 |

## E5. Were the teammate (ripple) estimates right?

- 3375 teammate estimates scored against what the same players would have been expected to do with no news. Overall: right direction 49.5%, wrong 35.5%; pure chance would be 43.5%.
- Running back out → carries for the remaining backs: right 66.5%, wrong 29.7%, chance 43.1%. This is the one strong rule.
- Receiver or tight end out → targets for teammates: WR right 43.3%, wrong 40.4%, chance 37.2%; TE right 43.6%, wrong 39.6%, chance 37.2%. The average estimate was +2.31 targets; the average real change was 0.51.
- Quarterback out → pass catchers down: right 52.1%, wrong 30.3%, chance 49.6%. Top target scored 98.9% of his expected points (site assumes 90%), the others 89.1% (site assumes 80%).
- Confidence labels: clear 43.5% right (n=889), lean 51.5% right (n=2210), toss 53.3% right (n=276). The label the site calls its surest is not its most accurate.
- "Seen this season" evidence vs the share rule: Share rule (heuristic): 52% right, average miss 4.18; Seen this season (with/without split): 43.8% right, average miss 3.31.
- Refit, WR/TE out: a teammate gains 0.126 of his proportional share of the vacated targets, plus 0.104 of all of them if he is the next man up (site: 0.75 and 0.25). On 2025-26 the refit misses by 1.66 targets vs 1.75 for the site rule and 1.65 for "no change".
- Refit, RB out: remaining backs gain 0.313 of their proportional share of the vacated carries, and the lead remaining back an extra 0.047 of all of them. Refit misses by 3.42 carries vs 4.35 (site rule) and 4.27 ("no change").

By rule. "Right" means the player moved the predicted way by more than half a target or carry (1.5 points for percentage estimates) relative to his expected level with no news. "Chance" is how often a similar player on a quiet team moved that way anyway.

| Rule | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| out WR → targets | 935 | 43.3 | 40.4 | 37.2 | 43.7 | 382 | 2.31 | 0.51 | 2.85 | 2.06 |
| out QB → pass catchers (points) | 891 | 52.1 | 30.3 | 49.6 | 49.3 | 292 | -1.51 | -0.71 | 4.73 | 4.94 |
| return WR → targets | 332 | 48.2 | 34.9 | 47.9 | 50.8 | 122 | -2.43 | -0.11 | 2.74 | 1.87 |
| out TE → targets | 280 | 43.6 | 39.6 | 37.2 | 41.3 | 92 | 2.12 | 0.51 | 2.98 | 2.24 |
| out RB → carries | 269 | 66.5 | 29.7 | 43.1 | 74.7 | 87 | 6.39 | 3.23 | 5.4 | 4.91 |
| return RB → targets | 172 | 44.8 | 37.8 | 47.9 | 53.8 | 26 | -2.3 | 0.45 | 3.08 | 2.09 |
| out QB → backup QB starts | 116 | 57.8 | 29.3 | 33.8 | 59.1 | 44 |  |  |  |  |
| return WR → carries | 93 | 44.1 | 49.5 | 49.5 | 35.1 | 37 | -5.45 | 1.35 | 7.47 | 4.58 |
| return TE → targets | 80 | 48.8 | 33.8 | 47.9 | 50 | 24 | -2.48 | 0.11 | 3.01 | 2 |
| return RB → carries | 69 | 76.8 | 21.7 | 49.5 | 73.3 | 15 | -6.48 | -2.52 | 5.29 | 4.06 |
| out RB → targets | 51 | 27.5 | 54.9 | 37.2 | 0 | 11 | 1.7 | -0.06 | 3.25 | 1.73 |
| return TE → carries | 22 | 50 | 45.5 | 49.5 | 50 | 4 | -4.74 | 0.16 | 5.88 | 3.77 |

By the confidence label the site shows.

| Label | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clear | 889 | 43.5 | 40.3 | 38.1 | 45 | 338 | 2.9 | 0.78 | 3.3 | 2.29 |
| lean | 2210 | 51.5 | 33.8 | 45.6 | 50.6 | 743 | -0.96 | 0.02 | 3.99 | 3.51 |
| toss | 276 | 53.3 | 33.3 | 44 | 44.6 | 74 | 0.8 | 0.44 | 4.16 | 4.07 |

Out events: this-season with/without evidence vs the share rule.

| Basis | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Share rule (heuristic) | 1482 | 52 | 33.1 | 45.2 | 50.1 | 509 | 0.32 | 0.08 | 4.18 | 4.19 |
| Seen this season (with/without split) | 944 | 43.8 | 39.9 | 38.2 | 44.8 | 355 | 2.89 | 0.77 | 3.31 | 2.28 |

Out events: by size of the estimate.

| Size | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estimate 3+ a game | 506 | 53.2 | 36.4 | 39.5 | 56.3 | 197 | 5.87 | 1.82 | 5.16 | 3.5 |
| Estimate 1.5-3 | 519 | 45.1 | 41 | 37.9 | 46.4 | 196 | 2.03 | 0.68 | 2.67 | 2.23 |
| Estimate under 1.5 | 510 | 42.5 | 39.2 | 37.4 | 38 | 179 | 1.05 | 0.42 | 2.19 | 2.03 |

Out events (non-QB): by how much work the missing player had.

| Missing player | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Missing player had 14+ touches/targets a game | 166 | 63.9 | 29.5 | 41.8 | 62.5 | 56 | 6.3 | 3.33 | 5.54 | 4.74 |
| 8-14 | 445 | 48.5 | 38.9 | 39.1 | 53.7 | 149 | 3.28 | 1.14 | 3.5 | 2.86 |
| under 8 | 924 | 43.1 | 40.6 | 37.2 | 42.2 | 367 | 2.22 | 0.46 | 2.86 | 2.06 |

Out events: how the absence was known.

| Source | n | Right direction % | Wrong % | Chance % | Right % 2025-26 | n | Avg estimate | Avg actual change | Avg miss of estimate | Avg miss of "no change" |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Not on report (IR / early rule-out) | 1159 | 48 | 36.4 | 44.4 | 46.6 | 421 | 0.62 | 0.06 | 4.24 | 3.8 |
| Official Out / Doubtful | 1267 | 49.6 | 35.1 | 40.6 | 49.2 | 443 | 1.96 | 0.62 | 3.48 | 3.13 |

Why a baseline is needed: similar players on teams with no news, change vs their own last three games (raw) and vs the fitted expectation (adjusted).

| Measure | n | Raw: up % | Raw: down % | Adjusted: up % | Adjusted: down % |
| --- | --- | --- | --- | --- | --- |
| Targets | 5604 | 34.7 | 51.7 | 37.2 | 47.9 |
| Carries | 1904 | 39.4 | 52.9 | 43.1 | 49.5 |
| Points | 6154 | 32.9 | 49.8 | 33.8 | 49.6 |

## E6. Does matchup strength predict anything?

- Against a player's own average, the site's matchup number has a correlation of 0.055 with over/under-performance (soft vs tough third: 1.65 points). Best variant: "Raw, season to date" at 0.061 (1.28 points).
- Against Sleeper's projection the same number is worth 0.011 correlation (0.62 points soft vs tough): some signal is left after the projection.
- By position (best variant, vs own average): QB 0.195, RB 0.032, WR 0.022, TE 0.053.

How a player did relative to (a) his own season average and (b) Sleeper's projection, against the opponent's rating. Tier gap = soft third minus tough third, in points. Hold-out 2025-26 unless marked.

| Matchup measure | Pos | Corr. vs own average | Tier gap vs own average | Corr. vs projection 2022-24 | Corr. vs projection | Tier gap vs projection | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Raw points allowed, last 6 weeks (site today) | QB | 0.165 | 4.48 | 0.024 | 0.053 | 1.6 | 417 |
| Raw points allowed, last 6 weeks (site today) | RB | 0.077 | 1.95 | 0.062 | 0.017 | 0.56 | 699 |
| Raw points allowed, last 6 weeks (site today) | WR | -0.008 | 0.59 | 0.015 | -0.01 | 0.33 | 983 |
| Raw points allowed, last 6 weeks (site today) | TE | 0.041 | 0.96 | 0.016 | 0.002 | 0.46 | 354 |
| Raw points allowed, last 6 weeks (site today) | ALL | 0.055 | 1.65 | 0.03 | 0.011 | 0.62 | 2453 |
| Raw, season to date | QB | 0.195 | 4.4 | 0.045 | 0.068 | 1.43 | 417 |
| Raw, season to date | RB | 0.032 | 0.55 | 0.069 | -0.033 | -0.87 | 699 |
| Raw, season to date | WR | 0.022 | 0.78 | 0.012 | 0.02 | 0.53 | 983 |
| Raw, season to date | TE | 0.053 | 0.61 | 0.03 | 0.008 | 0.03 | 354 |
| Raw, season to date | ALL | 0.061 | 1.28 | 0.036 | 0.012 | 0.24 | 2453 |
| Schedule-adjusted, last 6 weeks | QB | 0.137 | 2.69 | 0.021 | 0.056 | 0.92 | 417 |
| Schedule-adjusted, last 6 weeks | RB | 0.044 | 0.68 | 0.043 | -0.018 | -0.78 | 699 |
| Schedule-adjusted, last 6 weeks | WR | 0.013 | 0.44 | 0.034 | 0.009 | 0.32 | 983 |
| Schedule-adjusted, last 6 weeks | TE | -0.031 | -1.17 | 0.003 | -0.057 | -1.32 | 354 |
| Schedule-adjusted, last 6 weeks | ALL | 0.039 | 0.72 | 0.03 | 0.001 | -0.1 | 2453 |
| Schedule-adjusted, season to date | QB | 0.159 | 3.86 | 0.022 | 0.068 | 1.6 | 417 |
| Schedule-adjusted, season to date | RB | -0.008 | -0.42 | 0.05 | -0.07 | -1.6 | 699 |
| Schedule-adjusted, season to date | WR | 0.031 | 0.44 | 0.011 | 0.024 | 0.2 | 983 |
| Schedule-adjusted, season to date | TE | 0.004 | -0.22 | 0.028 | -0.029 | -0.7 | 354 |
| Schedule-adjusted, season to date | ALL | 0.04 | 0.74 | 0.026 | -0.002 | -0.18 | 2453 |
| Schedule-adjusted + shrunk, season to date | QB | 0.159 | 3.83 | 0.021 | 0.068 | 1.62 | 417 |
| Schedule-adjusted + shrunk, season to date | RB | -0.007 | -0.32 | 0.05 | -0.069 | -1.52 | 699 |
| Schedule-adjusted + shrunk, season to date | WR | 0.032 | 0.46 | 0.011 | 0.025 | 0.22 | 983 |
| Schedule-adjusted + shrunk, season to date | TE | 0.002 | -0.35 | 0.028 | -0.031 | -0.84 | 354 |
| Schedule-adjusted + shrunk, season to date | ALL | 0.04 | 0.75 | 0.026 | -0.002 | -0.16 | 2453 |

## E7. Is the win probability any good?

- The site's current win probability scores 0.245 over both seasons against 0.25 for a coin flip, barely better than guessing. It is overconfident: when it gave a side 70-80%, that side won 59.3% of the time.
- Best spread for the projected-lineup method: 37.5 points fitted on 2025, 55 on 2026, 48 on both. The season-average method is best pulled 40% of the way to 50/50.
- Measured directly, the gap between two teams' actual and projected scores has a spread of 35.6 points. On the 74 real matchups alone: site today 0.251, projected lineups 0.215.

Brier score: 0.25 is a coin flip, lower is better. Every pair of teams in each regular-season week from Week 4 (the real matchups are too few to test on their own). Anything fitted is fitted on the other season.

| Method | Brier 2025 | Picked winner % 2025 | games | Brier 2026 | Picked winner % 2026 | games | Brier, both |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coin flip | 0.25 | 50.6 | 308 | 0.25 | 50.7 | 270 | 0.25 |
| Site today: season scoring averages | 0.244 | 62.7 | 308 | 0.245 | 59.6 | 270 | 0.245 |
| Site today, pulled toward 50% (strength fitted on the other season) | 0.233 | 62.7 | 308 | 0.236 | 59.6 | 270 | 0.235 |
| Projected lineups (spread fitted on the other season) | 0.231 | 63 | 308 | 0.235 | 61.9 | 270 | 0.233 |
| Projected lineups, spread 48 points (fitted on both) | 0.23 | 63 | 308 | 0.232 | 61.9 | 270 | 0.231 |

Site today: when it said X%, how often did that side win? (both seasons)

| Stated chance | games | Average stated | Actually won |
| --- | --- | --- | --- |
| 50-60% | 164 | 55 | 57.3 |
| 60-70% | 155 | 64.7 | 58.1 |
| 70-80% | 140 | 75 | 59.3 |
| 80-100% | 119 | 86.4 | 73.1 |

Projected lineups with a 48-point spread, same check.

| Stated chance | games | Average stated | Actually won |
| --- | --- | --- | --- |
| 50-60% | 292 | 54.7 | 56.2 |
| 60-70% | 207 | 64.8 | 66.7 |
| 70-80% | 72 | 74.5 | 73.6 |
| 80-100% | 7 | 82.7 | 85.7 |

## E8. Would the site's lineup have beaten the one actually set?

- Across 208 team-weeks the site's lineup scored 2.21 points a week more than the lineup the manager set (90% range 0.66 to 3.94). For your team: 4.21 (-0.1 to 8.64).
- Managers reached 87.5% of the perfect lineup, the site 89.1%.
- Managers started 0.05 players a week who did not play; the site lineup 0.01. Caveat: Sleeper's stored projections are the final pre-kickoff ones, so the site lineup here knows about Sunday-morning inactives. It is what the site would say if checked 90 minutes before each game, not on Tuesday.
- Check on the scorer: my re-scored lineup totals differ from Sleeper's official ones by 0.15 points a week on average.

Every team-week in this league, Weeks 2-17 of 2025 and 2026 to date. "Site lineup" is the best legal lineup by the site's own rules, from that week's roster, built before kickoff.

| Team-weeks | n | Lineup actually set | Site lineup | Perfect lineup | Site minus actual | 90% range | Site better % | Site worse % | Actual as % of perfect | Site as % of perfect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All teams, 2025-2026 | 208 | 135.1 | 137.3 | 154.3 | 2.21 | 0.66 to 3.94 | 36.5 | 29.8 | 87.5 | 89.1 |
| All teams, 2025 | 128 | 135.6 | 138.4 | 157.2 | 2.77 | 0.62 to 5.2 | 35.9 | 31.3 | 86.1 | 88 |
| All teams, 2026 | 80 | 134.1 | 135.5 | 149.7 | 1.33 | 0.15 to 2.33 | 37.5 | 27.5 | 89.9 | 90.7 |
| Your team | 24 | 150 | 154.2 | 166.8 | 4.21 | -0.1 to 8.64 | 41.7 | 25 | 90.2 | 92.6 |
| Your team, 2026 | 8 | 146.2 | 149.8 | 163.2 | 3.59 | -4.62 to 10.86 | 50 | 25 | 90.2 | 92.4 |

2026 by manager: points per week left on the table against the site lineup.

| Manager | weeks | Actual | Site lineup | Site minus actual | Actual as % of perfect | Starters who did not play, per week |
| --- | --- | --- | --- | --- | --- | --- |
| Thisowenguy | 8 | 146.2 | 149.8 | 3.59 | 90.2 | 0 |
| andbums | 8 | 129.1 | 132.2 | 3 | 88.5 | 0.13 |
| HyperFire12 | 8 | 127 | 129.9 | 2.86 | 92.7 | 0 |
| MWrighter38 | 8 | 125.1 | 127.4 | 2.24 | 89.5 | 0 |
| ColinHill | 8 | 143.1 | 145 | 1.95 | 91.1 | 0 |
| CadeCermak | 8 | 146.4 | 147.9 | 1.5 | 88.4 | 0 |
| JamesKnowsBalls | 8 | 136.9 | 138.3 | 1.35 | 90.5 | 0 |
| JohnTerno | 8 | 110.3 | 110.9 | 0.55 | 88.5 | 0 |
| ARY3R | 8 | 144 | 142.7 | -1.31 | 89.1 | 0 |
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

- A team's implied total explains its skill-position fantasy output with correlation 0.408 (each implied point is worth about 2.57 team fantasy points).
- After Sleeper's projection, the implied total adds 0.033 correlation (high-total vs low-total teams: 0.75 points per player); against a player's own average it adds 0.019.
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

- QB: the site's value misses rest-of-season points per game by 3.43; best method is "Half site value, half usage" at 3.08.
- RB: the site's value misses rest-of-season points per game by 3.15; best method is "Half site value, half usage" at 2.96.
- WR: the site's value misses rest-of-season points per game by 2.93; best method is "Half site value, half usage" at 2.83.
- TE: the site's value misses rest-of-season points per game by 2.45; best method is "Half site value, half usage" at 2.28.
- Health factors are far from what the site assumes: Questionable: played 79.2% of remaining games (site assumes 97%); Doubtful: played 59.1% of remaining games (site assumes 92%); Out (official), first or second week: played 56.5% of remaining games (site assumes 85%); Out, already missed 2+: played 57.8% of remaining games (site assumes 85%); Off the report, just went down: played 23.1% of remaining games (site assumes 50%); Off the report, missed 2-3: played 29.5% of remaining games (site assumes 50%); Off the report, missed 4+ (long-term IR): played 9% of remaining games (site assumes 50%).

Predicting a player's points per game from that week to Week 17, taken at Weeks 4-11. Hold-out season 2025; healthy players who went on to play 3+ games.

| Position | Method | Avg miss (pts/game) | Bias | Rank corr. | n |
| --- | --- | --- | --- | --- | --- |
| QB | Site value today (values.js) | 3.43 | -1.67 | 0.439 | 183 |
| QB | Season average | 3.82 | -1.54 | 0.395 | 183 |
| QB | Last 3 games | 4.49 | -1.88 | 0.402 | 183 |
| QB | This week's projection | 4.77 | 0.34 | 0.333 | 183 |
| QB | Usage-based expected points | 3.1 | 0.12 | 0.419 | 183 |
| QB | Half site value, half usage | 3.08 | -0.77 | 0.467 | 183 |
| QB | Season average + usage (fitted) | 3.35 | -1.32 | 0.401 | 183 |
| QB | Fitted blend of all | 3.31 | -1.28 | 0.406 | 183 |
| RB | Site value today (values.js) | 3.15 | -0.55 | 0.792 | 295 |
| RB | Season average | 3.26 | -0.01 | 0.796 | 295 |
| RB | Last 3 games | 3.88 | -0.47 | 0.731 | 295 |
| RB | This week's projection | 3.95 | 0.62 | 0.649 | 295 |
| RB | Usage-based expected points | 3.11 | 0.52 | 0.803 | 295 |
| RB | Half site value, half usage | 2.96 | -0.01 | 0.817 | 295 |
| RB | Season average + usage (fitted) | 3.04 | 0.82 | 0.808 | 295 |
| RB | Fitted blend of all | 3.03 | 0.6 | 0.802 | 295 |
| WR | Site value today (values.js) | 2.93 | -1.24 | 0.803 | 407 |
| WR | Season average | 3.31 | -1.21 | 0.754 | 407 |
| WR | Last 3 games | 3.63 | -1.44 | 0.755 | 407 |
| WR | This week's projection | 3.55 | 0.02 | 0.649 | 407 |
| WR | Usage-based expected points | 2.97 | -0.8 | 0.768 | 407 |
| WR | Half site value, half usage | 2.83 | -1.02 | 0.797 | 407 |
| WR | Season average + usage (fitted) | 2.93 | -0.61 | 0.768 | 407 |
| WR | Fitted blend of all | 2.92 | -0.67 | 0.769 | 407 |
| TE | Site value today (values.js) | 2.45 | -0.39 | 0.848 | 163 |
| TE | Season average | 2.68 | -0.25 | 0.807 | 163 |
| TE | Last 3 games | 3.14 | -0.68 | 0.774 | 163 |
| TE | This week's projection | 2.93 | 0.75 | 0.672 | 163 |
| TE | Usage-based expected points | 2.32 | 0.34 | 0.801 | 163 |
| TE | Half site value, half usage | 2.28 | -0.03 | 0.827 | 163 |
| TE | Season average + usage (fitted) | 2.62 | -0.38 | 0.802 | 163 |
| TE | Fitted blend of all | 2.58 | -0.45 | 0.823 | 163 |

Health: share of the remaining games (to Week 17) actually played, by status when the value was taken. Players averaging 7+ points.

| Status at the time | n | Games played % | 2022-24 | 2025 | Points per game when back vs before | Site assumes |
| --- | --- | --- | --- | --- | --- | --- |
| Healthy | 3113 | 86.8 | 86.6 | 87.5 | 0.93 | 1 |
| Questionable | 219 | 79.2 | 80.8 | 72.9 | 0.84 | 0.97 |
| Doubtful | 24 | 59.1 | 61.4 | 10 | 1.01 | 0.92 |
| Out (official), first or second week | 113 | 56.5 | 57.5 | 53.6 | 0.88 | 0.85 |
| Out, already missed 2+ | 34 | 57.8 | 56.6 | 59.5 | 0.91 | 0.85 |
| Off the report, just went down | 110 | 23.1 | 24.8 | 18.7 | 0.77 | 0.5 |
| Off the report, missed 2-3 | 82 | 29.5 | 33.1 | 17.9 | 0.73 | 0.5 |
| Off the report, missed 4+ (long-term IR) | 38 | 9 | 8.7 | 9.7 | 0.75 | 0.5 |

## E12. Do buy-low / sell-high signals work?

- QB: usage carries weight 0.4 next to 0.33 for recent points. Players running 4+ above their usage dropped 3.78 a game over the next month (0.88 more than an ordinary hot streak). Players 4+ below gained 3.87 (0.69 beyond the usual).
- RB: usage carries weight 0.44 next to 0.32 for recent points. Players running 4+ above their usage dropped 4.34 a game over the next month (0.92 more than an ordinary hot streak). Players 4+ below gained 1.45 (1.91 beyond the usual).
- WR: usage carries weight 0.34 next to 0.36 for recent points. Players running 4+ above their usage dropped 3.75 a game over the next month (0.7 more than an ordinary hot streak). Players 4+ below gained 0.8 (1.57 beyond the usual).
- TE: usage carries weight 0.38 next to 0.22 for recent points. Players running 4+ above their usage dropped 4.8 a game over the next month (1.88 more than an ordinary hot streak). 

Next four weeks' points per game predicted from the last four games' points (T) and what the usage in those games would normally produce (X). Weights fitted 2022-24; misses on 2025-26.

| Position | Weight on recent points | Weight on usage | Miss: assume he keeps scoring the same | Miss: recent points, regressed | Miss: points + usage | Miss: + season average and snap trend | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 0.33 | 0.4 | 4.59 | 4.04 | 4.03 | 3.98 | 333 |
| RB | 0.32 | 0.44 | 4.21 | 3.95 | 3.79 | 3.71 | 530 |
| WR | 0.36 | 0.34 | 4.11 | 3.79 | 3.68 | 3.78 | 750 |
| TE | 0.22 | 0.38 | 3.85 | 3.6 | 3.51 | 3.4 | 336 |

What happened next to players scoring well above or below their usage. "Beyond the usual pull-back" removes the ordinary drift back to average that any hot or cold player shows.

| Position | Group | n | Last 4: points | Last 4: usage says | Next 4: points | Change | Beyond the usual pull-back | Same, 2025-26 | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QB | Scoring 4+ a game above usage | 215 | 23.4 | 17 | 19.6 | -3.78 | -0.88 | -1.84 | 84 |
| QB | Within 4 of usage | 723 | 16.6 | 16.5 | 17.2 | 0.5 | -0.13 | -0.28 | 217 |
| QB | Scoring 4+ a game below usage | 100 | 11.8 | 17.2 | 15.7 | 3.87 | 0.69 | -0.05 | 32 |
| RB | Scoring 4+ a game above usage | 179 | 19.5 | 13.4 | 15.2 | -4.34 | -0.92 | -0.48 | 62 |
| RB | Within 4 of usage | 1354 | 12.5 | 12.4 | 11.8 | -0.7 | 0.12 | 0.26 | 448 |
| RB | Scoring 4+ a game below usage | 81 | 11.6 | 16.6 | 13 | 1.45 | 1.91 | 3.38 | 20 |
| WR | Scoring 4+ a game above usage | 137 | 18 | 12.7 | 14.3 | -3.75 | -0.7 | -1.3 | 34 |
| WR | Within 4 of usage | 2238 | 11.7 | 11.7 | 10.7 | -0.91 | -0.15 | -0.47 | 702 |
| WR | Scoring 4+ a game below usage | 56 | 11.7 | 16.6 | 12.5 | 0.8 | 1.57 | 1.71 | 14 |
| TE | Scoring 4+ a game above usage | 46 | 14.7 | 8.6 | 9.9 | -4.8 | -1.88 | -1.67 | 12 |
| TE | Within 4 of usage | 879 | 10.4 | 10 | 9.6 | -0.85 | 0.01 | -0.21 | 323 |

## E13. Would the site have called this league's real trades right?

- 50 two-team trades with players on both sides, 31 of them from Week 4 on. Where one side clearly won in hindsight (19 trades), the side the site valued higher was the side that won 63.2% of the time; correlation between the site's value gap and the delivered gap: 0.176.
- Accepted player-only trades were rarely even on the site's numbers: the median deal had the smaller side at 54% of the larger, and a quarter were below 33%. The finder's "within 15%" fairness test would have called most real, accepted trades unfair.

The twelve most lopsided trades in hindsight. "Value then" is the site's trade value on the day; "Delivered" is points above a replacement player from the trade to Week 17.

| Season | Week | Side A got | Value then | Delivered | Side B got | Value then | Delivered | Site picked the right side |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | 13 | Jackblacknine: Michael Pittman Jr. + Jameson Williams + Michael Wilson | 32.6 | 76 | CadeCermak: George Pickens | 60.9 | 18.2 | no |
| 2025 | 4 | ARY3R: James Cook III | 67.8 | 85.7 | Thisowenguy: CeeDee Lamb | 5.2 | 37.8 | yes |
| 2026 | 6 | CadeCermak: Player 5850 | 0 | 43.8 | HyperFire12: Josh Downs | 4.2 | 0.7 | no |
| 2025 | 7 | ColinHill: Omarion Hampton | 24.5 | 12.9 | CadeCermak: George Kittle | 28.8 | 55.6 | yes |
| 2026 | 4 | JamesKnowsBalls: Drake London | 34.5 | 19.6 | JohnTerno: Alvin Kamara + DK Metcalf + Jameson Williams | 11.5 | 62.1 | no |
| 2025 | 5 | Jackblacknine: George Pickens | 47.5 | 70.4 | CadeCermak: Emeka Egbuka | 27.2 | 28.4 | yes |
| 2025 | 14 | Thisowenguy: Javonte Williams | 24.6 | 4.3 | CadeCermak: Chris Olave | 32.9 | 45.4 | yes |
| 2026 | 5 | Thisowenguy: A.J. Brown | 4.4 | 0 | andbums: D'Andre Swift | 36.6 | 40.9 | yes |
| 2025 | 12 | CMC_and_Bums: Kyle Pitts Sr. + Zay Flowers | 16.2 | 68.2 | CadeCermak: Jameson Williams | 22.7 | 32.9 | no |
| 2026 | 8 | CadeCermak: James Cook III | 61.8 | 11.6 | HyperFire12: Chuba Hubbard + Michael Wilson + Jonah Coleman | 68.6 | 46.7 | yes |
| 2025 | 8 | Jackblacknine: Daniel Jones | 7.9 | 3.5 | CadeCermak: Brock Purdy | 7.8 | 37 | no |
| 2025 | 8 | ARY3R: Travis Kelce + J.K. Dobbins | 13.7 | 32.6 | CMC_and_Bums: Alvin Kamara | 4.8 | 1.6 | yes |

What accepted trades in this league look like.

| Measure | Value |
| --- | --- |
| Trades with players on both sides | 50 |
| Shapes | 1-for-1: 25, 2-for-2: 4, 3-for-3: 2, 1-for-2: 12, 2-for-3: 4, 1-for-3: 3 |
| Included draft picks | 0 |
| Smaller side as a share of the larger (site value), player-only trades: 10th / 25th / median / 75th percentile | 0.15 / 0.33 / 0.54 / 0.82 |
| Most frequent partners | CadeCermak / Jackblacknine (5); CMC_and_Bums / CadeCermak (4); CMC_and_Bums / Thisowenguy (4); Thisowenguy / andbums (3); CadeCermak / HyperFire12 (3) |

## E14. How long are players out, and what are they worth when they return?

- After one missed game, 30.9% were back the next game; after three, 23.3%. 39.1% of players who had missed four games returned at all that season.
- First game back: missed 1 game → 78% of prior scoring, missed 2-3 → 80% of prior scoring, missed 4+ → 77% of prior scoring. Games two and three back: 92%, 94%, 81%.

Skill players averaging 8+ points who missed at least one game, 2022-2026.

| Games missed so far | Cases | Back the very next game % | Back at all that season % | If back: more games missed, on average |
| --- | --- | --- | --- | --- |
| 1 | 505 | 30.9 | 65.1 | 2.2 |
| 2 | 306 | 24.2 | 56.5 | 2.2 |
| 3 | 202 | 23.3 | 49 | 2.1 |
| 4 | 133 | 16.5 | 39.1 | 2.1 |
| 5 | 92 | 18.5 | 32.6 | 1.9 |
| 6 | 66 | 7.6 | 19.7 | 2.1 |

Production after returning, against the four games before the absence.

| Absence | n | First game back (share of before) | Snap share, first game back | Games 2-3 back | n |
| --- | --- | --- | --- | --- | --- |
| Missed 1 game | 156 | 0.78 | 0.9 | 0.92 | 111 |
| Missed 2-3 | 121 | 0.8 | 0.88 | 0.94 | 87 |
| Missed 4+ | 52 | 0.77 | 0.78 | 0.81 | 36 |

By status on the first report after the injury.

| Status the first week out | Cases | Games missed, average | Missed exactly one game % | Returned that season % |
| --- | --- | --- | --- | --- |
| Not on report | 148 | 4.2 | 14.2 | 42.6 |
| Out | 218 | 2.6 | 27.1 | 69.3 |
| Questionable | 105 | 1.5 | 60 | 85.7 |
| Doubtful | 34 | 2.7 | 38.2 | 73.5 |

## E15. What are keepers and draft picks worth?

- Value kept year to year: QB 25 or younger 83%, QB 26-29 75%, QB 30-33 70%, QB 34+ 73%, RB 23 or younger 94%, RB 24-25 78%, RB 26-27 74%, RB 28+ 74%, WR 23 or younger 92%, WR 24-26 86%, WR 27-29 76%, WR 30+ 85%.
- Draft picks in this league: round 1 returned 141.1 season points above replacement, round 2 82.5, round 3 60.5; by round 6 it is 18.4.

Players averaging 9+ points one season: what they did the next (2022→23 through 2025→26 to date). "Kept" counts a player who did not play as zero.

| Position | Age | n | Points per game, year 1 | Year 2 (if played) | Share of value kept | Held 85%+ of it % | Did not play 4+ games next year % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QB | 25 or younger | 56 | 15.9 | 16.1 | 0.83 | 66.1 | 17.9 |
| QB | 26-29 | 53 | 16.8 | 18.1 | 0.75 | 52.8 | 30.2 |
| QB | 30-33 | 21 | 15.8 | 15.5 | 0.7 | 47.6 | 28.6 |
| QB | 34+ | 21 | 14.9 | 15.2 | 0.73 | 42.9 | 28.6 |
| RB | 23 or younger | 34 | 14.3 | 14.2 | 0.94 | 70.6 | 5.9 |
| RB | 24-25 | 57 | 13.3 | 11.4 | 0.78 | 43.9 | 8.8 |
| RB | 26-27 | 33 | 15.1 | 13.1 | 0.74 | 45.5 | 15.2 |
| RB | 28+ | 25 | 14.4 | 12.1 | 0.74 | 48 | 12 |
| TE | 24-26 | 18 | 11.8 | 10.5 | 0.89 | 50 | 0 |
| TE | 27-29 | 18 | 11.3 | 9.9 | 0.87 | 55.6 | 0 |
| TE | 30+ | 18 | 12.1 | 10.7 | 0.78 | 55.6 | 11.1 |
| WR | 23 or younger | 58 | 13.1 | 12.7 | 0.92 | 63.8 | 5.2 |
| WR | 24-26 | 86 | 13.9 | 12.8 | 0.86 | 52.3 | 7 |
| WR | 27-29 | 47 | 13.8 | 11.2 | 0.76 | 42.6 | 6.4 |
| WR | 30+ | 23 | 13.9 | 11.8 | 0.85 | 47.8 | 0 |

This league's drafts (2025 and 2026): what each round returned that season. Points above replacement are scaled to a 17-week season.

| Round | Picks | Points per game | Season points above a replacement player | Beat replacement % | Keepers taken here |
| --- | --- | --- | --- | --- | --- |
| 1 | 18 | 19.6 | 141.1 | 94.4 | 5 |
| 2 | 18 | 16.2 | 82.5 | 77.8 | 0 |
| 3 | 18 | 15.2 | 60.5 | 77.8 | 0 |
| 4 | 18 | 16 | 57.4 | 83.3 | 0 |
| 5 | 18 | 13.5 | 36.9 | 66.7 | 0 |
| 6 | 18 | 12.8 | 18.4 | 55.6 | 0 |
| 7 | 18 | 13.1 | 35.5 | 61.1 | 0 |
| 8 | 18 | 11.3 | 25.2 | 50 | 0 |
| 9 | 18 | 10.3 | 9.7 | 38.9 | 0 |
| 10 | 18 | 10.3 | 15.2 | 44.4 | 0 |
| 11 | 18 | 9.5 | 1 | 11.1 | 0 |
| 12 | 18 | 10.6 | 13.1 | 33.3 | 0 |
| 13 | 18 | 10.4 | 12.9 | 50 | 0 |
| 14 | 18 | 9.9 | 8.7 | 50 | 0 |
| 15 | 18 | 9.4 | 9.3 | 33.3 | 0 |
| 16 | 18 | 10.9 | 11.6 | 38.9 | 0 |
