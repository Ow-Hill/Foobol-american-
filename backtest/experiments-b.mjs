// Experiments E7-E9 and E11-E15: the real league replay (lineups, win odds, trades), next man up,
// and everything the trade system leans on (rest-of-season value, buy/sell signals, returning
// players, keepers and picks).
import fs from 'node:fs';
import path from 'node:path';
import * as D from './data.mjs';
import { DIR } from './fetch.mjs';
import { asOf, eachWeek, ppg, ppg3, xpAvg, xpGame, ecrWeek } from './experiments-a.mjs';
import { buildModel } from '../public/js/model.js';
import { buildRipple } from '../public/js/ripple.js';

const { mean, sum, r1, r2, r3, pct, pearson, spearman, ols, predict, bootCI, TRAIN, SKILL } = D;
const split = (s) => (TRAIN.includes(s) ? 'train' : 'test');
const cdf = (z) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z >= 0 ? y : -y));
};

// ---------- the real league, week by week ----------
function leagueWeeks() {
  const out = [];
  for (const L of D.leagueChain()) {
    const S = D.loadSeason(L.season);
    const owners = Object.fromEntries(L.rosters.map((r) => [r.rid, L.users.find((u) => u.id === r.owner)?.name || 'Team ' + r.rid]));
    const pastScores = {};
    const pairs = {};
    const lastReg = L.settings.playoff_week_start - 1;
    for (const [wk, w] of Object.entries(L.weeks)) {
      pastScores[wk] = Object.fromEntries(w.mu.map((m) => [m.rid, m.pts || 0]));
      pairs[wk] = Object.fromEntries(w.mu.map((m) => [m.rid, m.mid]));
    }
    for (let wk = 2; wk <= Math.min(S.lastWeek, 17); wk++) {
      const w = L.weeks[wk];
      if (!w || !w.mu.length || !w.mu.some((m) => m.pts > 0)) continue;
      out.push({ L, S, wk, owners, pastScores, pairs, regular: wk <= lastReg, mu: w.mu });
    }
  }
  return out;
}
// withEcr: attach that week's final expert consensus, as the live site now does (E17)
function modelFor(lw, withEcr = false, rid = null) {
  const teams = lw.mu.map((m) => ({ id: m.rid, owner: lw.owners[m.rid], players: m.players || [], starters: m.starters || [], reserve: [] }));
  const players = structuredClone(asOf(lw.L.season, lw.wk));
  attachRosBt(players, lw.L.season, lw.wk);
  if (withEcr) {
    const e = ecrWeek(lw.L.season, lw.wk, 'final');
    for (const [pid, x] of e?.players || []) if (players[pid] && players[pid].pos === x.pos) players[pid].ecr = { ecr: x.ecr, sd: x.sd, pos: x.pos };
  }
  const { snap, now } = D.synthSnap(lw.L.season, lw.wk, { teams, lg: lw.L, pastScores: lw.pastScores, pairs: lw.pairs, playersOverride: players });
  return buildModel(snap, rid ?? teams[0].id, now);
}

// ================= E8 + E7 =================
const replayCache = {};
function replay(withEcr = false) {
  if (replayCache[withEcr]) return replayCache[withEcr];
  const rows = [];
  const games = [];
  const cfg = JSON.parse(fs.readFileSync(path.join(DIR, '..', '..', 'config.json'), 'utf8'));
  for (const lw of leagueWeeks()) {
    const M = modelFor(lw, withEcr);
    const act = D.actual(lw.L.season, lw.wk);
    const pts = (id) => (act.get(id)?.played ? act.get(id).pts : 0);
    const P = M.snap.players;
    const byRid = {};
    for (const m of lw.mu) {
      const t = M.teamBy[m.rid];
      const l = M.lineup(t);
      const engineIds = l.opt.slots.map((s) => s.pid).filter(Boolean);
      const mgrIds = (m.starters || []).filter((x) => x && x !== '0');
      const best = M.solve(m.players || [], { v: pts, can: (id) => !M.P(id).missing });
      const mine = sum(mgrIds.map(pts));
      const row = {
        season: lw.L.season, wk: lw.wk, rid: m.rid, owner: lw.owners[m.rid], me: lw.owners[m.rid]?.toLowerCase() === cfg.username.toLowerCase(),
        manager: mine, sleeperPts: m.pts, engine: sum(engineIds.map(pts)), optimal: best.total,
        projMgr: sum(mgrIds.map((id) => P[id]?.proj?.pts || 0)), projEngine: l.opt.total,
        qStarts: mgrIds.filter((id) => P[id]?.inj === 'Questionable').length,
        deadStarts: mgrIds.filter((id) => !act.get(id)?.played).length,
        engineDead: engineIds.filter((id) => !act.get(id)?.played).length,
      };
      rows.push(row);
      byRid[m.rid] = row;
    }
    if (!lw.regular || lw.wk < 4) continue;
    // every pair of teams that week is a fair test of a win probability (the real matchups are flagged)
    const mid = Object.fromEntries(lw.mu.map((m) => [m.rid, m.mid]));
    const rids = lw.mu.map((m) => m.rid);
    for (let i = 0; i < rids.length; i++) {
      for (let j = i + 1; j < rids.length; j++) {
        const [a, b] = (i + j + lw.wk) % 2 ? [rids[i], rids[j]] : [rids[j], rids[i]];
        if (byRid[a].sleeperPts === byRid[b].sleeperPts) continue;
        games.push({ season: lw.L.season, wk: lw.wk, real: mid[a] != null && mid[a] === mid[b], pSite: M.winProb(a, b), dProj: byRid[a].projMgr - byRid[b].projMgr, dAct: byRid[a].sleeperPts - byRid[b].sleeperPts, win: byRid[a].sleeperPts > byRid[b].sleeperPts ? 1 : 0, sdSite: Math.sqrt(M.profiles()[a].sd ** 2 + M.profiles()[b].sd ** 2) });
      }
    }
  }
  return (replayCache[withEcr] = { rows, games });
}

export function e8() {
  const { rows } = replay();
  const scorerGap = mean(rows.map((r) => Math.abs(r.manager - r.sleeperPts)));
  const tab = (set, label) => {
    const byWeek = {};
    for (const r of set) (byWeek[r.season + ':' + r.wk] ||= []).push(r);
    const d = (x) => mean(x.map((r) => r.engine - r.manager));
    const ci = bootCI(byWeek, d, 300);
    return [label, set.length, r1(mean(set.map((r) => r.manager))), r1(mean(set.map((r) => r.engine))), r1(mean(set.map((r) => r.optimal))), r2(d(set)), `${r2(ci[0])} to ${r2(ci[1])}`, pct(mean(set.map((r) => (r.engine > r.manager + 0.01 ? 1 : 0)))), pct(mean(set.map((r) => (r.engine < r.manager - 0.01 ? 1 : 0)))), pct(mean(set.map((r) => r.manager / r.optimal))), pct(mean(set.map((r) => r.engine / r.optimal)))];
  };
  const head = ['Team-weeks', 'n', 'Lineup actually set', 'Site lineup', 'Perfect lineup', 'Site minus actual', '90% range', 'Site better %', 'Site worse %', 'Actual as % of perfect', 'Site as % of perfect'];
  const me = rows.filter((r) => r.me);
  const t = [tab(rows, 'All teams, 2025-2026'), tab(rows.filter((r) => r.season === 2025), 'All teams, 2025'), tab(rows.filter((r) => r.season === 2026), 'All teams, 2026'), tab(me, 'Your team'), tab(me.filter((r) => r.season === 2026), 'Your team, 2026')];
  const owners = {};
  for (const r of rows.filter((x) => x.season === 2026)) (owners[r.owner] ||= []).push(r);
  const perOwner = Object.entries(owners).map(([o, x]) => [o, x.length, r1(mean(x.map((r) => r.manager))), r1(mean(x.map((r) => r.engine))), r2(mean(x.map((r) => r.engine - r.manager))), pct(mean(x.map((r) => r.manager / r.optimal))), r2(mean(x.map((r) => r.deadStarts)))]).sort((a, b) => b[4] - a[4]);
  const dead = { mgr: mean(rows.map((r) => r.deadStarts)), engine: mean(rows.map((r) => r.engineDead)) };
  // the same replay with the expert consensus blended in at QB, WR and K
  const ecrRows = replay(true).rows;
  const key = (r) => `${r.season}:${r.wk}:${r.rid}`;
  const ecrBy = Object.fromEntries(ecrRows.map((r) => [key(r), r]));
  const paired = rows.filter((r) => ecrBy[key(r)]).map((r) => ({ season: r.season, wk: r.wk, d: ecrBy[key(r)].engine - r.engine }));
  const byWk = {};
  for (const r of paired) (byWk[r.season + ':' + r.wk] ||= []).push(r);
  const ecrDiff = mean(paired.map((r) => r.d));
  const ecrCi = bootCI(byWk, (x) => mean(x.map((r) => r.d)), 300);
  const changed = paired.filter((r) => Math.abs(r.d) > 0.01);
  t.push(tab(ecrRows, 'All teams, site lineup with expert consensus blended in'));
  const fit = { ecr: { diff: r2(ecrDiff), range: `${r2(ecrCi[0])} to ${r2(ecrCi[1])}`, changed: changed.length, n: paired.length, betterWhenChanged: r3(mean(changed.map((r) => (r.d > 0 ? 1 : 0)))) }, diff: t[0][5], range: t[0][6], mine: t[3][5], mineRange: t[3][6], mgrPctOfPerfect: t[0][9], sitePctOfPerfect: t[0][10], scorerGap: r2(scorerGap), deadStartsMgr: r3(dead.mgr), deadStartsSite: r3(dead.engine), n: rows.length };
  return {
    id: 'E8', title: 'Would the site\'s lineup have beaten the one actually set?',
    tables: [
      { caption: 'Every team-week in this league, Weeks 2-17 of 2025 and 2026 to date. "Site lineup" is the best legal lineup by the site\'s own rules, from that week\'s roster, built before kickoff.', head, rows: t },
      { caption: '2026 by manager: points per week left on the table against the site lineup.', head: ['Manager', 'weeks', 'Actual', 'Site lineup', 'Site minus actual', 'Actual as % of perfect', 'Starters who did not play, per week'], rows: perOwner },
    ],
    findings: [
      `Across ${rows.length} team-weeks the site's lineup scored ${t[0][5]} points a week ${t[0][5] >= 0 ? 'more' : 'less'} than the lineup the manager set (90% range ${t[0][6]}). For your team: ${t[3][5]} (${t[3][6]}).`,
      `Managers reached ${t[0][9]}% of the perfect lineup, the site ${t[0][10]}%.`,
      `Blending in the expert consensus (QB, WR, K) changed the site's lineup in ${changed.length} of ${paired.length} team-weeks and moved its score by ${r2(ecrDiff)} points a week on average (90% range ${r2(ecrCi[0])} to ${r2(ecrCi[1])}); where it changed something, it scored more ${pct(mean(changed.map((r) => (r.d > 0 ? 1 : 0))))}% of the time.`,
      `Managers started ${r2(dead.mgr)} players a week who did not play; the site lineup ${r2(dead.engine)}. Caveat: Sleeper's stored projections are the final pre-kickoff ones, so the site lineup here knows about Sunday-morning inactives. It is what the site would say if checked 90 minutes before each game, not on Tuesday.`,
      `Check on the scorer: my re-scored lineup totals differ from Sleeper's official ones by ${r2(scorerGap)} points a week on average.`,
    ],
    fit,
  };
}

export function e7() {
  const { games } = replay();
  const brier = (set, p) => mean(set.map((g) => (p(g) - g.win) ** 2));
  const acc = (set, p) => mean(set.map((g) => ((p(g) > 0.5 ? 1 : 0) === g.win ? 1 : 0)));
  const y25 = games.filter((g) => g.season === 2025);
  const y26 = games.filter((g) => g.season === 2026);
  const shrink = (p, k) => 0.5 + k * (p - 0.5);
  const bestOf = (set, make, grid) => grid.map((v) => ({ v, b: brier(set, make(v)) })).sort((x, y) => x.b - y.b)[0].v;
  const sdGrid = Array.from({ length: 23 }, (_, i) => 15 + i * 2.5);
  const kGrid = Array.from({ length: 11 }, (_, i) => i / 10);
  const projAt = (sdv) => (g) => cdf(g.dProj / sdv);
  const siteAt = (k) => (g) => shrink(g.pSite, k);
  // fit on one season, score on the other, both ways
  const cv = (make, grid) => {
    const a = bestOf(y25, make, grid);
    const b = bestOf(y26, make, grid);
    return { fit25: a, fit26: b, b26: brier(y26, make(a)), b25: brier(y25, make(b)), pooled: bestOf(games, make, grid) };
  };
  const cvProj = cv(projAt, sdGrid);
  const cvSite = cv(siteAt, kGrid);
  const sdUse = Math.round(cvProj.pooled);
  const methods = [
    ['Coin flip', () => 0.5, () => 0.5],
    ['Site today: season scoring averages', (g) => g.pSite, (g) => g.pSite],
    ['Site today, pulled toward 50% (strength fitted on the other season)', siteAt(cvSite.fit26), siteAt(cvSite.fit25)],
    ['Projected lineups (spread fitted on the other season)', projAt(cvProj.fit26), projAt(cvProj.fit25)],
    [`Projected lineups, spread ${sdUse} points (fitted on both)`, projAt(sdUse), projAt(sdUse)],
  ];
  const rows = methods.map(([n, p25, p26]) => [n, r3(brier(y25, p25)), pct(acc(y25, p25)), y25.length, r3(brier(y26, p26)), pct(acc(y26, p26)), y26.length, r3((brier(y25, p25) * y25.length + brier(y26, p26) * y26.length) / games.length)]);
  const bins = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];
  const rel = (p) => bins.map(([lo, hi]) => {
    const x = games.map((g) => { const v = p(g); return v >= 0.5 ? { v, win: g.win } : { v: 1 - v, win: 1 - g.win }; }).filter((g) => g.v >= lo && g.v < hi);
    return [`${Math.round(lo * 100)}-${Math.round(Math.min(hi, 1) * 100)}%`, x.length, pct(mean(x.map((g) => g.v))), pct(mean(x.map((g) => g.win)))];
  });
  const realG = games.filter((g) => g.real);
  const fit = { sd: sdUse, sdFit: cvProj, siteShrink: cvSite, realGames: realG.length, realBrierSite: r3(brier(realG, (g) => g.pSite)), realBrierProj: r3(brier(realG, projAt(sdUse))), realBrierShrunk: r3(brier(realG, siteAt(cvSite.pooled))), pooledBrier: Object.fromEntries(rows.map((r) => [r[0], r[7]])), n: games.length, avgSiteSd: r1(mean(games.map((g) => g.sdSite))), sdProjError: r1(D.sd(games.map((g) => g.dAct - g.dProj))) };
  const site = rows[1];
  return {
    id: 'E7', title: 'Is the win probability any good?',
    tables: [
      { caption: 'Brier score: 0.25 is a coin flip, lower is better. Every pair of teams in each regular-season week from Week 4 (the real matchups are too few to test on their own). Anything fitted is fitted on the other season.', head: ['Method', 'Brier 2025', 'Picked winner % 2025', 'games', 'Brier 2026', 'Picked winner % 2026', 'games', 'Brier, both'], rows },
      { caption: 'Site today: when it said X%, how often did that side win? (both seasons)', head: ['Stated chance', 'games', 'Average stated', 'Actually won'], rows: rel((g) => g.pSite) },
      { caption: `Projected lineups with a ${sdUse}-point spread, same check.`, head: ['Stated chance', 'games', 'Average stated', 'Actually won'], rows: rel(projAt(sdUse)) },
    ],
    findings: [
      `The site's current win probability scores ${site[7]} over both seasons against 0.25 for a coin flip, barely better than guessing. It is overconfident: when it gave a side 70-80%, that side won ${rel((g) => g.pSite)[2][3]}% of the time.`,
      `Best spread for the projected-lineup method: ${cvProj.fit25} points fitted on 2025, ${cvProj.fit26} on 2026, ${sdUse} on both. The season-average method is best pulled ${Math.round((1 - cvSite.pooled) * 100)}% of the way to 50/50.`,
      `Measured directly, the gap between two teams' actual and projected scores has a spread of ${fit.sdProjError} points. On the ${realG.length} real matchups alone: site today ${fit.realBrierSite}, projected lineups ${fit.realBrierProj}.`,
    ],
    fit,
  };
}

// ================= E9 =================
function depthCharts(season) {
  const f = path.join(DIR, `depth_charts_${season}.csv`);
  if (!fs.existsSync(f)) return null;
  const db = D.playersDb();
  const byGsis = {};
  const byName = {};
  for (const p of Object.values(db)) {
    if (p.gsis) byGsis[p.gsis] = p.id;
    if (p.pos === 'RB') (byName[D.nameKey(p.n)] ||= []).push(p.id);
  }
  const out = {};
  for (const r of D.parseCsv(fs.readFileSync(f, 'utf8'))) {
    if (r.game_type !== 'REG' || r.formation !== 'Offense' || r.position !== 'RB') continue;
    const pid = byGsis[r.gsis_id] || (byName[D.nameKey(r.full_name)]?.length === 1 ? byName[D.nameKey(r.full_name)][0] : null);
    if (!pid) continue;
    ((out[Number(r.week)] ||= {})[D.fixTeam(r.club_code)] ||= []).push({ pid, d: Number(r.depth_team) });
  }
  return out;
}
export function e9() {
  const ev = [];
  for (const s of [2022, 2023, 2024]) {
    const charts = depthCharts(s);
    if (!charts) continue;
    eachWeek([s], 4, (season, w, S) => {
      const P = asOf(s, w);
      const act = D.actual(s, w);
      const kick = Math.min(...Object.values(S.games[w] || {}).map((x) => new Date(x.kick).getTime()).filter(Number.isFinite));
      const r = buildRipple(P, { W: w, now: kick, isBye: S.isBye });
      const repl = D.relevant(P, 'RB', (p) => p.proj?.pts || 0).slice(30, 40).map((p) => (act.get(p.id)?.played ? act.get(p.id).pts : 0));
      for (const e of r.events.filter((x) => x.kind === 'out' && P[x.src]?.pos === 'RB')) {
        const src = P[e.src];
        const u = src.hist.slice(-3);
        if (mean(u.map((h) => h.att + h.tgt)) < 12) continue;
        const mates = Object.values(P).filter((q) => q.team === src.team && q.pos === 'RB' && q.id !== src.id && !['Out', 'Doubtful', 'IR'].includes(q.inj || ''));
        if (mates.length < 2) continue;
        const chart = (charts[w]?.[src.team] || []).filter((c) => mates.some((m) => m.id === c.pid)).sort((a, b) => a.d - b.d)[0]?.pid;
        const usagePick = mates.slice().sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99))[0].id;
        const work = (id) => { const a = act.get(id); return a?.played ? a.att + a.tgt : -1; };
        const lead = mates.slice().sort((a, b) => work(b.id) - work(a.id))[0];
        if (work(lead.id) < 0 || !chart) continue;
        const pts = (id) => (act.get(id)?.played ? act.get(id).pts : 0);
        ev.push({ chartHit: chart === lead.id ? 1 : 0, usageHit: usagePick === lead.id ? 1 : 0, agree: chart === usagePick ? 1 : 0, chartPts: pts(chart), usagePts: pts(usagePick), leadPts: pts(lead.id), repl: mean(repl), disagreeChart: chart !== usagePick ? (chart === lead.id ? 1 : 0) : null, disagreeUsage: chart !== usagePick ? (usagePick === lead.id ? 1 : 0) : null });
      }
    });
  }
  const dis = ev.filter((e) => e.disagreeChart != null);
  const fit = { n: ev.length, chartHit: r3(mean(ev.map((e) => e.chartHit))), usageHit: r3(mean(ev.map((e) => e.usageHit))), agree: r3(mean(ev.map((e) => e.agree))), chartPts: r1(mean(ev.map((e) => e.chartPts))), usagePts: r1(mean(ev.map((e) => e.usagePts))), repl: r1(mean(ev.map((e) => e.repl))), nDisagree: dis.length, disagreeChart: r3(mean(dis.map((e) => e.disagreeChart))), disagreeUsage: r3(mean(dis.map((e) => e.disagreeUsage))) };
  return {
    id: 'E9', title: 'Is "next man up" the right pickup when a lead back is out?',
    tables: [{ caption: 'Lead running backs (12+ carries and targets a game) ruled out, 2022-2024, teams with at least two other backs.', head: ['Pick', 'Cases', 'Led the backfield that week %', 'Points scored', 'A replacement-level RB scored'], rows: [['Next on the official depth chart', ev.length, pct(fit.chartHit), fit.chartPts, fit.repl], ['Most recent work (carries + targets, last 3 games)', ev.length, pct(fit.usageHit), fit.usagePts, fit.repl], ['When the two disagree: depth chart', dis.length, pct(fit.disagreeChart), '', ''], ['When the two disagree: recent work', dis.length, pct(fit.disagreeUsage), '', '']] }],
    findings: [
      `In ${ev.length} cases the depth-chart backup led the backfield ${pct(fit.chartHit)}% of the time and scored ${fit.chartPts} points; the back with the most recent work led ${pct(fit.usageHit)}% and scored ${fit.usagePts}. A replacement-level back scored ${fit.repl}.`,
      `They named the same player ${pct(fit.agree)}% of the time. When they disagreed (${dis.length} cases), the depth chart was right ${pct(fit.disagreeChart)}% and recent work ${pct(fit.disagreeUsage)}%.`,
    ],
    fit,
  };
}

// ================= E11 =================
// A plain 10-team league drafted by projection, so the real value code has rosters to work with.
function genericModel(season, W) {
  const P = structuredClone(asOf(season, W));
  if (USE_ROS) attachRosBt(P, season, W);
  const ids = Object.values(P).filter((p) => p.proj && p.pos !== 'K' && p.pos !== 'DEF').sort((a, b) => (ppg(b) ?? b.proj.pts) - (ppg(a) ?? a.proj.pts)).slice(0, 150).map((p) => p.id);
  const ks = (pos) => Object.values(P).filter((p) => p.proj && p.pos === pos).sort((a, b) => b.proj.pts - a.proj.pts).slice(0, 10).map((p) => p.id);
  const K = ks('K');
  const DEF = ks('DEF');
  const teams = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, owner: 'T' + (i + 1), players: [...ids.filter((_, k) => (Math.floor(k / 10) % 2 === 0 ? k % 10 : 9 - (k % 10)) === i), K[i], DEF[i]].filter(Boolean), starters: [], reserve: [] }));
  const { snap, now } = D.synthSnap(season, W, { teams, playersOverride: P });
  return buildModel(snap, 1, now);
}
function rosOutcome(season, W, pid, team) {
  const S = D.loadSeason(season);
  const games = [];
  let teamGames = 0;
  let po = 0;
  for (let wk = W; wk <= Math.min(17, S.lastWeek); wk++) {
    if (!S.isBye(team, wk)) teamGames++;
    const r = S.weeks[wk]?.get(pid);
    if (r?.played) {
      games.push(r.pts);
      if (wk >= 15) po += r.pts;
    }
  }
  return { ppg: games.length >= 3 ? mean(games) : null, total: sum(games), played: games.length, teamGames, po };
}
let e11Cache = null;
function valueRows() {
  if (e11Cache) return e11Cache;
  const rows = [];
  for (const s of [2022, 2023, 2024, 2025]) {
    for (let W = 4; W <= 11; W++) {
      const M = genericModel(s, W);
      const V = M.V;
      const P = M.snap.players;
      for (const pos of SKILL) {
        const pool = V.rows.filter((r) => r.pos === pos && P[r.pid]?.hist.length >= 3).slice(0, Math.round(D.POOL[pos] * 1.25));
        for (const v of pool) {
          const p = P[v.pid];
          const o = rosOutcome(s, W, p.id, p.team);
          rows.push({ season: s, wk: W, split: split(s), pos, id: p.id, n: p.n, site: v.ppg, siteRos: v.ros, siteGames: v.games, avail: v.avail, value: v.value, proj: p.proj?.pts ?? 0, ppg: ppg(p), ppg3: ppg3(p), xp: xpAvg(p), xp4: xpAvg(p, 4), inj: p.inj || null, proxy: !!p.injProxy, missed: (() => { const S = D.loadSeason(s); let k = 0; for (let wk = W - 1; wk >= 1; wk--) { if (S.isBye(p.team, wk)) continue; if (p.hist.some((h) => h.w === wk)) break; k++; } return k; })(), o });
        }
      }
    }
  }
  return (e11Cache = rows);
}
export function e11() {
  const rows = valueRows();
  const withPpg = rows.filter((r) => r.o.ppg != null && !r.inj);
  const fit = { beta: {} };
  const out = [];
  for (const pos of SKILL) {
    const tr = withPpg.filter((r) => r.pos === pos && r.split === 'train');
    const te = withPpg.filter((r) => r.pos === pos && r.split === 'test');
    const feats = (r) => [r.proj, r.ppg, r.ppg3, r.xp];
    const beta = ols(tr.map(feats), tr.map((r) => r.o.ppg), 1e-4);
    const beta2 = ols(tr.map((r) => [r.ppg, r.xp]), tr.map((r) => r.o.ppg), 1e-4);
    fit.beta[pos] = { all: beta.map(r3), ppgXp: beta2.map(r3) };
    const methods = [['Site value today (values.js)', (r) => r.site], ['Season average', (r) => r.ppg], ['Last 3 games', (r) => r.ppg3], ['This week\'s projection', (r) => r.proj], ['Volume-based expected points', (r) => r.xp], ['Half site value, half volume-based', (r) => 0.5 * r.site + 0.5 * r.xp], ['Season average + volume (fitted)', (r) => predict(beta2, [r.ppg, r.xp])], ['Fitted blend of all', (r) => predict(beta, feats(r))]];
    const wk = (set, f) => {
      const g = {};
      for (const r of set) (g[r.season + ':' + r.wk] ||= []).push(r);
      return mean(Object.values(g).filter((x) => x.length >= 6).map((x) => spearman(x.map(f), x.map((r) => r.o.ppg))));
    };
    fit[pos] = {};
    for (const [name, f] of methods) {
      const m = { mae: mean(te.map((r) => Math.abs(r.o.ppg - f(r)))), rho: wk(te, f), bias: mean(te.map((r) => r.o.ppg - f(r))) };
      out.push([pos, name, r2(m.mae), r2(m.bias), r3(m.rho), te.length]);
      fit[pos][name] = { mae: r2(m.mae), rho: r3(m.rho), bias: r2(m.bias) };
    }
  }
  // health factor: share of remaining team games actually played, by status at the time
  const state = (r) => (r.inj === 'Questionable' ? 'Questionable' : r.inj === 'Doubtful' ? 'Doubtful' : r.inj === 'Out' ? (r.missed >= 2 ? 'Out, already missed 2+' : 'Out (official), first or second week') : r.proxy ? (r.missed >= 4 ? 'Off the report, missed 4+ (long-term IR)' : r.missed >= 2 ? 'Off the report, missed 2-3' : 'Off the report, just went down') : 'Healthy');
  const SITE = { Healthy: 1, Questionable: 0.97, Doubtful: 0.92, 'Out (official), first or second week': 0.85, 'Out, already missed 2+': 0.85, 'Off the report, just went down': 0.5, 'Off the report, missed 2-3': 0.5, 'Off the report, missed 4+ (long-term IR)': 0.5 };
  const g = {};
  for (const r of rows.filter((x) => x.ppg >= 7 && x.o.teamGames >= 4)) (g[state(r)] ||= []).push(r);
  const health = Object.entries(g).sort((a, b) => Object.keys(SITE).indexOf(a[0]) - Object.keys(SITE).indexOf(b[0])).map(([k, x]) => {
    const share = sum(x.map((r) => r.o.played)) / sum(x.map((r) => r.o.teamGames));
    const back = x.filter((r) => r.o.played >= 2);
    const prod = sum(back.map((r) => r.o.total / r.o.played)) / sum(back.map((r) => r.ppg));
    const tr = x.filter((r) => r.split === 'train');
    const te = x.filter((r) => r.split === 'test');
    const sh = (s) => (s.length ? sum(s.map((r) => r.o.played)) / sum(s.map((r) => r.o.teamGames)) : NaN);
    return { k, n: x.length, share, shareTrain: sh(tr), shareTest: sh(te), prod, site: SITE[k] };
  });
  fit.health = Object.fromEntries(health.map((h) => [h.k, { share: r3(h.share), prod: r3(h.prod), n: h.n, site: h.site }]));
  const best = (pos) => Object.entries(fit[pos]).sort((a, b) => a[1].mae - b[1].mae)[0];
  return {
    id: 'E11', title: 'Do trade values predict the rest of the season?',
    tables: [
      { caption: 'Predicting a player\'s points per game from that week to Week 17, taken at Weeks 4-11. Hold-out season 2025; healthy players who went on to play 3+ games.', head: ['Position', 'Method', 'Avg miss (pts/game)', 'Bias', 'Rank corr.', 'n'], rows: out },
      { caption: 'Health: share of the remaining games (to Week 17) actually played, by status when the value was taken. Players averaging 7+ points.', head: ['Status at the time', 'n', 'Games played %', '2022-24', '2025', 'Points per game when back vs before', 'Site assumes'], rows: health.map((h) => [h.k, h.n, pct(h.share), pct(h.shareTrain), pct(h.shareTest), r2(h.prod), h.site]) },
    ],
    findings: [
      ...SKILL.map((pos) => `${pos}: the site's value misses rest-of-season points per game by ${fit[pos]['Site value today (values.js)'].mae}; best method is "${best(pos)[0]}" at ${best(pos)[1].mae}.`),
      `Health factors are far from what the site assumes: ${health.filter((h) => h.k !== 'Healthy').map((h) => `${h.k}: played ${pct(h.share)}% of remaining games (site assumes ${Math.round(h.site * 100)}%)`).join('; ')}.`,
    ],
    fit,
  };
}

// ================= E12 =================
export function e12() {
  const rows = [];
  eachWeek(D.SEASONS, 5, (s, w, S) => {
    const P = asOf(s, w);
    for (const p of Object.values(P)) {
      if (!SKILL.includes(p.pos) || p.inj) continue;
      const last = p.hist.filter((h) => h.w >= w - 5).slice(-4);
      if (last.length < 4) continue;
      const T = mean(last.map((h) => h.pts));
      if (T < 6) continue;
      const X = mean(last.map((h) => xpGame(p.pos, h)));
      const next = [];
      for (let wk = w; wk <= Math.min(w + 3, S.lastWeek); wk++) {
        const r = S.weeks[wk]?.get(p.id);
        if (r?.played) next.push(r.pts);
      }
      if (next.length < 2) continue;
      const snp = last.map((h) => h.snp).filter((x) => x != null);
      const tdPts = mean(last.map((h) => (h.td || 0) * 6));
      rows.push({ season: s, wk: w, split: split(s), pos: p.pos, T, X, N: mean(next), season_avg: ppg(p), snpTrend: snp.length >= 4 ? (snp[2] + snp[3]) / 2 - (snp[0] + snp[1]) / 2 : 0, tdShare: T ? tdPts / T : 0 });
    }
  }, 14);
  const fit = {};
  const out = [];
  const groups = [];
  for (const pos of SKILL) {
    const tr = rows.filter((r) => r.pos === pos && r.split === 'train');
    const te = rows.filter((r) => r.pos === pos && r.split === 'test');
    const bT = ols(tr.map((r) => [r.T]), tr.map((r) => r.N));
    const bTX = ols(tr.map((r) => [r.T, r.X]), tr.map((r) => r.N));
    const bAll = ols(tr.map((r) => [r.T, r.X, r.season_avg, r.snpTrend]), tr.map((r) => r.N), 1e-4);
    const m = (f) => mean(te.map((r) => Math.abs(r.N - f(r))));
    fit[pos] = { T: bT.map(r3), TX: bTX.map(r3), all: bAll.map(r3), maeNaive: r2(m((r) => r.T)), maeT: r2(m((r) => predict(bT, [r.T]))), maeTX: r2(m((r) => predict(bTX, [r.T, r.X]))), maeAll: r2(m((r) => predict(bAll, [r.T, r.X, r.season_avg, r.snpTrend]))), n: te.length };
    out.push([pos, bTX[1] != null ? r2(bTX[1]) : '', r2(bTX[2]), fit[pos].maeNaive, fit[pos].maeT, fit[pos].maeTX, fit[pos].maeAll, te.length]);
    const all = rows.filter((r) => r.pos === pos);
    for (const [name, f] of [['Scoring 4+ a game above usage', (r) => r.T - r.X >= 4], ['Within 4 of usage', (r) => Math.abs(r.T - r.X) < 4], ['Scoring 4+ a game below usage', (r) => r.T - r.X <= -4]]) {
      const x = all.filter(f);
      const te2 = x.filter((r) => r.split === 'test');
      if (x.length < 15) continue;
      groups.push([pos, name, x.length, r1(mean(x.map((r) => r.T))), r1(mean(x.map((r) => r.X))), r1(mean(x.map((r) => r.N))), r2(mean(x.map((r) => r.N - r.T))), r2(mean(x.map((r) => r.N - predict(bT, [r.T])))), te2.length ? r2(mean(te2.map((r) => r.N - predict(bT, [r.T])))) : '', te2.length]);
    }
    fit[pos].groups = Object.fromEntries(groups.filter((x) => x[0] === pos).map((x) => [x[1], { n: x[2], change: x[6], beyondUsual: x[7], beyondUsualTest: x[8] }]));
  }
  return {
    id: 'E12', title: 'Do buy-low / sell-high signals work?',
    tables: [
      { caption: 'Next four weeks\' points per game predicted from the last four games\' points (T) and what the usage in those games would normally produce (X). Weights fitted 2022-24; misses on 2025-26.', head: ['Position', 'Weight on recent points', 'Weight on usage', 'Miss: assume he keeps scoring the same', 'Miss: recent points, regressed', 'Miss: points + usage', 'Miss: + season average and snap trend', 'n'], rows: out },
      { caption: 'What happened next to players scoring well above or below their usage. "Beyond the usual pull-back" removes the ordinary drift back to average that any hot or cold player shows.', head: ['Position', 'Group', 'n', 'Last 4: points', 'Last 4: usage says', 'Next 4: points', 'Change', 'Beyond the usual pull-back', 'Same, 2025-26', 'n'], rows: groups },
    ],
    findings: SKILL.map((pos) => {
      const g = fit[pos].groups;
      const hi = g['Scoring 4+ a game above usage'];
      const lo = g['Scoring 4+ a game below usage'];
      return `${pos}: usage carries weight ${r2(fit[pos].TX[2])} next to ${r2(fit[pos].TX[1])} for recent points. ${hi ? `Players running 4+ above their usage dropped ${-hi.change} a game over the next month (${-hi.beyondUsual} more than an ordinary hot streak).` : ''} ${lo ? `Players 4+ below gained ${lo.change} (${lo.beyondUsual} beyond the usual).` : ''}`;
    }),
    fit,
  };
}

// ================= E13 =================
export function e13() {
  const trades = [];
  for (const L of D.leagueChain()) {
    const S = D.loadSeason(L.season);
    const owners = Object.fromEntries(L.rosters.map((r) => [r.rid, L.users.find((u) => u.id === r.owner)?.name || 'Team ' + r.rid]));
    for (const [wkS, w] of Object.entries(L.weeks)) {
      const leg = Number(wkS);
      for (const t of w.tx.filter((x) => x.type === 'trade' && x.adds && (x.rids || []).length === 2)) {
        const W = Math.max(4, Math.min(leg, S.lastWeek));
        if (W > 15 || !L.weeks[W]) continue;
        const lw = { L, S, wk: W, owners, pastScores: Object.fromEntries(Object.entries(L.weeks).map(([k, x]) => [k, Object.fromEntries(x.mu.map((m) => [m.rid, m.pts || 0]))])), pairs: Object.fromEntries(Object.entries(L.weeks).map(([k, x]) => [k, Object.fromEntries(x.mu.map((m) => [m.rid, m.mid]))])), mu: L.weeks[W].mu };
        if (!lw.mu.length) continue;
        let M;
        try {
          M = modelFor(lw);
        } catch {
          continue;
        }
        const V = M.V;
        const [a, b] = t.rids;
        const recv = (rid) => Object.entries(t.adds).filter(([, r]) => r === rid).map(([pid]) => pid);
        const ra = recv(a);
        const rb = recv(b);
        if (!ra.length || !rb.length) continue;
        const actual = (ids) => sum(ids.map((id) => {
          let tot = 0;
          const pos = M.P(id).pos;
          for (let wk = leg; wk <= Math.min(17, S.lastWeek); wk++) {
            const r = S.weeks[wk]?.get(id);
            if (r?.played) tot += Math.max(0, r.pts - (V.rep[pos] || 0));
          }
          return tot;
        }));
        const va = V.tsum(ra);
        const vb = V.tsum(rb);
        const xa = actual(ra);
        const xb = actual(rb);
        trades.push({ season: L.season, leg, a: owners[a], b: owners[b], na: ra.length, nb: rb.length, va, vb, xa, xb, picks: (t.picks || []).length, bal: Math.min(va, vb) / Math.max(va, vb, 0.01), names: [ra.map((id) => M.P(id).n).join(' + '), rb.map((id) => M.P(id).n).join(' + ')] });
      }
    }
  }
  // trades before Week 4 are valued with Week 4 knowledge, so they are left out of the verdict check
  const decided = trades.filter((t) => t.leg >= 4 && Math.abs(t.xa - t.xb) >= 10 && Math.abs(t.va - t.vb) >= 1);
  const agree = mean(decided.map((t) => (Math.sign(t.va - t.vb) === Math.sign(t.xa - t.xb) ? 1 : 0)));
  const late = trades.filter((t) => t.leg >= 4);
  const corr = pearson(late.map((t) => t.va - t.vb), late.map((t) => t.xa - t.xb));
  const bal = trades.filter((t) => !t.picks).map((t) => t.bal).sort((x, y) => x - y);
  const q = (p) => bal[Math.floor(p * (bal.length - 1))];
  const shape = {};
  for (const t of trades) shape[`${Math.min(t.na, t.nb)}-for-${Math.max(t.na, t.nb)}`] = (shape[`${Math.min(t.na, t.nb)}-for-${Math.max(t.na, t.nb)}`] || 0) + 1;
  const pairs = {};
  for (const t of trades) pairs[[t.a, t.b].sort().join(' / ')] = (pairs[[t.a, t.b].sort().join(' / ')] || 0) + 1;
  const fit = { n: trades.length, decided: decided.length, agree: r3(agree), corr: r3(corr), balance: { p10: r2(q(0.1)), p25: r2(q(0.25)), median: r2(q(0.5)), p75: r2(q(0.75)) }, withPicks: trades.filter((t) => t.picks).length, shape, topPairs: Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 5) };
  const big = late.slice().sort((x, y) => Math.abs(y.xa - y.xb) - Math.abs(x.xa - x.xb)).slice(0, 12);
  return {
    id: 'E13', title: 'Would the site have called this league\'s real trades right?',
    tables: [
      { caption: 'The twelve most lopsided trades in hindsight. "Value then" is the site\'s trade value on the day; "Delivered" is points above a replacement player from the trade to Week 17.', head: ['Season', 'Week', 'Side A got', 'Value then', 'Delivered', 'Side B got', 'Value then', 'Delivered', 'Site picked the right side'], rows: big.map((t) => [t.season, t.leg, `${t.a}: ${t.names[0]}`, r1(t.va), r1(t.xa), `${t.b}: ${t.names[1]}`, r1(t.vb), r1(t.xb), Math.sign(t.va - t.vb) === Math.sign(t.xa - t.xb) ? 'yes' : 'no']) },
      { caption: 'What accepted trades in this league look like.', head: ['Measure', 'Value'], rows: [['Trades with players on both sides', trades.length], ['Shapes', Object.entries(shape).map(([k, v]) => `${k}: ${v}`).join(', ')], ['Included draft picks', fit.withPicks], ['Smaller side as a share of the larger (site value), player-only trades: 10th / 25th / median / 75th percentile', `${fit.balance.p10} / ${fit.balance.p25} / ${fit.balance.median} / ${fit.balance.p75}`], ['Most frequent partners', fit.topPairs.map(([k, v]) => `${k} (${v})`).join('; ')]] },
    ],
    findings: [
      `${trades.length} two-team trades with players on both sides, ${late.length} of them from Week 4 on. Where one side clearly won in hindsight (${decided.length} trades), the side the site valued higher was the side that won ${pct(agree)}% of the time; correlation between the site's value gap and the delivered gap: ${r3(corr)}.`,
      `Accepted player-only trades were rarely even on the site's numbers: the median deal had the smaller side at ${pct(fit.balance.median)}% of the larger, and a quarter were below ${pct(fit.balance.p25)}%. The finder's "within 15%" fairness test would have called most real, accepted trades unfair.`,
    ],
    fit, trades,
  };
}

// ================= E14 =================
export function e14() {
  const runs = [];
  for (const s of D.SEASONS) {
    const S = D.loadSeason(s);
    const hist = {};
    for (let wk = 1; wk <= S.lastWeek; wk++) for (const r of S.weeks[wk].values()) if (r.played && SKILL.includes(r.pos)) (hist[r.id] ||= []).push({ w: wk, pts: r.pts, team: r.team, pos: r.pos, snp: r.snp });
    for (const [pid, h] of Object.entries(hist)) {
      for (let i = 2; i < h.length - 0; i++) {
        const before = h.slice(0, i + 1);
        if (before.length < 3 || mean(before.map((x) => x.pts)) < 8) continue;
        const cur = h[i];
        const next = h[i + 1];
        // team games between this appearance and the next one (or the end of the season)
        const end = next ? next.w : Math.min(S.lastWeek, 17) + 1;
        let missed = 0;
        for (let wk = cur.w + 1; wk < end; wk++) if (!S.isBye(cur.team, wk)) missed++;
        if (!missed) continue;
        const first = cur.w + 1 + (S.isBye(cur.team, cur.w + 1) ? 1 : 0);
        const tag = S.inj[first]?.get(pid)?.status || 'Not on report';
        const injury = S.inj[first]?.get(pid)?.injury || null;
        const pre = mean(before.slice(-4).map((x) => x.pts));
        const preSnp = mean(before.slice(-4).map((x) => x.snp).filter((x) => x != null));
        const back = next ? h.slice(i + 1, i + 4) : [];
        runs.push({ season: s, split: split(s), pos: cur.pos, missed, returned: !!next, tag, injury, pre, back1: back[0]?.pts ?? null, back1Snp: back[0]?.snp ?? null, preSnp, back23: back.length >= 3 ? mean(back.slice(1).map((x) => x.pts)) : null });
      }
    }
  }
  const haz = [];
  for (let j = 1; j <= 6; j++) {
    const at = runs.filter((r) => r.missed >= j);
    const backNext = at.filter((r) => r.missed === j && r.returned);
    const everBack = at.filter((r) => r.returned);
    haz.push([j, at.length, pct(backNext.length / at.length), pct(everBack.length / at.length), r1(mean(everBack.map((r) => r.missed - j + 1)))]);
  }
  const prod = [];
  for (const [name, f] of [['Missed 1 game', (r) => r.missed === 1], ['Missed 2-3', (r) => r.missed >= 2 && r.missed <= 3], ['Missed 4+', (r) => r.missed >= 4]]) {
    const x = runs.filter((r) => r.returned && f(r) && r.back1 != null);
    const x2 = x.filter((r) => r.back23 != null);
    prod.push([name, x.length, r2(sum(x.map((r) => r.back1)) / sum(x.map((r) => r.pre))), r2(mean(x.filter((r) => r.back1Snp != null && r.preSnp).map((r) => r.back1Snp / r.preSnp))), r2(sum(x2.map((r) => r.back23)) / sum(x2.map((r) => r.pre))), x2.length]);
  }
  const byTag = Object.entries(runs.reduce((g, r) => ((g[r.tag] ||= []).push(r), g), {})).filter(([, x]) => x.length >= 20).map(([k, x]) => [k, x.length, r1(mean(x.map((r) => r.missed))), pct(mean(x.map((r) => (r.missed === 1 && r.returned ? 1 : 0)))), pct(mean(x.map((r) => (r.returned ? 1 : 0))))]);
  const fit = { hazard: haz.map((h) => ({ missed: h[0], n: h[1], backNext: h[2], backEver: h[3], moreGames: h[4] })), production: Object.fromEntries(prod.map((p) => [p[0], { first: p[2], firstSnap: p[3], next2: p[4], n: p[1] }])) };
  return {
    id: 'E14', title: 'How long are players out, and what are they worth when they return?',
    tables: [
      { caption: 'Skill players averaging 8+ points who missed at least one game, 2022-2026.', head: ['Games missed so far', 'Cases', 'Back the very next game %', 'Back at all that season %', 'If back: more games missed, on average'], rows: haz },
      { caption: 'Production after returning, against the four games before the absence.', head: ['Absence', 'n', 'First game back (share of before)', 'Snap share, first game back', 'Games 2-3 back', 'n'], rows: prod },
      { caption: 'By status on the first report after the injury.', head: ['Status the first week out', 'Cases', 'Games missed, average', 'Missed exactly one game %', 'Returned that season %'], rows: byTag },
    ],
    findings: [
      `After one missed game, ${haz[0][2]}% were back the next game; after three, ${haz[2][2]}%. ${haz[3][3]}% of players who had missed four games returned at all that season.`,
      `First game back: ${prod.map((p) => `${p[0].toLowerCase()} → ${Math.round(p[2] * 100)}% of prior scoring`).join(', ')}. Games two and three back: ${prod.map((p) => `${Math.round(p[4] * 100)}%`).join(', ')}.`,
    ],
    fit,
  };
}

// ================= E15 =================
export function e15() {
  const db = D.playersDb();
  const seasonStat = {};
  for (const s of D.SEASONS) {
    const S = D.loadSeason(s);
    for (let wk = 1; wk <= Math.min(17, S.lastWeek); wk++) for (const r of S.weeks[wk].values()) if (r.played) ((seasonStat[s] ||= {})[r.id] ||= { pos: r.pos, g: 0, pts: 0 }), (seasonStat[s][r.id].g++, (seasonStat[s][r.id].pts += r.pts));
  }
  const ppgOf = (s, id) => (seasonStat[s]?.[id]?.g >= (s === 2026 ? 4 : 6) ? seasonStat[s][id].pts / seasonStat[s][id].g : null);
  const pairs = [];
  for (const s of [2022, 2023, 2024, 2025]) {
    for (const [id, st] of Object.entries(seasonStat[s] || {})) {
      if (!SKILL.includes(st.pos)) continue;
      const a = ppgOf(s, id);
      if (a == null || a < 9) continue;
      const age = db[id]?.age ? db[id].age - (2026 - s) : null;
      if (age == null) continue;
      const b = ppgOf(s + 1, id);
      pairs.push({ pos: st.pos, age, a, b, gone: b == null });
    }
  }
  const bucket = (pos, age) => (pos === 'RB' ? (age <= 23 ? '23 or younger' : age <= 25 ? '24-25' : age <= 27 ? '26-27' : '28+') : pos === 'QB' ? (age <= 25 ? '25 or younger' : age <= 29 ? '26-29' : age <= 33 ? '30-33' : '34+') : age <= 23 ? '23 or younger' : age <= 26 ? '24-26' : age <= 29 ? '27-29' : '30+');
  const g = {};
  for (const p of pairs) (g[p.pos + '|' + bucket(p.pos, p.age)] ||= []).push(p);
  const ages = Object.entries(g).filter(([, x]) => x.length >= 12).sort().map(([k, x]) => {
    const kept = x.filter((p) => !p.gone);
    return [k.split('|')[0], k.split('|')[1], x.length, r1(mean(x.map((p) => p.a))), r1(mean(kept.map((p) => p.b))), r2(sum(x.map((p) => (p.gone ? 0 : p.b))) / sum(x.map((p) => p.a))), pct(mean(x.map((p) => (!p.gone && p.b >= 0.85 * p.a ? 1 : 0)))), pct(mean(x.map((p) => (p.gone ? 1 : 0))))];
  });
  // what each draft round returned in this league
  const rounds = {};
  for (const L of D.leagueChain()) {
    const rep = {};
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
      const v = Object.entries(seasonStat[L.season] || {}).filter(([, st]) => st.pos === pos && st.g >= 4).map(([, st]) => st.pts / st.g).sort((a, b) => b - a);
      const n = L.rosters.length;
      rep[pos] = v[Math.round(n * ({ QB: 1.2, RB: 3.2, WR: 3.6, TE: 1.2, K: 1, DEF: 1 }[pos]))] ?? 0;
    }
    for (const d of Object.values(L.drafts)) {
      for (const p of d.picks) {
        const st = seasonStat[L.season]?.[p.pid];
        const pg = st && st.g ? st.pts / st.g : 0;
        const above = st ? Math.max(0, pg - rep[st.pos]) * st.g : 0;
        (rounds[p.round] ||= []).push({ season: L.season, keeper: !!p.keeper, pg, g: st?.g || 0, above, weeks: Math.min(17, D.loadSeason(L.season).lastWeek) });
      }
    }
  }
  const roundRows = Object.entries(rounds).map(([r, x]) => [Number(r), x.length, r1(mean(x.map((p) => p.pg))), r1(mean(x.map((p) => (p.above / p.weeks) * 17))), pct(mean(x.map((p) => (p.above > 0 ? 1 : 0)))), x.filter((p) => p.keeper).length]).sort((a, b) => a[0] - b[0]);
  const fit = { ages: Object.fromEntries(ages.map((a) => [`${a[0]} ${a[1]}`, { n: a[2], retention: a[5], held85: a[6], gone: a[7] }])), rounds: Object.fromEntries(roundRows.map((r) => [r[0], { n: r[1], ppg: r[2], aboveReplacement: r[3], hit: r[4] }])) };
  return {
    id: 'E15', title: 'What are keepers and draft picks worth?',
    tables: [
      { caption: 'Players averaging 9+ points one season: what they did the next (2022→23 through 2025→26 to date). "Kept" counts a player who did not play as zero.', head: ['Position', 'Age', 'n', 'Points per game, year 1', 'Year 2 (if played)', 'Share of value kept', 'Held 85%+ of it %', 'Did not play 4+ games next year %'], rows: ages },
      { caption: 'This league\'s drafts (2025 and 2026): what each round returned that season. Points above replacement are scaled to a 17-week season.', head: ['Round', 'Picks', 'Points per game', 'Season points above a replacement player', 'Beat replacement %', 'Keepers taken here'], rows: roundRows },
    ],
    findings: [
      `Value kept year to year: ${ages.filter((a) => a[2] >= 20).map((a) => `${a[0]} ${a[1]} ${Math.round(a[5] * 100)}%`).join(', ')}.`,
      `Draft picks in this league: round 1 returned ${roundRows[0]?.[3]} season points above replacement, round 2 ${roundRows[1]?.[3]}, round 3 ${roundRows[2]?.[3]}; by round 6 it is ${roundRows[5]?.[3]}.`,
    ],
    fit,
  };
}

// ================= E19 =================
// USE_ROS: attach the experts' rest-of-season rank in E11/E13, as the live site does (values.js).
let USE_ROS = true;
export function setUseRos(v) {
  USE_ROS = v;
  e11Cache = null;
}
function attachRosBt(players, season, wk) {
  if (!USE_ROS) return;
  const m = rosWeek(season, wk);
  for (const [pid, x] of m || []) if (players[pid] && players[pid].pos === x.pos) players[pid].ros = { ecr: x.ecr, pos: x.pos };
}
// Rest-of-season expert consensus (FantasyPros ROS rankings, archived about weekly by
// dynastyprocess/data) as a second opinion on trade values. Same frame as E11.
import fsE19 from 'node:fs';
let rosMapCache = null;
function rosWeek(season, wk) {
  const dir = path.join(DIR, 'ecr');
  rosMapCache ||= JSON.parse(fsE19.readFileSync(path.join(dir, 'fp-to-sleeper.json'), 'utf8'));
  for (let w = wk; w >= Math.max(1, wk - 2); w--) {
    const f = path.join(dir, `ros-${season}-${w}.json`);
    if (!fsE19.existsSync(f)) continue;
    const j = JSON.parse(fsE19.readFileSync(f, 'utf8'));
    const out = new Map();
    for (const r of j.rows) {
      const pid = r.pos === 'DEF' ? D.fixTeam(r.team) : rosMapCache[r.id];
      if (pid) out.set(pid, { ecr: Number(r.ecr), pos: r.pos });
    }
    return out;
  }
  return null;
}
export function e19() {
  setUseRos(false);
  const base = valueRows();
  setUseRos(true);
  const rows = base
    .filter((r) => r.o.ppg != null && !r.inj)
    .map((r) => ({ ...r, ros: rosWeek(r.season, r.wk)?.get(r.id) }))
    .filter((r) => r.ros && r.ros.pos === r.pos);
  const fit = { curve: {}, weight: {}, test: {}, train: {} };
  const out = [];
  for (const pos of SKILL) {
    const tr = rows.filter((r) => r.pos === pos && r.split === 'train');
    const te = rows.filter((r) => r.pos === pos && r.split === 'test');
    if (tr.length < 80 || te.length < 30) continue;
    const curve = ols(tr.map((r) => [Math.log(r.ros.ecr)]), tr.map((r) => r.o.ppg));
    fit.curve[pos] = curve.map(r3);
    const rp = (r) => Math.max(0, predict(curve, [Math.log(r.ros.ecr)]));
    let best = { w: 1, e: Infinity };
    for (let w = 0; w <= 1.0001; w += 0.05) {
      const e = mean(tr.map((r) => Math.abs(r.o.ppg - (w * r.site + (1 - w) * rp(r)))));
      if (e < best.e - 1e-9) best = { w: Math.round(w * 100) / 100, e };
    }
    fit.weight[pos] = best.w;
    const wkRho = (set, f) => {
      const g = {};
      for (const r of set) (g[r.season + ':' + r.wk] ||= []).push(r);
      return mean(Object.values(g).filter((x) => x.length >= 6).map((x) => spearman(x.map(f), x.map((r) => r.o.ppg))));
    };
    const poRho = (set, f) => {
      const x = set.filter((r) => r.o.po > 0);
      const g = {};
      for (const r of x) (g[r.season + ':' + r.wk] ||= []).push(r);
      return mean(Object.values(g).filter((y) => y.length >= 6).map((y) => spearman(y.map(f), y.map((r) => r.o.po))));
    };
    const methods = [['Site value today', (r) => r.site], ['Expert ROS rank, as points', rp], ['Half and half', (r) => 0.5 * r.site + 0.5 * rp(r)], [`Fitted: ${Math.round(best.w * 100)}% site`, (r) => best.w * r.site + (1 - best.w) * rp(r)]];
    fit.test[pos] = {};
    fit.train[pos] = {};
    for (const [name, f] of methods) {
      const m = { mae: mean(te.map((r) => Math.abs(r.o.ppg - f(r)))), rho: wkRho(te, f), po: poRho(te, f) };
      fit.test[pos][name] = { mae: r2(m.mae), rho: r3(m.rho), po: r3(m.po) };
      fit.train[pos][name] = { mae: r2(mean(tr.map((r) => Math.abs(r.o.ppg - f(r))))), rho: r3(wkRho(tr, f)) };
      out.push([pos, name, r2(m.mae), r3(m.rho), r3(m.po), te.length]);
    }
  }
  // the rule is chosen on 2022-24: the fitted weight, if it beat the site value there; then checked on 2025
  const fk = (p) => Object.keys(fit.test[p]).find((k) => k.startsWith('Fitted'));
  fit.adopt = Object.fromEntries(Object.keys(fit.test).map((p) => [p, fit.train[p][fk(p)].mae < fit.train[p]['Site value today'].mae - 0.02]));
  fit.confirmed = Object.fromEntries(Object.keys(fit.test).map((p) => [p, fit.test[p][fk(p)].mae <= fit.test[p]['Site value today'].mae && fit.test[p][fk(p)].rho >= fit.test[p]['Site value today'].rho - 0.01]));
  return {
    id: 'E19', title: 'Does the experts\' rest-of-season ranking improve trade values?',
    tables: [{ caption: 'Predicting points per game from that week to Week 17, taken at Weeks 4-11. Fitted on 2022-24, hold-out 2025; healthy players who went on to play 3+ games and had an expert ROS rank. Last column: rank correlation with points scored in Weeks 15-17 alone.', head: ['Position', 'Method', 'Avg miss (pts/game)', 'Rank corr.', 'Rank corr., Weeks 15-17', 'n'], rows: out }],
    findings: [
      ...Object.keys(fit.test).map((p) => `${p}: site value misses by ${fit.test[p]['Site value today'].mae}, experts' ROS rank ${fit.test[p]['Expert ROS rank, as points'].mae}, half and half ${fit.test[p]['Half and half'].mae}, fitted blend (${Math.round(fit.weight[p] * 100)}% site) ${fit.test[p][fk(p)].mae}.`),
      `Rule chosen on 2022-24 (blend where it beat the site value by more than 0.02 a game): ${Object.entries(fit.adopt).map(([p, a]) => `${p} ${a ? 'blend' : 'site value'}`).join(', ')}. Confirmed on 2025 at: ${Object.entries(fit.confirmed).filter(([p, c]) => c && fit.adopt[p]).map(([p]) => p).join(', ') || 'none'}.`,
    ],
    fit,
  };
}

// ================= E20 =================
// Waiver advice. For every team-week of this league (Weeks 3-14), what the site's waiver plan
// would have suggested, against adding the best-projected free agent, against what managers
// actually added, and against doing nothing. A move is worth the best-lineup points it adds over
// the next three weeks with real scores: add in, drop out, everything else as the roster stood.
// Note: Sleeper's "trending adds" are not archived, so that signal is blind here, and next week's
// projection is not used (the archive only has the final, post-news version).
const SKILL_K = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
function moveGain(M, S, wk, rosterIds, add, drop, span = 3) {
  let gain = 0;
  for (let w = wk; w <= Math.min(wk + span - 1, Math.min(17, S.lastWeek)); w++) {
    const act = S.weeks[w];
    if (!act) continue;
    const pts = (id) => (act.get(id)?.played ? act.get(id).pts : 0);
    const base = rosterIds.filter((id) => id !== add);
    const after = base.filter((id) => id !== drop).concat(add);
    const v = (ids) => M.solve(ids, { v: pts, can: () => true }).total;
    gain += v(after) - v(base);
  }
  return gain;
}
let e20Cache = null;
const row_stash_holder = {};
export function waiverRows() {
  if (e20Cache) return e20Cache;
  const rows = [];
  for (const L of D.leagueChain()) {
    const S = D.loadSeason(L.season);
    const owners = Object.fromEntries(L.rosters.map((r) => [r.rid, L.users.find((u) => u.id === r.owner)?.name || 'Team ' + r.rid]));
    const pastScores = {};
    const pairs = {};
    for (const [k, x] of Object.entries(L.weeks)) {
      pastScores[k] = Object.fromEntries(x.mu.map((m) => [m.rid, m.pts || 0]));
      pairs[k] = Object.fromEntries(x.mu.map((m) => [m.rid, m.mid]));
    }
    for (let wk = 3; wk <= Math.min(14, S.lastWeek - 1); wk++) {
      const w = L.weeks[wk];
      if (!w?.mu?.length) continue;
      const lw = { L, S, wk, owners, pastScores, pairs, mu: w.mu };
      // what managers actually added that week (claims and free agents processed before week wk's games)
      const realAdds = {};
      for (const tx of (L.weeks[wk - 1]?.tx || []).concat(L.weeks[wk]?.tx || [])) {
        if (!['waiver', 'free_agent'].includes(tx.type) || !tx.adds) continue;
        for (const [pid, rid] of Object.entries(tx.adds)) {
          const drop = Object.entries(tx.drops || {}).find(([, r]) => r === rid)?.[0] || null;
          (realAdds[rid] ||= []).push({ add: pid, drop });
        }
      }
      for (const m of w.mu) {
        let M;
        try {
          M = modelFor(lw, true, m.rid);
        } catch {
          continue;
        }
        const roster = (m.players || []).filter((id) => !(m.reserve || []).includes(id));
        let plan;
        try {
          plan = M.waiverPlan();
        } catch {
          continue;
        }
        const cands = [...(plan.groups.risers || []), ...(plan.groups.lottery || []), ...(plan.groups.cuffs || [])];
        // the top claim is the best player for the lineup now; injured stashes are judged separately
        const isStash = (c) => c.p.avail === 'out';
        const now = cands.filter((c) => !isStash(c));
        now.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || (b.p?.proj || 0) - (a.p?.proj || 0));
        const top = now[0];
        const stash = cands.find(isStash);
        if (stash) {
          const drop = stash.drop?.pid || null;
          (row_stash_holder.list ||= []).push({ season: L.season, wk, gain3: moveGain(M, S, wk, roster, stash.id, drop), gain8: moveGain(M, S, wk, roster, stash.id, drop, 8), name: stash.p.n });
        }
        const fa = Object.values(M.snap.players).filter((p) => p.own == null && SKILL_K.includes(p.pos) && p.proj?.pts > 0 && !['Out', 'IR', 'Doubtful'].includes(p.inj || ''));
        const benchLow = M.lineup(M.me).bench.filter((id) => !M.lineup(M.me).opt.slots.some((s) => s.pid === id)).sort((a, b) => Math.max(M.val(a), M.P(a).ppg || 0) - Math.max(M.val(b), M.P(b).ppg || 0))[0] || null;
        const naive = fa.filter((p) => p.pos !== 'K' && p.pos !== 'DEF').sort((a, b) => b.proj.pts - a.proj.pts)[0];
        const naivePpg = fa.filter((p) => p.pos !== 'K' && p.pos !== 'DEF' && p.hist.length >= 3).sort((a, b) => (M.P(b.id).ppg || 0) - (M.P(a.id).ppg || 0))[0];
        const fullRoster = M.me.players.length >= M.maxRoster;
        const dropFor = (d) => (fullRoster ? d : null);
        const row = { season: L.season, wk, rid: m.rid, owner: owners[m.rid], noNeed: plan.noNeed };
        if (top) {
          const drop = top.drop?.pid || null;
          row.site = { add: top.id, name: top.p.n, why: (top.why || []).join('; '), proj: top.p.proj, drop, tier: top.tier, group: top.group, impact: top.impact, gain: moveGain(M, S, wk, roster, top.id, drop), dropBeat: null };
          // did the drop outscore the add over the three weeks?
          const sum = (id) => {
            let s = 0;
            for (let x = wk; x <= wk + 2; x++) s += S.weeks[x]?.get(id)?.played ? S.weeks[x].get(id).pts : 0;
            return s;
          };
          row.site.dropBeat = drop ? (sum(drop) > sum(top.id) ? 1 : 0) : null;
          row.site.addPts = sum(top.id);
        }
        if (naive) row.naive = { add: naive.id, gain: moveGain(M, S, wk, roster, naive.id, dropFor(benchLow)) };
        if (naivePpg) row.naivePpg = { add: naivePpg.id, gain: moveGain(M, S, wk, roster, naivePpg.id, dropFor(benchLow)) };
        const real = (realAdds[m.rid] || []).filter((x) => M.snap.players[x.add]);
        if (real.length) row.real = real.map((x) => ({ ...x, gain: moveGain(M, S, wk, roster, x.add, x.drop && roster.includes(x.drop) ? x.drop : null) }));
        // features for every candidate, to refit the ranking
        row.cards = cands.slice(0, 12).map((c) => ({ id: c.id, tier: c.tier, group: c.group, impact: c.impact, ppg3: c.p.ppg3 || 0, ppg: c.p.ppg || 0, proj: c.p.proj || 0, nWhy: (c.why || []).length, gain: moveGain(M, S, wk, roster, c.id, c.drop?.pid || null) }));
        rows.push(row);
      }
    }
  }
  return (e20Cache = rows);
}
export function e20() {
  const rows = waiverRows();
  const stat = (list) => {
    const g = list.map((x) => x.gain);
    return { n: g.length, mean: mean(g), hit: mean(g.map((x) => (x > 0 ? 1 : 0))), big: mean(g.map((x) => (x >= 10 ? 1 : 0))) };
  };
  const byWk = (pick) => {
    const g = {};
    for (const r of rows) {
      const x = pick(r);
      if (x) (g[r.season + ':' + r.wk] ||= []).push(x);
    }
    return g;
  };
  const line = (label, pick) => {
    const list = rows.map(pick).filter(Boolean);
    const s = stat(list);
    const ci = bootCI(byWk(pick), (x) => mean(x.map((y) => y.gain)), 300);
    return [label, s.n, r1(s.mean), `${r1(ci[0])} to ${r1(ci[1])}`, pct(s.hit), pct(s.big)];
  };
  const realFirst = (r) => (r.real?.length ? r.real.sort((a, b) => b.gain - a.gain).slice(-1)[0] && r.real[0] : null);
  const realAll = rows.flatMap((r) => (r.real || []).map((x) => ({ ...x, season: r.season, wk: r.wk })));
  const head = ['Move', 'Team-weeks', 'Lineup points gained, next 3 weeks (avg)', '90% range', 'Helped %', 'Added 10+ points %'];
  const table1 = [
    line("Site's top suggestion", (r) => r.site),
    line('Naive: best-projected free agent', (r) => r.naive),
    line('Naive: best season average free agent', (r) => r.naivePpg),
    ["Managers' actual adds (each add)", realAll.length, r1(mean(realAll.map((x) => x.gain))), '', pct(mean(realAll.map((x) => (x.gain > 0 ? 1 : 0)))), pct(mean(realAll.map((x) => (x.gain >= 10 ? 1 : 0))))],
    ['Doing nothing', rows.length, 0, '', 0, 0],
  ];
  const st = row_stash_holder.list || [];
  const stashLine = ['Injured stash (separately, over 8 weeks)', st.length, r1(mean(st.map((x) => x.gain8))), '', pct(mean(st.map((x) => (x.gain8 > 0 ? 1 : 0)))), pct(mean(st.map((x) => (x.gain8 >= 10 ? 1 : 0))))];
  table1.push(stashLine);
  const tiers = {};
  for (const r of rows) if (r.site) (tiers[`Tier ${r.site.tier} (${r.site.group})`] ||= []).push(r.site);
  const table2 = Object.entries(tiers).sort().map(([k, list]) => { const s = stat(list); return [k, s.n, r1(s.mean), pct(s.hit), pct(mean(list.filter((x) => x.dropBeat != null).map((x) => x.dropBeat)))]; });
  // refit the ranking of candidates: which single rule picks the best card on 2025, checked on 2026
  const rules = {
    'Site order (tier, then impact)': (c) => -(c.tier * 100) + c.impact,
    'Impact this week only': (c) => c.impact,
    'Recent scoring (last 3)': (c) => c.ppg3,
    'Season average': (c) => c.ppg,
    'Projection this week': (c) => c.proj,
    'Impact + 0.3 x last 3': (c) => c.impact + 0.3 * c.ppg3,
  };
  const ruleRows = Object.entries(rules).map(([k, f]) => {
    const per = (season) => {
      const x = rows.filter((r) => r.season === season && r.cards?.length).map((r) => r.cards.slice().sort((a, b) => f(b) - f(a))[0].gain);
      return { mean: mean(x), n: x.length };
    };
    const a = per(2025);
    const b = per(2026);
    return [k, r1(a.mean), a.n, r1(b.mean), b.n];
  });
  const s = stat(rows.map((r) => r.site).filter(Boolean));
  const nv = stat(rows.map((r) => r.naive).filter(Boolean));
  const fit = {
    site: { mean: r2(s.mean), hit: r3(s.hit), n: s.n }, naive: { mean: r2(nv.mean), hit: r3(nv.hit), n: nv.n },
    real: { mean: r2(mean(realAll.map((x) => x.gain))), n: realAll.length },
    tiers: Object.fromEntries(table2.map((r) => [r[0], { n: r[1], mean: r[2], hit: r[3], dropBeat: r[4] }])),
    rules: Object.fromEntries(ruleRows.map((r) => [r[0], { y2025: r[1], y2026: r[3] }])),
  };
  const bestRule = ruleRows.slice().sort((a, b) => b[1] - a[1])[0];
  return {
    id: 'E20', title: 'Would the site\'s waiver suggestions have helped?',
    tables: [
      { caption: 'Every team-week, Weeks 3-14 of this league\'s 2025 and 2026 seasons. Gain = best-lineup points over the next three weeks with real scores, the add in and the suggested drop out, against the roster as it stood.', head, rows: table1 },
      { caption: 'Site suggestions by tier and group. Last column: how often the player the site said to drop then outscored the player it said to add.', head: ['Tier', 'n', 'Avg gain', 'Helped %', 'Drop outscored the add %'], rows: table2 },
      { caption: 'Which rule picks the best of the site\'s candidates? Average gain of the top pick, 2025 and 2026 separately.', head: ['Ranking rule', '2025 avg gain', 'n', '2026 avg gain', 'n'], rows: ruleRows },
    ],
    findings: [
      `The site's top waiver suggestion gained ${r1(s.mean)} lineup points over three weeks on average and helped ${pct(s.hit)}% of the time. The best-projected free agent gained ${r1(nv.mean)}; managers' actual adds ${r1(fit.real.mean)} (${realAll.length} adds). Doing nothing: 0.`,
      `By tier: ${table2.map((r) => `${r[0]} ${r[2]} (n=${r[1]})`).join(', ')}.`,
      `Ranking candidates: best rule on 2025 was "${bestRule[0]}" (${bestRule[1]}), which gained ${bestRule[3]} on 2026; the site's own order gained ${ruleRows[0][1]} and ${ruleRows[0][3]}.`,
    ],
    fit,
  };
}
