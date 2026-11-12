# James Cook Lovers — league facts

Verified from Sleeper league settings via Down Field `get_team_context` and StatsDeck
`get_scoring` on 2026-11-04 (Week 9). Re-check if the commissioner changes settings.

## Identity

| Field | Value |
| --- | --- |
| Platform | Sleeper, 2026 season, keeper league |
| League ID | 1312204198166691840 (Down Field internal id 8c6308f8-f8ce-494b-88f2-53627415d84a) |
| Owen's team | roster 4, team name "Points for Warriors" (formerly "Nation of Islam"), division 1 |
| Sleeper username / user id | thisowenguy / 1262189050337439744 |
| Scout-Squad league ref | league:sleeper:1312204198166691840 |
| Teams / divisions | 10 teams, 2 divisions |

## Lineup and roster

- Starters: QB, RB, RB, WR, WR, TE, FLEX, FLEX (RB/WR/TE), K, DEF
- Bench 6, IR 3, no taxi. Roster max 19 including IR.
- **IR eligibility in this league:** Out, Doubtful, Suspended, IR, NA, DNR and COVID all allowed
  (reserve_allow_out / doubtful / sus / na / dnr / cov = 1). Questionable is not.
- A player on IR whose tag is upgraded to Questionable or healthy locks roster moves until moved off IR.

## Scoring (exact)

- Passing: 0.04/yd, 4 per TD, −1 INT, 2 per 2-pt
- Rushing / receiving: 0.1/yd, 6 per TD, 1 per reception (full PPR), 2 per 2-pt
- Fumble lost −2. No TE premium, no first-down or 100-yard bonuses.
- Kicker: FG 0–39 = 3, 40–49 = 4, 50–59 = 5, 60+ = 6; FG miss −1; PAT 1, PAT miss −1
- DST: sack 1, INT 2, fumble recovery 2, TD 6, safety 2, blocked kick 2, forced fumble 1;
  points allowed 0 = +10, 1–6 = +7, 7–13 = +4, 14–20 = +1, 21–27 = 0, 28–34 = −1, 35+ = −4;
  no yards-allowed scoring. This matches Down Field's default DST model exactly.

## Calendar and mechanics

| Item | Value |
| --- | --- |
| Regular season | Weeks 1–14 |
| Playoffs | Weeks 15–17, 6 teams, top 2 seeds get byes |
| **Trade deadline** | **Week 11** (Sleeper setting `trade_deadline: 11`). Project notes said 12 or 13 — those are wrong. Confirm the exact lock time in the Sleeper app. |
| Trade review | 1 day review; 5 veto votes needed. Get deals accepted at least a day before the deadline. |
| Waivers | Rolling priority, no FAAB bidding; a successful claim moves you to last. 2-day clear. Current position: see the snapshot below. |
| Keepers | 1 keeper per team (Gibbs). Drafts are 3 rounds. Draft-pick trading on; Owen owns his own 2027–2029 1st/2nd/3rd. |

## Week 10 snapshot (2026-11-12) — refresh before using

Checked live: Flaim `get_roster` / `get_standings`, Down Field `get_team_context` and
`simulate_league` (5,000 sims).

- Record 3-6, 7th of 10. Points for 1,323.28 (3rd in the league); potential points 1,476 →
  about 153 points left on the bench this season.
- Waiver priority **9 of 10** (rolling; it was #2 at the Week 9 sync and has since been spent).
- Down Field sim: **56% playoffs**, 0.3% bye, 5.8% title, 6.0 expected wins.
  (Week 9 was 84% / 13% / 20%; the Week 9 loss to ColinHill cost most of it.)
- Week 10 opponent: HyperFire12 (roster 9, 3-6, 27% playoffs).
- Two QBs rostered (Maye, Mahomes) — still the standing surplus to sell. DEF (Chicago) is the
  thinnest spot.
- Tags: A.J. Brown Questionable (knee, starting at FLEX); IR holds Ferguson (IR), Harvey (IR),
  Stevenson (Doubtful — IR-eligible here; an upgrade to Questionable locks moves).

### Deadline status

**Week 11 is the trade deadline and Week 10 is in progress.** With the 1-day review, an offer has
to be accepted before the Week 11 lock minus one day — this week is the last full week to shop.
At 56% playoff odds the season-planner rule says buy or consolidate, not sell.

## League directory (roster id → manager)

1 ARY3R · 2 Jackblacknine · 3 MWrighter38 · 4 Thisowenguy (Owen) · 5 ColinHill ·
6 CMC_and_Bums · 7 JamesKnowsBalls · 8 CadeCermak · 9 HyperFire12 · 10 JohnTerno
Team names change often; resolve them live with Flaim `get_league_info` or Down Field reads.
