# Worked examples

All numbers are from the live Week 9 snapshot on **2026-11-05** (roster 4, 3-5, waiver
priority #2, trade deadline Wed 2026-11-18). They will drift; use them to check the method, not
as current advice.

## Example 1 — a starter who is a game-time decision

**Facts**

- Malik Nabers is in the FLEX slot, projected **15.72**.
- Latest RotoWire note (ESPN, tier 1, 1.6 h old): jersey and helmet on, but he worked with the
  Giants' training staff; status **Questionable**.
- Model's raw fallback: A.J. Brown, **13.22** — but Brown's own latest note is a **DNP**.
- Health-filtered fallback: Greg Dulcich, **8.20** → drop-off **7.52**.

**Decision**

| Field | Value |
| --- | --- |
| kind / priority | `injury` / `this-week` |
| title | Malik Nabers is a game-time decision |
| verdict | Start Malik Nabers only if active; Greg Dulcich is the fallback (8.2 proj). |
| because | Effective tag: Questionable (undisclosed). · He is in your FLEX slot. · Greg Dulcich projects 8.2. |
| deadline | Inactives before Sun 11:30 AM (kickoff − 90 min) |
| confidence | **65** |

**Confidence arithmetic:** health basis 55 + two distinct sources (RotoBaller, Athlon) 10 = 65.
No note in the two newest evidence items, so no +15.

**What the engine refused to do:** name A.J. Brown as the fallback. Brown is Questionable *and*
did not practice, so he fails the health gate even though the model ranks him higher.

## Example 2 — the health gate suppresses a "Clear" swap

`M.swaps()` returns one upgrade:

| Start | Bench | Slot | Gap | Band | Call |
| --- | --- | --- | --- | --- | --- |
| A.J. Brown (13.22) | Devin Singletary | FLEX | **4.48** | clear | Clear |

By gap alone this would be `this-week` (≥ 4). The engine drops it entirely because Brown's
latest dated report is:

> Brown (ankle/knee) isn't present for the portion of Thursday's practice open to media view
> — ESPN, tier 1, **DNP**, status **Questionable**.

Instead the brief emits the lowest-severity version of the same fact:

| Field | Value |
| --- | --- |
| kind / priority | `monitor` / `watch` |
| title | A.J. Brown: DNP in the latest report |
| verdict | DNP. One report alone can't flip the start/sit — recheck inactives ~90 min before kick. |
| because | Practice: DNP. · Status: Questionable. · Tags: injury, practice. |
| confidence | 65 (news 55 + two distinct sources 10) |

This is the rule in action: health beats models. A projection edge does not survive a player
who has not practiced. A single practice report on a **bench** player is a watch item; it does
not create an `act` decision.

## Example 3 — a waiver need with no open spot

**Facts**

- `waiverPlan()` need: **"Week 10 byes: Chicago Bears"**, priority 3, claim true.
- Detail: "Lineup would have empty DEF slot."
- Open roster spots: **0**. Waiver priority: **#2 (rolling)**.

**Decision**

| Field | Value |
| --- | --- |
| kind / priority | `waiver` / `this-week` |
| verdict | Lineup would have empty DEF slot. You need to drop someone first. |
| because | Priority 3 on this week's needs. · Waiver priority: #2 (rolling). |
| deadline | Waivers process Tuesday |
| confidence | **70** |

**Why `this-week` and not `act`:** only a need with priority ≤ 1 becomes `act`. The slot is not
empty yet, and the roster is full, so the first move is a drop — which belongs to
`ff-waiver-plan`. Confidence is the plain projection base (70): no evidence items, no
modifiers, no `act` bonus.

## Example 4 — what it takes for a starter DNP to reach `act`

A DNP on a **bench** player is quiet. A DNP on a **starter** is only `act` when the lineup cost
is severe. Tested on a cloned snapshot with A.J. Brown moved into the FLEX slot:

| Fallback situation | Impact part | Relevance | Bucket |
| --- | --- | --- | --- |
| No healthy fallback (every bench body blocked) | 0.9 | **≈ 91** | `act` |
| Equal-value healthy replacement | 0.0 | **≈ 64** | `week` |

Arithmetic for the first row under the `mine` profile:

```
100 × (0.12×1.0 + 0.28×0.9 + 0.12×0.7 + 0.36×1.0 + 0.07×0.66 + 0.05×1.0)
  = 100 × 0.912 ≈ 91
```

The severity is the same in both rows; only the lineup impact changes. That is deliberate:
relevance is led by how bad the news is **and** what it costs the lineup, not by the fact that
the player is merely rostered. It also explains why a healthy roster legitimately produces
**0 act** — a headline alone should not force a move.

## Regression checks after a change

| Check | Expected |
| --- | --- |
| Practice classifier (FP/LP/DNP/EST) | 5/5 |
| Posture / false-positive cases (`championship`, `headline`, `is present`) | all pass |
| Items scored | ~1,200 over 19 roster players in ~150–170 ms |
| Route sweep | 19 routes render, 0 console errors |
| Briefing feed | still renders from the shared `feedItem` export |
| Act bucket | can be empty; verify there is no starter DNP before "fixing" it |

Re-run the engine in the dashboard console:

```js
const snap = await (await fetch('/api/snapshot')).json();
const M = buildModel(snap, snap.meta.defaultRosterId, Date.now(), null);
const news = playerNewsFor(M);
console.table(buildDecisions(M, news).decisions.map(d => ({
  priority: d.priority, kind: d.kind, title: d.title, confidence: d.confidence,
})));
```
