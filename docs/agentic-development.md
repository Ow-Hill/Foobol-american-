# How this was built — agentic coding log

This repo was built in pair-programming sessions between Owen and an AI coding agent. The human
set the goal, supplied the league context and the ff-* skill rules, approved plans, and made the
product calls. The agent inspected the live data, wrote the code and tests, ran the app in a
browser, and documented the result.

The prompts below are the ones captured in the session record. Earlier milestones are summarised
from the project history rather than quoted verbatim.

## Prompt history

| Date | Prompt / request | What came out of it |
| --- | --- | --- |
| 2026-11-05 | Build a live roster-management dashboard for the **James Cook Lovers** Sleeper league, following the `ff-command-center`, `ff-lineup-call`, `ff-injury-triage`, `ff-waiver-plan`, `ff-trade-lab` and `ff-season-planner` skills. | Initial 19-page dashboard, trade finder, lineup solver, live Sleeper/ESPN data (`716ab8d`). |
| 2026-11-05 | Improve the navigation: compact collapsible groups, task-based sections, a mobile drawer, and stop wiping menu state. | Nav P0–P3 (`0de05fb`, `8b82ac5`, `cb3312a`, `a6f82f4`). |
| 2026-11-05 | Add player news: Google News RSS headlines per player, deterministic classification, ranked “Your players”, League/Wire/Rumours tabs, degraded/print states. | News P0–P4 (`4e13f8d`, `8fa24f9`, `6d6835f`, `59491a4`, `debdf19`, `1c3c99d`). |
| 2026-11-05 | Mirror the news/decision contract in a repo-local skill and document the speculative act gate. | `skills/ff-decision-engine/` (`a996095`). |
| 2026-11-09 | **“plan on how to improve the search function”** | A phased plan after auditing 1,078 cached headlines: matcher bugs, 3-day vs 7-day mismatch, Google redirect links, cross-player duplicates, 429 handling, missing search UI. |
| 2026-11-09 | **“Make the search function better, and make skills for the next itteration”** | Search v2 (`f6d74c5`): apostrophe/hyphen/initial matching, team-defense queries, 7-day window, relevance gate, adaptive cache, retry/backoff, story dedupe, publisher domains, News search box, `/api/news` lookup, tests, `ff-news-search` skill. |
| 2026-11-09 | **“save this to a git repo”** | Committed the search work and skill to local `main` (`f6d74c5`); no remote was configured. |
| 2026-11-10 | **“if i close the window will this still be saved”** | Confirmed the commit and files persist on disk; explained that the local server and browser UI state do not, and that no off-machine backup exists without a remote. |
| 2026-11-11 | **“add a section that shows the history of prompts and how this was developed by agentic coding”** | This document and the README section. |

## The working method

### 1. Plan first, with evidence

For the search work the agent did not start editing. It read `lib/playernews.js`,
`public/js/playernews.js` and `views/news.js`, then analysed the live cache:

- 45 players, 1,078 headlines, all Google redirect links.
- 85 of 4,266 players could never match their own name (`Ja'Marr Chase`, `De'Von Achane`, …).
- `Chicago Bears` had 0 cached headlines; defenses were excluded from the scan.
- The server kept 3 days while the UI claimed 7.
- One A.J. Brown story appeared under three players.

The plan was approved before implementation. That is why the final commit fixes a named list of
defects rather than “improving search” in the abstract.

### 2. Skills are contracts

The ff-* skills are not decoration. Each engine has a written contract and the app mirrors it:

- `ff-decision-engine` ↔ `public/js/decision.js` + `public/js/playernews.js`
- `ff-news-search` ↔ `lib/playernews.js` + `views/news.js` + `/api/news`

When a hand-written brief and the dashboard disagree, the dashboard is treated as the source of
truth and the docs are corrected.

### 3. Deterministic runtime, agentic development

The agent writes code; the app does not call an LLM at runtime. Classification, scoring, health
gates and search ranking are regex + weights + thresholds, so the same inputs produce the same
output. “Agentic” describes the development loop, not the product.

### 4. Small commits, one concern each

Each phase was committed separately (`nav`, `news`, `decision`, `docs`, `search`). That keeps the
history readable and makes a bad phase easy to revert without losing the rest.

### 5. Verify against the running app

Every phase ended with:

- `node --check` / `npm test`
- server restart and live snapshot fetch
- browser route sweep with console-error check
- 390px and 1440px overflow checks
- degraded/disabled feed states

Examples from the search commit: 37 players scanned, 840 headlines, 0 failures; 10/10 tests;
0 console errors on 8 routes; 0 horizontal overflow at 390 and 1440.

### 6. Leave a handoff

The search work shipped with:

- `skills/ff-news-search/SKILL.md` — how the search behaves and how to answer questions about it.
- `references/contract.md` — query, matcher, cache, payload and copy rules.
- `references/next-iteration.md` — collision disambiguation, link resolution, source quality,
  evaluation harness and the remaining UX.

## What the human did vs. what the agent did

| Human | Agent |
| --- | --- |
| Set the league, team and product goal | Read the live snapshot and cache |
| Supplied the ff-* rules and constraints | Proposed the phased plan |
| Approved the search plan and nav scope | Implemented the phases |
| Chose the trade deadline / waiver / IR rules | Wrote deterministic engines and tests |
| Reviewed the output and asked for changes | Ran the server, browser checks and docs |
| Made the final “save it” call | Committed locally and reported the state |

## Reproduce the checks

```bash
cd ff-roster-monitor
npm test                 # matcher, parser, queries, relevance, story clustering
node server.js           # http://localhost:4321
curl localhost:4321/api/snapshot | head -c 200
```

The app has no build step and no runtime dependencies beyond Node 18+.
