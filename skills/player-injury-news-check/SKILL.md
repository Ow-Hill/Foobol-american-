---
name: Player Injury News Check
description: Runs a live background check on NFL players: current injury status, practice reports, and news via web search. Use for injury check, background check, or player status requests.
command: /player-injury-check
---

# Player Injury & News Check

A standalone, reusable skill: given one or more player names, produce a
validated, schema-consistent injury/news status file. Other skills — like
`ff-ml-projections` — call into this one instead of duplicating the same
web-search-and-write logic.

## Why this exists as its own skill rather than inline steps
Two reasons:
1. **Reusability.** Any skill or request that needs current player status
   (not just projections — trade advice, lineup decisions, waiver claims)
   can invoke this one instead of re-implementing the same web_search +
   schema logic.
2. **Separation of concerns.** This skill's only job is producing a *clean,
   validated* status file. It does not know or care what downstream
   consumer will use it — that keeps it simple enough to trust and easy to
   test independently of any particular projection model.

## Critical constraint (same as every skill in this family)
The code-execution sandbox that runs `scripts/validate_context.py` has no
internet access. It can only validate and clean data — **you (the
assistant) must gather the actual injury/news information yourself, using
your own web_search / web_fetch tools**, before this skill's script ever
runs. Do not add network calls to the script.

## Workflow

**Step 1 — Get the player list.** From the user's request, or from another
skill invoking this one (e.g. `ff-ml-projections` passing its draft-board
players).

**Step 2 — Search for each player, one query per player minimum.** Use
web_search with queries like `"<player name> injury status"` and
`"<player name> practice report"`. For anything ambiguous or contested,
run a second query. Prioritize the last 7 days of results — older injury
news is often stale by the time it matters for a lineup or draft decision.

**Step 3 — Write findings to `data/injury_context.csv`** with this exact
schema (see `assets/context_schema_example.csv`):

| column | rule |
|---|---|
| player | exact name as given in the request |
| status | one of: HEALTHY, QUESTIONABLE, DOUBTFUL, OUT, PUP/IR |
| est_games_missed | integer 0-17, your best read from the news |
| note | one sentence, in your own words — do not quote search results verbatim (copyright rule: paraphrase, never reproduce article text even briefly) |
| source_search_date | today's date, YYYY-MM-DD |

Never invent a status you didn't actually search for. If search turns up
nothing, write HEALTHY with a note saying no fresh news was found — don't
leave the player out silently, since a silent omission looks identical to
"nothing to report" downstream.

**Step 4 — Validate.** Run:
```
python3 scripts/validate_context.py
```
This checks the file exists, has the right columns, that `status` values
are from the allowed set, and that `est_games_missed` is numeric and in
range. It reports any row it had to reject or couldn't parse — fix those
by hand and re-run rather than letting the script silently drop rows.

**Step 5 — Report back.** Summarize what you found in plain language,
player by player, still paraphrasing rather than quoting. If another skill
invoked this one, hand back the validated file path
(`data/injury_context.csv`) rather than re-stating everything in prose.

## Integration with other skills
`ff-ml-projections`'s Step 2 calls into this skill directly instead of
duplicating this logic. If both skills are installed, invoking
`ff-ml-projections` will pull in this skill automatically for its
injury/news step. If only this skill is installed, it still works
standalone for any "check on this player" type request.

If a check turns up genuinely conflicting or uncertain information across
sources (e.g. an ACL recovery timeline different outlets describe
differently), that's a signal to offer `notebooklm-research-handoff`
instead of guessing between conflicting quick-search results — that skill
is built for exactly this kind of multi-source synthesis.

## What this skill deliberately does NOT do
- No point-total or fantasy-score adjustment — that's `ff-ml-projections`'s
  `apply_context_adjustments.py`, kept separate so this skill stays
  reusable for non-fantasy use cases too (e.g. "is my player playing this
  week").
- No historical trend analysis — this is a snapshot, not a projection.
