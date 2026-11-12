// Download and cache everything the backtest needs into data/bt/ (git-ignored).
// Sleeper: weekly projections + stats 2022-now, player database, this league's history.
// nflverse (public GitHub releases): official injury reports, games with closing lines and weather,
// weekly depth charts. Safe to re-run: files already on disk are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bt');
export const SEASONS = [2022, 2023, 2024, 2025, 2026];
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const posQuery = POS.map((p) => `position%5B%5D=${p}`).join('&');
const UA = { 'User-Agent': 'ff-roster-monitor-backtest/1.0' };
const NV = 'https://github.com/nflverse/nflverse-data/releases/download';

async function get(url, as = 'json', tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (err) {
      if (i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}
const has = (f) => fs.existsSync(path.join(DIR, f));
const save = (f, v) => fs.writeFileSync(path.join(DIR, f), typeof v === 'string' ? v : JSON.stringify(v));

const DROP = /^(pos_rank|adp|pos_adp|rank_)/;
function trim(rows, kind) {
  const out = [];
  for (const r of rows || []) {
    const st = r.stats || {};
    const pos = r.player?.position;
    if (!POS.includes(pos)) continue;
    if (kind === 'stats' && !((st.gp || 0) > 0 || (st.off_snp || 0) > 0 || pos === 'DEF')) continue;
    if (kind === 'proj' && !(st.pts_ppr > 0 || st.pts_std > 0 || pos === 'K' || pos === 'DEF')) continue;
    const s = {};
    for (const k in st) if (!DROP.test(k) && st[k]) s[k] = st[k];
    out.push({ id: r.player_id, pos, n: pos === 'DEF' ? r.player_id : `${r.player.first_name} ${r.player.last_name}`, team: r.team || null, opp: r.opponent || null, date: r.date || null, s });
  }
  return out;
}

export async function fetchAll({ log = console.log } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const state = await get('https://api.sleeper.app/v1/state/nfl');
  save('state.json', state);
  const curSeason = Number(state.season);
  const curWeek = state.season_type === 'regular' ? state.week : 18;

  // Sleeper weekly projections and stats
  for (const season of SEASONS) {
    const last = season < curSeason ? 18 : season === curSeason ? curWeek : 0;
    for (let wk = 1; wk <= last; wk++) {
      for (const kind of ['proj', 'stats']) {
        const f = `sl-${kind}-${season}-${wk}.json`;
        const live = season === curSeason && wk >= curWeek - 1;
        if (has(f) && !live) continue;
        const ep = kind === 'proj' ? 'projections' : 'stats';
        const rows = await get(`https://api.sleeper.com/${ep}/nfl/${season}/${wk}?season_type=regular&${posQuery}`);
        save(f, trim(rows, kind));
      }
    }
    log(`sleeper ${season}: weeks 1-${last}`);
  }

  // Sleeper player database (ids, ages, gsis ids)
  if (!has('players.json')) {
    const raw = await get('https://api.sleeper.app/v1/players/nfl');
    const out = {};
    for (const id in raw) {
      const p = raw[id];
      if (!POS.includes(p.position)) continue;
      out[id] = { id, n: p.full_name || `${p.first_name} ${p.last_name}`, pos: p.position, team: p.team || null, age: p.age || null, bd: p.birth_date || null, exp: p.years_exp ?? null, gsis: (p.gsis_id || '').trim() || null, rookie: p.metadata?.rookie_year || null };
    }
    save('players.json', out);
    log(`players: ${Object.keys(out).length}`);
  }

  // This league, back through previous_league_id
  if (!has('league.json')) {
    const cfg = JSON.parse(fs.readFileSync(path.join(DIR, '..', '..', 'config.json'), 'utf8'));
    const chain = [];
    let id = cfg.leagueId;
    while (id && id !== '0' && chain.length < 6) {
      const lg = await get(`https://api.sleeper.app/v1/league/${id}`);
      if (!lg) break;
      const [users, rosters, picks, drafts] = await Promise.all([
        get(`https://api.sleeper.app/v1/league/${id}/users`),
        get(`https://api.sleeper.app/v1/league/${id}/rosters`),
        get(`https://api.sleeper.app/v1/league/${id}/traded_picks`),
        get(`https://api.sleeper.app/v1/league/${id}/drafts`),
      ]);
      const weeks = {};
      const last = Number(lg.season) < curSeason ? 17 : curWeek;
      for (let wk = 1; wk <= last; wk++) {
        const [mu, tx] = await Promise.all([get(`https://api.sleeper.app/v1/league/${id}/matchups/${wk}`), get(`https://api.sleeper.app/v1/league/${id}/transactions/${wk}`)]);
        weeks[wk] = { mu: (mu || []).map((m) => ({ rid: m.roster_id, mid: m.matchup_id, pts: m.points, starters: m.starters, players: m.players, sp: m.starters_points })), tx: (tx || []).filter((t) => t.status === 'complete').map((t) => ({ type: t.type, created: t.created, adds: t.adds, drops: t.drops, rids: t.roster_ids, picks: t.draft_picks, leg: t.leg })) };
      }
      const draftPicks = {};
      for (const d of drafts || []) draftPicks[d.draft_id] = { season: d.season, type: d.type, rounds: d.settings?.rounds, picks: ((await get(`https://api.sleeper.app/v1/draft/${d.draft_id}/picks`)) || []).map((p) => ({ no: p.pick_no, round: p.round, rid: p.roster_id, pid: p.player_id, keeper: p.is_keeper })) };
      chain.push({ id, season: Number(lg.season), name: lg.name, settings: lg.settings, scoring: lg.scoring_settings, positions: lg.roster_positions, users: users.map((u) => ({ id: u.user_id, name: u.display_name })), rosters: rosters.map((r) => ({ rid: r.roster_id, owner: r.owner_id, players: r.players, starters: r.starters, reserve: r.reserve, settings: r.settings })), picks, drafts: draftPicks, weeks });
      log(`league ${lg.season}: ${Object.keys(weeks).length} weeks`);
      id = lg.previous_league_id;
    }
    save('league.json', chain);
  }

  // nflverse
  const nv = [['games.csv', 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv']];
  for (const s of SEASONS) nv.push([`injuries_${s}.csv`, `${NV}/injuries/injuries_${s}.csv`]);
  for (const s of [2022, 2023, 2024]) nv.push([`depth_charts_${s}.csv`, `${NV}/depth_charts/depth_charts_${s}.csv`]);
  for (const [f, url] of nv) {
    const live = f === 'games.csv' || f.includes(String(curSeason));
    if (has(f) && !live) continue;
    const txt = await get(url, 'text');
    if (txt) save(f, txt);
    log(`nflverse ${f}: ${txt ? Math.round(txt.length / 1024) + ' KB' : 'missing'}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) fetchAll().catch((e) => { console.error(e); process.exit(1); });
