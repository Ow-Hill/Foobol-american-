# Roster Monitor — James Cook Lovers

A live roster-management dashboard for the Sleeper league **James Cook Lovers**. It is built from the
`ff-command-center`, `ff-lineup-call`, `ff-injury-triage`, `ff-waiver-plan`, `ff-trade-lab` and
`ff-season-planner` skills and follows their rules.

## Run it

```bash
cd ff-roster-monitor
node server.js        # Node 18+, no dependencies
# open http://localhost:4321
```

Change the league, your Sleeper username or the port in `config.json`.

## Where it runs

Nothing is deployed. The app only runs on the machine that starts it:

| | |
| --- | --- |
| Local | `http://localhost:4321` |
| Same Wi-Fi | `http://<your-lan-ip>:4321` — the server binds all interfaces |
| Public internet | **No** — no domain, no tunnel, no cloud host |

* There is no database. Every page is rebuilt from live Sleeper/ESPN calls with short in-memory caching. `data/` (git-ignored) holds the player-list cache, the headline cache, a 7-day status-change log (`status-log.json`), each team's opening Vegas total, and the last good snapshot (`snapshot-last.json`). If Sleeper or ESPN is down, the site serves that snapshot with a "Showing saved data from …" banner instead of going blank.
* If the `node server.js` process stops, the site is down. Nothing restarts it on boot.
* To expose it: either run a tunnel (`cloudflared tunnel --url http://localhost:4321` or `ngrok http 4321`) for a temporary shareable URL, or deploy to any Node host and start it with `node server.js`. The server uses `PORT` when the host sets it, otherwise the port in `config.json`.

## What's on each page

| Page | Skill it follows | What it does |
| --- | --- | --- |
| Briefing | command-center | Ranked decision brief (act / this week / watch) with evidence, hard problems, this week's matchup, clocks, roster news, league wire |
| Lineup | lineup-call | Best legal lineup, Clear / Lean / Toss-up calls, tiebreak order, conditional calls |
| Injuries | injury-triage | Sleeper vs ESPN labels with times, most-severe-wins rule, league IR rules, IR lock, next man up |
| Waivers | waiver-plan | Needs in priority order, bye look-ahead, tiered candidates with a named drop, K/DEF streams |
| Trades | trade-lab | Deadline window, sell/buy market, two-team lineup math, three pitches + walk-away line |
| Season | season-planner | Playoff odds, weekly review, lineup efficiency, deadline + playoff prep, `.ics` check-ins |
| News | command-center | Player search + "Your players" ranks every report by lineup impact; League ranks rivals by whether they start against you this week; Wire ranks free agents by lineup gain and opened-up playing time; Rumours holds the last 5 days of speculation; **Teammate** rows estimate how injuries, returns and trades move other players' targets and carries |

## Compete, share & plan

| Page | What it does |
| --- | --- |
| Values & start/sit | League-adjusted player values (your scoring, slots and replacement level), rankings, side-by-side compare, head-to-head start/sit |
| Trade finder | Searches deals of **up to 3 players per side** (goals: win-win, upgrade a position, consolidate depth, sell one for more). Target or shop a player, protect untouchables, pick a value horizon (win now / balanced / future). Ranks by value balance, typical-lineup gain, bye-aware rest-of-season points, and **playoff/title odds change for both teams**; handles roster-limit drops and gives an acceptance estimate. Analyzer for any 3-for-3 deal |
| Playoff path | Seed odds, bracket odds, likely opponents per round, win chance in every game left, what-if scenarios |
| Weekly report | Matchup previews, personalised recap, awards, power rankings — copy, share or print |
| League historian | Ask questions across every season; rule-based, answers only from recorded games, lineups, drafts and trades |
| Video recaps | Animated weekly recap (16:9 or 9:16) you can play and download as .webm |
| Rate my team | Graded strengths, weaknesses and season outlook for any team |
| Rivalry reports | Head-to-head history, streaks, playoff meetings, trades, rivalry board |
| League story | Chapters generated from the real record of every season |
| Turning points | Close losses, bench-flipped games, record with perfect lineups, and which remaining games swing your odds |
| Manager profiles | Habits and tendencies from drafts, waivers, trades and lineups |
| Draft plan | Slot explorer, keeper candidates, draft steals and misses, round-by-round value, undervalued players |

History comes from walking the league's `previous_league_id` chain (currently 2025 and 2026).

## Alerts

Status changes on your roster (Sleeper or ESPN injury tag, a starter's depth-chart move, a trade)
can be pushed to your phone. Off by default; add an `alerts` block to `config.json`:

```json
"alerts": { "ntfy": "https://ntfy.sh/<your-private-topic>", "quietHours": [23, 7] }
```

or a webhook: `{ "webhook": "<url>", "format": "discord" }` (`slack` and `json` also work). One
batched message per refresh, each change sent once, nothing older than 12 hours, nothing while the
site is serving saved data. `"scope": "starters"` limits it to your starters. Headlines,
speculation and teammate estimates are never sent.

## Matchup strength

Lineup shows, for each player, how many fantasy points his opponent allowed to that position over
the last six finished weeks (your league's scoring), when it is in the softest or toughest third of
the league. It is also a tiebreak step for close start/sit calls, after game environment and before
kickoff. Players are credited to their current NFL team, so a mid-season trade slightly blurs it.

## Decision engine

The Briefing opens with a ranked decision brief (`public/js/decision.js`): `act` / `this-week` /
`watch`, each with evidence, risk, a deadline and a deterministic confidence score. Health beats
models — a player whose latest report is DNP/Out/IR is never recommended, and never named as the
fallback. The same contract is documented for agent use in
`skills/ff-decision-engine/SKILL.md`, with thresholds and worked examples beside it.

## Player news search

The News page has a search box (or press `/`) that ranks **your roster → league rosters → free
agents**. Picking a player opens the report drawer with cached RotoWire notes, ESPN articles and
Google News headlines. If a player is outside the scanned set, **Refresh headlines** fetches that
one player on demand (`/api/news?pid=…`, rate-limited) and classifies the result without rebuilding
the snapshot.

`lib/playernews.js` searches one exact name at a time (`"<name>" NFL when:7d`), with extra
nickname queries for team defenses. It normalises apostrophes, hyphens, initials and suffixes, so
`Ja'Marr Chase`, `A.J. Brown`, `Amon-Ra St. Brown` and `Chicago Bears` all match their own
headlines. Cached per player with a 3/10/30-minute TTL, stale-on-failure, one HTTP retry on
429/5xx, and per-player failure backoff. Cross-player story ids stop one headline appearing under
three different players in League, Wire or Rumours. Refresh timing follows the football clock:
every 2 minutes in the 2 hours before kickoff (inactives), 5 minutes during games, on game eve and
in the Wed–Fri practice-report window, 15 minutes after games, 30 minutes on quiet days.

Each snapshot is diffed against the last one: changes to a player's Sleeper tag, ESPN status, depth
order (top two only) and team are logged with the time they were first seen and shown as **Status
change** rows ("Sleeper status: Questionable → Out"). Health checks use the latest dated status, so
a player cleared on Friday is no longer treated as out because of Wednesday's report. The full contract is in
`skills/ff-news-search/SKILL.md`.

The scan covers your roster, this week's opponent's starters, your starters' NFL teammates (QB,
backfield, WR room, TE1) and trending free agents in this league, capped at 65 names. Same-name
players (`Josh Allen` the QB vs the edge rusher) are rejected when the headline ties the name to
another team or to the defense. **Search all NFL players** finds anyone in Sleeper's player list
when the snapshot has no match.

## Teammate ripple

`public/js/ripple.js` estimates who gains or loses when a teammate is out, returns or is traded:
vacated targets go to the other pass catchers by share (with a bump for the next man up), carries
go mostly to the handcuff, a QB injury downgrades every pass catcher (the top target least), and a
returning starter takes back what the fill-ins gained, and a team whose Vegas implied total moves
2.5+ points since the week opened is flagged (the market often knows first). When the team has already played without
him this season, the observed with/without split is used instead. Rows are labelled **Estimate**,
capped below "Act now", and never flip a start/sit on their own. Each week's estimates are recorded
the first time the server sees them (`data/ripple-log.json`) and scored once the games are played;
the News page shows how often each rule moved the right way. Rules and sources:
`skills/ff-news-search/references/ripple.md`.

## Data

* **Sleeper** (public API): league settings, rosters, matchups, transactions, picks, players, projections, weekly stats.
* **ESPN** (public API): injury report with RotoWire notes, news, NFL schedule and betting lines.
* Projections are scored with the league's exact scoring settings (checked against Sleeper's own points: 145/145 match).
* The lineup solver reproduces Sleeper's "potential points" for all 10 teams.

## How the trade finder decides

* **Trade value** = league-adjusted value (points above replacement for this league) + a small credit for useful starters; age-weighted when you pick the Balanced/Future horizon (age curves from `ff-ml-projections`).
* **Points per game** shrinks small samples toward the projection and clips to a sane bound (also from `ff-ml-projections`).
* **Two-stage search:** a fast pass over every balanced combination, then a bye-aware weekly lineup replay and a simulation of both teams' odds on the best 24.
* **Acceptance** is a heuristic (value fairness, their lineup change, their odds change, seller status, how often they trade) — not a prediction. No trade is a valid answer.

## Rules built in

Live roster first · health beats projections (most severe label wins) · IR eligibility from league settings ·
rolling waivers (a won claim sends you last) · Week 11 trade deadline with 1-day review · advice only —
nothing here can set a lineup, claim a player or send a trade.

## What it can't do

The Flaim / Down Field / StatsDeck / Scout-Squad connectors in the skills aren't reachable from a website.
The Lineup, Injuries, Waivers and Trades pages each have a **Copy second-opinion prompt** button that
hands the findings to those connectors. Playoff odds are this site's own simulation (not Down Field's).
Official inactives and weather are not checked.

## How this was built — agentic coding

This repo was built in pair-programming sessions with an AI coding agent. The human set the goal,
league context, ff-* rules and product calls; the agent inspected live data, wrote the engines and
tests, ran the app in a browser, and documented the contracts. The app itself is deterministic — no
LLM runs at request time.

### Prompt history

| Date | Prompt / request | Result |
| --- | --- | --- |
| 2026-11-05 | Build the James Cook Lovers Sleeper dashboard following the six ff-* skills | 19-page dashboard, trade finder, live data (`716ab8d`) |
| 2026-11-05 | Improve navigation: collapsible groups, task sections, mobile drawer, persisted state | Nav P0–P3 (`0de05fb`…`a6f82f4`) |
| 2026-11-05 | Add player news, deterministic ranking, League/Wire/Rumours, degraded/print states | News P0–P4 (`4e13f8d`…`1c3c99d`) |
| 2026-11-09 | “plan on how to improve the search function” | Audited 1,078 headlines; named matcher, window, link, duplicate and 429 defects; phased plan |
| 2026-11-09 | “Make the search function better, and make skills for the next itteration” | Search v2 + `ff-news-search` skill + tests (`f6d74c5`) |
| 2026-11-09 | “save this to a git repo” | Committed to local `main`; no remote configured |
| 2026-11-10 | “if i close the window will this still be saved” | Confirmed the commit persists on disk; server/UI state does not |
| 2026-11-11 | “add a section that shows the history of prompts and how this was developed by agentic coding” | This section + `docs/agentic-development.md` |

Earlier rows are reconstructed from the project record; the quoted prompts from 2026-11-09 onward
are verbatim.

### The loop

1. **Plan first** — read the code, audit live data, quantify defects, propose phases. The search plan
   named the exact bugs before any edit.
2. **Skills as contracts** — every engine mirrors a skill; the dashboard is the source of truth when
   prose and code disagree.
3. **Deterministic engines** — regex, weights and thresholds; the same inputs produce the same output.
4. **Small commits** — one concern per phase, so a bad phase can be reverted cleanly.
5. **Verify live** — `npm test`, server restart, route sweep, console errors, 390/1440 overflow,
   degraded/disabled states.
6. **Leave a handoff** — README, skill contract, worked examples and a next-iteration backlog.

Full log, commit map and the human/agent split: [`docs/agentic-development.md`](docs/agentic-development.md).
