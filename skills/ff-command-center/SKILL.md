---
name: ff-command-center
description: Hub for every fantasy football question in the James Cook Lovers Sleeper league (Owen's team, roster 4). Sets ground rules, routes to the right connector and workflow skill, and resolves disagreements between Flaim, Down Field, StatsDeck and Scout-Squad. Use first for any lineup, waiver, trade, injury, standings or playoff question.
---

# FF Command Center

The hub. Load this first, then hand off to the workflow skill that fits the question.
League facts live in `references/league-facts.md`; connector quirks in
`references/connector-cheatsheet.md`. Read them when a number or setting matters.

## The five rules that never bend

1. **Live roster first.** Start every answer with a fresh Flaim `get_roster`
   (`platform: sleeper`, `sport: football`, `league_id: 1312204198166691840`,
   `season_year: 2026`, `team_id: 4`). Never present a remembered roster as current.
   The roster changes between chats; memory and project notes go stale fast.
2. **Health beats models.** No model reads breaking news. Any tagged player gets a web
   check (see `ff-injury-triage`) before a start/sit or add/drop is final.
3. **Three opinions on close calls.** Down Field, StatsDeck and Scout-Squad use different
   models. On any lean or toss-up, get all three and apply the consensus rule below.
4. **Relay, don't invent.** Every number comes from a tool, with its source and update time.
   Never average projections across tools into one number. A tool that abstains stays
   abstained; give the blocker and the next check instead.
5. **Advice only.** No connector can set a lineup, claim, or send a trade. Owen makes every
   move in the Sleeper app. Never say a move was made.

## Router

| Question | Workflow skill | First calls |
| --- | --- | --- |
| Who to start, set my lineup, start X or Y | `ff-lineup-call` | Flaim `get_roster`, Down Field `recommend_lineup` |
| Pickups, drops, streamers, waiver priority | `ff-waiver-plan` | Down Field `get_team_context`, `recommend_waivers` |
| Trade ideas, evaluate an offer, counter | `ff-trade-lab` | Down Field `get_roster` scope league, `evaluate_moves` |
| A player is hurt, tagged, or on IR | `ff-injury-triage` | Flaim `get_roster`, web search |
| Odds, standings, recap, deadline plan, playoffs | `ff-season-planner` | Down Field `simulate_league`, `get_weekly_review` |
| Rest-of-season player value | `fantasy-football-ml-projections` only with real data; otherwise Down Field `get_projections` + reasoning, labeled |
| Sources disagree on a timeline | `notebooklm-research-handoff` (short brief, 5 questions max) |

Connector-provided skills (Down Field `waiver-wire`, `trade-ideas`, `fantasy-data`,
`weekly-review`, `week-in-review`, `league-research`) are already folded into the workflow
skills above. Follow ours; they add the league-specific rules.

## Consensus rule (start/sit and player-vs-player)

Collect: Down Field edge + band (clear / lean / toss-up) + p15/p85 range;
StatsDeck `statsdeck_projection` for each; Scout-Squad `gut_check` verdict + confidence.

- **All three agree and Down Field says clear** → state it as the move.
- **All three agree, Down Field lean or toss-up** → "lean X", give the margin from each.
- **Split 2-1, or any margin under ~2 points** → it's a toss-up. Break it in this order:
  1. Health certainty: prefer the player with no injury tag.
  2. Matchup posture: favored this week → higher floor (Down Field p15);
     underdog → higher ceiling (p85). Get favored/underdog from Down Field `get_matchup`.
  3. Game environment: higher implied team total (in Down Field's schedule data).
  4. Kickoff time: the later game keeps late-swap flexibility.
- Show the three numbers side by side so Owen sees the disagreement.

## Status-conflict rule

Flaim, Down Field and StatsDeck pull injury labels at different times. When they disagree:
compare timestamps (Down Field `statusObservedAt`, StatsDeck `injury_intel.status_since`),
run a web search for the last 48 hours, and treat the more severe label as true until a
dated report confirms the upgrade.

## How answers read

Lead with the call, then the two or three reasons that decide it, then what couldn't be checked.
Plain words: "usually between 11 and 31 points", not "p15–p85". Don't say "Decision Artifact",
"abstention", "catalog" or name the data feed for a status ("he's listed questionable").
Tables for side-by-side comparisons; prose otherwise. Cite web sources; paraphrase, never
quote more than a short phrase.

## Owen's standing preferences

- Use the project's football skills and Flaim for anything Sleeper-integrated.
- Keep NotebookLM briefs short.
- Waiver output in three tiers: proven risers / handcuff stashes / lottery tickets.
- Trade pitches in three versions (anchor, sweetened, needs-based) with a walk-away line.
