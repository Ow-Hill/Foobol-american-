---
name: ff-decision-engine
description: Ranks this week's moves for Owen's James Cook Lovers Sleeper team into act / this-week / watch, each with evidence, risk, a deadline and a deterministic confidence score. Mirrors the dashboard's Decision brief (public/js/decision.js). Use for "what should I do this week", "what matters most", a pre-kickoff brief, or to explain why the app is flagging something.
---

# FF Decision Engine

Turns the roster model and the news engine into one ranked list of decisions. It does not
replace the workflow skills — it decides **what to do first** and **why**, then hands each
item to the skill that owns the detail.

Read `ff-command-center` first if it is not already loaded. The five rules there still apply,
especially: live roster first, health beats models, relay don't invent, advice only.

The app is the source of truth for this contract. `public/js/decision.js` exports
`DECISION_CONTRACT`, `PRIORITY_RANK`, `PRIORITY_LABEL` and `buildDecisions(M, news)`;
`public/js/playernews.js` builds the evidence and scores. If a hand-written brief and the
dashboard disagree, the dashboard is right — fix the engine or say why you are overriding it.

## When to hand off

| The question is… | Go to | This skill still does |
| --- | --- | --- |
| Start X or Y, set my lineup | `ff-lineup-call` | Puts the lineup call at the right priority and supplies evidence |
| A player is hurt or on IR | `ff-injury-triage` | Applies the health gate and the re-check time |
| Pickups, drops, streamers | `ff-waiver-plan` | Surfaces the need and the claim deadline |
| Trade ideas, an offer, a counter | `ff-trade-lab` | Enforces the deadline window and the walk-away rule |
| Odds, playoffs, season plan | `ff-season-planner` | Adds context, not a separate decision list |

## Build the brief

### Step 1 — Refresh the facts

1. Flaim `get_roster` (team 4, Sleeper, 2026). Never use a remembered roster.
2. Confirm the week, waiver priority, trade deadline and this week's opponent from the live
   snapshot or `ff-command-center` references.
3. Note whether headline search is available. If it is off or a refresh failed, the brief is
   **degraded** — say so and lower confidence (see `references/thresholds.md`).

### Step 2 — Collect evidence

For every candidate, keep at most the two newest items from the last 7 days:

- **RotoWire note** — the status field is authoritative, even when the prose disagrees.
- **ESPN article** — headline + description.
- **Google News headline** — headline, source, link only. Never fetch or invent the article body.

Record per item: source, time, source tier (1/2/3), posture (`confirmed` / `reported` /
`speculative`), practice (FP/LP/EST/DNP), status, and category. If two headlines say the same
thing, keep the better-sourced one and report the outlet count. Do not count syndicated copies
as independent confirmation.

### Step 3 — Build candidates in this order

Stop adding a decision only when its `id` already exists. The order matters because later
sections skip players already handled.

1. **Hard problems** — empty slot, starter out/on bye, IR lock → `act`.
2. **Game-time decisions** — starters tagged Questionable → `this-week`, with a healthy fallback.
3. **Lineup swaps** — model upgrades with a real gap → `act` / `this-week` / `watch`.
4. **Waiver needs and the best claim** — need first, then tier-1 adds.
5. **Trade window** — only inside 10 days of the league deadline.
6. **News monitors** — act/week news that is not already a decision.

Exact gates, weights and cut-offs: `references/thresholds.md`.

### Step 4 — Apply the health gate

Health beats models, and it applies to both sides of a move:

- Never recommend starting a player whose latest dated report says **DNP, Out or IR**.
- Never name such a player as the fallback either. Retry up to four bench bodies.
- A Questionable player is startable, but the brief must be conditional and name the re-check.
- A single practice report on a starter is a **monitor**, not a benching. Wait for the official
  status or inactives.
- Most-severe label wins until a dated report confirms the upgrade. A speculative report can
  raise a flag; it can never produce `act`, `better`, or a start/sit on its own.

### Step 5 — Rank and score

Sort by `priority`, then `kind` (injury/lineup before waiver, trade, monitor), then
`confidence`. Confidence is arithmetic, not vibes — see the formula in
`references/thresholds.md`. A brief with **0 act** is a valid, healthy result: say the roster is
legal and healthy, then show the nearest watch items that could escalate.

## Output contract

Mirror `DECISION_CONTRACT` exactly. Every decision has:

| Field | Meaning |
| --- | --- |
| `id` | Stable string, so a re-run does not duplicate a decision |
| `kind` | `lineup` · `injury` · `waiver` · `trade` · `monitor` |
| `priority` | `act` · `this-week` · `watch` |
| `title` | Short imperative ("Start X over Y") |
| `verdict` | One sentence: what to do |
| `because` | `string[]` — the two or three numbers that decide it |
| `evidence` | `{ text, src, time, url, tier, posture }[]` |
| `risk` | One sentence: what would make this wrong |
| `confidence` | 20–95, from the deterministic formula |
| `deadline` | `{ label, at }` or `null` |
| `action` | `{ label, route }` — where to act in the app |
| `guardrails` | `string[]` — the rules that constrain this kind |
| `players` | Player id array |
| `basis` | `projection` · `health` · `news` · `market` |

## How a brief reads

Lead with the summary line, then the ranked decisions:

```
0 act · 2 this week · 2 watch · evidence, not commands

| Priority | Kind | Decision | Confidence | Deadline |
|---|---|---|---|---|
| This week | Injury | Malik Nabers is a game-time decision | 65% | Inactives before Sun 11:30 AM |
| This week | Waiver | Week 10 byes: Chicago Bears | 70% | Waivers process Tuesday |
| Watch | Monitor | A.J. Brown: DNP in the latest report | 65% | — |
```

Then, for each `act` and `this-week` item only: verdict, the two or three `because` facts, one
or two evidence links with source and age, the risk, and the action. Group `watch` items into
one short list. Finish with:

- what could not be checked (official inactives, weather, a missing feed);
- the next re-check time (normally ~90 minutes before the relevant kickoff);
- a reminder that every move is Owen's to make in Sleeper.

## Never

- Never say a lineup was set, a claim submitted, or a trade offered or accepted.
- Never turn a headline into a status change. "Report: expected to play" is not active.
- Never average or blend projections from different tools into one number.
- Never let a speculative item be the only support for `act` or for "trending up".
- Never recommend a DNP/Out/IR player, or use one as the fallback.
- Never hide a degraded feed; say which source is missing and lower confidence.
- Never treat bench points as lineup points.

## If you have the dashboard open

```js
// import { buildModel } from '/js/model.js';
// import { playerNewsFor } from '/js/playernews.js';
// import { buildDecisions } from '/js/decision.js';
const snap = await (await fetch('/api/snapshot')).json();
const M = buildModel(snap, snap.meta.defaultRosterId, Date.now(), null);
const news = playerNewsFor(M);          // memoised; same result in News + Briefing
const brief = buildDecisions(M, news);  // { generatedAt, week, decisions, summary }
```

Load `/api/snapshot` for `snapshot`. Do not re-score per render; the news build is cached per
model. In chat without the app, reproduce the same rules from connector data and label the
source of every number.

## References

- `references/thresholds.md` — every weight, rank, formula, gate and deadline in the engine.
- `references/worked-examples.md` — four live walks through the ranking and the health gate.
