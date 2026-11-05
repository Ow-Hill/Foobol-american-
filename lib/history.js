// Walks the league's previous_league_id chain and returns every season in one compact payload.
const S = require('./sources');
const cfg = require('../config.json');

const pad = (n) => n;

async function season(id, isCurrent) {
  const ttl = isCurrent ? 5 * 60 * 1000 : 12 * 3600 * 1000;
  return S.memo('hist:' + id, ttl, async () => {
    const L = await S.sleeper(`/league/${id}`);
    const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
    const [users, rosters, drafts, wb, lb, mus, txs] = await Promise.all([
      S.sleeper(`/league/${id}/users`),
      S.sleeper(`/league/${id}/rosters`),
      S.sleeper(`/league/${id}/drafts`).catch(() => []),
      S.sleeper(`/league/${id}/winners_bracket`).catch(() => []),
      S.sleeper(`/league/${id}/losers_bracket`).catch(() => []),
      Promise.all(weeks.map((w) => S.sleeper(`/league/${id}/matchups/${w}`).catch(() => []))),
      Promise.all(weeks.map((w) => S.sleeper(`/league/${id}/transactions/${w}`).catch(() => []))),
    ]);
    const userBy = Object.fromEntries(users.map((u) => [u.user_id, u]));
    const teams = rosters.map((r) => {
      const u = userBy[r.owner_id] || {};
      const st = r.settings || {};
      return {
        rid: r.roster_id,
        ownerId: r.owner_id,
        owner: u.display_name || 'Team ' + r.roster_id,
        name: (u.metadata && u.metadata.team_name) || u.display_name || 'Team ' + r.roster_id,
        w: st.wins || 0, l: st.losses || 0, t: st.ties || 0,
        pf: (st.fpts || 0) + (st.fpts_decimal || 0) / 100,
        pa: (st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100,
        pp: (st.ppts || 0) + (st.ppts_decimal || 0) / 100,
        division: st.division ?? null,
        players: r.players || [],
      };
    });
    const matchups = {};
    weeks.forEach((w, i) => {
      const rows = (mus[i] || []).filter((m) => m.matchup_id != null);
      const played = rows.some((m) => (m.points || 0) > 0);
      if (!played) return;
      matchups[w] = rows.map((m) => ({ rid: m.roster_id, mid: m.matchup_id, pts: m.points, starters: m.starters, pp: m.players_points }));
    });
    const tx = [];
    txs.forEach((arr) => {
      for (const t of arr || []) {
        if (t.status !== 'complete') continue;
        tx.push({
          id: t.transaction_id, type: t.type, leg: t.leg, created: t.created, rids: t.roster_ids,
          adds: t.adds, drops: t.drops,
          picks: (t.draft_picks || []).map((p) => ({ s: p.season, r: p.round, orig: p.roster_id, to: p.owner_id })),
        });
      }
    });
    let draft = null;
    const d0 = drafts.find((d) => d.status === 'complete') || drafts[0];
    if (d0) {
      const picks = await S.sleeper(`/draft/${d0.draft_id}/picks`).catch(() => []);
      draft = {
        id: d0.draft_id, type: d0.type, status: d0.status, rounds: d0.settings?.rounds, slots: d0.draft_order || {}, startTime: d0.start_time,
        picks: picks.map((p) => ({
          no: p.pick_no, round: p.round, slot: p.draft_slot, rid: p.roster_id, pid: p.player_id,
          n: `${p.metadata?.first_name || ''} ${p.metadata?.last_name || ''}`.trim(), pos: p.metadata?.position, team: p.metadata?.team, exp: p.metadata?.years_exp ? Number(p.metadata.years_exp) : 0, keeper: !!p.is_keeper,
        })),
      };
    }
    const bracket = { winners: wb.map((b) => ({ r: b.r, m: b.m, w: b.w, l: b.l, t1: b.t1, t2: b.t2, p: b.p })), losers: lb.map((b) => ({ r: b.r, m: b.m, w: b.w, l: b.l, t1: b.t1, t2: b.t2, p: b.p })) };
    const final = bracket.winners.find((b) => b.p === 1);
    return {
      season: L.season, leagueId: id, name: L.name, status: L.status,
      rosterPositions: L.roster_positions,
      playoffStart: L.settings.playoff_week_start, playoffTeams: L.settings.playoff_teams, numTeams: L.settings.num_teams,
      champion: final && final.w ? final.w : null, runnerUp: final && final.l ? final.l : null,
      teams, matchups, transactions: tx, draft, bracket,
    };
  });
}

async function buildHistory() {
  const seasons = [];
  let id = cfg.leagueId;
  let first = true;
  while (id && id !== '0' && seasons.length < 8) {
    const s = await season(id, first);
    seasons.push(s);
    const L = await S.memo('lgprev:' + id, 12 * 3600 * 1000, () => S.sleeper(`/league/${id}`));
    id = L.previous_league_id;
    first = false;
  }
  seasons.reverse();

  const slim = await S.slimPlayers();
  const names = {};
  const need = (pid) => {
    if (!pid || pid === '0' || names[pid]) return;
    const p = slim[pid];
    if (p) names[pid] = [p.n, p.pos, p.team];
  };
  for (const s of seasons) {
    for (const wk in s.matchups) for (const m of s.matchups[wk]) for (const pid in m.pp || {}) need(pid);
    for (const t of s.transactions) {
      for (const pid in t.adds || {}) need(pid);
      for (const pid in t.drops || {}) need(pid);
    }
    for (const t of s.teams) t.players.forEach(need);
    if (s.draft) for (const p of s.draft.picks) if (!names[p.pid]) names[p.pid] = [p.n, p.pos, p.team || null];
  }
  return { builtAt: Date.now(), seasons, names };
}

module.exports = { buildHistory };
