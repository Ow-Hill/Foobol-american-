# Skills audit — repo vs installed Claude skills vs live connectors

Checked 2026-11-12 (NFL Week 10, before Thursday kickoff). Method: diffed `skills/` on `main`
against the football skills installed in Claude, then ran each skill's first calls against the
live connectors and compared the rules with the dashboard code.

## 1. Repo vs installed copies

| Skill | Repo | Installed in Claude | Same files? |
| --- | --- | --- | --- |
| ff-command-center, ff-lineup-call, ff-injury-triage, ff-waiver-plan, ff-trade-lab, ff-season-planner | yes | yes | identical before this audit; command-center edited here (re-upload) |
| playoff-schedule-strength | yes | yes | identical |
| ff-ml-projections | yes | as `fantasy-football-ml-projections` | identical files, different folder name |
| player-injury-news-check, waiver-wire-scanner, notebooklm-research-handoff | **added here** | yes | identical (copied from the installed set) |
| ff-decision-engine, ff-news-search | yes | **no** | repo-only; Claude chats cannot use the dashboard's rules until uploaded |

## 2. What works

| Check | Tool | Result |
| --- | --- | --- |
| Hub's fixed Flaim params (league 1312204198166691840, team 4, 2026) | Flaim `get_roster` | Works: starters, bench, IR, injury tags, record |
| League settings in `league-facts.md` | Down Field `get_team_context` | All still correct: trade deadline 11, playoffs from Week 15, 6 teams, rolling waivers (type 0), 2-day clear, IR allows Out/Doubtful/Sus/NA/DNR/COV, 1-day review, 5 veto votes |
| Exact scoring | StatsDeck `get_scoring` | Imported from Sleeper; matches `league-facts.md` line by line (0.04 pass yd, 4 pass TD, full PPR, kicker 3/4/5/6, DST tiers +10…−4) |
| Depth chart, implied totals | Down Field `get_team_context` | Present per player and per game, as the lineup/waiver skills expect |
| Season odds | Down Field `simulate_league` | Works (5,000 sims); caveats are exactly the ones the cheat sheet lists |
| Player refs | Scout-Squad `search` | Returns `player:sleeper:<id>` with league ownership, as documented |

## 3. What didn't (and the fix made)

| # | Problem | Fix |
| --- | --- | --- |
| 1 | `league-facts.md` snapshot was Week 9: 3-5, waiver #2, 84% playoffs / 20% title | Replaced with Week 10: 3-6, waiver **9 of 10**, **56% playoffs / 5.8% title**, opponent HyperFire12 |
| 2 | Cheat sheet said Flaim `get_standings` is all placeholders | Records, points for and waiver priority are now real; only the playoff fields (`seasonPhase`, `madePlayoffs`, `playoffOutcome`) are wrong. Rule rewritten |
| 3 | Nothing flagged that the trade window is closing | "Deadline status" added: Week 11 lock, 1-day review → this week is the last full week; at 56% odds the planner rule says buy/consolidate |
| 4 | Hub tiebreak had 4 steps; the dashboard (`public/js/model.js` `tiebreak`) has 5 | Added "Position matchup" between game environment and kickoff |
| 5 | `ff-decision-engine/references/thresholds.md` described the pre-ripple engine (flat 3/10/30 min cache, old league/wire weights, no estimate posture) | Synced: kickoff-aware refresh, status-change log, `NOT_RUMOUR`, `latestAdverse`, estimate posture capped at 74, current profile weights |
| 6 | Workflow skills call three helper skills that were not in the repo | Copied in unchanged |
| 7 | Projection skill has two names | Hub router and README name both |
| 8 | `playoff-schedule-strength` says never hard-code Weeks 15–17 / the deadline, while the ff skills do | Hub now states the calendar is confirmed from Sleeper settings, which satisfies that skill's Step 0 |

## 4. Still open (not fixable from the repo)

- **Re-upload to Claude.** Installed skills don't sync from git. Upload `ff-command-center`
  (edited) and, if wanted in chat, `ff-decision-engine` and `ff-news-search` (new to Claude).
- **Down Field scores on a generic PPR template.** Close for this league (full PPR, 6-pt TDs),
  but passing TDs are 4 and kickers get distance points — Down Field's numbers are not exact.
  StatsDeck is the exact-scoring source.
- **Projection scripts need scikit-learn.** They run in Claude's code sandbox, not in this repo's
  Node environment (pandas only here). The dashboard does not use them.
- **The sim ignores divisions and draws random opponents for Weeks 11–14.** A 3-6 team's real
  path depends on the schedule; treat 56% as a rough number.
- **Snapshot numbers go stale weekly.** Re-run section 2's calls before relying on
  `league-facts.md`; the settings section is stable, the snapshot section is not.
