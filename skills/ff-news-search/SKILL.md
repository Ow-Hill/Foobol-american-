---
name: ff-news-search
description: How the James Cook Lovers player-news search works and how to use it — exact-name Google News queries, 7-day window, apostrophe/initial/team-defense matching, adaptive cache, failure backoff, cross-player story dedupe, and the News search box with on-demand lookup. Use for "search player news", "why is this player missing", "where did this headline come from", or before changing lib/playernews.js, public/js/playernews.js or views/news.js.
---

# FF News Search

The search is a deterministic transport + ranking pipeline. It never invents a report and never
fetches an article body. The dashboard is the source of truth:

| Layer | File | Owns |
| --- | --- | --- |
| Transport | `lib/playernews.js` | queries, RSS parsing, name matching, cache, retry/backoff, story ids |
| Classification / scoring | `public/js/playernews.js` | practice/status/category, tiers, profiles, `storyId` consumption, lookup rows |
| UI | `public/js/views/news.js` | search box, lookup panel, ranked tabs, coverage/staleness copy |
| Snapshot | `lib/snapshot.js` | which players are scanned, `playerNews.diag` / `perPlayer` payload |
| On-demand lookup | `server.js` | `GET /api/news?pid=…`, rate limiting |

Read `ff-command-center` first. Health beats models; headline search is evidence, not a status
change. Speculative items can raise a flag but never flip a start/sit.

## Search contract (v2)

### Query

- Base query: `"<player name>" NFL when:7d` — exact name, seven days, US English.
- Team defenses add two queries: `"<nickname> defense" NFL when:7d` and
  `"<nickname> D/ST" NFL when:7d`. The exact-name query alone misses “Bears defense”.
- Do **not** batch names into one OR query: Google drops the `when:` filter and precision
  collapses. One player, one (or three) queries.
- No article body is fetched. The RSS item gives headline, source, publisher URL and link.

### Name matching

`headlineHit(name, title, { pos, team })` normalises both sides:

1. Unicode NFD, strip diacritics, lowercase.
2. Remove apostrophes (`Ja'Marr` → `jamarr`), remove periods (`A.J.` → `aj`), turn hyphens into
   spaces (`Amon-Ra` → `amon ra`).
3. Drop suffixes (`Jr`, `Sr`, `II`, `III`, `IV`, `V`).
4. Require the surname token, then a plausible first name: exact, initials (`A. Brown`), or a
   concatenated initial pair (`A.J.` / `AJ`), with middle tokens allowed (`Amon-Ra St. Brown`).
5. Defenses match nickname + a defense cue (`defense`, `D/ST`, `unit`, `def`) or the team
   abbreviation. “Chicago Bears offense struggles” is not a defensive headline.
6. Reject a name-only hit with no football signal: the title must contain an NFL/fantasy/status
   term or one of the player’s team aliases. This drops lifestyle and other-sport stories that
   Google returns because the name is famous.

Known limit: same-name collisions are not resolved by team or position yet (for example
`Josh Allen` QB vs edge rusher). Treat that as a ranking caveat, not a confirmed report.

### Window and cache

| Item | Value |
| --- | --- |
| Server window | 7 days |
| Client evidence window | 7 days |
| TTL — starters / hot names | 3 minutes |
| TTL — roster / normal | 10 minutes |
| TTL — wire / cold names | 30 minutes |
| Failure retry | 1m, 2m, 4m, 8m, 15m cap, with jitter |
| HTTP retry | 429 / 5xx / timeout once, `Retry-After` respected, 5s cap |
| Concurrency | 3 |
| Timeout | 15s |
| Per-source cap | 8 items per player |

Stale-on-failure: a failed player keeps the last good items and is marked stale. One failure must
not blank the tab. `degraded` is true when any player in this refresh failed.

### Story dedupe

`attachStories` clusters headlines across players:

- Compare within 72 hours.
- Significant tokens are words longer than 3 characters, minus stop words.
- Merge only with **at least 3 shared tokens and Jaccard ≥ 0.7**.
- Every item gets `storyId` and `alsoPids`.
- League / Wire / Rumours show one row per `storyId`; “Your players” keeps each player’s own
  report drawer.

This stops one A.J. Brown headline appearing under three players. It deliberately under-clusters
rather than merging two different players’ similar injury reports.

### Payload

`snapshot.playerNews` adds:

```json
{
  "items": [{ "id": "g…", "pid": "7564", "title": "…", "src": "Yahoo Sports",
              "domain": "sports.yahoo.com", "time": 1794000000000,
              "url": "https://news.google.com/rss/articles/…",
              "storyId": "s…", "alsoPids": ["6790"] }],
  "degraded": false,
  "disabled": false,
  "freshAt": 1794000000000,
  "scanned": 37,
  "failed": [{ "id": "…", "error": "429" }],
  "perPlayer": { "7564": { "t": 1794000000000, "stale": false, "failed": false,
                            "failCount": 0, "nextTry": 0, "lastErr": null } },
  "diag": { "version": 2, "windowDays": 7, "scanned": 37, "fetched": 3,
            "failed": 0, "items": 920, "oldestItemAt": 1793000000000,
            "bySource": { "Yahoo Sports": 186 }, "ttlMs": { "hot": 180000,
            "base": 600000, "cold": 1800000 } }
}
```

### Search UI

- Search ranks **my roster → league rosters → free agents**, then value.
- Picking a player opens the lookup panel with cached notes, articles and headlines.
- “Refresh headlines” calls `GET /api/news?pid=…`; the server rate-limits to one request per
  player per 5s and 30 requests/minute. The response is classified client-side with
  `lookupItems`, so no snapshot rebuild is needed.
- Empty lookup copy says headlines are cached for the roster and trending names, not every player,
  and offers a Google News link.
- `/` focuses the search; Arrow keys move the active result; Enter opens; Escape clears.

## How to answer a question

1. **“Why is X missing?”** Check the matcher first (apostrophe, hyphen, initials, DEF), then the
   7-day window, then whether X was scanned (`diag.scanned` covers roster + hot names only).
   A player outside the scan set needs the lookup button, not a claim that no news exists.
2. **“Where did this come from?”** Name the publisher domain, the source tier and the age. The link
   is a Google News redirect; do not describe the article body.
3. **“Is this confirmed?”** RotoWire note status is authoritative. A headline is `reported` or
   `speculative`; it cannot upgrade a player on its own.
4. **“Why did the count change?”** The 7-day window and story dedupe both change counts. League /
   Wire / Rumours are one row per story, so 920 items can produce fewer rows.

## Acceptance checks

- `npm test` passes `test/news-search.test.js` (matcher, parser, queries, story clustering).
- A player with an apostrophe in the first name returns headlines.
- `Chicago Bears` returns defensive headlines.
- Two players mentioned in one story produce one League/Wire row, not two.
- A 429/timeout leaves the last good rows visible and marks the player stale.
- No horizontal overflow at 390px or 1440px on News.

## Next iteration

`references/next-iteration.md` is the working backlog: collision disambiguation, link resolution,
source quality, evaluation harness, and the remaining search UX. `references/contract.md` has the
field-by-field payload and examples.
