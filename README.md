# Roster Monitor — James Cook Lovers

A live roster-management dashboard for the Sleeper league **James Cook Lovers**. It is built from the
`ff-command-center`, `ff-lineup-call`, `ff-injury-triage`, `ff-waiver-plan`, `ff-trade-lab` and
`ff-season-planner` skills and follows their rules.

## Run it

```bash
cd Foobol-american-
node server.js        # Node 18+, no dependencies
npm test              # 162 tests
# open http://localhost:4321
```

Change the league, your Sleeper username or the port in `config.json` (a `PORT` environment variable wins over it).

## Where it runs

Nothing is deployed. The app only runs on the machine that starts it:

| | |
| --- | --- |
| Local | `http://localhost:4321` |
| Same Wi-Fi | `http://<your-lan-ip>:4321` — the server binds all interfaces |
| Your phone, anywhere | `scripts/public.sh` (macOS/Linux) or `scripts/public.ps1` (Windows): a free Cloudflare tunnel behind a password, while your computer is on |

* There is no database. Every page is rebuilt from live Sleeper/ESPN calls with short in-memory caching. `data/` (git-ignored) holds the player-list cache, the headline cache, a 7-day status-change log (`status-log.json`), each team's opening Vegas total, and the last good snapshot (`snapshot-last.json`). If Sleeper or ESPN is down, the site serves that snapshot with a "Showing saved data from …" banner instead of going blank.
* If the `node server.js` process stops, the site is down. Nothing restarts it on boot.
* The server uses `PORT` when it is set, otherwise the port in `config.json`.

### Open it on your phone (free)

1. Install `cloudflared`: `brew install cloudflared` (macOS) or `winget install --id Cloudflare.cloudflared` (Windows).
2. Start the site and the tunnel together, with a password of 10+ characters:
   ```bash
   SITE_PASSWORD='pick-something-long' ./scripts/public.sh          # macOS / Linux
   $env:SITE_PASSWORD = 'pick-something-long'; .\scripts\public.ps1  # Windows PowerShell
   ```
3. Open the `https://….trycloudflare.com` address it prints. Any username works, the password is
   `SITE_PASSWORD`, and the browser remembers it.

Things to know: the computer has to stay on and awake (set it not to sleep while plugged in). The
address changes every time you start the script; a fixed address needs a domain on Cloudflare and a
named tunnel. The scripts refuse to start without a password, because `/api/news` makes outside
requests for whoever calls it. Ten wrong passwords lock that visitor out for 10 minutes.
`SITE_PASSWORD` also works without the tunnel, for example on your Wi-Fi.

## What's on each page

| Page | Skill it follows | What it does |
| --- | --- | --- |
| Briefing | command-center | Ranked decision brief (act / this week / watch) with evidence, hard problems, this week's matchup, clocks, roster news, league wire |
| Lineup | lineup-call | Best legal lineup, Clear / Lean / Toss-up calls, tiebreak order, conditional calls |
| Live | lineup-call | Game-day scoreboard: live points, what's still to come from each starter (projection × share of his game left), a win chance that moves with the games, starters ruled out before their game locks with who to swap in, and every league matchup with who to root for. Refreshes every minute while games are on |
| Injuries | injury-triage | Sleeper vs ESPN labels with times, most-severe-wins rule, league IR rules, IR lock, next man up |
| Waivers | waiver-plan | Needs in priority order, bye look-ahead, tiered candidates with a named drop, K/DEF streams |
| Trades | trade-lab | Deadline window, sell/buy market, two-team lineup math, three pitches + walk-away line |
| Season | season-planner | Playoff odds, weekly review, lineup efficiency, deadline + playoff prep, your best lineup for each playoff week, kicker and defense stashes for Weeks 15–17, `.ics` check-ins |
| News | command-center | Player search + "Your players" ranks every report by lineup impact; League ranks rivals by whether they start against you this week; Wire ranks free agents by lineup gain and opened-up playing time; Rumours holds the last 5 days of speculation; **Teammate** rows estimate how injuries, returns and trades move other players' targets and carries |

## Compete, share & plan

| Page | What it does |
| --- | --- |
| Values & start/sit | League-adjusted player values (your scoring, slots and replacement level), rankings, side-by-side compare, head-to-head start/sit |
| Trade finder | Searches deals of **up to 3 players per side** (goals: win-win, upgrade a position, consolidate depth, sell one for more). Target or shop a player, protect untouchables, pick a value horizon (win now / balanced / future). Ranks by value balance, typical-lineup gain, bye-aware rest-of-season points, and **playoff/title odds change for both teams**; handles roster-limit drops and gives an acceptance estimate. Analyzer for any 3-for-3 deal |
| Playoff path | Seed odds, bracket odds, likely opponents per round, win chance in every game left, what-if scenarios. **Who to root for**: every other team's game left, by how much each result moves your playoff odds, plus how often points for decides your spot. **Scout your playoff opponent**: the teams you most likely meet first, their weak spots, and free agents that would help them most (grab one with a spare spot) |
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

**Lineup locks soon.** About 100 minutes before kickoff, a starter in that game who is Out, Doubtful
or Questionable gets an alert naming the healthy bench player to swap in. Games on a day other than
Thursday, Sunday or Monday (Saturday games in Weeks 15–17, Christmas) also get one heads-up naming
your starters in them. These go out during quiet hours too. With alerts on, the server rebuilds every
5 minutes around kickoffs, so they arrive even when nobody has the site open (the computer still has
to be on). The Season page's calendar file adds a reminder two hours before each of those game days.

## How good is the advice? (Track record)

The **Track record** page shows how the site's calls have done: this season's own lineup calls,
logged the first time they appear (`data/calls-log.json`) and marked right or wrong after the
games, next to a backtest over 2022–2026. Every threshold the engine uses was sized from that
backtest and lives in `public/js/fitted.js`, with the experiment it came from.
Full write-up: [`docs/backtest-report.md`](docs/backtest-report.md).

```bash
npm run backtest      # downloads history to data/bt/ and re-runs all 15 experiments
```

What it found, in short: the lineup the site recommends beat the one managers set by about 2
points a week; Clear / Lean / Toss-up calls win 68% / 60% / 54%; a Questionable player plays 70%
of the time (90% after a full practice, 55% after none); only running-back injuries move
teammates' workload predictably; and points allowed to a position does not help choose between
two players once you know their projections, so that tiebreak was removed.
Floor and ceiling now come from the projection and how far players like him usually miss it
(the old last-six-games range held the actual score 35% of the time instead of 50%). The news
classifier is checked against hand-labelled headlines (`node backtest/news-eval.mjs`); on fresh
live headlines it read 89% correctly on the latest batch, before the fixes it prompted. Expert
consensus averaged into QB, WR and K projections added about half a point a week to replayed
lineups. Waiver claims are ranked by projection: in a replay of this league's 2025-26 seasons the
top claim added about 9 lineup points over three weeks (the old ranking, led by injured stashes and
rookies, added 2; the best-projected free agent, 5). Tier 1 needs 3+ lineup points this week; on
synthetic leagues for 2022-25 the tiers held in order (25.6 / 15.0 / 8.9 points on held-out 2025). The backtest's consensus history is built with `node backtest/fetch-ecr.mjs <clone>`
(see the script header).

## Matchup strength

Lineup shows, for **quarterbacks**, when the opponent has been in the softest or toughest third of
the league for points allowed to the position over the last six weeks. It is information only.
For RB, WR and TE the backtest found no signal beyond the projection, so nothing is shown and it
is no longer a tiebreak.

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

`public/js/ripple.js` estimates who gains or loses when a teammate is out, returns or is traded.
The sizes are measured (backtest E5): when a running back is out the remaining backs gain about a
third of their share of his carries (right 69% of the time, 43% by chance); a missing receiver's
targets mostly do not land on any one teammate, so those estimates are small toss-ups; with a
backup quarterback the top target holds up and the others lose about a tenth; a returning back
takes back about 40% of what his fill-in gained. Games already played without him this season are
weighted in by how many there are. A team whose implied total moves 2.5+ points since the week
opened is flagged. Rows are labelled **Estimate**, capped below "Act now", never flip a start/sit
on their own, and say how often that kind of estimate has been right. Each week's estimates are
recorded (`data/ripple-log.json`) and scored after the games. Rules:
`skills/ff-news-search/references/ripple.md`.

## Data

* **Sleeper** (public API): league settings, rosters, matchups, transactions, picks, players, projections, weekly stats.
* **ESPN** (public API): injury report with RotoWire notes, news, NFL schedule and betting lines.
* **FantasyPros expert consensus** (weekly rankings via dynastyprocess/data, refreshed daily): averaged 50/50 with Sleeper's projection at QB, WR and K, where that beat Sleeper alone in the backtest; shown next to Sleeper's number everywhere.
  The rest-of-season rankings are blended into RB, WR and TE trade values (they cut the rest-of-season miss by about a tenth).
* **Dynasty Dealer** (free, no key, [dynastydealer.com](https://www.dynastydealer.com)): redraft PPR trade-market values built from real Sleeper trades, loaded once a day and shown as a second opinion (Market column on Values, market chips and a market check in the trade pages). Their terms ask for a visible credit link, which every page that shows them carries. They change no recommendation. Turn off with `MARKET_VALUES=0`.
* **Open-Meteo** (free, no key): wind at kickoff for outdoor games, shown as a flag with its measured effect.
* **nflverse** (public release files): the NFL's official injury report with practice status, used directly for chance-to-play; the backtest also uses its closing lines, wind and depth charts.
* Projections are scored with the league's exact scoring settings (checked against Sleeper's own points: 145/145 match).
* The lineup solver reproduces Sleeper's "potential points" for all 10 teams.

## One player value

Every page reads the same rest-of-season player value (`public/js/values.js`, 0–100, points above
replacement for this league's scoring and lineup, byes and health in, playoff weeks weighted by
playoff odds). This week's start/sit still uses this week's projection; anything that lasts longer uses
the value:

* **Drops** go to the lowest-value bench player (last K/DEF, 2nd QB/TE and playoff-week starters stay protected).
* **Waivers** show each add's value and its net value after the drop. A Tier 2 add worth less than the
  player it drops falls to Tier 3: rolling priority should buy rest-of-season value, not one week.
  The scanner's 0–100 is a *scanner score* (news, usage, trend, market and the larger of lineup or value gain), not the player value.
* **Injuries:** a bench player who is out, with IR full, is a cut candidate when a free agent is worth more.
* **Start/sit:** value is the last tiebreak, after health, game environment and kickoff.
* **Season:** the playoff slate shows each player's Weeks 15–17 points and value.
* **Keepers & picks** (a tab on Values): keeper value against a first-round pick, your picks priced on the same scale, and each rival's best keeper.

The drop and Tier 2 rules are new and not yet backtested (`VALUE_RULES` in `public/js/fitted.js` turns
them off). Trade value's curve (`TRADE_CURVE`) is calibrated by E21: `node backtest/fetch-market.mjs`
collects trades from Sleeper leagues shaped like this one (free API, non-commercial use, about 300
calls a minute), then `npm run backtest` fits the curve and only suggests it if it picks winners in
this league's own trades better than today's 47%.

## Live draft guide

Open `/draft.html` (or **Live draft guide** on the Draft plan page) and paste a Sleeper draft link,
draft ID, league ID or username. It works for any Sleeper draft, including other leagues and mock
drafts, and finds your own league's draft with no typing. Pick your team once and it follows the
draft live, checking Sleeper every 3 seconds.

* **Take now / Plan for pick #N:** the top six players for your next pick, each with reasons: value,
  which starting spot he fills, the chance he is still there at your next pick, how much you lose by
  waiting at his position (value over the best one likely left), last in his tier, falling past ADP,
  camp news, injury, new team, and last season's volume against his scoring.
* **Alerts:** position runs, how many teams picking before you still need each position, tiers about
  to run dry, and players you can safely wait on.
* **Best available:** every player on the site's 0-100 value in this draft's own scoring, lineup and
  team count, with tier, ADP, points per game and "there at your pick" odds. Auctions get $ values.
* **Camp and preseason research:** Google News headlines from the last three weeks for the top ~70
  players, read with the news engine's classifier: first-team reps, named starter, standout, holdout,
  demotion, surgery, PUP. Each moves points per game by at most −15% to +8%.
* **On the clock:** the tab title changes, and with alerts on you get a tone and a notification.
* **Finished drafts:** results by value drafted, steals, and a replay slider showing what the guide
  would have said before any pick.

Value per player: Sleeper's season projection (60%), last season's volume through the waiver
scanner's volume model (25%) and last season's results (15%); a player on a new team leans more on
the projection. That × games × preseason health, above replacement for this draft. Before Sleeper
posts next season's projections, values fall back to last season and ADP. Logic is in
`public/js/draftguide.js`, Sleeper calls in `lib/draftlive.js`, camp news in `lib/draftnews.js`.
The blend weights, camp nudges, ADP spread and need weights are judgment, not backtested.

* **Next season and practice drafts:** the draft list finds next year's league draft on its own
  (Sleeper gives the renewed league a new ID; the guide follows `previous_league_id` back to the
  league in `config.json`), your Sleeper mock drafts, and other leagues. Before Sleeper sets the
  draft order you can plan from the slot you expect; it switches to your real team once the order
  is set. **Practice draft** runs a draft on the site against bots (ADP with noise, filling their
  lineups, kickers and defenses last), in any format or as a copy of the draft you're following.
* **Player detail:** click any name for how his points per game were built, last season's usage
  (targets, shares, air yards, red zone, routes, expected points), camp and preseason headlines with
  links, Sleeper's injury note, depth chart, adds across Sleeper in the last 24 hours, and the odds
  he lasts to each of your next picks.
* **Live with Sleeper:** checks every 3 seconds (1.5 when you're up within two picks), shows the pick
  clock, links to the draft room, and researches news for the best players still on the board as
  the draft moves. Sleeper's API is read-only, so you still make the pick in Sleeper.

Check it against real Sleeper data on your computer: `npm run check-draft` (or
`npm run check-draft -- <draft link>`) writes `docs/draft-check.md` with the fields Sleeper sent
and a replay of your picks. A mock draft on Sleeper is the quickest live test.

## How the trade finder decides

* **Points per game** is half results (projection and recent scoring, small samples shrunk) and half what the player's volume normally produces (targets, air yards on catches, carries, red-zone work). That mix predicted the rest of the season better than results alone at every position.
* **Experts' rest-of-season rank** is blended in for healthy RBs, WRs and TEs (50% / 55% / 70% weight on the experts). On 2025 it cut the miss to 2.73 / 2.67 / 2.11 points a game from 3.00 / 2.87 / 2.21.
* **Health** uses measured odds: a Questionable player delivers about 83% of a healthy player's rest-of-season points, an officially Out player 62%, a player on injured reserve 8–27% depending on how long he has been out.
* **Playoff weeks** count by each team's own chance of reaching them, so a contender values Weeks 15–17 more than a team that is out, and the same player is worth different amounts to the two sides.
* **Buy / Hold / Sell** flags players scoring 4+ a game above or below what their volume supports, with what happened next to players like them.
* **Picks and keepers** are valued from this league's own drafts (round 1 ≈ 141 season points above replacement, round 2 ≈ 82, round 3 ≈ 60; two drafts, so treat as rough).
* **A 2-for-1** credits the side that opens a roster spot with the best free agent, and charges the other side its forced drop.
* **Search:** a fast pass over every combination, then a bye-aware rest-of-season replay and a simulation of both teams' odds on the best 24, ranked by the title and playoff odds you gain without costing the partner theirs. "Doing nothing" is always shown.
* **Acceptance** is a heuristic, anchored to what this league has actually accepted (the median accepted deal had one side worth less than half the other on these values). A deal lopsided enough to draw five veto votes is flagged. No trade is a valid answer.

## Rules built in

Live roster first · health beats projections (most severe label wins) · IR eligibility from league settings ·
rolling waivers (a won claim sends you last) · Week 11 trade deadline with 1-day review · advice only —
nothing here can set a lineup, claim a player or send a trade.

## What it can't do

The Flaim / Down Field / StatsDeck / Scout-Squad connectors in the skills aren't reachable from a website.
The Lineup, Injuries, Waivers and Trades pages each have a **Copy second-opinion prompt** button that
hands the findings to those connectors. Playoff odds are this site's own simulation (not Down Field's).
Official inactives are not checked. Wind is flagged but not built into projections (15+ mph costs
quarterbacks about 2 points and kickers about 1.3). There is one projection source. The news classifier
has no backtest because no archive of old headlines exists. The full list of what is still
unsolved is at the end of `docs/backtest-report.md`.

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
