---
name: Fantasy Football ML Projections
description: Builds ML fantasy football player projections (age curves, opportunity share, time-series validation). Use for player projections, injury-adjusted rankings, or draft-value checks.
command: /ff-ml-projections
---

# Fantasy Football ML Projections

Builds player-projection models using position-specific age curves, opportunity-
share feature engineering, and leakage-free time-series validation. See
`references/methodology.md` for the full rationale on model choice, feature
design, and known pitfalls (e.g. why raw trend features must be clipped).

## Critical constraint: this skill's code has no internet access

The code-execution sandbox that runs `scripts/*.py` has **no network access at
all** — it can only read files already present in the skill/workspace. It
cannot fetch injury reports, news, or live stats itself. Any "live" data in
this workflow has to be gathered by **you (the assistant), using your own
web_search / web_fetch tools, before invoking any script.** Do not attempt to
add `requests`/`urllib` calls to the scripts — they will fail with no
connection.

## Workflow

**Step 1 — Identify scope.** Get the list of players the user cares about
(their draft board, roster, or named players). If unclear, ask.

**Step 2 — Gather live context via the Player Injury News Check skill.**
Invoke that skill (`player-injury-check`, callable as `/player-injury-check`
in Claude Code, or triggered by its own description if a request mentions
injury/background/status checks) with the players in scope. It handles the
web_search calls and writes a validated `data/injury_context.csv` in the
schema `apply_context_adjustments.py` expects (see its own SKILL.md for the
exact columns).

If that skill isn't installed, do the equivalent yourself: web_search each
player's current injury status and recent news, then write
`data/injury_context.csv` with columns `player, status, est_games_missed,
note, source_search_date` (status one of HEALTHY/QUESTIONABLE/DOUBTFUL/OUT/
PUP-IR). Never fabricate a status you didn't actually search for.

**Step 3 — Ensure historical data exists.** Check for `data/player_seasons.csv`.
If missing, copy `assets/sample_player_seasons.csv` as a starting point, but
tell the user plainly that it's illustrative/fabricated sample data, not real
box scores — see the warning in `references/methodology.md`.

**Step 4 — Run the pipeline:**
```
python3 scripts/build_projections.py
python3 scripts/apply_context_adjustments.py
```
The first trains position-specific models with walk-forward validation and
writes baseline projections. The second merges your Step 2 injury/news
findings on top, discounting projected points by estimated missed games and
flagging anything DOUBTFUL/OUT/PUP.

**Step 5 — Report results.** Summarize the top projections and any players
whose projection changed materially because of injury context, citing what
you found in Step 2 in your own words (paraphrase — do not quote search
results verbatim per copyright rules).

## Where things live
- `scripts/` — the four pipeline modules (feature engineering, model
  selection, validation, adjustment merge). Run from the skill's root.
- `data/` — created at runtime: `player_seasons.csv` (historical input),
  `injury_context.csv` (written by the `player-injury-check` skill in Step
  2), `outputs/` (final CSVs).
- `assets/` — templates and sample data shipped with the skill.
- `references/methodology.md` — full technical writeup, load only if you or
  the user need the "why" behind a modeling choice.

## Portability note
This folder follows the open Agent Skills format (`SKILL.md` + frontmatter).
It works as-is in claude.ai (Settings → Customize → Skills, zip upload) and
Claude Code (drop in `.claude/skills/`, invocable as `/ff-ml-projections`).
It integrates with the companion `player-injury-check` skill for Step 2 —
install both for the full live-data workflow. Chat interfaces without code
execution (plain API chat, most third-party chatbots) cannot run the Python
scripts at all; in that case, fall back to reasoning qualitatively about
opportunity trend, age curve, and live news rather than fitting a real
model, and say so explicitly rather than presenting a made-up number with
false precision.
