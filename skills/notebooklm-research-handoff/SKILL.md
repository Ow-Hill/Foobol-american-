---
name: NotebookLM Research Handoff
description: Drafts a copy-paste deep-research brief for NotebookLM when a topic needs multi-source synthesis beyond quick web_search. Use for injury deep-dives, prospect scouting, or season outlooks.
command: /notebooklm-research-handoff
---

# NotebookLM Research Handoff

Claude's web_search is good at quick, targeted per-player checks (Step 2 of
`player-injury-check`, for example). It is not the right tool for
synthesizing dozens of beat-writer reports, clinical injury timelines, and
scouting profiles into one coherent picture — that's a multi-document
synthesis job, and NotebookLM is built for exactly that. This skill's job
is to produce a clean, well-scoped research brief the user can paste
straight into NotebookLM, and to know when to offer to do that
unprompted, not just when asked.

## When to proactively offer this (don't wait to be asked)
- A `player-injury-check` or `roster-diagnostic` run turns up something
  that's genuinely uncertain or conflicting across sources, not just a
  quick status check — e.g. an ACL recovery timeline that different
  outlets describe differently, or a full-roster injury sweep with several
  open questions at once.
- Before a high-stakes checkpoint: the rookie draft, the trade deadline,
  setting a playoff-week roster. These reward a deeper one-time research
  pass more than another round of one-off searches.
- The user's request itself sounds like it wants breadth/depth a few
  web_searches won't give ("what's the real recovery outlook for every
  ACL guy on my roster", "scout me the rookie class at TE").
- The user says anything like "deep dive," "comprehensive," or mentions
  NotebookLM directly.

Offer it as a question, don't just produce it silently — the user still
has to go run it in NotebookLM themselves and bring back the results, so
springing a wall of research questions on them without asking is more
disruptive than helpful.

## Workflow

**Step 1 — Confirm scope with the user** if it isn't already obvious from
context (which players/positions, what specifically is uncertain).

**Step 2 — Build the brief:**
```
python3 scripts/build_research_brief.py --topic "..." --context "..." \
    --questions questions.txt --sources sources.txt --feed-into "<skill/file>"
```
Or write `data/brief_input.json` directly (see
`assets/example_briefs.json` for fully worked examples covering the four
recurring needs in this project: full-roster injury deep-dive, rookie
scouting for a rookie-only draft, trade-target due diligence, and a
playoff-schedule deep dive) and run the script with no arguments to read
it from there.

Produces `data/outputs/notebooklm_brief.md` — a clean, numbered research
brief plus a short list of source types to upload into NotebookLM
(official injury reports, beat-writer camp coverage, clinical/recovery
timeline articles, scouting reports — whatever fits the topic).

**Step 3 — Hand it to the user** with the file, and say plainly: paste the
questions into NotebookLM along with a handful of relevant sources (or let
NotebookLM search the web itself if that's enabled), then bring the answer
back here.

**Step 4 — Close the loop.** When the user returns with NotebookLM's
findings, don't just repeat them back — write the relevant facts into
whichever skill's data file the brief specified in `feed_into` (e.g.
`player-injury-check`'s `data/injury_context.csv`, or straight into a
roster/trade decision), so the research actually moves the rest of the
skill family forward instead of sitting in the chat as a one-off answer.

## Why this is a separate skill, not folded into player-injury-check
Different job, different tool. `player-injury-check` is fast, per-player,
web_search-based, and designed to run every time a roster needs a status
check. This skill is occasional, broader, and explicitly hands the actual
research off to a different product NotebookLM. Keeping them separate
means the fast path stays fast and this one only fires when it's actually
worth the extra step.

## What this skill deliberately does not do
- Does not call any NotebookLM API — none is available to this
  environment (checked; no MCP connector exists for it as of this
  writing). This produces a document for a human to paste in manually.
- Does not replace `player-injury-check` for routine "is this player
  playing this week" checks — that's overkill for a NotebookLM round trip.
