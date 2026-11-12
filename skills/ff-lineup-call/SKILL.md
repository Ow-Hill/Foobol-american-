---
name: ff-lineup-call
description: Sets Owen's weekly start/sit lineup in the James Cook Lovers Sleeper league by combining Flaim, Down Field, StatsDeck and Scout-Squad with a live injury check. Use for who to start, sit or flex, set my lineup, start X or Y, or a pre-kickoff lineup check.
---

# FF Lineup Call

Produces this week's lineup with a clear/lean/toss-up label on every change. Follows the
rules and consensus method in `ff-command-center` (load it if it isn't loaded).

## Step 1 — Find hard problems first (they outrank any projection)

Call in parallel:
- Flaim `get_roster` (team 4): look for an **empty starting slot**, a starter tagged
  **Out / Doubtful / IR**, a starter on bye, and an IR player whose tag was upgraded
  (that locks roster moves).
- Down Field `recommend_lineup` (roster_id "4"). Hold the objective for Step 2.
- StatsDeck `get_my_roster`: its `open_starting_slots` and `lineup_swaps` catch the same
  problems from a second source.

Report any hard problem at the top in one line each ("DEF slot is empty — Chicago is on your
bench and plays Sunday night"). These are clear moves regardless of models.

## Step 2 — Pick the risk posture

Down Field `get_matchup` (this week) gives both lineups' forecasts. Favored by a lot →
re-run `recommend_lineup` with objective `protect-floor`; big underdog → `chase-upside`;
otherwise keep `expected-points`. Say which posture was used and why.

## Step 3 — Second and third opinions on every lean or toss-up swap

For each swap Down Field does not call clear:
- StatsDeck `start_sit` with the players and week.
- Scout-Squad `search` for each name → `gut_check` question_type `start_sit`
  with slot and the player refs.
- StatsDeck `get_snap_counts` for RB/WR/TE in the swap — a falling snap share is the
  usage signal projections miss.

Apply the hub's consensus rule. Never blend the numbers into one.

## Step 4 — Health check

Every player in a swap with any tag, and every starter tagged Questionable:
run `player-injury-news-check` (web search, last 7 days; two queries if reports differ).
Compare against the Flaim / Down Field / StatsDeck tags and apply the status-conflict rule.
If the status won't be known until inactives (~90 minutes before kickoff), say so and give
the conditional: "start A if active; otherwise B".

## Step 5 — Timing

- Use Down Field's lineup deadline from the recommendation.
- Thursday and Monday players go in fixed slots; keep a FLEX for the latest Sunday kickoff
  so a late scratch can be swapped.
- If a player's game has started, he's locked — never suggest moving him.

## Output

1. Hard problems (if any), each as a direct instruction.
2. A table of changes:

   | Slot | Start | Bench | Down Field | StatsDeck | Scout-Squad | Call |
   | --- | --- | --- | --- | --- | --- | --- |

   Call = Clear / Lean / Toss-up, plus the tiebreak used for toss-ups.
3. Conditional calls waiting on injury news, with when to re-check.
4. One line on what couldn't be verified (official inactives, weather).

Offer to re-run Sunday morning. If Owen wants it automatic, `ff-season-planner` covers
scheduled check-ins.
