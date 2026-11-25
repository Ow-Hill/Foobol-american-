// Collects real trades from Sleeper leagues shaped like James Cook Lovers, to calibrate trade
// value against what managers actually accept (E21 in experiments-b.mjs).
//
// How it finds leagues: start from this league's managers, list their other Sleeper leagues for
// each season, keep the ones like ours, and walk outward through those leagues' managers until
// --max leagues are kept. "Like ours": 10 or 12 teams, one QB slot and no superflex, full PPR,
// redraft or keeper (not dynasty).
//
// Sleeper's API is free, read-only and keyless for non-commercial use, and asks callers to stay
// under 1,000 calls a minute (https://docs.sleeper.com). This script waits between calls to stay
// near 300 a minute. The output is a local cache (data/bt/market-trades.json), not published.
//
// Usage: NODE_USE_ENV_PROXY=1 node backtest/fetch-market.mjs [--max 300] [--seasons 2025,2026]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIR } from './fetch.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SL = 'https://api.sleeper.app/v1';
const UA = { 'User-Agent': 'ff-roster-monitor-backtest/1.0' };
const GAP_MS = 200; // ~300 calls a minute, well under Sleeper's 1,000

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};

let last = 0;
async function get(p, tries = 3) {
  for (let i = 0; ; i++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(SL + p, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (res.status === 404) return null;
      if (res.status === 429) throw new Error('rate limited');
      if (!res.ok) throw new Error(`${res.status} ${p}`);
      return await res.json();
    } catch (err) {
      if (i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
}

// Is this league shaped like ours?
export function similar(lg) {
  if (!lg || !lg.settings || !lg.roster_positions) return false;
  const pos = lg.roster_positions;
  const qb = pos.filter((p) => p === 'QB').length;
  return [10, 12].includes(lg.total_rosters) && qb === 1 && !pos.includes('SUPER_FLEX') && Number(lg.scoring_settings?.rec) === 1 && (lg.settings.type ?? 0) !== 2;
}

// Only what calibration needs: who got which players and picks, when.
export function slimTrade(t, lid, season) {
  return {
    lid, season: Number(season), leg: t.leg, created: t.created,
    rids: t.roster_ids || [],
    adds: t.adds || {},
    picks: (t.draft_picks || []).map((d) => ({ s: Number(d.season), r: d.round, to: d.owner_id, from: d.previous_owner_id })),
  };
}

export async function fetchMarket({ max = 300, seasons = [2025, 2026], log = console.log } = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, 'market-trades.json');
  const out = { generated: new Date().toISOString(), seasons, leagues: [], trades: [] };
  const kept = new Set();
  const seenUsers = new Set();
  const users = [];
  const home = await get(`/league/${cfg.leagueId}`);
  for (const u of (await get(`/league/${cfg.leagueId}/users`)) || []) users.push(u.user_id);

  while (users.length && kept.size < max) {
    const uid = users.shift();
    if (seenUsers.has(uid)) continue;
    seenUsers.add(uid);
    for (const season of seasons) {
      const lgs = (await get(`/user/${uid}/leagues/nfl/${season}`)) || [];
      for (const lg of lgs) {
        if (kept.size >= max) break;
        // our own league is E13's test set: never fit on it
        if (kept.has(lg.league_id) || lg.league_id === cfg.leagueId || lg.league_id === home?.previous_league_id || !similar(lg)) continue;
        kept.add(lg.league_id);
        const last = Math.min(18, (lg.settings.playoff_week_start || 15) + 2);
        let n = 0;
        for (let wk = 1; wk <= last; wk++) {
          for (const t of (await get(`/league/${lg.league_id}/transactions/${wk}`)) || []) {
            if (t.type !== 'trade' || t.status !== 'complete') continue;
            out.trades.push(slimTrade(t, lg.league_id, season));
            n++;
          }
        }
        out.leagues.push({ lid: lg.league_id, season: Number(season), teams: lg.total_rosters, type: lg.settings.type ?? 0, trades: n });
        for (const u of (await get(`/league/${lg.league_id}/users`)) || []) if (!seenUsers.has(u.user_id)) users.push(u.user_id);
        log(`${kept.size}/${max} leagues · ${out.trades.length} trades`);
        fs.writeFileSync(file, JSON.stringify(out)); // save as we go: a stopped run keeps its trades
      }
    }
  }
  fs.writeFileSync(file, JSON.stringify(out));
  log(`wrote ${file}: ${out.leagues.length} leagues, ${out.trades.length} trades`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await fetchMarket({ max: Number(arg('max', 300)), seasons: String(arg('seasons', '2025,2026')).split(',').map(Number) });
}
