---
name: ff-trade-lab
description: Finds, evaluates and pitches trades for Owen's team in the James Cook Lovers Sleeper league before the Week 11 deadline. Scores every version with Down Field for both teams, checks health and Weeks 15-17 schedules, and writes anchor, sweetened and needs-based pitches with a walk-away line. Use for trade ideas, evaluating an offer, counters, or selling a surplus.
---

# FF Trade Lab

The trade analyzer. Builds on Down Field's `trade-ideas` method and follows the rules in
`ff-command-center`.

## Step 0 — Is the window open?

Sleeper's setting is `trade_deadline: 11`. Trades need a 1-day review (5 veto votes to
block), so an offer must be accepted at least a day before the Week 11 lock. If the deadline
has passed, say so first and treat ideas as offseason or keeper planning.

## Step 1 — Read the league once

- Down Field `get_roster` scope "league": every team's players, starters by slot, records,
  this week's forecasts. Don't repeat per team.
- Flaim `get_roster` for the partner as ground truth (Down Field can lag a sync).
- Down Field `simulate_league` (odds): who's contending, who's out of it. Sellers are teams
  with low playoff odds.
- League prices: Flaim `get_transactions` type "trade" and StatsDeck `get_trades`
  `recent_trades` — what this league has actually paid.

## Step 2 — Map needs and surpluses

For every team: a need is a starting slot filled by a weak, injured or soon-on-bye player;
a surplus is depth the lineup can't start. Pair Owen's needs with their surpluses and vice
versa. Owen's standing surplus: two starting QBs (sell one in a 2-for-1, not straight up).

## Step 3 — Diligence on every player in the deal

- `player-injury-news-check` on all of them.
- `playoff-schedule-strength` with `playoff_weeks [15,16,17]`, `num_teams_qualifying 6`.
  A Weeks 15–17 bye or a brutal slate is close to a deal-breaker.
- StatsDeck `get_snap_counts` for usage trend.

## Step 4 — Score the versions

Down Field `evaluate_moves` with up to five trade versions in one call (anchor, sweetened,
needs-based, plus any counter). Each needs partner_roster_id and provider player ids for
send/receive. Read both sides:
- Owen's title and playoff odds change, with noise and band.
- The partner's odds change — if theirs falls, expect a no.

Optional: Scout-Squad `gut_check` question_type `trade` (Pro) for a saved receipt.

## Step 5 — Keeper and pick value

1 keeper per team (Owen keeps Gibbs); 3-round drafts; picks are tradable and Owen owns his
2027–2029 1st/2nd/3rd. Picks are a clean sweetener for a contender. No tool values them —
label any pick valuation as judgment.

## Step 6 — Pitch

For the best idea, write three versions:
1. **Anchor** — the deal Owen wants.
2. **Sweetened** — adds a depth piece or a late pick.
3. **Needs-based** — framed around the partner's own hole.
Set a walk-away line before talking. Pitch before Sunday games while Owen's pieces are
healthy and the partner's situation is uncertain.

For a specific offer Owen received: evaluate it as made, give accept / counter / decline as a
labeled lean, and say what to do if the counter is refused.

## Output

For each idea: give and get, partner and why they'd say yes, Owen's lineup before vs after,
odds change for both teams, main risk, what would make it wrong. No trade is a valid answer.
Never claim a trade was sent or accepted. Never suggest coordinating with one manager to hurt
a third.

## Partner notes (refresh — rosters change)

ColinHill and CMC_and_Bums have been open to fair deals. Jackblacknine and HyperFire12 own
backfield rivals of Owen's backs — check before shopping a RB to them. JohnTerno (1-7) is a
likely seller.
