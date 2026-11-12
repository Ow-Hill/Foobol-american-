# Skills

These are the skill contracts the dashboard and the agent follow. The app mirrors the deterministic
engines in `public/js/`; when prose and code disagree, the dashboard is the source of truth and the
skill is corrected.

## Workflow skills

| Skill | Use it for |
| --- | --- |
| [`ff-command-center`](ff-command-center/SKILL.md) | Start here. Ground rules, connector routing, league facts, resolving source disagreements. |
| [`ff-lineup-call`](ff-lineup-call/SKILL.md) | Who to start, sit or flex; set the weekly lineup; pre-kickoff check. |
| [`ff-injury-triage`](ff-injury-triage/SKILL.md) | Hurt/questionable/IR players, conflicting tags, replacement naming. |
| [`ff-waiver-plan`](ff-waiver-plan/SKILL.md) | Claims, drops, streamers, handcuffs, rolling priority. |
| [`ff-trade-lab`](ff-trade-lab/SKILL.md) | Trade ideas, offers, counters, walk-away lines before the Week 11 deadline. |
| [`ff-season-planner`](ff-season-planner/SKILL.md) | Playoff odds, recaps, efficiency audits, deadline push, playoff prep. |

## Dashboard and analysis skills

| Skill | Use it for |
| --- | --- |
| [`ff-decision-engine`](ff-decision-engine/SKILL.md) | Ranked act / this-week / watch brief; mirrors `public/js/decision.js`. |
| [`ff-news-search`](ff-news-search/SKILL.md) | Player-news search, matcher, cache, story dedupe, lookup UI; mirrors `lib/playernews.js`. |
| [`ff-ml-projections`](ff-ml-projections/SKILL.md) | Age curves, opportunity share, projection methodology and validation scripts. |
| [`playoff-schedule-strength`](playoff-schedule-strength/SKILL.md) | Opponent strength across Weeks 15–17, bye risk, schedule matrix scripts. |

## Notes

- `ff-decision-engine` and `ff-news-search` are repo-local; the others came from the source skill
  zips supplied for this project.
- `ff-news-search/references/next-iteration.md` is the working backlog for search.
- Skills are documentation, not runtime dependencies. The app has no build step and calls no LLM.
