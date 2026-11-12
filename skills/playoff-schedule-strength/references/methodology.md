# Methodology Reference

## Why playoff weeks only, not season-long strength of schedule
Season-long SOS is close to noise by the time you're making a trade-deadline
decision — you only get 3 (sometimes 2) fantasy playoff games. What matters
is specifically whether your roster's NFL matchups during *those* weeks are
favorable, not their average across 17 games. This skill deliberately
ignores every other week.

## Rank convention (kept consistent everywhere in this skill)
1 = toughest defense (fewest fantasy points allowed to that position),
32 = easiest (most allowed). A **higher** average rank faced during the
playoff weeks is a **more favorable** matchup for your player.

## Position weighting
- **QB / WR / TE**: scored almost entirely on opponent pass-defense rank
  (90/10 in favor of pass D), since that's the primary driver of their
  fantasy output.
- **RB**: blended 55% run-defense rank / 45% pass-defense rank. Pure
  rushers lean more run-defense-driven; PPR receiving work means pass
  defense still matters. This blend is a simplification — a true model
  would weight it per-player by that RB's actual target share (this skill
  doesn't have that data; `ff-ml-projections`'s weighted-opportunity feature
  does, and combining the two is a natural next step).
- **K / DEF**: not scored. Kicker output depends on game script and total
  scoring environment, not a single defensive rank; team defense scoring
  depends on the opposing offense, which is a different analysis this skill
  doesn't attempt.

## Why labels (Favorable/Neutral/Tough), not point projections
Defensive rank data is directionally real but noisy — a team's rank-8 pass
defense in Week 10 isn't a precise predictor of Week 16 output, especially
with injuries and scheme changes between now and the playoffs. Presenting a
specific point-total adjustment would imply more precision than defensive
rankings can support. A three-tier label is honest about that.

## Why this doesn't hard-code playoff weeks or a trade deadline
Every league's settings differ, and even connected-platform APIs can return
stale season state (a real example encountered while building this: a
connected Sleeper league showed `seasonPhase: "playoffs_in_progress"` with
every team at 0-0 for the *new* season — clearly carried-over state from the
prior year that hadn't refreshed). Trusting a hard-coded assumption or an
unverified API field silently would produce confidently wrong playoff-week
scoring. Confirming explicitly (Step 0) costs one question or one extra
tool call and prevents that failure mode entirely.

## Known limitations
- Defensive rankings are a proxy for opponent strength, not a full model —
  no adjustment for the specific starting QB throwing to your WR, injuries
  on the opposing defense, or weather.
- No park/game-script modeling (a team playing from behind passes more
  regardless of matchup quality).
- Byes are treated as binary (present/absent) — no partial credit for a
  strong Week 14 leading into a Week 15 bye, which some leagues' playoff
  structures might still reward via a first-round bye of their own.
