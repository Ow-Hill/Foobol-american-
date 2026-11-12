---
name: ff-injury-triage
description: Resolves injury and availability questions for Owen's James Cook Lovers Sleeper roster by reconciling conflicting tags across Flaim, Down Field and StatsDeck with live web reporting, then applies the league's IR rules and names the replacement. Use when a player is hurt, questionable, on IR, or statuses disagree.
---

# FF Injury Triage

Wraps `player-injury-news-check` and escalates to `notebooklm-research-handoff` when sources
truly disagree. Follows `ff-command-center`.

## Step 1 — Collect every label with its time

- Flaim `get_roster`: `injuryStatus`, `injuryBodyPart`, slot (starter, bench, reserve).
- Down Field `get_team_context`: status + `statusCoverage.catalogFetchedAt`, depth-chart rank
  and who's next on the depth chart.
- StatsDeck `get_my_roster` or `get_injuries`: `official_injury`, `injury_intel` with
  `status_since` and `previous_status`.

If the labels differ, that's a conflict — go to Step 2 before deciding anything.

## Step 2 — Check the news

Run `player-injury-news-check` for each player: web search, last 7 days, one query per player,
a second if reports conflict. Fetch the article. Note practice participation (DNP / limited /
full) by day, coach quotes, and the date of the event (newer summaries often repeat old news).

Take the most severe label until a dated report confirms an upgrade.

If outlets give different recovery timelines, offer a short NotebookLM brief
(`notebooklm-research-handoff`, 5 questions max). Verify whatever comes back.

## Step 3 — Apply this league's IR rules

- IR-eligible here: **Out, Doubtful, Suspended, IR, NA, DNR, COVID**. Questionable is not.
- An IR player upgraded to Questionable or healthy locks all adds and claims until moved off.
  Check this every Tuesday before waivers.
- Hold: any WR2-level player or better, and any RB with a clear path to 60%+ of touches,
  however long the absence.
- Cut only low-volume depth out 4+ weeks, and only when IR is full.
- Use open IR slots to scoop talented injured players rivals drop during bye weeks.

## Step 4 — Replacement

- Down Field `recommend_waivers` → its **insurance** list names the next man up behind each
  injured starter and whether anyone rosters him.
- For lineup impact this week, hand off to `ff-lineup-call`; for a pickup, to `ff-waiver-plan`.

## Output

| Player | Labels (source, time) | What the news says (date) | Verdict | Action |
| --- | --- | --- | --- | --- |

Verdict: Playing / Game-time decision / Out this week / Multi-week. Action: start, conditional
start with a named fallback, move to IR, hold, or drop. Give the next check time
(e.g. Friday practice report, inactives 90 minutes before kickoff).
