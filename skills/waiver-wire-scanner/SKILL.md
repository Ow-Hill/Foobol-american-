---
name: waiver-wire-scanner
description: Scans available waiver-wire players, background-checks the promising ones, and ranks them against your roster needs. Use for waiver pickups, free agent adds, or streaming decisions.
command: /waiver-wire-scanner
---

# Waiver Wire Scanner

Pulls every available free agent in your league, narrows that list down to a
realistic shortlist, background-checks only those, and ranks them against
your actual roster's weak spots — not a generic "best available" list.

## Why triage before background-checking, and why "all" doesn't mean all
A 10-team league's free-agent pool can easily be 100+ players. Deep-checking
every one of them via web_search isn't just slow — it wastes searches on
players no one would ever add. This skill triages FIRST on cheap signals
(platform ownership rate when available, position need, and your own
football knowledge of who's actually relevant right now) down to a
shortlist of roughly 10-20 names, and only THEN spends web_search budget
background-checking those. Say this plainly to the user rather than
silently narrowing "all" to "some."

## Critical constraint (same as every skill in this family)
The code-execution sandbox has no internet access. Live free-agent lists
come from the Flaim Fantasy connector (or equivalent); background-check
findings come from your own web_search calls. Scripts here only triage,
validate, and score.

## Workflow

**Step 1 — Pull the roster and compute position need.** Call the fantasy
connector's `get_roster` for the user's team, write to `data/roster.csv`
(`player, position, nfl_team`). Also fetch `get_league_info` for
`roster_positions` if not already confirmed this session, and write to
`data/league_config.json`:
```json
{"roster_positions": ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","K","DEF"]}
```
`scripts/triage_candidates.py` computes which positions are thin (e.g. a
league needing 1 TE starter where the user rosters exactly 1 TE with zero
depth) — this is the single biggest lever on which waiver adds actually
matter, so don't skip it even for a "just show me the best players" request.

**Step 2 — Pull free agents.** Call the connector's `get_free_agents` for
each position (or ALL), write to `data/free_agents_raw.csv`
(`player, position, nfl_team, platform_ownership_pct, acquisition_state`).
Leave `platform_ownership_pct` blank if the platform doesn't report it
(Sleeper commonly returns this as unavailable) — the triage script handles
that case, see Step 3.

**Step 3 — Triage:**
```
python3 scripts/triage_candidates.py
```
Ranks candidates within each position by ownership rate when available.
When it's NOT available (e.g. Sleeper), the script falls back to whatever
order Step 2 wrote the rows in — so in that case, YOU need to do the
ordering: before writing `free_agents_raw.csv`, either (a) run 1-2 broad
web_search queries like `"waiver wire pickups week <N> 2026 fantasy
football"` to get a community-sourced sense of who's actually relevant, and
list those players first, or (b) use your own knowledge of recent depth
chart / injury news to prioritize obvious names (a backup who just became a
starter, a rookie seeing a snap-share jump). Say explicitly which method you
used — don't present a Sleeper-sourced shortlist as if it were ownership-
rate-ranked when it wasn't.

Produces `data/candidates_shortlist.csv` — more slots go to thin positions
(default caps: 8 for HIGH-priority positions, 3 for NORMAL, 1 for LOW;
override by editing the caps at the top of the script if a league needs
something different).

**Step 4 — Background-check the shortlist only.** For each shortlisted
player, gather current opportunity signal and injury/news status via
web_search — this is the same job as the `player-injury-check` skill; call
into it directly if installed rather than duplicating the logic. Write
`data/background_checks.csv`:

| column | meaning |
|---|---|
| player | must match `candidates_shortlist.csv` |
| opportunity_signal | one of: TRENDING_UP, STABLE, TRENDING_DOWN, INJURY_REPLACEMENT, ROOKIE_HYPE, NONE |
| injury_status | HEALTHY, QUESTIONABLE, DOUBTFUL, OUT, PUP/IR |
| note | one sentence, paraphrased, no quoted text |
| source_search_date | today's date |

**Step 5 — Score:**
```
python3 scripts/score_candidates.py
```
Produces `data/outputs/waiver_recommendations.csv`, labeling each shortlisted
player ADD NOW / SPECULATIVE STASH / MONITOR / PASS. See
`references/methodology.md` for the exact rule set — it's deliberately
simple and transparent rather than a black-box score, since the inputs
(ownership rate, a hand-written opportunity signal) don't support more
precision than that.

**Step 6 — Report back**, leading with ADD NOW recommendations at
HIGH-priority positions, and connect each to what roster spot it would
fill or replace.

## Integration with the rest of this skill family
- `player-injury-check` — Step 4 is that skill's job; call into it.
- `playoff-schedule-strength` — once a candidate is added, worth running
  that skill on them if they're being picked up with the playoff stretch in
  mind specifically (e.g. a Week 15-17 schedule-based streaming target).
- `ff-ml-projections` — not used here. Waiver-wire players rarely have
  enough recent-role stability for that skill's season-level model to say
  anything useful; a fresh opportunity signal from Step 4 is more relevant
  than a model trained on last year's usage.
