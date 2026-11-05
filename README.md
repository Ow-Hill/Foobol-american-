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

* There is no database and no persisted state: every page is rebuilt from live Sleeper/ESPN calls with short in-memory caching. `data/` holds only a player-list cache and is git-ignored.
* If the `node server.js` process stops, the site is down. Nothing restarts it on boot.
* To expose it: either run a tunnel (`cloudflared tunnel --url http://localhost:4321` or `ngrok http 4321`) for a temporary shareable URL, or deploy to any Node host and start it with `node server.js`. `config.json` currently holds the port, so a host that assigns `PORT` needs that read from `process.env.PORT` first.

## What's on each page

| Page | Skill it follows | What it does |
| --- | --- | --- |
| Briefing | command-center | Hard problems first, this week's matchup, clocks, roster news, league wire |
| Lineup | lineup-call | Best legal lineup, Clear / Lean / Toss-up calls, tiebreak order, conditional calls |
| Injuries | injury-triage | Sleeper vs ESPN labels with times, most-severe-wins rule, league IR rules, IR lock, next man up |
| Waivers | waiver-plan | Needs in priority order, bye look-ahead, tiered candidates with a named drop, K/DEF streams |
| Trades | trade-lab | Deadline window, sell/buy market, two-team lineup math, three pitches + walk-away line |
| Season | season-planner | Playoff odds, weekly review, lineup efficiency, deadline + playoff prep, `.ics` check-ins |
| News | command-center | ESPN articles + RotoWire notes + league moves, tagged by who owns each player |

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
