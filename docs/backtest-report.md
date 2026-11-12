# Backtest report: how the site's advice did on 2022–2026, and what changed

Run 2026-11-12 (NFL Week 10). Reproduce with `npm run backtest`. Every table behind the numbers
below is in [`docs/backtest/tables-current.md`](backtest/tables-current.md); the engine as it stood
before this work is in [`tables-before.md`](backtest/tables-before.md).

## Method in five lines

- **Data:** Sleeper's projections and stats for every week of 2022–2026 (to Week 9 of 2026), the
  NFL's official injury reports with practice status, closing betting lines and wind, depth charts,
  and this league's own 2025 and 2026 seasons (lineups, 50 two-team trades, both drafts).
- **Replay:** for each past week the harness rebuilds what the site would have known beforehand and
  runs the site's real code on it (`buildRipple`, `matchupFor`, `buildModel`, `buildValues`).
- **No peeking:** numbers were fitted on 2022–2024 and judged on 2025–2026. A test checks the
  replay never reads the week it predicts.
- **Against the obvious alternative:** each rule is compared with doing the naive thing, and with
  chance. A rule that didn't beat that was removed.
- **One known best case:** Sleeper's archive keeps the *final pre-kickoff* projections, after
  inactives were announced. The lineup replay therefore shows what the site says 90 minutes before
  kickoff, not on Tuesday.

## Scorecard

| Advice | Before | After | The naive alternative | Verdict |
| --- | --- | --- | --- | --- |
| Weekly lineup (208 team-weeks in this league) | +2.21 pts/week over the lineup managers set | +2.23 (90% range 0.59 to 4.05); your team +4.7 | Managers: 87.5% of a perfect lineup; site 89.1% | Works. Unchanged by this round: the gain comes from following the projection |
| Start/sit labels | 4-point "Clear", 2-point "Lean" for every position | Same for RB/WR/TE (68% and 59–63% measured); smaller cut-offs for K, DEF; QB lean at 3 | Coin flip 50% | Labels were honest for skill positions, wrong for K/DEF. Fixed; each label now shows its measured rate |
| Tiebreak: position matchup | Used | **Removed** | Won 50.0% of 11,051 toss-ups | Did not work |
| Tiebreak: implied team total | Used at any 1-point gap | Used only at 4+ points | 52.4% overall, 54.5% at 4+ | Weak; kept only where it showed something |
| Questionable starter | Full projection | 91% of projection if active; chance to play by practice status and position; swap call when the fallback plays first | — | Old rule ignored a 30% chance of a zero |
| Teammate estimates, RB out | Right 66.5%, sized 2× too big (est. +6.4 carries, actual +3.2) | Right 68.8%, sized right (+3.3 vs +3.4) | Chance 43% | Works, now correctly sized |
| Teammate estimates, WR/TE out | Right 43%, sized 4.5× too big | Right 48–55%, far fewer and smaller | Chance 37% | Weak signal; labelled toss-up |
| Teammate estimates, QB out | −10% top target, −20% others | 0% and −10% | Top target scored 99% of expected, others 89% | Old rule too harsh |
| Confidence labels on estimates | "clear" 43.5%, "lean" 51.5%, "toss" 53.3% (upside down) | lean 66%, toss 52% | — | Fixed: the label now tracks accuracy |
| Win probability | Brier 0.245; said 75% when the side won 59% | 0.235; says 74%, wins 73% | Coin flip 0.250 | Was barely better than guessing; now calibrated |
| Next man up (RB) | Depth chart order | Recent work first | Depth chart led the backfield 71%, recent work 78%; when they disagreed 25% vs 55% | Changed |
| Trade values (rest-of-season pts/game miss) | QB 3.43, RB 3.15, WR 2.93, TE 2.45 | 3.07, 3.00, 2.87, 2.21 | Season average: 3.82, 3.26, 3.31, 2.68 | Better at every position |
| Trade values: injured players | IR counted as 50% of healthy, Out 85%, Questionable 97% | 8–27%, 62%, 83% | Measured: IR players played 9–30% of remaining games | Largest single error found |
| Trade verdicts on this league's real trades | Right side in 12 of 19 | 9 of 17 | — | **Unproven.** Too few trades to tell either from luck |

## What the other tools do, and where this one stands

| Area | Others | This site, after this round |
| --- | --- | --- |
| Projections | FantasyPros averages many sources; independent comparisons (2012–2016) found averages beat any single source | Still one source (Sleeper/RotoWire). Blending it with season averages or volume-based numbers gained under 0.03 points, so no blend was added. A true second source is the open gap |
| Injury tags | Footballguys publishes chance-to-play by tag (Questionable ~71%, Doubtful ~5–7%) | Own measurement agrees (70%, 1%) and goes further: by practice status, position and injury, plus scoring when active |
| Matchups | 4for4 schedule-adjusts points allowed; Establish the Run regresses WR/TE harder | Tested raw, schedule-adjusted and shrunk versions. None predicted RB/WR/TE results once the projection was known; schedule adjustment did not help. Shown for QBs only |
| Buy low / sell high | PFF and others publish expected points | Added: volume-based expected points and a Buy/Hold/Sell tag, sized from what happened next |
| Ranges | Down Field publishes 15th–85th percentile ranges | Still the middle half of the last six games (not rebuilt) |
| Track record | FantasyPros ranks experts; Scout-Squad keeps receipts | Added: every lineup call is logged and scored; Track record page shows live and backtest numbers |
| Weather | Paid tools carry wind | Measured (QB −2.0, K −1.3 at 15+ mph) but no free wind forecast to act on |
| Trades | Down Field scores both teams' odds | Same idea, plus measured health odds, per-team playoff weighting, picks and keepers valued |

## Findings, by experiment

**E1 — Projections.** Sleeper's number misses by 5.3–6.2 points per player-week for skill positions
(K 4.0, DEF 4.6) and orders players well (weekly rank correlation 0.30–0.46; K 0.10, which is close
to no skill at all). Season average, last three games, the old trade-value blend, volume-based
expected points and a fitted blend of all of them were each no better. *Consequence:* the planned
"second opinion" blend was dropped.

**E2 — Labels.** For RB/WR/TE (and across FLEX), the higher projection won 52% at a gap under 1
point, 56% at 1–2, 59% at 2–3, 63% at 3–4, 68% at 4–5, 74% at 6–8 and 85% at 10+. For defenses a
2-point gap already won 66%; kicker projections barely separate at all. *Consequence:* cut-offs by
position, and the measured rate is shown with every call.

**E3 — Tiebreaks.** In toss-ups, simply keeping the higher projection won 54%. The softer position
matchup won 50.0%. The higher implied team total won 52.4% (54.5% when the totals were 4+ apart).
The untagged player beat a Questionable one 54%.

**E4 — Injury tags.** 868 Questionable cases among relevant skill players: 70% played (68% in the
hold-out seasons). After a full final practice 90%, limited 68%, none 55%. Questionable
quarterbacks played 42%. Doubtful: 1 of 100. Those who played scored 90–92% of their projection.
By injury: hamstring 59% played, knee 65%, ankle 69%, back/ribs 79%.

**E5 — Teammate estimates.** Players drift back toward their average whether or not anything
happened, so every estimate is scored against what similar players on quiet teams did. On that
basis only running-back carries were a strong signal. Vacated targets mostly do not land on any
one teammate (average real gain +0.5 where the site said +2.3). This-season "with/without" splits
built on one or two games ran 3–4× too large. Returning receivers had no measurable effect on
teammates; returning backs took back about 40% of what the split implied.

**E6 — Matchup strength.** Against a player's own average, the opponent's points allowed mattered
for quarterbacks (correlation 0.17–0.20) and barely for anyone else (RB 0.03–0.08, WR about 0, TE
0.04–0.05). Against the projection it was worth 0.01 overall. Schedule-adjusting made it worse,
not better.

**E7 — Win probability.** Tested on every pair of teams in every week (578 pairs) because 74 real
matchups are too few. The season-average method was overconfident; pulling team averages 40% of
the way to the league mean fixed it. With projected lineups the right spread between two teams is
48 points.

**E8 — Lineup replay.** See the scorecard. By manager in 2026 the site lineup beat eight of ten.
Managers started a player who didn't play once every 19 team-weeks.

**E9 — Next man up.** 90 cases of a lead back ruled out. Either pick averaged about 13 points
against 8.1 for a replacement-level back, so the handcuff add is real.

**E10 — Environment.** Implied totals explain team output (correlation 0.41) but add almost
nothing once the projection is known (0.03). Wind of 15+ mph outdoors: QB −2.0, K −1.3, TE −1.0,
WR −0.7, RB −0.7 points against projection (49–183 cases each).

**E11 — Trade values.** Results in the scorecard. Health: of players averaging 7+ points, a healthy
one played 87% of the remaining games; Questionable 79%; officially Out 57%; just placed on injured
reserve 23%; on it for 2–3 games 29%; four or more 9%. Scoring when back was 74–90% of before.

**E12 — Buy low / sell high.** "Volume-based expected points" here means what a player's targets,
air yards on catches, carries and red-zone work normally produce; it leaves out touchdowns and
yards after the catch. Players scoring 4+ a game above it dropped 3.8–4.8 a game over the next
month, about 1 point more than an ordinary hot streak cools (−0.5 to −1.8 in the hold-out
seasons). Players 4+ below gained 0.8–3.9. Adding it to recent points cut the next-month miss for
RB (3.95 → 3.79), WR (3.79 → 3.68) and TE (3.60 → 3.51), not QB.

**E13 — This league's trades.** Accepted deals are rarely even on the site's values: the median had
the smaller side at 45% of the larger, a quarter under 34%. The old "within 15% is fair" test
would have called most real, accepted trades unfair. Shapes: 25 one-for-one, 12 one-for-two.
No trade in two seasons included a draft pick.

**E14 — Returns.** After one missed game 31% were back the next week; after three, 23%; of players
who had missed four, 39% returned at all that season. First game back: 77–80% of prior scoring;
games two and three: 92–94% (81% after a 4+ game absence).

**E15 — Keepers and picks.** Value kept the next season: RB 23 or younger 94%, 24–25 78%, 26+ 74%;
WR 23 or younger 92%, 24–26 86%, 27–29 76%; QB 25 or younger 83%, 30+ 70%. This league's drafts
returned 141 season points above replacement in round 1, 82 in round 2, 60 in round 3 (18 picks
each: a small sample).

## What changed in the code

| Change | Where |
| --- | --- |
| All measured numbers in one place, each citing its experiment; a test compares them with the saved results | `public/js/fitted.js`, `test/fitted.test.mjs` |
| Labels by position with measured win rate; tiebreak order; Questionable value, chance to play, swap call; win probability; next man up | `public/js/model.js` |
| Teammate rules resized; labels track accuracy; track record attached to each estimate | `public/js/ripple.js` |
| Trade values: health by status and games missed, half volume-based, playoff weeks by each team's odds, Buy/Hold/Sell, pick and keeper values | `public/js/values.js` |
| One rest-of-season answer on both trade pages; roster-spot credit in 2-for-1s; acceptance judged against this league's accepted deals; veto warning; finder ranks by title odds gained | `public/js/views/finder.js`, `views/trades.js` |
| Official injury report (practice + game status) as a direct source | `lib/nflverse.js`, `lib/snapshot.js` |
| Every lineup call logged and scored; Track record page | `lib/calls.js`, `public/js/views/track.js` |
| Matchup label shown for QBs only | `public/js/views/lineup.js` |
| The harness itself | `backtest/` |

## Not solved

- **A second projection source.** The evidence that averaging helps is from other people's studies;
  it could not be tested here because only Sleeper's projections are archived. This is the most
  valuable thing still missing.
- **Early-week accuracy.** The archive holds final projections only, so how good the site's advice
  is on Tuesday or Friday is unmeasured. The live call log will answer it from now on.
- **Trade verdicts.** 17–19 decided trades cannot show whether the new values judge trades better
  (12 of 19 before, 9 of 17 after; both are within noise of each other and of a coin).
- **Acceptance.** Only accepted trades are recorded. Without the offers that were refused, the
  acceptance number remains a heuristic, now anchored to what this league has accepted.
- **Headline classifier.** No archive of past headlines, so no backtest. A labelled evaluation set
  and a measure of how far headlines lag the official report were planned and not built.
- **Ranges.** Floor and ceiling still come from the last six games.
- **Wind.** Measured, but ESPN's feed carries temperature and conditions only.
- **Season simulation.** Later weeks use the corrected team averages; only this week's win
  probability uses projected lineups.
- **Cross-check against Down Field.** The finder's top deals were not compared with Down Field's
  `evaluate_moves` in this round.
- **Playoff-schedule adjustment for trades.** Dropped: matchup strength showed no signal to build
  it on, except weakly for quarterbacks.

## Sources

[R-bloggers projection comparisons](https://r-bloggers.com/?p=117620) ·
[Datascope on ESPN bias](https://datascopeanalytics.com/blog/which-site-has-the-best-fantasy-football-projections/) ·
[Footballguys chance to play](https://www.footballguys.com/article/2025-chance-to-play-questionable-vs-doubtful) ·
[4for4 on defenses repeating](https://www.4for4.com/2026/preseason/do-defenses-repeat-fantasy-football-performances) ·
[Establish the Run DvP](https://establishtherun.com/establish-the-run-nfl-dvp/) ·
[Fantasy Footballers sticky stats](https://www.thefantasyfootballers.com/articles/whats-sticky-statistics-you-can-rely-on-for-fantasy-football/) ·
[FantasyPros Start/Sit Assistant](https://fantasypros.com/nfl/myplaybook/start-sit-assistant) ·
data from Sleeper and [nflverse](https://github.com/nflverse/nflverse-data) (CC BY 4.0).
