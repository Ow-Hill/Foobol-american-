// Builds one normalized snapshot of league + NFL context for the client.
const S = require('./sources');
const cfg = require('../config.json');

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
  const [statsByWeek, muByWeek, txByWeek, sbByWeek] = await Promise.all([
    Promise.all(pastWeeks.map((w) => S.weeklyStats(season, w).catch(() => []))),
    Promise.all(muWeeks.map((w) => S.matchups(cfg.leagueId, w, w === W).catch(() => []))),
    Promise.all(pastWeeks.concat([W]).map((w) => S.transactions(cfg.leagueId, w, w === W).catch(() => []))),
    Promise.all(schedWeeks.map((w) => S.scoreboard(w, w === W).catch(() => null))),
  ]);
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

  return {
    meta: {
      builtAt: Date.now(),
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

module.exports = { buildSnapshot };
