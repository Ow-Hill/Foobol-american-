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
`football`, `fantasy`, `injury`, `practice`, `trade`, `week 9`, `touchdown`, `field goal`, `bye`,
etc.) or one of the player’s team aliases (`MIA` → `miami`, `dolphins`). Generic words that occur
in every sport (`play`, `out`, `game`, `season`, `return`, `points`, `pass`) are not cues.
Name-only lifestyle stories are dropped.

`nameConflict(title, player)` runs first and rejects a same-name player: the words directly before
the name are another NFL team (`Jaguars' Josh Allen`, `Jaguars LB Josh Allen`) or a defensive
position for an offensive player (`edge rusher Josh Allen`), and the headline never names the
player's own team. A team elsewhere in the headline (`Chiefs reunite with Tyreek Hill`) does not
count.

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
| `Josh Allen` QB BUF | `Jaguars' Josh Allen records two sacks` | false (relevant) |
| `Josh Allen` QB BUF | `Josh Allen throws 3 TDs vs Dolphins` | true (relevant) |
| `Tyreek Hill` WR MIA | `Chiefs reunite with Tyreek Hill? Fantasy outlook` | true (relevant) |

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

- Looks up the player in the current snapshot, then in the full Sleeper player list, so any NFL
  player can be fetched.
- A single-player lookup never prunes the cache file (only a full scan knows who is followed).

`GET /api/players?q=<3+ letters>` searches every NFL skill player by name (8 results) for the
"Search all NFL players" button when the snapshot has fewer than 4 matches.
- Calls `playerNews([{ id, n, pos, team, hot: true }], { force: true })`.
- Returns `{ pid, items, diag, perPlayer }`.
- Rate limit: 5 seconds per player, 30 requests per minute globally. 429 body:
  `{ "error": "News lookup is rate limited. Try again in a few seconds." }`.

Client: `lookupItems(M, pid, raw)` classifies the fetched headlines with the same regex and tier
rules as the snapshot path, scores them with the same profiles, adds the "so what" for your own
players, then the lookup panel merges them with cached notes/articles.

## 6. Copy rules

- Never say a headline confirms a status. RotoWire note status is authoritative.
- Never describe an article body; only the headline + source + link.
- Always show the publisher domain when available (`sports.yahoo.com`), not just “Google News”.
- Say “stale” when the player’s cache is older than its TTL.
- Say “not scanned” when a player is outside the scan set (below); offer the lookup instead.
- Label ripple rows “Estimate” with their confidence; never call one a projection.

## 7. Scan set (`lib/snapshot.js`)

In order, deduped, capped at 65 names:

1. My roster and IR (`hot` for starters).
2. This week's opponent's starters.
3. NFL teammates of my starters: QB1, RB1–RB2, every WR slot's #1, TE1 (`cold`).
4. Sleeper trending adds (top 20) and drops (top 8) that are **free agents in this league** (`cold`).

Every depth ≤ 3 skill player on my roster's NFL teams is also added to the snapshot's player set,
so teammate news resolves, is searchable and can carry a ripple.

## 8. Relevance profiles (`public/js/playernews.js`)

| Tab | Weights |
| --- | --- |
| Your players | roster .12 · impact .28 · urgency .12 · severity .36 · league .07 · tier .05 |
| League | opponent .30 · impact .20 · urgency .10 · severity .25 · league .10 · tier .05 |
| Wire | impact .30 · opportunity .35 · availability .10 · urgency .10 · league .10 · tier .05 |

- **opponent**: 1 when the player starts against me this week, 0.5 on that roster's bench.
- **Wire impact**: `M.addImpact(pid)` (lineup points he would add) / 5, capped at 1.
- **opportunity**: high for a promotion, activation or positive ripple; 0.05 for his own Out/IR/DNP.
- **availability**: 1 when a ripple says a starter ahead of him is out.
- Ripple rows are capped at 74 under every profile, so an estimate never reaches “Act now”.

See `ripple.md` for the ripple rules.
