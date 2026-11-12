---
name: ff-season-planner
description: Season-level planning for Owen's James Cook Lovers Sleeper team — playoff odds, weekly recaps and lineup-efficiency audits, the Week 11 trade-deadline push, Weeks 15-17 playoff prep, and scheduled weekly check-ins. Use for odds, standings, recap, how my season is going, deadline plan, playoff schedule, or setting up recurring reminders.
---

# FF Season Planner

Zooms out from one week. Uses Down Field's `weekly-review` and `week-in-review` methods,
`playoff-schedule-strength`, and the rules in `ff-command-center`.

## Where we stand

- Down Field `simulate_league` view "odds": playoff, bye and title chances for every team,
  with noise. View "rankings": three separate orders (this week's lineup, record, odds) —
  keep them separate, never blend.
- Caveats to state: the sim ignores the league's 2 divisions, draws random future opponents,
  leaves out K and DEF, and assumes no roster moves.
- Never use Flaim standings (stale). Records come from Down Field or Flaim `get_matchups`.

## Weekly review (Tuesday)

- Down Field `get_weekly_review` (latest finished week, or scope "season" for the story).
- Lineup-efficiency audit: Down Field `get_team_context` gives season points (`fpts`) vs
  potential points (`ppts`). The gap is points left on the bench; track it week to week.
- For a shareable recap, follow Down Field's `week-in-review` format: result and score first,
  record, notable league results, two next questions.
- Grade decisions only against advice actually recorded before kickoff; a worse outcome alone
  isn't a bad decision.

## Trade-deadline push (now through Week 11)

1. Odds check (above): contending → buy; playoff odds under ~30% by Week 10 → sell for picks.
2. `playoff-schedule-strength` on Owen's full roster → sell bad Weeks 15–17 slates, buy good ones.
3. Run `ff-trade-lab` on each consolidation idea (2-for-1 that turns bench depth into a
   starter; move the spare QB).
4. Offers need acceptance a day before the deadline (1-day review).

## Playoff prep (Weeks 12–17)

- Weeks 12–14: trim non-contingent depth; keep Gibbs's handcuff; pre-add DSTs with soft
  Weeks 15–17 slates before rivals do.
- DST streaming: StatsDeck `get_team_defense` with `opponent` (defense-vs-position and how
  generous that offense is to defenses) + implied totals from Down Field's schedule. Target
  opponents with implied totals under ~20.5. This league's DST scoring rewards points-allowed
  tiers heavily (+10 shutout down to −4 at 35+).
- Kicker: StatsDeck `get_kicker_stats` — distance bonuses (4 / 5 / 6 for 40+ / 50+ / 60+)
  favor long-range kickers in domes or calm weather.
- Weeks 15–17: `ff-lineup-call` each week with the risk posture set by the matchup.

## Scheduled check-ins (ask before creating any)

Offer these as scheduled tasks (Owen's time zone: America/Toronto). Each prompt should say
"use the ff-command-center skill" so the run loads the rules.

| Check-in | When | Prompt core |
| --- | --- | --- |
| Waiver preview | Tuesday evening | Run ff-waiver-plan; tell me what to claim before waivers process |
| Lineup check | Thursday before TNF, Sunday ~11:00 | Run ff-lineup-call; only tell me what to change |
| Injury watch | Sunday ~11:45 | Run ff-injury-triage on my starters |
| Weekly recap | Tuesday morning | Weekly review + lineup-efficiency audit |
| Trade ideas | Wednesday evening, until Week 11 | Run ff-trade-lab for my weakest starting spot |

Use the session's scheduling tool (load via ToolSearch). Confirm what was created and its
approval setting; never claim a schedule exists without the tool's confirmation.
