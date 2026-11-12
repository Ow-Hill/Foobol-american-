# Connector cheat sheet

All four connectors are linked to James Cook Lovers (linked 2026-11-04 via Sleeper username
thisowenguy). Load deferred tools with ToolSearch `select:` before calling them; batch the
names you need into one ToolSearch call.

## Flaim — ground truth from Sleeper

- Params on every call: `platform: sleeper`, `sport: football`,
  `league_id: 1312204198166691840`, `season_year: 2026`; `team_id: 4` for Owen.
- Best calls: `get_roster`, `get_free_agents` (position, count ≤ 100), `get_players`,
  `get_matchups` (week), `get_transactions` (type: add / drop / trade / waiver), `get_draft`.
- Quirks: `get_standings` and `get_league_info` return stale placeholders (0-0-0,
  "playoffs_in_progress") — never use them for records. Use Down Field or `get_matchups`.
  No ownership %. Free-agent order is not a ranking. Read-only.
- Injury tags here can lag the other connectors by a day.

## Down Field — decisions and season odds

- Model: Fourth Down component simulation, scored on a generic **PPR template** (matches this
  league well; custom rules are not applied). Kicker/DST use a simple heuristic.
  No news or weather in the model.
- Best calls:
  - `get_team_context` (roster_id "4"): rules, roster, depth-chart rank per player, waiver
    position, this week's schedule with implied totals. One read replaces several.
  - `recommend_lineup`: best legal lineup with each swap's win probability and band
    (clear / lean / toss-up), plus a lineup deadline.
  - `recommend_waivers` (position, objective): this-week value, season outlook, and an
    **insurance** list naming the next man up behind injured starters.
  - `evaluate_moves`: up to 5 adds/drops/trades vs. standing pat; returns title/playoff odds
    change for Owen **and the trade partner** — the best acceptance signal available.
  - `simulate_league` (view odds or rankings), `get_weekly_review`, `get_matchup`,
    `get_roster` scope "league", `scan_all_teams`, `get_projections`, `get_nfl_schedule` (byes).
- Objective arg: expected-points (default), protect-floor, chase-upside.
- Sim caveats: ignores the league's 2 divisions in seeding, draws random future opponents,
  leaves K/DEF out, and assumes no future roster moves.
- Ships its own skills as MCP resources (skill://downfield/...): downfield, fantasy-data,
  waiver-wire, trade-ideas, weekly-review, week-in-review, league-research.

## StatsDeck — usage, matchups, exact scoring

- Connected with the league's exact scoring imported (check with `get_scoring`).
- Projection = trailing per-game production (recency-weighted, spans seasons) × the
  opponent's defense-vs-position ratio. No news. Questionable players project "if he plays";
  Out/Doubtful/IR project 0.
- Best calls: `get_my_roster` (strength, hole, lineup_swaps, open slots, owned picks),
  `start_sit` (players list, week), `get_snap_counts` (players list), `get_team_defense`
  (team, opponent) for DST streams and defense-vs-position, `get_kicker_stats`,
  `get_injuries`, `get_available_players`, `get_trades` (league trades priced; Sleeper pending
  offers are never visible), `get_player_stats`, `get_rankings`.

## Scout-Squad — third opinion with saved receipts

- Model: Sleeper/RotoWire projections. Consensus, news and pulse signals currently unavailable.
- Player refs come from `search` (q = name) → `player:sleeper:<id>`.
- Calls: `waiver_board` (league_ref, position, week = current or current+1),
  `gut_check` start_sit and add_drop (free), trade and lineup (Pro), `batch_gut_check` (Pro),
  `get` to re-read a saved receipt.
- League ref: `league:sleeper:1312204198166691840`. Check sync with `connect_league` (no args).

## Web search and NotebookLM

- Web search: last 7 days, one query per player minimum, a second when reports conflict.
  Fetch the article; snippets aren't sources. Paraphrase.
- NotebookLM: no API. Use `notebooklm-research-handoff` for a copy-paste brief, then verify
  every returned claim against Flaim and the web (it has hallucinated matchups before).

## Known disagreements (Week 9 worked example)

QB start, Maye vs Mahomes: Down Field Mahomes +2.6 (lean, 58%); StatsDeck Maye +3.2;
Scout-Squad Maye +0.1 (51%). A 2-1 split with small margins = toss-up, settled by the
tiebreak order in the hub skill. A.J. Brown: Flaim showed Out while Down Field and StatsDeck
showed an upgrade to Questionable that same day — the status-conflict rule applies.
