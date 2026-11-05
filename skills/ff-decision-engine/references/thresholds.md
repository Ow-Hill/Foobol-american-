# Decision engine — thresholds and rules

Every number here is implemented in `public/js/playernews.js` (evidence + scoring) and
`public/js/decision.js` (ranking + confidence). When a hand-written brief disagrees, follow the
code. Values verified against the Week 9 snapshot, 2026-11-05.

## 1. Window and freshness

| Item | Value |
| --- | --- |
| Evidence window | 7 days (604,800,000 ms) |
| Per-player evidence shown in a decision | 2 newest non-duplicate items |
| Google News cache | 10 minutes, disk-backed, stale-on-failure |
| Snapshot cache | 45 seconds, stale-while-rebuild |
| Headline fetch | one query per player, headline + source + link only |
| Degraded flag | set when `news.search` is off or a refresh partially failed |

Never present a cached headline as newer than its timestamp. If the feed is degraded, say so
and apply the confidence penalty in §7.

## 2. Classification

### Practice (first match wins)

1. `full` → `FP`
2. `DNP`
3. estimated / walkthrough → `EST`
4. limited / side work / individual drills → `LP`

### Status

| Source | Rule |
| --- | --- |
| RotoWire note | `statusHint` is authoritative; canonicalise it |
| Headline/article | `IR` → `Out` (unless an activation phrase is present) → `Doubtful` → `Questionable` |

Activation phrases (`activated`, `cleared to play`, `designated to return`, `expected to play`)
prevent an `Out` match from firing. Anchors matter: `championship`, `headline` and
`is present` must not create injury/DNP flags.

### Posture

| Posture | Rule |
| --- | --- |
| `confirmed` | RotoWire note with no rumour language |
| `speculative` | Non-note, rumour language present, and no official/announce/confirm/activated/cleared phrase |
| `reported` | Everything else |

`better = !speculative && (activation phrase OR (status Questionable AND practice FP))`.

## 3. Severity

```
statusRank:  IR/PUP/Sus 5 · NA/DNR/COV 4 · Out 4 · Doubtful 3 · Questionable 2 · Probable 1
practiceRank: DNP 3 · EST 2.4 · LP 2 · FP 0.6

severity = 0
if status:   severity = statusRank / 4
if practice: severity = max(severity, practiceRank / 3)
if better:   severity = min(severity, 0.35)
if speculative: severity *= 0.6
severity = min(severity, 1)
```

Practice alone: FP 0.20, LP 0.67, EST 0.80, DNP 1.00.
Status alone: Probable 0.25, Questionable 0.50, Doubtful 0.75, Out/IR 1.00.

## 4. Direction ("worse" / "better" / "flat")

Rank each item: `max(statusRank, practiceRank)`; an activated/`better` item ranks 0.5. Compare
against the previous **status-bearing** report only (practice-only items do not set the bar):

| Condition | Direction |
| --- | --- |
| rank > previous + 0.4 | `worse` |
| rank < previous − 0.4 and no adverse tag | `better` |
| otherwise | `flat` |

Adverse tag = any practice other than FP, or status Out/IR/Doubtful. An adverse report can
never read as improvement, even if a later status rank is numerically lower.

## 5. Dedupe

Search headlines for the same player are clustered with Jaccard similarity ≥ 0.6 over tokens
longer than four characters (stop-words removed). Keep the best tier (ESPN breaks ties), record
`reps` = outlet count, and mark the rest `dupe` — never score them, never count them as
independent evidence.

## 6. Relevance score (0–100)

`score = 100 × Σ weightᵢ × partᵢ` under one profile per tab.

| Weight | mine ("Your players") | league | wire |
| --- | --- | --- | --- |
| roster | 0.12 | 0 | — |
| impact | 0.28 | 0.20 | 0.35 |
| availability | — | — | 0.25 |
| urgency | 0.12 | 0.10 | 0.15 |
| severity | 0.36 | 0.25 | 0.15 |
| league | 0.07 | 0.40 | 0.05 |
| tier | 0.05 | 0.05 | 0.05 |

### Parts

| Part | Value |
| --- | --- |
| `roster` | mine: starter 1.0 · bench 0.4 · IR 0.2 · rostered elsewhere 0.2 · unrostered 0.1 |
| `impact` | not mine 0; mine default 0.15; my starter = `min(1, healthyFallbackSlack / 4)`, or 0.9 when there is no healthy fallback; trade chatter within 10 days of the deadline = at least 0.6 |
| `urgency` | no game 0.25 · already kicked 0.15 · ≤2 h 1.0 · ≤26 h 0.9 · ≤74 h 0.7 · ≤7 d 0.5 · else 0.3 |
| `severity` | §3 |
| `league` | owner win% × 0.6 + 0.4 if trade and deadline < 10 d + 0.15 if practice; ownerless/unknown win% = 0.35 |
| `tier` | tier 1 = 1.0 · tier 2 = 0.5 · tier 3 = 0 |

### Source tiers

| Tier | Sources (examples) |
| --- | --- |
| 1 | ESPN, NFL.com, Yahoo, CBS, NBC Sports, Fox, The Athletic, RotoWire, SI, PFT, PFF, Boston Globe, The Ringer, Reuters, AP, NYT, Washington Post, The Score |
| 2 | FantasyPros, Fantasy Footballers, RotoBaller, ClutchPoints, USA Today, Bleacher Report, WalterFootball, DraftSharks, Peacock, Sporting News, numberFire |
| 3 | everything else |

### Buckets (mine profile)

| Bucket | Score |
| --- | --- |
| `act` | ≥ 75 |
| `week` | 55–74 |
| `watch` | 35–54 |
| `background` | < 35 |

A player row uses his highest-scoring non-duplicate item. With no items, the row is `week` if
he is a starter or has effective severity ≥ 2, else `background`.

## 7. Decision ranking and confidence

### Ranking

| Rank | Priority | | Rank | Kind |
| --- | --- | --- | --- | --- |
| 0 | `act` | | 3 | `injury`, `lineup` |
| 1 | `this-week` | | 2 | `waiver` |
| 2 | `watch` | | 1 | `trade` |
| | | | 0 | `monitor` |

Sort: priority → kind (descending) → confidence (descending). This is why a starter's health
outranks a bye-week waiver note at the same priority.

### Confidence

| Modifier | Points |
| --- | --- |
| Base, `basis: projection` | 70 |
| Base, any other basis | 55 |
| Any RotoWire note in evidence | +15 |
| ≥ 2 distinct sources in evidence | +10 |
| All evidence speculative (and evidence present) | −20 |
| News degraded or disabled | −10 |
| Priority `act` | +5 |

Clamp to **20–95**. Deterministic: no random jitter, no model output.

## 8. Candidate gates

### 8.1 Hard problems → `act`

Only `sev: critical` from `M.problems()`: empty starting slot, starter out, starter on bye, IR
lock. Kind comes from the destination tab (`injuries` → injury, `waivers` → waiver, else
lineup). Basis `health`. Marks the player handled so later sections skip him.

### 8.2 Game-time decision → `this-week`

A starter with effective availability `q`, not already handled. Find the healthiest fallback;
verdict is "start only if active; X is the fallback (projection)". Deadline = kickoff − 90
minutes. If no healthy fallback exists, say "claim one before Sunday".

### 8.3 Lineup swap

Skip empty slots and swaps without a bench-out. **Suppress the swap entirely when the incoming
player has any non-duplicate DNP/Out/IR report** — this is the health gate.

| Gap / band | Priority |
| --- | --- |
| `band: hard` or gap ≥ 6 | `act` |
| gap ≥ 4 | `this-week` |
| gap < 4 | `watch` |

Evidence: up to two items for the incoming player and one for the outgoing, capped at three.

### 8.4 Waivers

- Needs with a claim, top 3: priority `act` when need priority ≤ 1, else `this-week`.
- Tier-1 adds, top 2: `watch`.
- Deadline: next waiver run (Tuesday). Rolling priority: a won claim sends Owen to last.

### 8.5 Trade

Only when the deadline has not passed, `acceptBy` exists, and 0 ≤ days ≤ 10.
Priority `act` within 4 days, else `this-week`. Use the top target from `marketFor()`; the
pitch itself belongs to `ff-trade-lab`.

### 8.6 News monitors

My players, not on IR, bucket `act` or `week`, and not already covered by another decision.
Require a top item with DNP, a status, or an injury tag. Priority:

| Spot | Bucket `act` | Bucket `week` |
| --- | --- | --- |
| Starter | `act` | `this-week` |
| Bench | `watch` | `watch` |

Cap at three. Basis `news`. This is how a starter's single practice report stays a monitor
instead of becoming a benching.

## 9. Health gate (fallbacks)

`healthiestFallback(M, slot, exclude, byPid)` asks `M.fallbackFor` up to four times and rejects
a candidate when:

- his availability is `out` or `bye`; or
- any non-duplicate item reports practice `DNP` or status `Out`/`IR`.

The model's own `fallbackFor` only discounts Questionable players, so the decision layer must
apply this filter. Never name a rejected player in the verdict, the `because` list, or the
"if he sits" line.

## 10. Calendar constants

| Item | Value |
| --- | --- |
| League trade deadline | Week 11; deals must be **accepted by Wed 2026-11-18** (snapshot `acceptBy` 2026-11-19T01:15Z) |
| NFL trade deadline | Tue 2026-11-10 (per snapshot note) |
| Trade window in the engine | opens when ≤ 10 days to `acceptBy` |
| Re-check | inactives ~90 minutes before kickoff |
| Waivers | rolling priority, process Tuesday, 2-day clear |
| Playoffs | Weeks 15–17; deadline prep belongs to `ff-season-planner` |

## 11. Guardrails by kind

Every decision starts with: **"Advice only — make the move yourself in the Sleeper app."**

| Kind | Additional guardrail |
| --- | --- |
| injury | Most-severe label wins until a dated report says otherwise |
| injury, lineup | Re-check inactives ~90 minutes before kickoff |
| waiver | Rolling waivers: a won claim sends you to last priority |
| trade | A deal is not made until accepted and cleared review in Sleeper |
| any | If every evidence item is speculative: it can raise a flag but cannot flip a start or sit |
