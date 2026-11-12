---
name: Playoff Schedule Strength
description: Analyzes NFL opponent strength for your roster during your fantasy playoff weeks; flags bye-week risk and favorable/tough matchups for trade and lineup decisions.
command: /playoff-schedule-strength
---

# Playoff Schedule Strength

Scores every player on a fantasy roster by how tough their NFL opponents are
during the *fantasy playoff weeks specifically* (not the whole season) — the
single most actionable lens for Week 13 trade-deadline buy/sell calls and
which bench players are worth stashing.

## Critical constraint (same as every skill in this family)
The code-execution sandbox has no internet access. All schedule and
defensive-strength data must come from **your own web_search/web_fetch
calls**, written into `data/schedule_matrix.csv`. The scripts here only
validate and score — they cannot fetch anything.

## Step 0 — Confirm the playoff weeks and team count. Do not assume.
Ask the connected league platform (e.g. Flaim Fantasy `get_league_info` /
`get_standings`) and cross-check with the user if anything is ambiguous.
**Do not hard-code Weeks 15-17 or a Week 13 trade deadline** — leagues vary,
and even a connected platform's settings can show stale/rolled-over state
(e.g. a `seasonPhase` of "playoffs_in_progress" with every team at 0-0 is a
sign the data hasn't refreshed for the new season — flag that to the user
rather than trusting it silently). If truly unconfirmable, ask the user
directly rather than guessing. Write the confirmed weeks to
`data/league_config.json`:
```json
{"playoff_weeks": [15, 16, 17], "num_teams_qualifying": 6, "confirmed_via": "user-provided, 2026-08-20"}
```

## Workflow

**Step 1 — Get the roster.** If a fantasy connector (e.g. Flaim Fantasy) is
available and already connected, call its `get_roster` tool directly for
the user's team — don't ask them to type out their roster by hand. Write it
to `data/roster.csv`: `player, position, nfl_team`.

**Step 2 — Research each NFL team's playoff-week opponents and defensive
strength, via web_search.** For every distinct `nfl_team` in the roster,
search for that team's schedule for the confirmed playoff weeks, and for
each opponent, search for their current pass-defense and run-defense rank
(1 = toughest/fewest fantasy points allowed, 32 = easiest/most allowed —
this convention matters, keep it consistent). Write findings to
`data/schedule_matrix.csv` using this schema (see
`assets/schedule_matrix_template.csv`):

| column | meaning |
|---|---|
| nfl_team | the roster player's real team |
| week | the fantasy-playoff week number |
| opponent | opponent abbreviation, or `BYE` if the team has a bye that week |
| opp_pass_def_rank | 1-32, 1 = toughest pass defense |
| opp_run_def_rank | 1-32, 1 = toughest run defense |
| note | one-sentence paraphrase of what you found (never quote source text) |
| source_search_date | today's date |

A `BYE` during a playoff week is the single worst outcome for a player —
make sure this is never silently skipped.

**CSV formatting note:** keep `note` text free of literal commas (use
semicolons instead) — an unquoted comma inside a plain CSV field breaks
parsing. This bit the first test run of this skill during development.

**Step 3 — Validate the schedule matrix:**
```
python3 scripts/build_schedule_matrix.py
```
Checks every roster player's team has an entry for every confirmed playoff
week, ranks are numeric 1-32, and flags any bye weeks prominently.

**Step 4 — Score the roster:**
```
python3 scripts/score_players.py
```
Produces `data/outputs/playoff_outlook.csv`, ranking every rostered player
by average opponent defensive rank faced across the playoff weeks
(position-weighted — see `references/methodology.md` for why RB uses a
run/pass blend while WR/TE/QB weight pass defense almost entirely), labeled
Favorable / Neutral / Tough / BYE WEEK RISK.

**Step 5 — Report back.** Lead with any bye-week risks, then the clearest
favorable/tough matchups, and connect it to a decision: who's worth trying
to trade for before the deadline, who on the bench might be worth stashing,
who's a buy-low before their playoff slate looks easy.

## Integration with the rest of this skill family
- Pairs with `player-injury-check` — a favorable schedule is worth less if
  the player is hurt. Run both before a trade decision.
- Feeds `ff-ml-projections` conceptually (a future version of that skill's
  weekly projections should multiply in this schedule signal), but for now
  they're separate — this skill's output is a ranking/label, not a point
  adjustment, since defensive matchup strength is directionally useful but
  too noisy to justify a precise point multiplier without real defensive
  EPA/DVOA data behind it.

## What this skill deliberately does not do
- No season-long strength of schedule — only the confirmed playoff weeks
  matter for this use case.
- No point projections — that overstates precision defensive rankings
  don't actually support. Favorable/Neutral/Tough labels are honest about
  the level of confidence this analysis can support.
