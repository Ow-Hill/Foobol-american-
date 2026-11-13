---
name: ff-waiver-plan
description: Plans waiver claims and free-agent adds for Owen's team in the James Cook Lovers Sleeper league (rolling priority, no FAAB). Merges Down Field, Scout-Squad and StatsDeck boards with the waiver-wire-scanner method and tiers each move. Use for pickups, drops, streamers, handcuffs, or whether to spend waiver priority.
---

# FF Waiver Plan

Turns four free-agent boards into a short, tiered plan with a named drop for each add.
Wraps the `waiver-wire-scanner` skill and Down Field's `waiver-wire` method; follows the
rules in `ff-command-center`.

## Step 1 — Context and locks

- Down Field `get_team_context` (roster_id "4"): waiver position, claim rules (rolling
  priority: a won claim sends Owen to last), depth-chart ranks, this week's schedule.
- Flaim `get_roster`: check every IR player's tag. An upgraded IR player blocks all claims —
  fix that first.

## Step 2 — Needs, in priority order

1. Empty or ineligible starting slot this week.
2. Starter Out/Doubtful this week.
3. Starters on bye this week or the next two (Down Field `get_nfl_schedule` with byes).
4. Thin positions (StatsDeck `get_my_roster` → `hole`).
5. Insurance: handcuff for Gibbs and any injured starter.
State "no need" if none apply — holding is a real option.

## Step 3 — Build the candidate pool (parallel)

- Down Field `recommend_waivers` (roster_id "4"; position if one need dominates). Keep its
  this-week value, season outlook band and **insurance** list.
- Scout-Squad `waiver_board` (league_ref `league:sleeper:1312204198166691840`) for this week
  and, on Tuesday/Wednesday, `week` = next week.
- StatsDeck `get_available_players` for the needed position.
- Flaim `get_free_agents` to confirm each name is actually unrostered.

## Step 4 — Shortlist (max 6)

Rank names that appear on two or more boards first, then Down Field insurance names, then
single-board names with a clear role change. Run `player-injury-news-check` on the
shortlist only, plus StatsDeck `get_snap_counts` for usage trend. Say plainly that the full
pool was triaged, not every player background-checked.

## Step 5 — Price each package against holding

- Pick the drop: never a starter still needed this week, never the only backup at QB/TE,
  never a patient hold just because his projection is low this week.
- Down Field `evaluate_moves` with up to 5 add/drop packages in one call → title/playoff
  odds change per move. Relay the band and noise.
- Optional: Scout-Squad `gut_check` add_drop (free) for a receipt on the top move.

## Step 5a — What the dashboard's waiver replay found (this league, 2025-26)

- Ranking free agents by **this week's projection** was the best simple rule: the top claim added
  about 8 lineup points over the next three weeks, against 5.4 for the best-projected free agent
  overall and 0 for standing pat.
- **Injured stashes** added 1.9 points over eight weeks on average and helped 15% of the time.
  Treat them as free-agency adds when IR is open, never as a claim.
- **"Young, ascending"** alone is not a reason to spend priority.

## Step 6 — Tier and spend priority

| Tier | Meaning | Priority |
| --- | --- | --- |
| 1 Smash | Clear starter takeover (RB1 role from injury) or a dropped top-24 RB/WR | Spend it |
| 2 Conditional | Rookie ascending, goal-line role in a split — only with real lineup distress | Spend only if Tier 1 is empty and the need is urgent |
| 3 Pass | Lateral WR4/5, TE/QB streamers | Wait for free agency |
| 4 Free agency | Handcuffs, bye fillers, DST/K streams | Wednesday after waivers clear |

Wednesday: Flaim `get_transactions` (type drop) and StatsDeck `get_trades` → recent drops by
rivals worth a no-cost claim.

## Output

Group as **proven risers / handcuff stashes / lottery tickets**. For each: add, drop, tier,
which slot it fills and when, Down Field this-week gain + season band, and the trigger to
revisit (next practice report, two more games of usage). End with priority advice:
spend or hold, and why. Never say a claim was placed.
