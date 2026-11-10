# News search — contract and examples

Source of truth: `lib/playernews.js` (transport), `public/js/playernews.js` (classification),
`public/js/views/news.js` (UI), `lib/snapshot.js` (scan + payload), `server.js` (`/api/news`).

## 1. Query construction

| Player kind | Queries |
| --- | --- |
| Skill player | `"<full name>" NFL when:7d` |
| Team defense | exact name, `"<nickname> defense" NFL when:7d`, `"<nickname> D/ST" NFL when:7d` |

Google News RSS URL shape:

```
https://news.google.com/rss/search?q=<encoded>&hl=en-US&gl=US&ceid=US:en
```

Do not use OR-batched names. It breaks `when:` and returns cross-player noise.

## 2. Name matching

`normalizeName`:

```
NFD → strip diacritics → lowercase → remove ' and ’ → remove . → hyphen to space
→ non-alphanumeric to space → collapse spaces
```

`nameTokens` drops a trailing suffix from `jr sr ii iii iv v` and returns `{ first, last, all }`.

`headlineHit(name, title, opts)`:

1. DEF path when `opts.pos === 'DEF'` or the name ends in `D/ST` / `defense`:
   require a defense cue and a nickname/city/abbreviation hit.
2. Otherwise require the normalized surname token.
3. Require a first-name match before the surname:
   - exact token (`jamarr`, `devon`, `amon`);
   - concatenated initials (`aj` from `a` + `j`);
   - single initial prefix (`A. Brown`, `T. Hockenson`);
   - middle tokens are allowed (`Amon-Ra St. Brown`).

After the name match, `relevant(title, player)` requires an NFL/fantasy/status cue (`nfl`,
`football`, `fantasy`, `injury`, `practice`, `trade`, `week 9`, `touchdown`, `field goal`, etc.) or
one of the player’s team aliases (`MIA` → `miami`, `dolphins`). Name-only lifestyle stories are
dropped.

Test table (also in `test/news-search.test.js`):

| Name | Title | Result |
| --- | --- | --- |
| `Ja'Marr Chase` | `Ja'Marr Chase explodes for 120 yards` | true |
| `De'Von Achane` | `De'Von Achane expected to play` | true |
| `A.J. Brown` | `AJ Brown wants out of New England` | true |
| `A.J. Brown` | `A. Brown wants out of New England` | true |
| `T.J. Hockenson` | `T.J. Hockenson limited in practice` | true |
| `Amon-Ra St. Brown` | `Amon-Ra St. Brown practices in full` | true |
| `Marvin Harrison Jr.` | `Marvin Harrison Jr. scores twice` | true |
| `James Cook` | `Dalvin Cook signs with the Bills` | false |
| `Chicago Bears` DEF | `Bears defense dominates` | true |
| `Chicago Bears` DEF | `CHI D/ST forces turnovers` | true |
| `Chicago Bears` DEF | `Chicago Bears offense struggles` | false |

## 3. Cache states

| State | Condition | UI |
| --- | --- | --- |
| fresh | `now - t < ttlFor(player)` | normal row |
| stale | TTL expired, refresh not attempted or failed | row still shown; `perPlayer[pid].stale`; row appends `· stale` |
| failed | `failCount > 0` | `degraded` banner; `failed[]` diagnostics |
| disabled | `config.news.search === false` | notes + ESPN only; Rumours empty copy |

`ttlFor`: `hot` 3m, `cold` 30m, otherwise 10m. `backoffMs`: `60s × 2^(failCount-1)` capped at 15m
plus up to 5s jitter. `get` retries 429/5xx/timeout once; `Retry-After` is capped at 5s.

## 4. Story clustering

`attachStories(items)`:

- Window: 72 hours between items.
- Token set: normalized words longer than 3 characters, minus `STOP`.
- Merge if any member has `shared >= 3` **and** `Jaccard >= 0.7`.
- Set `storyId = 's' + hash(first title)` and `alsoPids` (other players in the cluster).

UI effect: `rankList` in `views/news.js` keeps the first (highest-scoring) row per `storyId` for
League, Wire and Rumours. “Your players” does not apply the global filter, so each player’s own
drawer still shows the story.

## 5. On-demand lookup

`GET /api/news?pid=<player id>`

- Looks up the player in the current snapshot.
- Calls `playerNews([{ id, n, pos, team, hot: true }], { force: true })`.
- Returns `{ pid, items, diag, perPlayer }`.
- Rate limit: 5 seconds per player, 30 requests per minute globally. 429 body:
  `{ "error": "News lookup is rate limited. Try again in a few seconds." }`.

Client: `lookupItems(M, pid, raw)` classifies the fetched headlines with the same regex and tier
rules as the snapshot path, then the lookup panel merges them with cached notes/articles.

## 6. Copy rules

- Never say a headline confirms a status. RotoWire note status is authoritative.
- Never describe an article body; only the headline + source + link.
- Always show the publisher domain when available (`sports.yahoo.com`), not just “Google News”.
- Say “stale” when the player’s cache is older than its TTL.
- Say “not scanned” when a player is outside the roster + hot-name set; offer the lookup instead.
