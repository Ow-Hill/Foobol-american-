// Live draft guide, server side: reads any Sleeper draft (league or mock), builds the player pool
// in that draft's own scoring, and serves the picks for the page to poll.
//
// Everything Sleeper sends is free, keyless and read-only (non-commercial use only, which this
// personal site is). The cloud sandbox cannot reach Sleeper, so this only runs on Owen's computer.
const S = require('./sources');
const { campNews } = require('./draftnews');

const POS = S.POS;
const posQuery = POS.map((p) => `position%5B%5D=${p}`).join('&');

// ---------- scoring ----------
// Sleeper's default scoring for mock drafts, which have no league. Leagues send their own.
const BASE_SCORING = {
  pass_yd: 0.04, pass_td: 4, pass_int: -1, pass_2pt: 2,
  rush_yd: 0.1, rush_td: 6, rush_2pt: 2,
  rec_yd: 0.1, rec_td: 6, rec_2pt: 2,
  fum_lost: -2,
  fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, xpm: 1, fgmiss: -1, xpmiss: -1,
  sack: 1, int: 2, fum_rec: 2, def_td: 6, safe: 2, blk_kick: 2, def_st_td: 6,
  pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_28_34: -1, pts_allow_35p: -4,
};
function scoringFor(draft, league) {
  if (league?.scoring_settings) return league.scoring_settings;
  const t = String(draft?.metadata?.scoring_type || 'ppr');
  const rec = /half/.test(t) ? 0.5 : /std/.test(t) ? 0 : 1;
  return { ...BASE_SCORING, rec };
}
// Which of Sleeper's ADP columns matches this draft's format. First one present wins.
function adpKeys(draft, league) {
  const t = String(draft?.metadata?.scoring_type || '');
  const sf = isSuperflex(draft, league) || /2qb/.test(t);
  const dyn = /dynasty/.test(t) || league?.settings?.type === 2;
  const rec = league?.scoring_settings ? league.scoring_settings.rec ?? 0 : /half/.test(t) ? 0.5 : /std/.test(t) ? 0 : 1;
  const fmt = rec >= 1 ? 'ppr' : rec > 0 ? 'half_ppr' : 'std';
  const keys = [];
  if (dyn && sf) keys.push('adp_dynasty_2qb');
  if (dyn) keys.push(`adp_dynasty_${fmt}`, 'adp_dynasty');
  if (sf) keys.push('adp_2qb');
  keys.push(`adp_${fmt}`, 'adp_half_ppr', 'adp_ppr', 'adp_std', 'adp_dd_ppr');
  return [...new Set(keys)];
}

// ---------- roster slots ----------
// League drafts use the league's roster_positions; mocks spell them out in draft.settings.
function rosterSlots(draft, league) {
  if (Array.isArray(league?.roster_positions) && league.roster_positions.length) return league.roster_positions.slice();
  const s = draft?.settings || {};
  const out = [];
  const add = (name, k) => { for (let i = 0; i < (s[k] || 0); i++) out.push(name); };
  add('QB', 'slots_qb'); add('RB', 'slots_rb'); add('WR', 'slots_wr'); add('TE', 'slots_te');
  add('FLEX', 'slots_flex'); add('WRRB_FLEX', 'slots_wrrb_flex'); add('REC_FLEX', 'slots_rec_flex'); add('SUPER_FLEX', 'slots_super_flex');
  add('K', 'slots_k'); add('DEF', 'slots_def'); add('BN', 'slots_bn');
  return out.length ? out : ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
}
function isSuperflex(draft, league) {
  return rosterSlots(draft, league).filter((s) => s === 'SUPER_FLEX' || s === 'QB').length >= 2;
}

// ---------- the player pool ----------
// One row per player with everything the guide weighs. Pure: tested on fixtures.
//   projRows: Sleeper season projections for the draft season (may be empty early in the year)
//   statRows: Sleeper season totals for last season (usage and results)
//   players:  slim player database (team, age, injury, depth chart)
function buildPool({ draft, league, players, projRows = [], statRows = [] }) {
  const score = S.makeScorer(scoringFor(draft, league));
  const keys = adpKeys(draft, league);
  const pool = {};
  const base = (id) => {
    if (pool[id]) return pool[id];
    const p = players[id];
    if (!p || !POS.includes(p.pos)) return null;
    // Free agents with no team and no projection are not draftable in practice.
    return (pool[id] = {
      id, n: p.n, pos: p.pos, team: p.team || null, age: p.age ?? null, exp: p.exp ?? null,
      inj: p.inj || null, body: p.body || null, note: p.note || null,
      depth: p.depth ?? null, dpos: p.dpos || null, rank: p.rank ?? null, status: p.status || null,
      proj: null, adp: null, last: null,
    });
  };

  for (const row of projRows) {
    const r = base(row.player_id);
    if (!r) continue;
    const st = row.stats || {};
    const pts = score(st);
    const gp = st.gp > 0 ? st.gp : null;
    r.proj = { pts: Math.round(pts * 10) / 10, gp };
    for (const k of keys) {
      if (st[k] != null && st[k] > 0 && st[k] < 900) {
        r.adp = Math.round(st[k] * 10) / 10;
        r.adpKey = k;
        break;
      }
    }
    if (!r.team && row.team) r.team = row.team;
  }

  // Last season: totals become one per-game line in the same shape the waiver scanner reads
  // (public/js/advstats.js), plus team shares computed from every player on the same team.
  const teamTot = {};
  for (const row of statRows) {
    const st = row.stats || {};
    const t = row.team || players[row.player_id]?.team;
    if (!t) continue;
    const a = (teamTot[t] ||= { tgt: 0, att: 0, air: 0 });
    a.tgt += st.rec_tgt || 0;
    a.att += st.rush_att || 0;
    a.air += Math.max(0, st.rec_air_yd || 0);
  }
  for (const row of statRows) {
    const st = row.stats || {};
    const gp = st.gp || 0;
    if (gp <= 0) continue;
    const r = base(row.player_id);
    if (!r) continue;
    const t = row.team || null;
    const T = t ? teamTot[t] : null;
    const pg = (v) => (v == null ? null : Math.round((v / gp) * 100) / 100);
    const sh = (x, tot) => (tot > 0 ? Math.round((x / tot) * 1000) / 1000 : null);
    const line = {
      pts: pg(score(st)), att: pg(st.rush_att || 0), tgt: pg(st.rec_tgt || 0), rec: pg(st.rec || 0),
      air: pg(st.rec_air_yd || 0), rzTgt: pg(st.rec_rz_tgt || 0), rzAtt: pg(st.rush_rz_att || 0),
      passAtt: pg(st.pass_att || 0), sack: pg(st.pass_sack ?? null), passRz: pg(st.pass_rz_att ?? null),
      rushYd: pg(st.rush_yd ?? null), rushTd: pg(st.rush_td ?? null), recYd: pg(st.rec_yd ?? null),
      snp: st.tm_off_snp > 0 && st.off_snp != null ? Math.round((st.off_snp / st.tm_off_snp) * 100) : null,
      tgtSh: T ? sh(st.rec_tgt || 0, T.tgt) : null, attSh: T ? sh(st.rush_att || 0, T.att) : null,
      airSh: T ? sh(Math.max(0, st.rec_air_yd || 0), T.air) : null,
    };
    for (const k in line) if (line[k] == null) delete line[k];
    r.last = { gp, team: t, line };
  }

  // Keep the pool to players someone could plausibly draft: a projection, an ADP, a search rank,
  // or a real season last year.
  const out = {};
  for (const id in pool) {
    const r = pool[id];
    const useful = (r.proj && r.proj.pts > 0) || r.adp || (r.last && r.last.gp >= 4 && r.last.line.pts > 3) || (r.rank != null && r.rank < 400 && r.team);
    if (useful && (r.team || r.adp)) out[id] = r;
  }
  return out;
}

// ---------- draft order ----------
function orderInfo(draft) {
  const s = draft.settings || {};
  return {
    type: draft.type || 'snake',
    teams: s.teams || Object.keys(draft.slot_to_roster_id || {}).length || 10,
    rounds: s.rounds || 15,
    reversal: s.reversal_round || 0,
    budget: s.budget || null,
  };
}

// ---------- Sleeper calls (memoised; Sleeper allows well under 1000 calls a minute) ----------
const get = (p, ttl) => S.memo('dr:' + p, ttl, () => S.sleeper(p));
const getDraft = (id) => get(`/draft/${id}`, 2500);
const getPicks = (id) => get(`/draft/${id}/picks`, 2000);
const getTraded = (id) => get(`/draft/${id}/traded_picks`, 30000).catch(() => []);
const getLeague = (id) => get(`/league/${id}`, 10 * 60 * 1000);
const getUsers = (id) => get(`/league/${id}/users`, 10 * 60 * 1000);
const getRosters = (id) => get(`/league/${id}/rosters`, 60 * 1000);
const getUser = (id) => get(`/user/${encodeURIComponent(id)}`, 60 * 60 * 1000);

const seasonProj = (season) =>
  S.memo(`dr:proj:${season}`, 60 * 60 * 1000, () => S.getJson(`https://api.sleeper.com/projections/nfl/${season}?season_type=regular&${posQuery}`, 60000)).catch(() => []);
const seasonStats = (season) =>
  S.memo(`dr:stats:${season}`, 6 * 60 * 60 * 1000, () => S.getJson(`https://api.sleeper.com/stats/nfl/${season}?season_type=regular&${posQuery}`, 60000)).catch(() => []);

// A draft link, a draft ID, a league ID or a Sleeper username → the draft to follow.
async function resolve(input, season) {
  const q = String(input || '').trim();
  const m = q.match(/draft\/nfl\/(\d+)/) || q.match(/^(\d{10,})$/);
  if (m) {
    const id = m[1];
    const d = await S.sleeper(`/draft/${id}`).catch(() => null);
    if (d && d.draft_id) return { drafts: [slimDraft(d)] };
    const l = await S.sleeper(`/league/${id}`).catch(() => null);
    if (l && l.league_id) return { drafts: (await S.sleeper(`/league/${id}/drafts`)).map(slimDraft) };
    throw new Error('No Sleeper draft or league has that ID');
  }
  const lm = q.match(/leagues\/(\d+)/);
  if (lm) return { drafts: (await S.sleeper(`/league/${lm[1]}/drafts`)).map(slimDraft) };
  if (/^[A-Za-z0-9_]{2,40}$/.test(q)) {
    const u = await S.sleeper(`/user/${encodeURIComponent(q)}`).catch(() => null);
    if (!u || !u.user_id) throw new Error('No Sleeper user by that name');
    const yrs = [season, season - 1];
    const lists = await Promise.all(yrs.map((y) => S.sleeper(`/user/${u.user_id}/drafts/nfl/${y}`).catch(() => [])));
    const drafts = lists.flat().map(slimDraft).sort((a, b) => (b.start || 0) - (a.start || 0));
    return { user: { id: u.user_id, name: u.display_name || q }, drafts };
  }
  throw new Error('Paste a Sleeper draft link, a draft or league ID, or a username');
}
function slimDraft(d) {
  return {
    id: d.draft_id, league: d.league_id || null, season: d.season, status: d.status, type: d.type,
    name: d.metadata?.name || (d.league_id ? 'League draft' : 'Mock draft'), scoring: d.metadata?.scoring_type || null,
    teams: d.settings?.teams || null, rounds: d.settings?.rounds || null, start: d.start_time || null,
  };
}

// Names for each draft slot: league users when there is a league, otherwise each user's profile.
async function slotNames(draft, league) {
  const order = draft.draft_order || {};
  const names = {};
  let users = [];
  if (league) users = await getUsers(league.league_id).catch(() => []);
  const byId = Object.fromEntries(users.map((u) => [u.user_id, u]));
  await Promise.all(Object.entries(order).map(async ([uid, slot]) => {
    let u = byId[uid];
    if (!u) u = await getUser(uid).catch(() => null);
    names[slot] = { user: uid, name: u?.metadata?.team_name || u?.display_name || `Slot ${slot}`, owner: u?.display_name || null };
  }));
  return names;
}

// Before Sleeper sets the draft order there is no slot for anyone yet: list the league's teams by
// roster so the page can still say who is who once the order arrives.
async function rosterNames(league) {
  if (!league) return [];
  const [users, rosters] = await Promise.all([getUsers(league.league_id).catch(() => []), getRosters(league.league_id).catch(() => [])]);
  const byId = Object.fromEntries(users.map((u) => [u.user_id, u]));
  return rosters.map((r) => {
    const u = byId[r.owner_id];
    return { rid: r.roster_id, user: r.owner_id || null, name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`, owner: u?.display_name || null };
  });
}

// A practice draft run on this site against bots: same board, a made-up draft with the chosen
// format. id = practice-<teams>-<rounds>-<scoring>, e.g. practice-10-15-ppr.
const PRACTICE_SCORING = ['ppr', 'half_ppr', 'std', '2qb'];
async function practiceDraft(id) {
  const m = id.match(/^practice-(\d{1,2})-(\d{1,2})-([a-z_0-9]+)$/);
  if (!m) throw new Error('Bad practice draft');
  const teams = Math.max(4, Math.min(16, Number(m[1])));
  const rounds = Math.max(8, Math.min(25, Number(m[2])));
  const scoring = PRACTICE_SCORING.includes(m[3]) ? m[3] : 'ppr';
  const state = await S.sleeper('/state/nfl').catch(() => ({}));
  const season = Number(state.league_season || state.season) || new Date().getFullYear();
  const sf = scoring === '2qb';
  const starters = 9 + (sf ? 1 : 0);
  return {
    draft_id: id, practice: true, season: String(season), status: 'drafting', type: 'snake',
    settings: { teams, rounds, reversal_round: 0, slots_qb: 1, slots_rb: 2, slots_wr: 2, slots_te: 1, slots_flex: 1, slots_super_flex: sf ? 1 : 0, slots_k: 1, slots_def: 1, slots_bn: Math.max(0, rounds - starters) },
    metadata: { scoring_type: scoring, name: `Practice draft · ${teams} teams · ${scoring.replace('_', ' ').toUpperCase()}` },
    draft_order: null, slot_to_roster_id: null,
  };
}

// The board is built once per draft and kept for 30 minutes; picks are polled separately.
const boards = new Map();
async function board(draftId) {
  const hit = boards.get(draftId);
  if (hit && Date.now() - hit.t < 30 * 60 * 1000) return hit.v;
  const draft = draftId.startsWith('practice-') ? await practiceDraft(draftId) : await getDraft(draftId);
  if (!draft || !draft.draft_id) throw new Error('Draft not found');
  const season = Number(draft.season) || new Date().getFullYear();
  const league = draft.league_id ? await getLeague(draft.league_id).catch(() => null) : null;
  const [players, projRows, statRows, names, rosters] = await Promise.all([S.slimPlayers(), seasonProj(season), seasonStats(season - 1), slotNames(draft, league), rosterNames(league)]);
  const pool = buildPool({ draft, league, players, projRows, statRows });
  const v = {
    draft: slimDraft(draft), order: orderInfo(draft), slots: rosterSlots(draft, league), names, rosters,
    practice: !!draft.practice,
    slotToRoster: draft.slot_to_roster_id || null, scoring: scoringFor(draft, league), adpKeys: adpKeys(draft, league),
    dynasty: /dynasty/.test(String(draft.metadata?.scoring_type || '')) || league?.settings?.type === 2,
    league: league ? { id: league.league_id, name: league.name } : null,
    pool, builtAt: Date.now(),
    sources: { projections: projRows.length, lastSeason: statRows.length, season, lastSeasonYear: season - 1 },
  };
  boards.set(draftId, { t: Date.now(), v });
  // Camp and preseason news for the players that matter, fetched in the background.
  warmNews(v);
  return v;
}

function newsTargets(b, limit = 70) {
  return Object.values(b.pool)
    .filter((p) => p.pos !== 'K' && p.pos !== 'DEF')
    .sort((a, c) => (a.adp ?? 999) - (c.adp ?? 999) || (c.proj?.pts || 0) - (a.proj?.pts || 0))
    .slice(0, limit)
    .map((p) => ({ id: p.id, n: p.n, pos: p.pos, team: p.team }));
}
const newsRuns = new Map();
function warmNews(b) {
  const id = b.draft.id;
  if (newsRuns.get(id)?.pending) return;
  const run = { pending: true, at: Date.now() };
  newsRuns.set(id, run);
  campNews(newsTargets(b)).catch(() => null).finally(() => (run.pending = false));
}

async function news(draftId, extraIds = []) {
  const b = await board(draftId);
  const list = newsTargets(b);
  // The page sends the best players still on the board and the ones it is about to recommend, so
  // research follows the available pool as the draft goes (cached 2 hours a player).
  for (const pid of extraIds.slice(0, 50)) {
    const p = b.pool[pid];
    if (p && p.pos !== 'DEF' && !list.some((x) => x.id === pid)) list.push({ id: p.id, n: p.n, pos: p.pos, team: p.team });
  }
  const [r, trend] = await Promise.all([
    campNews(list, { cacheOnly: newsRuns.get(draftId)?.pending && !extraIds.length }),
    S.trending('add').catch(() => []),
  ]);
  // Sleeper's most-added players over the last 24 hours: buzz from real drafts and waivers.
  r.trending = Object.fromEntries((trend || []).map((t) => [String(t.player_id), t.count]));
  return r;
}

async function live(draftId) {
  const [draft, picks, traded] = await Promise.all([getDraft(draftId), getPicks(draftId), getTraded(draftId)]);
  return {
    status: draft.status, type: draft.type, lastPicked: draft.last_picked || null, start: draft.start_time || null,
    timer: draft.settings?.pick_timer || null,
    draftOrder: draft.draft_order || null, slotToRoster: draft.slot_to_roster_id || null,
    picks: (picks || []).map((p) => ({
      no: p.pick_no, round: p.round, slot: p.draft_slot, rid: p.roster_id ?? null, by: p.picked_by || null, pid: String(p.player_id),
      keeper: !!p.is_keeper, amount: p.metadata?.amount != null ? Number(p.metadata.amount) : null,
      n: p.metadata ? `${p.metadata.first_name || ''} ${p.metadata.last_name || ''}`.trim() : null, pos: p.metadata?.position || null, team: p.metadata?.team || null,
    })),
    traded: (traded || []).filter((t) => String(t.season) === String(draft.season)).map((t) => ({ round: t.round, rid: t.roster_id, owner: t.owner_id })),
    at: Date.now(),
  };
}

// Owen's own drafts for the one-click list. Sleeper gives a league a new ID every season, with
// previous_league_id pointing back, so next year's league is found by walking the user's leagues
// for this season and next and following that link back to the configured league. Mock drafts
// (practice drafts on Sleeper) come from the user's draft list.
function renewedFrom(leagues, rootId) {
  const byId = Object.fromEntries(leagues.map((l) => [l.league_id, l]));
  const out = [];
  for (const l of leagues) {
    let cur = l;
    for (let hop = 0; hop < 4 && cur; hop++) {
      if (cur.previous_league_id === rootId || cur.league_id === rootId) {
        out.push(l);
        break;
      }
      cur = byId[cur.previous_league_id];
    }
  }
  return out;
}
async function homeDrafts(cfg) {
  const state = await S.sleeper('/state/nfl').catch(() => ({}));
  const season = Number(state.league_season || state.season) || new Date().getFullYear();
  const years = [season, season + 1];
  const seen = new Set();
  const out = [];
  const add = (d, kind) => {
    if (!d || seen.has(d.draft_id)) return;
    seen.add(d.draft_id);
    out.push({ ...slimDraft(d), kind });
  };
  if (cfg.leagueId) for (const d of await S.sleeper(`/league/${cfg.leagueId}/drafts`).catch(() => [])) add(d, 'league');
  const user = cfg.username ? await getUser(cfg.username).catch(() => null) : null;
  if (user?.user_id) {
    const leagues = (await Promise.all(years.map((y) => S.sleeper(`/user/${user.user_id}/leagues/nfl/${y}`).catch(() => [])))).flat();
    const next = cfg.leagueId ? renewedFrom(leagues, cfg.leagueId).filter((l) => l.league_id !== cfg.leagueId) : [];
    for (const l of next) for (const d of await S.sleeper(`/league/${l.league_id}/drafts`).catch(() => [])) add(d, 'next season');
    const mine = (await Promise.all(years.map((y) => S.sleeper(`/user/${user.user_id}/drafts/nfl/${y}`).catch(() => [])))).flat();
    for (const d of mine) add(d, d.league_id ? 'other league' : 'mock');
  }
  const rank = { 'next season': 0, league: 1, mock: 2, 'other league': 3 };
  out.sort((a, b) => (a.status === 'complete') - (b.status === 'complete') || rank[a.kind] - rank[b.kind] || (b.start || 0) - (a.start || 0));
  return { drafts: out, season, userId: user?.user_id || null };
}

// ---------- HTTP ----------
async function handle(url, cfg) {
  const p = url.pathname;
  const raw = String(url.searchParams.get('id') || '');
  const id = /^practice-[a-z0-9_-]{1,40}$/.test(raw) ? raw : raw.replace(/\D/g, '');
  if (p === '/api/draft/find') {
    const q = url.searchParams.get('q');
    const season = Number(url.searchParams.get('season')) || new Date().getFullYear();
    if (!q) {
      const h = await homeDrafts(cfg);
      return { status: 200, body: { home: h.drafts, season: h.season, userId: h.userId, username: cfg.username || null } };
    }
    return { status: 200, body: await resolve(q, season) };
  }
  if (!id) return { status: 400, body: { error: 'Missing draft id' } };
  if (p === '/api/draft/board') return { status: 200, body: await board(id) };
  if (p === '/api/draft/live') {
    if (id.startsWith('practice-')) return { status: 400, body: { error: 'Practice drafts run in the page' } };
    return { status: 200, body: await live(id) };
  }
  if (p === '/api/draft/news') {
    const ids = String(url.searchParams.get('pids') || '').split(',').filter((x) => /^\w+$/.test(x));
    return { status: 200, body: await news(id, ids) };
  }
  return { status: 404, body: { error: 'Unknown draft endpoint' } };
}

module.exports = { handle, renewedFrom, practiceDraft, buildPool, scoringFor, adpKeys, rosterSlots, isSuperflex, orderInfo, slimDraft, BASE_SCORING };
