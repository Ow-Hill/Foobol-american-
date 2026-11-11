# Roadmap — scanner, news and site

Written after the scanner/news audit and the teammate ripple engine (`public/js/ripple.js`).
Ordered by value to the weekly decisions (lineup, waivers, trades) per hour of work. Each item names
the files, how to know it worked, and the risk. Items marked **verify** depend on a data field or
endpoint that has to be confirmed against a live response first; this was planned without live
access to Sleeper or ESPN.

## Now (1–2 sessions each, highest leverage)

### R1. Status-change log: the most reliable news signal
**Why:** headlines lag and are noisy. A change in Sleeper's `injury_status`, ESPN's status or the
depth-chart order is the actual event. Today each snapshot only knows the current value, so
"Questionable → Out at 11:42" is never shown and ripple only fires on current state.
**Change:** `lib/snapshot.js` keeps `data/status-log.json` (`pid → [{ at, field, from, to, src }]`,
7-day window) by diffing `inj`, ESPN status, `depth`, `team` between builds. Expose as
`snapshot.changes`. The News engine turns each change into a dated item (`kind: 'change'`, posture
`confirmed`), and ripple uses "status changed in the last 48h" as its trigger (so a fresh change
outranks a long-standing tag).
**Done when:** a fixture diff (Questionable → Out) produces one `change` item and a ripple; the Your
players row shows "Out since Fri 11:42 (was Questionable)".
**Risk:** first build after a restart sees no history; seed silently from the first snapshot.

### R2. Game-day scheduler instead of fixed TTL classes
**Why:** the 3/10/30-minute TTLs spend requests evenly. The 90 minutes before kickoff (inactives)
and Wed–Fri practice-report windows are when news changes lineups.
**Change:** `lib/playernews.js` `ttlFor(p)` becomes a function of hours-to-kickoff for that player's
team (from the schedule already in the snapshot): ≤2h → 2 min, ≤26h → 5 min, practice days
14:00–19:00 ET → 5 min, otherwise 30 min; game over → 6h. Same concurrency and backoff.
**Done when:** a unit test over a fake clock shows the request budget across a week drops while the
inactives window is refreshed at ≤2 min.
**Risk:** Google 429s at peak; keep the global cap and per-player backoff.

### R3. Last-known-good snapshot on disk
**Why:** if Sleeper is unreachable at start-up, `buildSnapshot` throws and every page is empty
(seen in this environment: "Warm-up failed: fetch failed").
**Change:** `server.js` writes each good snapshot to `data/snapshot-last.json`; on failure it serves
that with `meta.staleSince`, and `app.js` shows a banner "Showing data from 2h ago — Sleeper did not
answer". Degrade per source too: ESPN, projections and Google News already `.catch`; make
`leagueCore` the only fatal call.
**Done when:** with the network blocked, the site loads the stored snapshot with the banner.

### R4. Ripple v2: use the data already on hand
- **Vegas line movement:** the scoreboard has implied team totals and spreads. Store the opening
  number in the status log (R1); a total that drops ≥2.5 points mid-week is priced-in bad news for
  that offense (often an unreported QB issue). Add as a ripple event `line-move` (down for every
  pass catcher, `toss` confidence).
- **Snap share as confirmation:** after the game, compare each ripple estimate with actual targets,
  carries and `snp`; show "last week's estimate: +3.4 tgt, actual +5" on the row, and keep a running
  hit rate per rule (`data/ripple-calibration.json`). Rules whose error is consistently one-sided
  get their share constants tuned.
- **Opponent defensive injuries (verify):** ESPN's injury report lists every position. Keep CB/S
  and edge players out per team; a team missing two starting corners is a WR upgrade for its
  opponent that week.
- **Offensive line (verify):** count OT/G/C out per team from the same report; two or more out is a
  small downgrade for that team's RBs and QB.
**Files:** `public/js/ripple.js`, `lib/snapshot.js` (keep non-skill injuries as team counts only).
**Done when:** calibration table renders with at least one finished week; tests cover each event.

### R5. Tests and CI for the rest of the model
Only the news code is tested. The lineup solver, waiver plan, trade evaluation and playoff
simulation drive the most decisions.
**Change:** reuse the fixture league in `test/ripple.test.mjs`; add `test/model.test.mjs` for
`solve` (legal lineups, FLEX/SUPER_FLEX), `startSit` bands, `fallbackFor` skipping Out players,
`waiverPlan` drop safety, and a seeded `runSim` regression. Add `.github/workflows/test.yml`
running `npm test` on push.
**Done when:** CI is green on the branch; a deliberately broken FLEX rule fails a test.

## Next (bigger features)

### R6. Matchup strength (defense vs position)
Fantasy points allowed by each defense to QB/RB/WR/TE over the last 4–6 weeks, scored with the
league's settings. **Verify** that Sleeper weekly stats rows carry the opponent; otherwise join
player team + week against the ESPN schedule already fetched. Use it in Lineup tiebreaks (after
health and projection), the Wire streamers, and the Weeks 15–17 schedule view.

### R7. Usage depth beyond targets and carries
History keeps `pts, snp, att, tgt, rec`. **Verify** which of Sleeper's stat fields exist (red-zone
targets/carries, air yards, receiving yards after catch) and keep the ones that do in
`snapshot.js` `hist`. Show target share, red-zone share and air-yard share on player rows; ripple
then redistributes by air-yard share for WRs (closer to how vacated volume actually moves).

### R8. Alerts when something changes
The site only helps when it is open. Send `act`-level decisions and R1 status changes on your own
starters to a push channel (ntfy topic, Discord or Slack webhook URL in `config.json`), with
de-duplication by decision id and quiet hours. Never send speculative or estimate-only items.

### R9. More news sources, in priority order
1. **ESPN per-team news** (verify endpoint shape) for the NFL teams of your starters — better
   coverage of depth-chart and practice notes than Google headlines.
2. **Publisher links** (backlog P5.2): resolve Google redirect URLs on click, cache 24h.
3. **Evaluation harness** (backlog P5.4): golden set with precision@10 and coverage, now including
   same-name and teammate cases.

### R10. Feed status and search UX (backlog P5.5–P5.6)
Collapsed "Feed status" block (scanned, failed, stale, source mix, retry per failed player);
date/source filters; "also about…" from `alsoPids`; recent-players shelf; persisted search.

## Later (site-wide)

- **Run it somewhere reachable:** `server.js` already honours `PORT` (the README still says it
  doesn't — fix the doc). Add a Dockerfile and a short deploy note; if exposed publicly, add a
  shared-secret login, since `/api/news` triggers outbound requests.
- **Phone first:** installable PWA (manifest + service worker caching the last snapshot) so the
  Briefing opens instantly on game day.
- **Settings in the UI:** league id, username, risk posture and alert channel without editing
  `config.json`; support more than one league.
- **Performance:** the snapshot refetches every past week's stats (1h memo). Persist completed
  weeks to disk once, since they never change, and only refetch the current week.
- **Accessibility:** `aria-live` result counts, focus return after rerender (backlog P5.5).

## Suggested order

R3 → R1 → R2 → R5 → R4 → R6 → R7 → R8 → R9 → R10, then the site-wide items. R3 first because a dead
data source currently blanks the whole site; R1 next because R2, R4 and R8 all build on the
status-change log.
