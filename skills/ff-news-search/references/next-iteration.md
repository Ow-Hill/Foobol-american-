# News search — next iteration backlog

The current engine is deterministic and local-first. These are the next changes in priority order.
Each item names the file, the acceptance test, and the risk.

## P5.1 — Same-name disambiguation

**Problem:** `Josh Allen` matches the Bills QB and the Jaguars edge rusher. `A.J. Brown` and other
common names can collide with college or other-sport coverage.

**Change:** pass `pos` and `team` into `headlineHit`; build a small alias map for team nicknames and
city names; reject or down-rank a headline when it names a different NFL team and no matching
position cue. Keep the exact-name query, but add one team-qualified variant only for names on the
collision list.

**Files:** `lib/playernews.js` (`headlineHit`, `queriesFor`), `lib/snapshot.js` (already passes
`pos`/`team`).

**Acceptance:** a fixture with the QB and edge-rusher Josh Allen returns only the correct player's
items for a team-qualified query; no regression on the 9 existing matcher tests.

**Risk:** over-filtering legitimate national stories. Measure precision/recall on the golden set
before enabling the filter for every player.

## P5.2 — Publisher links

**Problem:** every cached link is `news.google.com/rss/articles/…`. The domain chip helps, but the
reader still lands on a redirect.

**Change:** add a click-through resolver (`/api/news/link?url=…`) that follows the Google redirect
once, caches the final URL for 24h, and returns a 302. Do not bulk-resolve on refresh; that is the
fastest route to a 429.

**Files:** `server.js`, `lib/playernews.js` (cache final URL), `views/news.js` (link).

**Acceptance:** opening a headline resolves to the publisher; resolver failures fall back to the
Google URL; no more than one outbound request per link per day.

## P5.3 — Source quality and diversity

**Problem:** volume is concentrated (Yahoo 186, RotoBaller 76, FantasySP 13 in one snapshot).
Tier 1 alone does not mean “best for fantasy”.

**Change:** replace the flat `TIER1`/`TIER2` regex with a scored source map (official team/beat >
national > fantasy desk > aggregator). Add a per-source quota per player (already capped at 8) and
a diversity rule: at most two items from the same source in a top-10 list.

**Files:** `public/js/playernews.js` (`tierOf`, `scoreAll`), `lib/playernews.js` (cap).

**Acceptance:** top-10 Wire/League lists contain at least three distinct sources when available;
no source contributes more than 40% of a player’s rows.

## P5.4 — Evaluation harness

**Problem:** the matcher and ranking are tested by hand. There is no precision/coverage number.

**Change:** add `test/fixtures/news-golden.json` with 12 players (apostrophe, hyphen, initials,
suffix, defense, collision) and 5–10 human-labelled relevant headlines each. Add
`test/news-eval.test.js` that computes precision@10 and coverage. Run in `npm test` but keep it
non-blocking until the baseline is recorded.

**Files:** `test/`, `package.json`.

**Acceptance:** precision@10 ≥ 0.8; coverage ≥ 80% for players who have news; numbers printed in
the test output.

## P5.5 — Search UX round two

- Add source and date filters to the lookup panel (All / 24h / 3d / 7d; source select).
- Show “also about …” using `alsoPids` on League/Wire rows.
- Add a “Refresh all scanned players” button with a 60s cooldown and a progress count.
- Persist the last search and the open lookup in `localStorage` (`news.ui`), like `nav.open`.
- Add `aria-live="polite"` result count for screen readers.
- Add a recent-players shelf when the search is empty.

**Files:** `public/js/views/news.js`, `public/styles.css`, `public/js/app.js` (state persistence).

**Acceptance:** keyboard-only search works at 390px and 1440px; focus returns to the input after a
rerender; no layout shift when results appear.

## P5.6 — Diagnostics surface

Expose `playerNews.diag` in a small “Feed status” details block on News:

```
37 scanned · 920 headlines · refreshed 4m ago · 0 failed · 3 stale
Sources: Yahoo 186 · RotoBaller 76 · …
```

Link each failed player to the lookup retry. Keep it collapsed by default.

**Files:** `views/news.js`, `styles.css`.

**Acceptance:** a synthetic failed player shows a retry action; the block is hidden when the feed
is healthy.

## P5.7 — Cache and tests

- Add a schema migration test for `data/news-google.json` v1 → v2.
- Test `playerNews` with a mocked `fetch`: 429 then 200; timeout; partial DEF query failure;
  stale-on-failure; backoff `nextTry`.
- Add a 45-player cold-refresh budget test (< 8s with mocked 350ms responses).
- Document the cache file shape in `references/contract.md`.

**Acceptance:** `npm test` covers transport states; no test writes to the live cache file (use a
temp `DATA_DIR` override or dependency injection).
