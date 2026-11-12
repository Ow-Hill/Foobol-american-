// Builds one normalized snapshot of league + NFL context for the client.
const fs = require('fs');
const path = require('path');
const S = require('./sources');
const NV = require('./nflverse');
const WX = require('./weather');
const { calibrate } = require('./calibration');
const cfg = require('../config.json');

const SEEN_FILE = path.join(__dirname, '..', 'data', 'team-seen.json');
const TRADE_WINDOW = 21 * 86400000;
const SCAN_CAP = 65;
const SKILL = ['QB', 'RB', 'WR', 'TE'];

// Remember each player's last NFL team so a trade can name the team he left.
// Sleeper's team_changed_at says when, not from where.
function teamSeen(players, now) {
  let seen = {};
  try {
    seen = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')) || {};
  } catch {}
  let dirty = false;
  for (const p of Object.values(players)) {
    if (!SKILL.includes(p.pos) || !p.team) continue;
    const cur = seen[p.id];
    if (!cur) {
      seen[p.id] = { team: p.team, prev: null, at: 0 };
      dirty = true;
    } else if (cur.team !== p.team) {
      seen[p.id] = { team: p.team, prev: cur.team, at: now };
      dirty = true;
    }
    const s = seen[p.id];
    if (s.prev && now - s.at <= TRADE_WINDOW) p.prevTeam = s.prev;
  }
  if (dirty) {
    try {
      fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true });
      fs.writeFileSync(SEEN_FILE, JSON.stringify(seen));
    } catch {}
  }
}

// ---------- status-change log ----------
// The actual event behind most news is a status change. Diff each build against the last one
// and keep 7 days of { at, field, from, to }. Fields: Sleeper injury tag, ESPN status, depth
// order (only moves that touch the top two), NFL team. Also keeps each team's Vegas implied
// total at the first sighting this week, so a line that moves can be read as news.
const LOG_FILE = path.join(__dirname, '..', 'data', 'status-log.json');
const LOG_WINDOW = 7 * 86400000;

// How long after an official status change the scanner first found a headline about that player.
// Measures the news scraper against the signal it tries to read. Only status fields count.
function headlineLag(changes, items, now = Date.now()) {
  const byPid = {};
  for (const it of items || []) for (const pid of [it.pid, ...(it.alsoPids || [])].filter(Boolean)) (byPid[pid] ||= []).push(it.time);
  const lags = [];
  let missed = 0;
  let pending = 0;
  for (const [pid, list] of Object.entries(changes || {})) {
    for (const ch of list) {
      if (!['inj', 'es', 'off'].includes(ch.field)) continue;
      // a headline up to 2 hours before the feed updated counts as on time (lag 0)
      const hits = (byPid[pid] || []).filter((t) => t >= ch.at - 2 * 3600000).sort((a, b) => a - b);
      if (hits.length) lags.push(Math.max(0, hits[0] - ch.at));
      else if (now - ch.at < 24 * 3600000) pending++;
      else missed++;
    }
  }
  lags.sort((a, b) => a - b);
  const med = lags.length ? lags[Math.floor((lags.length - 1) / 2)] : null;
  return { n: lags.length + missed, found: lags.length, missed, pending, medianMs: med, within6h: lags.filter((x) => x <= 6 * 3600000).length };
}

function statusLog(players, espnInj, espnOk, lines, week, now, officialOk = false, file = LOG_FILE) {
  let db = { cur: {}, log: {}, lines: {} };
  try {
    db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {}
  let dirty = false;
  for (const p of Object.values(players)) {
    if (!SKILL.includes(p.pos) && p.pos !== 'K') continue;
    // official report (game status + practice): only when this week's report was read
    const cur = {
      inj: p.inj || null,
      es: espnOk ? espnInj[p.id]?.status || null : undefined,
      off: officialOk ? p.off?.status || null : undefined,
      prac: officialOk ? p.off?.prac || null : undefined,
      depth: p.depth ?? null,
      team: p.team || null,
    };
    const prev = db.cur[p.id];
    if (!prev) {
      db.cur[p.id] = { ...cur, es: cur.es ?? null, off: cur.off ?? null, prac: cur.prac ?? null, offWk: officialOk ? week : null };
      dirty = true;
      continue;
    }
    // a new week starts a new report: take its first values silently, not as changes
    if (officialOk && prev.offWk !== week) {
      prev.off = cur.off;
      prev.prac = cur.prac;
      prev.offWk = week;
      dirty = true;
    }
    for (const k of Object.keys(cur)) {
      if (cur[k] === undefined) continue; // ESPN did not answer this build: no change either way
      const from = prev[k] ?? null;
      const to = cur[k];
      if (from === to) continue;
      prev[k] = to;
      dirty = true;
      if (k === 'depth' && !((from != null && from <= 2) || (to != null && to <= 2))) continue;
      (db.log[p.id] ||= []).push({ at: now, field: k, from, to });
    }
  }
  for (const pid of Object.keys(db.log)) {
    const keep = db.log[pid].filter((e) => now - e.at <= LOG_WINDOW);
    if (keep.length !== db.log[pid].length) dirty = true;
    if (keep.length) db.log[pid] = keep;
    else delete db.log[pid];
  }
  const wk = String(week);
  const wl = (db.lines[wk] ||= {});
  for (const [team, imp] of Object.entries(lines)) {
    if (imp == null) continue;
    if (!wl[team]) {
      wl[team] = { open: imp, now: imp, at: now };
      dirty = true;
    } else if (wl[team].now !== imp) {
      wl[team].now = imp;
      dirty = true;
    }
  }
  for (const k of Object.keys(db.lines)) if (Number(k) < week - 1) delete db.lines[k];
  if (dirty) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(db));
    } catch {}
  }
  const changes = {};
  for (const pid in db.log) if (players[pid]) changes[pid] = db.log[pid];
  return { changes, lines: wl };
}

// Starters' NFL teammates whose news moves my players: the QB, the backfield, the WR room, TE1.
function teammatesOf(slim, teams) {
  const out = [];
  const byTeam = {};
  for (const pid in slim) {
    const p = slim[pid];
    if (!p.team || !SKILL.includes(p.pos) || p.depth == null) continue;
    (byTeam[p.team] ||= []).push(p);
  }
  const keep = { QB: 1, RB: 2, WR: 1, TE: 1 }; // depth_chart_order is per slot (LWR/RWR/SWR all have a 1)
  for (const team of teams) {
    for (const p of (byTeam[team] || []).sort((a, b) => a.depth - b.depth)) {
      if (p.depth <= (keep[p.pos] || 0)) out.push(p.id);
    }
  }
  return out;
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z]/g, '');

function trimText(s, n) {
  if (!s) return null;
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

async function buildSnapshot() {
  const t0 = Date.now();
  const { league, users, rosters, state } = await S.leagueCore(cfg.leagueId);
  const season = String(state.season || league.season);
  const W = state.week;
  const score = S.makeScorer(league.scoring_settings);
  const lastReg = (league.settings.playoff_week_start || 15) + 2;
  const lastWeekFetch = Math.min(lastReg, 18);

  const fetched = {};
  const mark = (k) => (fetched[k] = Date.now());

  const [slim, proj, projNext, trendAdd, trendDrop, picks, injRaw, newsRaw] = await Promise.all([
    S.slimPlayers(),
    S.projections(season, W),
    S.projections(season, W + 1).catch(() => []),
    S.trending('add').catch(() => []),
    S.trending('drop').catch(() => []),
    S.tradedPicks(cfg.leagueId).catch(() => []),
    S.espnInjuries().catch(() => null),
    S.espnNews().catch(() => null),
  ]);
  mark('sleeper');

  // Past stats, matchups, transactions, schedule in parallel
  const pastWeeks = Array.from({ length: Math.max(0, W - 1) }, (_, i) => i + 1);
  const muWeeks = Array.from({ length: league.settings.playoff_week_start - 1 }, (_, i) => i + 1);
  const schedWeeks = Array.from({ length: lastWeekFetch - W + 1 }, (_, i) => W + i);
  // Last 6 finished weeks of results, for matchup strength (points allowed by position).
  const resultWeeks = pastWeeks.slice(-6);
  const [statsByWeek, muByWeek, txByWeek, sbByWeek, pastSb] = await Promise.all([
    Promise.all(pastWeeks.map((w) => S.weeklyStats(season, w).catch(() => []))),
    Promise.all(muWeeks.map((w) => S.matchups(cfg.leagueId, w, w === W).catch(() => []))),
    Promise.all(pastWeeks.concat([W]).map((w) => S.transactions(cfg.leagueId, w, w === W).catch(() => []))),
    Promise.all(schedWeeks.map((w) => S.scoreboard(w, w === W).catch(() => null))),
    Promise.all(resultWeeks.map((w) => S.scoreboard(w, false).catch(() => null))),
  ]);
  const results = {};
  resultWeeks.forEach((w, i) => {
    if (!pastSb[i]) return;
    // team -> opponent only; scores and odds are not needed for past weeks
    const opp = {};
    for (const g of S.parseScoreboard(pastSb[i])) {
      opp[g.home.t] = g.away.t;
      opp[g.away.t] = g.home.t;
    }
    results[w] = opp;
  });
  mark('stats');

  // ----- schedule -----
  const allTeams = new Set();
  const schedule = {};
  schedWeeks.forEach((w, i) => {
    const games = sbByWeek[i] ? S.parseScoreboard(sbByWeek[i]) : [];
    games.forEach((g) => {
      allTeams.add(g.home.t);
      allTeams.add(g.away.t);
    });
    schedule[w] = { games };
  });
  // wind at kickoff for this week's outdoor games (best effort, never fatal)
  if (schedule[W]) await WX.addWind(schedule[W].games).catch(() => 0);
  schedWeeks.forEach((w) => {
    const playing = new Set();
    schedule[w].games.forEach((g) => {
      playing.add(g.home.t);
      playing.add(g.away.t);
    });
    schedule[w].byes = schedule[w].games.length ? [...allTeams].filter((t) => !playing.has(t)) : [];
  });
  mark('schedule');

  // ----- rostered ownership -----
  const owner = {};
  for (const r of rosters) for (const pid of r.players || []) owner[pid] = r.roster_id;

  // ----- projections -----
  const projBy = {};
  for (const row of proj) {
    if (!S.POS.includes(row.player?.position)) continue;
    projBy[row.player_id] = {
      pts: score(row.stats || {}),
      opp: row.opponent || null,
      date: row.date || null,
      team: row.team || null,
      live: {
        inj: row.player.injury_status || null,
        body: row.player.injury_body_part || null,
        note: row.player.injury_notes || null,
        nu: row.player.news_updated || null,
      },
      name: row.player.first_name ? `${row.player.first_name} ${row.player.last_name}` : null,
      pos: row.player.position,
      pteam: row.player.team || row.team || null,
      exp: row.player.years_exp ?? null,
      statsLite: pickStats(row.stats || {}, row.player.position),
      adp: row.stats && row.stats.adp_dd_ppr < 900 ? [row.stats.adp_dd_ppr, row.stats.pos_adp_dd_ppr] : null,
    };
  }
  const nextBy = {};
  for (const row of projNext) nextBy[row.player_id] = { pts: score(row.stats || {}), opp: row.opponent || null };

  // ----- history (league scoring) -----
  const hist = {};
  statsByWeek.forEach((rows, i) => {
    const w = pastWeeks[i];
    for (const row of rows) {
      const st = row.stats || {};
      const played = (st.gp || 0) > 0 || (st.off_snp || 0) > 0;
      if (!played) continue;
      const snp = st.tm_off_snp && st.off_snp != null ? Math.round((st.off_snp / st.tm_off_snp) * 100) : null;
      (hist[row.player_id] ||= []).push({
        w,
        pts: score(st),
        snp,
        att: st.rush_att || 0,
        tgt: st.rec_tgt || 0,
        rec: st.rec || 0,
        // usage detail for expected points (public/js/fitted.js XP): air yards, red-zone work, pass attempts
        air: st.rec_air_yd || 0,
        rzTgt: st.rec_rz_tgt || 0,
        rzAtt: st.rush_rz_att || 0,
        passAtt: st.pass_att || 0,
        td: (st.rec_td || 0) + (st.rush_td || 0),
      });
      if (!projBy[row.player_id] && row.player && S.POS.includes(row.player.position)) {
        // remember identity for players with history but no projection
        projBy[row.player_id] = projBy[row.player_id] || null;
      }
    }
  });

  // ----- trending -----
  const trend = {};
  trendAdd.forEach((t, i) => ((trend[t.player_id] ||= {}).add = { n: t.count, rank: i + 1 }));
  trendDrop.forEach((t, i) => ((trend[t.player_id] ||= {}).drop = { n: t.count, rank: i + 1 }));

  // ----- which players ship to the client -----
  const include = new Set();
  for (const pid in owner) include.add(pid);
  for (const pid in projBy) if (projBy[pid] && projBy[pid].pts >= 1.5) include.add(pid);
  for (const pid in trend) include.add(pid);
  for (const pid in hist) if (hist[pid].some((h) => h.pts >= 8) && slim[pid]) include.add(pid);
  for (const r of rosters) for (const pid of r.players || []) include.add(pid);
  for (const t of txByWeek.flat()) for (const pid of [...Object.keys(t.adds || {}), ...Object.keys(t.drops || {})]) include.add(pid);
  // My roster's NFL teams: every depth-chart skill player there, so teammate news resolves,
  // is searchable and can carry a ripple to my players.
  const meUser = users.find((u) => (u.display_name || '').toLowerCase() === String(cfg.username).toLowerCase());
  const meRoster = rosters.find((r) => meUser && r.owner_id === meUser.user_id) || rosters.find((r) => r.roster_id === cfg.defaultRosterId);
  const myNflTeams = new Set((meRoster?.players || []).map((pid) => slim[pid]?.team).filter(Boolean));
  for (const pid in slim) {
    const p = slim[pid];
    if (p.team && myNflTeams.has(p.team) && SKILL.includes(p.pos) && p.depth != null && p.depth <= 3) include.add(pid);
  }

  const players = {};
  const idx = {};
  const byName = {};
  for (const pid in slim) {
    const p = slim[pid];
    if (p.pos === 'DEF') continue;
    const key = norm(p.n);
    (byName[key] ||= []).push(pid);
    if (p.team) idx[key + '|' + p.team] = pid;
  }
  const espnIdx = {};
  for (const pid in slim) if (slim[pid].espn) espnIdx[slim[pid].espn] = pid;
  const resolve = (name, team, espnId) => {
    if (espnId && espnIdx[espnId]) return espnIdx[espnId];
    const k = norm(name);
    if (team && idx[k + '|' + team]) return idx[k + '|' + team];
    const c = byName[k];
    return c && c.length === 1 ? c[0] : null;
  };

  for (const pid of include) {
    const sp = slim[pid];
    const pr = projBy[pid];
    if (!sp && !pr) continue;
    const base = sp || { id: pid, n: pr.name || pid, pos: pr.pos, team: pr.pteam };
    const live = pr?.live;
    players[pid] = {
      id: pid,
      n: base.n,
      pos: base.pos,
      team: base.team || pr?.pteam || null,
      age: base.age ?? null,
      exp: base.exp ?? pr?.exp ?? null,
      inj: live ? live.inj : base.inj ?? null,
      body: (live && live.body) || base.body || null,
      note: (live && live.note) || base.note || null,
      prac: base.prac || null,
      tchg: base.tchg || null,
      depth: base.depth ?? null,
      dpos: base.dpos || null,
      rank: base.rank ?? null,
      status: base.status || null,
      nu: (live && live.nu) || base.nu || null,
      own: owner[pid] ?? null,
      proj: pr ? { pts: pr.pts, opp: pr.opp, date: pr.date, st: pr.statsLite } : null,
      next: nextBy[pid] || null,
      adp: pr?.adp || null,
      hist: hist[pid] || [],
      trend: trend[pid] || null,
    };
    if (base.pos === 'DEF') players[pid].n = base.n;
  }
  teamSeen(players, Date.now());

  // ----- official injury report (practice + game status), best effort -----
  let official = 0;
  try {
    official = NV.attach(players, await NV.officialReport(season, W));
  } catch (err) {
    console.warn('Official injury report unavailable:', err.message);
  }

  // ----- ESPN injury notes (RotoWire via ESPN) -----
  const espnInj = {};
  const notes = [];
  if (injRaw?.injuries) {
    for (const team of injRaw.injuries) {
      for (const it of team.injuries || []) {
        const a = it.athlete || {};
        const tm = S.fixTeam(a.team?.abbreviation || '');
        const pid = resolve(a.displayName, tm, (a.links?.[0]?.href || '').match(/id\/(\d+)/)?.[1]);
        if (!pid || !players[pid]) continue;
        const rec = {
          status: it.status || null,
          type: it.details?.type || null,
          returnDate: it.details?.returnDate || null,
          date: it.date || null,
          short: trimText(it.shortComment, 300),
          long: trimText(it.longComment, 900),
          src: it.notes?.items?.[0]?.source || 'ESPN',
        };
        espnInj[pid] = rec;
        notes.push({ pid, ...rec });
      }
    }
  }
  mark('espn');

  // ----- status changes + line movement -----
  const lineNow = {};
  for (const g of schedule[W]?.games || []) {
    lineNow[g.home.t] = g.home.imp;
    lineNow[g.away.t] = g.away.imp;
  }
  const { changes, lines } = statusLog(players, espnInj, !!injRaw?.injuries, lineNow, W, Date.now(), official > 0);
  const calibration = await calibrate(players, W, { isBye: (t, wk) => !!schedule[wk]?.byes?.includes(t), lines }).catch(() => null);

  // ----- ESPN articles -----
  const articles = [];
  for (const a of newsRaw?.articles || []) {
    const cats = a.categories || [];
    const pids = [];
    const teams = [];
    for (const c of cats) {
      if (c.type === 'athlete' && c.athlete) {
        const pid = resolve(c.athlete.description || c.description, null, String(c.athleteId || c.athlete.id));
        if (pid && players[pid] && !pids.includes(pid)) pids.push(pid);
      } else if (c.type === 'team' && c.team?.abbreviation) teams.push(S.fixTeam(c.team.abbreviation));
    }
    articles.push({
      id: String(a.id),
      headline: a.headline,
      desc: a.description || '',
      time: a.published || a.lastModified,
      url: a.links?.web?.href || null,
      type: a.type || null,
      pids,
      teams,
      byline: a.byline || null,
    });
  }

  // ----- league users -----
  const userBy = {};
  for (const u of users) userBy[u.user_id] = u;
  const teams = rosters.map((r) => {
    const u = userBy[r.owner_id] || {};
    const st = r.settings || {};
    return {
      id: r.roster_id,
      owner: u.display_name || `Team ${r.roster_id}`,
      name: u.metadata?.team_name || u.display_name || `Team ${r.roster_id}`,
      avatar: u.avatar || null,
      isMe: (u.display_name || '').toLowerCase() === cfg.username.toLowerCase(),
      division: st.division ?? null,
      w: st.wins || 0,
      l: st.losses || 0,
      t: st.ties || 0,
      pf: (st.fpts || 0) + (st.fpts_decimal || 0) / 100,
      pa: (st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100,
      pp: (st.ppts || 0) + (st.ppts_decimal || 0) / 100,
      wp: st.waiver_position ?? null,
      moves: st.total_moves ?? 0,
      players: r.players || [],
      starters: r.starters || [],
      reserve: r.reserve || [],
      taxi: r.taxi || [],
    };
  });

  const txs = txByWeek.flat().filter((t) => t.status === 'complete' || t.status === 'pending');

  // ----- Google News headlines for my roster + hot names -----
  let gn = { items: [], degraded: false, disabled: !S.newsEnabled, freshAt: 0 };
  if (S.newsEnabled) {
    // Scan order: my roster (hot) → this week's opponent starters → my starters' NFL teammates
    // → trending names that are free agents in this league. Deduped and capped.
    const scan = [];
    const kickBy = {};
    for (const g of schedule[W]?.games || []) {
      const t = new Date(g.date).getTime();
      kickBy[g.home.t] = t;
      kickBy[g.away.t] = t;
    }
    const addScan = (pid, flags) => {
      const p = players[pid];
      if (scan.length >= SCAN_CAP || !p || !p.n || scan.some((x) => x.id === pid)) return;
      scan.push({ id: pid, n: p.n, pos: p.pos, team: p.team, kick: kickBy[p.team] || null, ...flags });
    };
    const me0 = teams.find((t) => t.isMe);
    if (me0) for (const pid of [...me0.players, ...me0.reserve]) addScan(pid, { hot: (me0.starters || []).includes(pid) });
    const muNow = muByWeek[W - 1] || [];
    const myMu = me0 && muNow.find((m) => m.roster_id === me0.id);
    const oppMu = myMu && muNow.find((m) => m.matchup_id === myMu.matchup_id && m.roster_id !== me0.id);
    const oppTeam = oppMu && teams.find((t) => t.id === oppMu.roster_id);
    for (const pid of (oppMu?.starters?.length ? oppMu.starters : oppTeam?.starters) || []) if (pid && pid !== '0') addScan(pid, {});
    const starterTeams = [...new Set((me0?.starters || []).map((pid) => players[pid]?.team).filter(Boolean))];
    for (const pid of teammatesOf(slim, starterTeams)) if (!me0 || !me0.players.includes(pid)) addScan(pid, { cold: true });
    const hot = [...trendAdd.slice(0, 20), ...trendDrop.slice(0, 8)];
    for (const t of hot) if (owner[t.player_id] == null) addScan(t.player_id, { cold: true });
    gn = await S.playerNews(scan).catch(() => ({ items: [], degraded: true, disabled: false, freshAt: 0, scanned: scan.length, fetched: 0, failed: [], perPlayer: {}, diag: null }));
  }
  mark('googlenews');

  return {
    meta: {
      builtAt: Date.now(),
      officialReport: official, // players matched to the official injury report this week
      buildMs: Date.now() - t0,
      fetched,
      season,
      week: W,
      leagueId: cfg.leagueId,
      tz: cfg.timeZone,
      defaultRosterId: teams.find((t) => t.isMe)?.id ?? cfg.defaultRosterId,
      tradeDeadlineWeek: league.settings.trade_deadline,
      playoffWeeks: cfg.playoffWeeks,
      sources: {
        roster: 'Sleeper',
        projections: 'Sleeper/RotoWire stat projections, scored with this league\u2019s exact settings',
        injuries: 'Sleeper + ESPN (RotoWire notes)',
        schedule: 'ESPN',
        playerNews: 'Google News RSS headlines (headline + source + link only)',
      },
    },
    league: {
      name: league.name,
      status: league.status,
      rosterPositions: league.roster_positions,
      settings: pickSettings(league.settings),
      scoring: Object.fromEntries(Object.entries(league.scoring_settings).filter(([, v]) => v)),
    },
    teams,
    players,
    schedule,
    matchups: Object.fromEntries(muWeeks.map((w, i) => [w, muByWeek[i].map(slimMatchup)])),
    transactions: txs.map(slimTx),
    picks,
    notes,
    articles,
    changes,
    lines,
    results,
    calibration,
    headlineLag: headlineLag(changes, gn.items),
    playerNews: {
      items: gn.items,
      degraded: gn.degraded,
      disabled: !!gn.disabled,
      freshAt: gn.freshAt,
      scanned: gn.scanned || 0,
      failed: gn.failed || [],
      perPlayer: gn.perPlayer || {},
      diag: gn.diag || null,
    },
  };
}

function pickStats(st, pos) {
  const keys =
    pos === 'QB'
      ? ['pass_yd', 'pass_td', 'pass_int', 'rush_yd', 'rush_td']
      : pos === 'K'
        ? ['fgm', 'fga', 'xpm']
        : pos === 'DEF'
          ? ['sack', 'int', 'pts_allow']
          : ['rush_att', 'rush_yd', 'rec_tgt', 'rec', 'rec_yd', 'rush_td', 'rec_td'];
  const out = {};
  for (const k of keys) if (st[k] != null) out[k] = Math.round(st[k] * 10) / 10;
  return out;
}

function pickSettings(s) {
  const keys = [
    'trade_deadline', 'waiver_type', 'waiver_clear_days', 'waiver_day_of_week', 'reserve_slots', 'taxi_slots',
    'playoff_teams', 'playoff_week_start', 'num_teams', 'divisions', 'max_keepers', 'draft_rounds', 'trade_review_days',
    'veto_votes_needed', 'pick_trading', 'reserve_allow_out', 'reserve_allow_doubtful', 'reserve_allow_sus',
    'reserve_allow_na', 'reserve_allow_dnr', 'reserve_allow_cov', 'leg', 'type', 'disable_trades', 'daily_waivers',
  ];
  return Object.fromEntries(keys.map((k) => [k, s[k]]));
}

function slimMatchup(m) {
  return {
    rid: m.roster_id,
    mid: m.matchup_id,
    pts: m.points,
    starters: m.starters,
    sp: m.starters_points,
    players: m.players,
    pp: m.players_points,
  };
}

function slimTx(t) {
  return {
    id: t.transaction_id,
    type: t.type,
    status: t.status,
    leg: t.leg,
    created: t.created,
    rids: t.roster_ids,
    adds: t.adds,
    drops: t.drops,
    picks: (t.draft_picks || []).map((p) => ({ s: p.season, r: p.round, from: p.roster_id, orig: p.previous_owner_id, to: p.owner_id })),
  };
}

module.exports = { buildSnapshot, statusLog, headlineLag };
