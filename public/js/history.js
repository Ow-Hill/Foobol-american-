// League history model: every season's games, lineups, player games, transactions and drafts,
// normalised by *person* (owner id) so managers can be followed across seasons.
import { avg, sum } from './util.js';

const FLEX = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], WRRB_FLEX: ['WR', 'RB'], REC_FLEX: ['WR', 'TE'] };

export function solveSlots(slotNames, pids, posOf, valOf) {
  const out = Array(slotNames.length).fill(null);
  const used = new Set();
  const order = slotNames.map((_, i) => i).sort((a, b) => (FLEX[slotNames[a]] ? FLEX[slotNames[a]].length : 0) - (FLEX[slotNames[b]] ? FLEX[slotNames[b]].length : 0));
  for (const i of order) {
    let best = null;
    for (const id of pids) {
      if (used.has(id)) continue;
      const pos = posOf(id);
      const ok = FLEX[slotNames[i]] ? FLEX[slotNames[i]].includes(pos) : slotNames[i] === pos;
      if (ok && (best == null || valOf(id) > valOf(best))) best = id;
    }
    if (best) (out[i] = best), used.add(best);
  }
  return { slots: out, total: sum(out.map((id) => (id ? valOf(id) : 0))) };
}

export function buildHist(H, snap) {
  const names = H.names || {};
  const nm = (pid) => names[pid]?.[0] || snap?.players?.[pid]?.n || (pid && pid.length <= 3 ? pid : 'Player ' + pid);
  const posOf = (pid) => names[pid]?.[1] || snap?.players?.[pid]?.pos || (pid && pid.length <= 3 ? 'DEF' : '?');
  const teamOf = (pid) => names[pid]?.[2] || snap?.players?.[pid]?.team || null;

  const people = {};
  for (const s of H.seasons) {
    for (const t of s.teams) {
      const p = (people[t.ownerId] ||= { id: t.ownerId, name: t.owner, aliases: new Set(), seasons: {} });
      p.name = t.owner;
      p.aliases.add(t.owner.toLowerCase());
      p.aliases.add(t.name.trim().toLowerCase());
      p.seasons[s.season] = { rid: t.rid, teamName: t.name.trim(), w: t.w, l: t.l, t: t.t, pf: t.pf, pa: t.pa, pp: t.pp };
    }
  }
  const seasons = {};
  for (const s of H.seasons) {
    const teamsBy = Object.fromEntries(s.teams.map((t) => [t.rid, t]));
    const slotNames = s.rosterPositions.filter((p) => p !== 'BN');
    seasons[s.season] = { ...s, teamsBy, slotNames, current: s.status !== 'complete' };
  }
  const seasonList = H.seasons.map((s) => seasons[s.season]);

  const ent = (season, rid) => {
    const t = seasons[season].teamsBy[rid];
    return t ? { rid, ownerId: t.ownerId, owner: people[t.ownerId]?.name || t.owner, teamName: t.name.trim() } : { rid, ownerId: null, owner: 'Team ' + rid, teamName: '' };
  };

  // ----- games -----
  const games = [];
  for (const s of seasonList) {
    for (const wk of Object.keys(s.matchups).map(Number)) {
      const by = {};
      for (const m of s.matchups[wk]) (by[m.mid] ||= []).push(m);
      for (const pair of Object.values(by)) {
        if (pair.length !== 2) continue;
        const [x, y] = pair;
        const a = { ...ent(s.season, x.rid), pts: x.pts };
        const b = { ...ent(s.season, y.rid), pts: y.pts };
        const round = wk - s.playoffStart + 1;
        const inBracket = round >= 1 && s.bracket.winners.some((br) => br.r === round && [br.t1, br.t2].includes(x.rid) && [br.t1, br.t2].includes(y.rid));
        games.push({
          season: s.season, wk, a, b,
          winner: a.pts > b.pts ? a : b.pts > a.pts ? b : null,
          loser: a.pts > b.pts ? b : b.pts > a.pts ? a : null,
          margin: Math.abs(a.pts - b.pts),
          period: wk >= s.playoffStart ? (inBracket ? 'playoff' : 'consolation') : 'regular',
        });
      }
    }
  }

  // ----- lineups (actual vs optimal) -----
  const lineCache = {};
  function lineup(season, wk, rid) {
    const key = season + '|' + wk + '|' + rid;
    if (lineCache[key]) return lineCache[key];
    const s = seasons[season];
    const m = (s.matchups[wk] || []).find((x) => x.rid === rid);
    if (!m) return null;
    const pp = m.pp || {};
    const pids = Object.keys(pp);
    const opt = solveSlots(s.slotNames, pids, posOf, (id) => pp[id] || 0);
    const starters = (m.starters || []).filter((x) => x && x !== '0');
    const startSet = new Set(starters);
    const bench = pids.filter((id) => !startSet.has(id));
    return (lineCache[key] = { season, wk, rid, ...ent(season, rid), pts: m.pts, opt: opt.total, optSlots: opt.slots, left: Math.max(0, opt.total - m.pts), starters, bench, pp });
  }

  // ----- player games -----
  const perf = [];
  for (const s of seasonList) {
    for (const wk of Object.keys(s.matchups).map(Number)) {
      for (const m of s.matchups[wk]) {
        const st = new Set(m.starters || []);
        for (const pid in m.pp || {}) perf.push({ season: s.season, wk, rid: m.rid, ...ent(s.season, m.rid), pid, n: nm(pid), pos: posOf(pid), pts: m.pp[pid], started: st.has(pid) });
      }
    }
  }

  // ----- transactions -----
  const txs = [];
  for (const s of seasonList) {
    for (const t of s.transactions) {
      txs.push({
        ...t, season: s.season,
        who: t.rids.map((r) => ent(s.season, r)),
        addList: Object.keys(t.adds || {}).map((pid) => ({ pid, n: nm(pid), pos: posOf(pid), rid: t.adds[pid], ...ent(s.season, t.adds[pid]) })),
        dropList: Object.keys(t.drops || {}).map((pid) => ({ pid, n: nm(pid), pos: posOf(pid), rid: t.drops[pid], ...ent(s.season, t.drops[pid]) })),
      });
    }
  }

  // ----- standings before a week -----
  function recordBefore(season, wk, ownerId) {
    let w = 0;
    let l = 0;
    for (const g of games) {
      if (g.season !== season || g.wk >= wk || g.period !== 'regular') continue;
      if (g.a.ownerId === ownerId) g.a.pts > g.b.pts ? w++ : g.a.pts < g.b.pts ? l++ : 0;
      if (g.b.ownerId === ownerId) g.b.pts > g.a.pts ? w++ : g.b.pts < g.a.pts ? l++ : 0;
    }
    return { w, l };
  }

  // ----- per-week facts (recaps, report, video, story) -----
  const factCache = {};
  function weekFacts(season, wk) {
    const key = season + '|' + wk;
    if (factCache[key]) return factCache[key];
    const wg = games.filter((g) => g.season === season && g.wk === wk);
    if (!wg.length) return null;
    const lines = Object.values(seasons[season].teamsBy).map((t) => lineup(season, wk, t.rid)).filter(Boolean);
    const scores = lines.map((l) => ({ ...l }));
    const top = scores.slice().sort((a, b) => b.pts - a.pts)[0];
    const low = scores.slice().sort((a, b) => a.pts - b.pts)[0];
    const blowout = wg.slice().sort((a, b) => b.margin - a.margin)[0];
    const closest = wg.filter((g) => g.winner).sort((a, b) => a.margin - b.margin)[0];
    const blunder = lines.slice().sort((a, b) => b.left - a.left)[0];
    const topPlayers = perf.filter((p) => p.season === season && p.wk === wk && p.started).sort((a, b) => b.pts - a.pts).slice(0, 5);
    const benchHero = perf.filter((p) => p.season === season && p.wk === wk && !p.started).sort((a, b) => b.pts - a.pts)[0];
    let upset = null;
    for (const g of wg) {
      if (!g.winner) continue;
      const rw = recordBefore(season, wk, g.winner.ownerId);
      const rl = recordBefore(season, wk, g.loser.ownerId);
      const gap = (rl.w - rl.l) - (rw.w - rw.l);
      if (wk > 1 && gap >= 3 && (!upset || gap > upset.gap)) upset = { game: g, gap, rw, rl };
    }
    const effKing = lines.slice().sort((a, b) => b.pts / (b.opt || 1) - a.pts / (a.opt || 1))[0];
    return (factCache[key] = { season, wk, games: wg, lines, top, low, blowout, closest, blunder, topPlayers, benchHero, upset, effKing, avgScore: avg(scores.map((x) => x.pts)) });
  }

  const lastWeek = (season) => Math.max(...Object.keys(seasons[season].matchups).map(Number));
  const champion = (season) => {
    const s = seasons[season];
    return s.champion ? ent(season, s.champion) : null;
  };
  const runnerUp = (season) => {
    const s = seasons[season];
    return s.runnerUp ? ent(season, s.runnerUp) : null;
  };

  function h2h(ownerA, ownerB) {
    const gs = games.filter((g) => (g.a.ownerId === ownerA && g.b.ownerId === ownerB) || (g.a.ownerId === ownerB && g.b.ownerId === ownerA));
    const res = { games: gs, aw: 0, bw: 0, ties: 0, aPts: 0, bPts: 0 };
    for (const g of gs) {
      const me = g.a.ownerId === ownerA ? g.a : g.b;
      const op = g.a.ownerId === ownerA ? g.b : g.a;
      res.aPts += me.pts;
      res.bPts += op.pts;
      if (me.pts > op.pts) res.aw++;
      else if (me.pts < op.pts) res.bw++;
      else res.ties++;
    }
    return res;
  }

  function managerSeason(ownerId, season) {
    const p = people[ownerId];
    return p?.seasons[season] || null;
  }

  return { H, names, nm, posOf, teamOf, people, seasons, seasonList, games, perf, txs, ent, lineup, weekFacts, recordBefore, lastWeek, champion, runnerUp, h2h, managerSeason };
}
