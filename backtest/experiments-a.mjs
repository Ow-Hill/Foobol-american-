// Experiments E1-E6 and E10: weekly advice (projections, start/sit, tiebreaks, injury tags,
// teammate estimates, matchup strength, game environment). Each returns
// { id, title, question, tables: [{ caption, head, rows }], findings: [..], fit: {..} }.
import { createRequire } from 'node:module';
import * as D from './data.mjs';
import { buildRipple, usage } from '../public/js/ripple.js';
import { matchupFor } from '../public/js/matchup.js';

const require = createRequire(import.meta.url);
const { score: scoreRipple } = require('../lib/calibration.js');
const { mean, sum, r1, r2, r3, pct, pearson, spearman, ols, predict, bootCI, TRAIN, TEST, SKILL } = D;

const asOfCache = new Map();
export const asOf = (s, w) => {
  const k = s + ':' + w;
  if (!asOfCache.has(k)) asOfCache.set(k, D.asOf(s, w));
  return asOfCache.get(k);
};
export function eachWeek(seasons, from, cb, to = 17) {
  for (const s of seasons) {
    const S = D.loadSeason(s);
    for (let w = from; w <= Math.min(S.lastWeek, to); w++) cb(s, w, S);
  }
}
const split = (s) => (TRAIN.includes(s) ? 'train' : 'test');
export const ppg = (p) => (p.hist.length ? mean(p.hist.map((h) => h.pts)) : null);
export const ppg3 = (p) => (p.hist.length ? mean(p.hist.slice(-3).map((h) => h.pts)) : null);
const mae = (rows, f) => mean(rows.map((r) => Math.abs(r.actual - f(r))));
const bias = (rows, f) => mean(rows.map((r) => r.actual - f(r)));
const weekly = (rows, f) => {
  const g = {};
  for (const r of rows) (g[r.season + ':' + r.wk] ||= []).push(r);
  return mean(Object.values(g).filter((x) => x.length >= 6).map((x) => spearman(x.map(f), x.map((r) => r.actual))));
};
// the blend the trade values use today (public/js/values.js ppgRaw), without the league prior
const valuesBlend = (r) => {
  const hist = r.gp >= 4 ? 0.5 * r.ppg3 + 0.5 * r.ppg : r.ppg;
  const w = r.gp / (r.gp + 3);
  return 0.65 * (w * hist + (1 - w) * r.proj) + 0.35 * r.proj;
};

// ---------- usage-based expected points (fitted on the training seasons) ----------
const XP_FEATURES = { QB: ['passAtt', 'att', 'rzAtt'], RB: ['att', 'rzAtt', 'tgt', 'air', 'rzTgt'], WR: ['tgt', 'air', 'rzTgt', 'att'], TE: ['tgt', 'air', 'rzTgt'] };
let xpBeta = null;
export function xpModel() {
  if (xpBeta) return xpBeta;
  const X = {};
  const y = {};
  eachWeek(TRAIN, 1, (s, w, S) => {
    for (const r of S.weeks[w].values()) {
      if (!r.played || !XP_FEATURES[r.pos]) continue;
      if ((r.snp ?? 0) < 15 && r.pos !== 'QB') continue;
      if (r.pos === 'QB' && r.passAtt < 10) continue;
      (X[r.pos] ||= []).push(XP_FEATURES[r.pos].map((f) => r[f] || 0));
      (y[r.pos] ||= []).push(r.pts);
    }
  }, 18);
  xpBeta = {};
  for (const pos of SKILL) xpBeta[pos] = ols(X[pos], y[pos]);
  return xpBeta;
}
export const xpGame = (pos, h) => (XP_FEATURES[pos] ? Math.max(0, predict(xpModel()[pos], XP_FEATURES[pos].map((f) => h[f] || 0))) : null);
export const xpAvg = (p, n = 99) => (XP_FEATURES[p.pos] && p.hist.length ? mean(p.hist.slice(-n).map((h) => xpGame(p.pos, h))) : null);

// ---------- shared row set: lineup-relevant players who had a projection and played ----------
let rowsCache = null;
export function playerWeeks() {
  if (rowsCache) return rowsCache;
  const rows = [];
  eachWeek(D.SEASONS, 4, (s, w, S) => {
    const P = asOf(s, w);
    const act = D.actual(s, w);
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
      for (const p of D.relevant(P, pos)) {
        const a = act.get(p.id);
        const g = S.game(p.team, w);
        rows.push({
          season: s, wk: w, split: split(s), id: p.id, n: p.n, pos, team: p.team, opp: g?.opp || null,
          proj: p.proj.pts, gp: p.hist.length, ppg: ppg(p), ppg3: ppg3(p), xp: xpAvg(p, 4),
          played: !!a?.played, actual: a?.played ? a.pts : 0, inj: p.inj || null, prac: p.prac || null,
          imp: g?.imp ?? null, oppImp: g?.oppImp ?? null, wind: g?.wind ?? null, roof: g?.roof ?? null, home: g?.home ?? null,
        });
      }
    }
  });
  return (rowsCache = rows);
}

// ================= E1 =================
export function e1() {
  const all = playerWeeks().filter((r) => r.played && r.gp >= 3);
  const fit = {};
  const tables = [];
  const head = ['Position', 'Method', 'Avg miss (pts)', 'Bias', 'Weekly rank corr.', 'n'];
  const rowsOut = [];
  const better = [];
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
    const tr = all.filter((r) => r.pos === pos && r.split === 'train');
    const te = all.filter((r) => r.pos === pos && r.split === 'test');
    const feats = (r) => (r.xp != null ? [r.proj, r.ppg, r.ppg3, r.xp] : [r.proj, r.ppg, r.ppg3]);
    const beta = ols(tr.map(feats), tr.map((r) => r.actual), 1e-4);
    // simple two-way blend, weight chosen on the training seasons
    let bestW = 1;
    let bestErr = Infinity;
    for (let w = 0; w <= 1.0001; w += 0.05) {
      const e = mae(tr, (r) => w * r.proj + (1 - w) * (r.xp ?? r.ppg));
      if (e < bestErr - 1e-9) {
        bestErr = e;
        bestW = Math.round(w * 100) / 100;
      }
    }
    fit[pos] = { beta: beta.map(r3), features: SKILL.includes(pos) ? ['proj', 'ppg', 'ppg3', 'xp'] : ['proj', 'ppg', 'ppg3'], projWeight: bestW };
    const methods = [
      ['Sleeper projection (what the site uses)', (r) => r.proj],
      ['Season average', (r) => r.ppg],
      ['Last 3 games', (r) => r.ppg3],
      ['Trade-value blend (values.js)', valuesBlend],
      ...(SKILL.includes(pos) ? [['Volume-based expected points', (r) => r.xp]] : []),
      [`Projection ${Math.round(bestW * 100)}% + ${SKILL.includes(pos) ? 'usage' : 'average'} ${Math.round((1 - bestW) * 100)}%`, (r) => bestW * r.proj + (1 - bestW) * (r.xp ?? r.ppg)],
      ['Fitted blend of all', (r) => predict(beta, feats(r))],
    ];
    const res = methods.map(([name, f]) => ({ name, mae: mae(te, f), bias: bias(te, f), rho: weekly(te, f) }));
    for (const m of res) rowsOut.push([pos, m.name, r2(m.mae), r2(m.bias), r3(m.rho), te.length]);
    const base = res[0];
    const top = res.slice().sort((a, b) => a.mae - b.mae)[0];
    better.push({ pos, base: base.mae, best: top.name, bestMae: top.mae, gain: base.mae - top.mae });
    fit[pos].test = Object.fromEntries(res.map((m) => [m.name, { mae: r2(m.mae), bias: r2(m.bias), rho: r3(m.rho) }]));
  }
  tables.push({ caption: 'Hold-out seasons 2025-2026, players who played, weeks 4-17. Lower miss is better; rank correlation is how well the method ordered players within a week.', head, rows: rowsOut });
  const findings = [
    ...better.map((b) => `${b.pos}: Sleeper's projection misses by ${r2(b.base)} points on average; the best alternative (${b.best}) misses by ${r2(b.bestMae)} (${b.gain > 0.005 ? r2(b.gain) + ' better' : 'no better'}).`),
  ];
  return { id: 'E1', title: 'How accurate are the numbers the engine ranks on?', tables, findings, fit };
}

// ================= E2 =================
const GAP_BUCKETS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 8], [8, 10], [10, 99]];
function pairStats(rows, val, groupsFilter = () => true) {
  const g = {};
  for (const r of rows) if (groupsFilter(r)) (g[r.season + ':' + r.wk + ':' + (r.grp || r.pos)] ||= []).push(r);
  const byWeek = {};
  for (const [k, list] of Object.entries(g)) {
    const wkKey = k.split(':').slice(0, 2).join(':');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const va = val(a);
        const vb = val(b);
        if (a.actual === b.actual || va === vb) continue;
        const gap = Math.abs(va - vb);
        const hi = va > vb ? a : b;
        const lo = hi === a ? b : a;
        (byWeek[wkKey] ||= []).push({ gap, win: hi.actual > lo.actual ? 1 : 0, margin: hi.actual - lo.actual });
      }
    }
  }
  return byWeek;
}
function bucketTable(byWeek) {
  const out = [];
  for (const [lo, hi] of GAP_BUCKETS) {
    const stat = (rows) => {
      const x = rows.filter((p) => p.gap >= lo && p.gap < hi);
      return x.length ? mean(x.map((p) => p.win)) : NaN;
    };
    const allRows = Object.values(byWeek).flat();
    const x = allRows.filter((p) => p.gap >= lo && p.gap < hi);
    const ci = bootCI(byWeek, stat, 120);
    out.push({ lo, hi, n: x.length, win: stat(allRows), ci, margin: mean(x.map((p) => p.margin)) });
  }
  return out;
}
export function e2(valFn = (r) => r.proj, label = 'Sleeper projection') {
  const all = playerWeeks().filter((r) => r.played);
  const groups = [
    ['RB / WR / TE (same position)', (r) => ['RB', 'WR', 'TE'].includes(r.pos), null],
    ['FLEX (RB vs WR vs TE)', (r) => ['RB', 'WR', 'TE'].includes(r.pos), 'FLEX'],
    ['QB', (r) => r.pos === 'QB', null],
    ['K', (r) => r.pos === 'K', null],
    ['DEF', (r) => r.pos === 'DEF', null],
  ];
  const tables = [];
  const fit = {};
  const findings = [];
  for (const [name, filt, grp] of groups) {
    const rows = [];
    for (const sp of ['train', 'test']) {
      const set = all.filter((r) => r.split === sp && filt(r)).map((r) => (grp ? { ...r, grp } : r));
      const bt = bucketTable(pairStats(set, valFn));
      bt.forEach((b, i) => {
        (rows[i] ||= [`${b.lo}-${b.hi === 99 ? '+' : b.hi}`]).push(pct(b.win), b.n);
        if (sp === 'test') rows[i].push(`${pct(b.ci[0])}-${pct(b.ci[1])}`);
      });
      if (sp === 'train') {
        // smallest gap where the higher-projected player won at least 60% / 67% (training seasons)
        const at = (p) => bt.find((b) => b.win >= p && b.n >= 200)?.lo ?? null;
        fit[name] = { lean: at(0.6), clear: at(0.67), buckets: bt.map((b) => ({ gap: [b.lo, b.hi], win: r3(b.win), n: b.n })) };
      } else fit[name].test = bt.map((b) => ({ gap: [b.lo, b.hi], win: r3(b.win), n: b.n, ci: b.ci.map(r3) }));
    }
    tables.push({ caption: `${name}: how often the player with the higher ${label} outscored the other, by size of the gap.`, head: ['Gap (pts)', 'Win % 2022-24', 'pairs', 'Win % 2025-26', 'pairs', '90% range'], rows });
    const t = fit[name].test;
    const w = (lo) => t.find((b) => b.gap[0] === lo);
    findings.push(`${name}: a 2-3 point edge won ${pct(w(2).win)}% of the time, a 4-5 point edge ${pct(w(4).win)}%, 10+ ${pct(w(10).win)}%.`);
  }
  return { id: 'E2', title: 'Are Clear / Lean / Toss-up honest?', tables, findings, fit };
}

// ================= E3 =================
export function e3() {
  const all = playerWeeks().filter((r) => SKILL.includes(r.pos));
  const res = { health: {}, healthPlayed: {}, implied: {}, impliedBig: {}, matchup: {}, proj: {} };
  const add = (bucket, sp, win) => {
    const b = (bucket[sp] ||= { n: 0, w: 0 });
    b.n++;
    b.w += win;
  };
  const g = {};
  for (const r of all) (g[r.season + ':' + r.wk + ':' + r.pos] ||= []).push(r);
  for (const [k, list] of Object.entries(g)) {
    const [s, w] = k.split(':').map(Number);
    const P = asOf(s, w);
    const S = D.loadSeason(s);
    const results = {};
    for (let wk = Math.max(1, w - 6); wk < w; wk++) if (S.games[wk]) results[wk] = Object.fromEntries(Object.entries(S.games[wk]).map(([t, x]) => [t, x.opp]));
    const snap = (asOf['_snap' + k.slice(0, k.lastIndexOf(':'))] ||= { results, players: P });
    const M = { P: (pid) => ({ pos: P[pid].pos, game: { opp: S.game(P[pid].team, w)?.opp } }), snap };
    const sp = split(s);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (Math.abs(a.proj - b.proj) >= 2) continue;
        const aQ = a.inj === 'Questionable';
        const bQ = b.inj === 'Questionable';
        const clean = (r) => !r.inj || r.inj === 'Questionable';
        // step 1: health (one carries a Questionable tag, the other none)
        if (aQ !== bQ && clean(a) && clean(b) && a.actual !== b.actual) {
          const tagged = aQ ? a : b;
          const other = aQ ? b : a;
          add(res.health, sp, other.actual > tagged.actual ? 1 : 0);
          if (tagged.played && other.played) add(res.healthPlayed, sp, other.actual > tagged.actual ? 1 : 0);
        }
        if (!a.played || !b.played || a.actual === b.actual) continue;
        // baseline: just keep the (slightly) higher projection
        if (a.proj !== b.proj) add(res.proj, sp, (a.proj > b.proj ? a : b).actual > (a.proj > b.proj ? b : a).actual ? 1 : 0);
        // step 3: game environment
        if (a.imp != null && b.imp != null && Math.abs(a.imp - b.imp) >= 0.1) {
          const hi = a.imp > b.imp ? a : b;
          const lo = hi === a ? b : a;
          add(res.implied, sp, hi.actual > lo.actual ? 1 : 0);
          if (Math.abs(a.imp - b.imp) >= 4) add(res.impliedBig, sp, hi.actual > lo.actual ? 1 : 0);
        }
        // step 4: position matchup, the site's own function and its own threshold
        const ma = matchupFor(M, a.id);
        const mb = matchupFor(M, b.id);
        if (ma && mb && ma.of >= 8 && Math.abs(ma.rank - mb.rank) >= ma.of / 4) {
          const soft = ma.rank < mb.rank ? a : b;
          const tough = soft === a ? b : a;
          add(res.matchup, sp, soft.actual > tough.actual ? 1 : 0);
        }
      }
    }
  }
  const line = (name, b) => [name, pct(b.train ? b.train.w / b.train.n : NaN), b.train?.n ?? 0, pct(b.test ? b.test.w / b.test.n : NaN), b.test?.n ?? 0];
  const rows = [
    line('Keep the higher projection (what happens with no tiebreak)', res.proj),
    line('Health: pick the player with no tag over a Questionable one (sat out = 0)', res.health),
    line('Health: same, only when both ended up playing', res.healthPlayed),
    line('Game environment: pick the higher implied team total', res.implied),
    line('Game environment: only when the totals differ by 4+', res.impliedBig),
    line('Position matchup: pick the softer opponent (site rule)', res.matchup),
  ];
  const rate = (b, sp = 'test') => (b[sp] ? b[sp].w / b[sp].n : NaN);
  const findings = [
    `In toss-ups (projections within 2 points), the higher implied team total won ${pct(rate(res.implied))}% (${pct(rate(res.impliedBig))}% when 4+ apart); the softer position matchup won ${pct(rate(res.matchup))}%; the untagged player beat a Questionable one ${pct(rate(res.health))}% of the time counting sit-outs as zero.`,
  ];
  return {
    id: 'E3', title: 'Does each tiebreak step pick the winner?',
    tables: [{ caption: 'Same-position pairs projected within 2 points of each other. 50% = coin flip.', head: ['Tiebreak', 'Win % 2022-24', 'pairs', 'Win % 2025-26', 'pairs'], rows }],
    findings,
    fit: Object.fromEntries(Object.entries(res).map(([k, b]) => [k, { train: r3(rate(b, 'train')), test: r3(rate(b, 'test')), nTest: b.test?.n ?? 0 }])),
  };
}

// ================= E4 =================
const INJ_GROUP = [[/hamstring/i, 'Hamstring'], [/knee/i, 'Knee'], [/ankle/i, 'Ankle'], [/concussion/i, 'Concussion'], [/shoulder/i, 'Shoulder'], [/calf|achilles/i, 'Calf/Achilles'], [/groin|hip|quad|thigh/i, 'Groin/hip/quad'], [/foot|toe/i, 'Foot/toe'], [/back|rib|chest|oblique|abdom/i, 'Back/ribs/core'], [/illness|rest|personal|not injury/i, 'Illness/rest']];
const injGroup = (t) => (t ? INJ_GROUP.find(([re]) => re.test(t))?.[1] || 'Other' : 'Unknown');
export function e4() {
  const rows = [];
  eachWeek(D.SEASONS, 3, (s, w, S) => {
    const P = asOf(s, w);
    const act = D.actual(s, w);
    for (const [pid, rep] of S.inj[w] || []) {
      if (!['Questionable', 'Doubtful', 'Out'].includes(rep.status)) continue;
      const p = P[pid];
      if (!p || p.hist.length < 2 || S.isBye(p.team, w)) continue;
      const base = ppg(p);
      if (base < 6) continue; // fantasy-relevant only
      const a = act.get(pid);
      const snpBase = mean(p.hist.slice(-3).map((h) => h.snp).filter((x) => x != null));
      rows.push({ season: s, split: split(s), status: rep.status, pos: p.pos, prac: rep.prac || '?', grp: injGroup(rep.injury), played: a?.played ? 1 : 0, pts: a?.played ? a.pts : 0, base, hasProj: p.proj ? 1 : 0, proj: p.proj?.pts ?? null, snp: a?.played ? a.snp : null, snpBase });
    }
  }, 18);
  const tab = (list, key, labels) => {
    const g = {};
    for (const r of list) (g[key(r)] ||= []).push(r);
    return Object.entries(g)
      .filter(([, x]) => x.length >= 25)
      .sort((a, b) => (labels ? labels.indexOf(a[0]) - labels.indexOf(b[0]) : b[1].length - a[1].length))
      .map(([k, x]) => {
        const pl = x.filter((r) => r.played);
        const tr = x.filter((r) => r.split === 'train');
        const te = x.filter((r) => r.split === 'test');
        const prod = pl.length ? sum(pl.map((r) => r.pts)) / sum(pl.map((r) => r.base)) : NaN;
        const play = mean(x.map((r) => r.played));
        return { k, n: x.length, play, playTrain: mean(tr.map((r) => r.played)), playTest: mean(te.map((r) => r.played)), prod, ev: play * prod, snap: mean(pl.filter((r) => r.snp != null && r.snpBase).map((r) => r.snp / r.snpBase)) };
      });
  };
  const fmt = (t) => t.map((x) => [x.k, x.n, pct(x.play), pct(x.playTrain), pct(x.playTest), r2(x.prod), r2(x.snap), r2(x.ev)]);
  const head = (first) => [first, 'n', 'Played %', '2022-24', '2025-26', 'Points vs own average when playing', 'Snap share vs usual', 'Expected share of normal output'];
  const q = rows.filter((r) => r.status === 'Questionable');
  const byStatus = tab(rows, (r) => r.status, ['Questionable', 'Doubtful', 'Out']);
  const byPrac = tab(q, (r) => r.prac, ['FP', 'LP', 'DNP', '?']);
  const byPos = tab(q, (r) => r.pos, SKILL);
  const byGrp = tab(q, (r) => r.grp);
  const byPosPrac = tab(q, (r) => `${r.pos} ${r.prac}`);
  // does the stored projection already price the tag in?
  const qPlayed = q.filter((r) => r.played && r.proj != null);
  const projBias = mean(qPlayed.map((r) => r.pts - r.proj));
  const sat = q.filter((r) => !r.played);
  const keptProj = mean(sat.map((r) => r.hasProj));
  const sitProj = mean(sat.filter((r) => r.proj != null).map((r) => r.proj));
  const fit = {
    status: Object.fromEntries(byStatus.map((x) => [x.k, { play: r3(x.play), prod: r3(x.prod), ev: r3(x.ev), n: x.n }])),
    questionableByPractice: Object.fromEntries(byPrac.map((x) => [x.k, { play: r3(x.play), prod: r3(x.prod), ev: r3(x.ev), n: x.n }])),
    questionableByInjury: Object.fromEntries(byGrp.map((x) => [x.k, { play: r3(x.play), prod: r3(x.prod), n: x.n }])),
    questionableByPosition: Object.fromEntries(byPos.map((x) => [x.k, { play: r3(x.play), prod: r3(x.prod), n: x.n }])),
    projBiasWhenPlayed: r2(projBias),
    projBiasTrain: r2(mean(qPlayed.filter((r) => r.split === 'train').map((r) => r.pts - r.proj))),
    projBiasTest: r2(mean(qPlayed.filter((r) => r.split === 'test').map((r) => r.pts - r.proj))),
    projRatioTest: r3(sum(qPlayed.filter((r) => r.split === 'test').map((r) => r.pts)) / sum(qPlayed.filter((r) => r.split === 'test').map((r) => r.proj))),
    projRatioTrain: r3(sum(qPlayed.filter((r) => r.split === 'train').map((r) => r.pts)) / sum(qPlayed.filter((r) => r.split === 'train').map((r) => r.proj))),
    satOutStillProjected: r3(keptProj),
    satOutAvgProjection: r2(sitProj),
  };
  const Q = fit.status.Questionable;
  const findings = [
    `Fantasy-relevant Questionable players played ${pct(Q.play)}% of the time and scored ${pct(Q.prod)}% of their own average when they did, so a Questionable tag is worth about ${pct(Q.ev)}% of a normal week. Doubtful: played ${pct(fit.status.Doubtful?.play)}%.`,
    `Practice status moves it a lot: ${byPrac.map((x) => `${x.k} ${pct(x.play)}% played`).join(', ')}.`,
    keptProj > 0.05 ? `${pct(keptProj)}% of Questionable players who then sat out still carried a projection (average ${r2(sitProj)} points).` : `None of the Questionable players who sat out still has a projection in Sleeper's stored numbers: the archive keeps the final pre-kickoff version, after inactives were announced. Any replay that uses it already "knows" who sat.`,
    `When Questionable players did play, they scored ${r2(projBias)} points vs their projection on average (${fit.projBiasTrain} in 2022-24, ${fit.projBiasTest} in 2025-26; ${pct(fit.projRatioTrain)}% and ${pct(fit.projRatioTest)}% of the projection).`,
  ];
  return {
    id: 'E4', title: 'What does an injury tag really mean?',
    tables: [
      { caption: 'Official game-status report, skill players averaging 6+ points, 2022-2026.', head: head('Tag'), rows: fmt(byStatus) },
      { caption: 'Questionable only, by final practice status of the week.', head: head('Last practice'), rows: fmt(byPrac) },
      { caption: 'Questionable only, by position.', head: head('Position'), rows: fmt(byPos) },
      { caption: 'Questionable only, by injury.', head: head('Injury'), rows: fmt(byGrp) },
      { caption: 'Questionable only, position and practice status together.', head: head('Position + practice'), rows: fmt(byPosPrac) },
    ],
    findings, fit,
  };
}

// ================= E5 =================
// Players drift back toward their average whether or not anything happened (a receiver picked
// because he saw 9 targets a game lately will usually see fewer next week). So every estimate is
// scored against an expected baseline fitted on teams with no news, not against the raw last-3.
const DEAD = { tgt: 0.5, att: 0.5, pts: 1.5 };
export function e5() {
  const effects = [];
  const controls = { tgt: [], att: [], pts: [] };
  const fitRows = { wr: [], rb: [], qbTop: [], qbRest: [] };
  const l3 = (p, k) => mean(p.hist.slice(-3).map((h) => h[k] || 0));
  const sa = (p, k) => mean(p.hist.map((h) => h[k] || 0));
  const obs = (p, full, w) => {
    const h = full[p.id]?.hist.find((x) => x.w === w);
    if (!h || p.hist.length < 2) return null;
    const o = {};
    for (const k of ['tgt', 'att', 'pts']) o[k] = { l3: l3(p, k), sa: sa(p, k), act: h[k] || 0 };
    return o;
  };
  eachWeek(D.SEASONS, 4, (s, w, S) => {
    const P = asOf(s, w);
    const full = asOf(s, w + 1); // includes week w, used only to score
    const kick = Math.min(...Object.values(S.games[w] || {}).map((x) => new Date(x.kick).getTime()).filter(Number.isFinite));
    const r = buildRipple(P, { W: w, now: kick, isBye: S.isBye });
    const touched = new Set(r.events.map((e) => e.team));
    for (const e of r.effects) {
      const q = P[e.pid];
      const o = q && obs(q, full, w);
      if (!o) continue;
      const src = P[e.src];
      const metric = e.pct != null || e.starts ? 'pts' : Math.abs(e.att || 0) > Math.abs(e.tgt || 0) ? 'att' : 'tgt';
      const est = e.starts ? null : metric === 'pts' ? e.pct * o.pts.l3 : e[metric] || 0;
      const site = scoreRipple(e, full[e.pid], w);
      effects.push({ season: s, wk: w, split: split(s), kind: e.kind, conf: e.conf, observed: !!e.observed, srcPos: src?.pos || 'TEAM', srcUse: src ? usage(src).tgt + usage(src).att : 0, proxy: !!src?.injProxy, dir: e.dir, metric, est, o: o[metric], site: site?.result || null, starts: !!e.starts });
    }
    for (const p of Object.values(P)) {
      if (!['RB', 'WR', 'TE'].includes(p.pos) || touched.has(p.team) || p.inj || !p.proj) continue;
      const o = obs(p, full, w);
      if (!o) continue;
      if (o.tgt.l3 >= 2) controls.tgt.push({ split: split(s), ...o.tgt });
      if (p.pos === 'RB' && o.att.l3 >= 3) controls.att.push({ split: split(s), ...o.att });
      if (o.tgt.l3 >= 2 || o.att.l3 >= 5) controls.pts.push({ split: split(s), ...o.pts });
    }
    // raw material for refitting the share constants
    for (const ev of r.events.filter((e) => e.kind === 'out')) {
      const src = P[ev.src];
      if (!src) continue;
      const mates = Object.values(P).filter((q) => q.team === src.team && q.id !== src.id && !(q.inj && ['Out', 'Doubtful', 'IR'].includes(q.inj)));
      const us = usage(src);
      if (src.pos === 'WR' || src.pos === 'TE') {
        const catchers = mates.filter((q) => ['WR', 'TE', 'RB'].includes(q.pos));
        const tot = sum(catchers.map((q) => usage(q).tgt));
        const next = mates.filter((q) => q.pos === src.pos).sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99))[0];
        for (const q of catchers) {
          const o = obs(q, full, w);
          if (!o || !tot) continue;
          fitRows.wr.push({ split: split(s), x: [us.tgt * (usage(q).tgt / tot), q === next ? us.tgt : 0, q.pos === src.pos ? us.tgt * (usage(q).tgt / tot) : 0], o: o.tgt });
        }
      } else if (src.pos === 'RB') {
        const rbs = mates.filter((q) => q.pos === 'RB').sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99));
        const tot = sum(rbs.map((q) => usage(q).att));
        rbs.forEach((q, i) => {
          const o = obs(q, full, w);
          if (!o) return;
          fitRows.rb.push({ split: split(s), x: [us.att * (tot ? usage(q).att / tot : 0), i === 0 ? us.att : 0], o: o.att });
        });
      } else if (src.pos === 'QB') {
        const catchers = mates.filter((q) => ['WR', 'TE', 'RB'].includes(q.pos) && usage(q).tgt >= 2);
        const top = catchers.slice().sort((a, b) => usage(b).tgt - usage(a).tgt)[0];
        for (const q of catchers) {
          const o = obs(q, full, w);
          if (!o || !(o.pts.l3 > 3)) continue;
          (q === top ? fitRows.qbTop : fitRows.qbRest).push({ split: split(s), o: o.pts });
        }
      }
    }
  });
  // expected level with no news: fitted on quiet teams in the training seasons
  const base = {};
  for (const k of ['tgt', 'att', 'pts']) base[k] = ols(controls[k].filter((r) => r.split === 'train').map((r) => [r.l3, r.sa]), controls[k].filter((r) => r.split === 'train').map((r) => r.act), 1e-5);
  const adj = (k, o) => o.act - predict(base[k], [o.l3, o.sa]);
  const chance = {};
  for (const k of ['tgt', 'att', 'pts']) {
    const a = controls[k].map((r) => adj(k, r));
    const rawD = controls[k].map((r) => r.act - r.l3);
    chance[k] = { n: a.length, up: mean(a.map((x) => (x > DEAD[k] ? 1 : 0))), down: mean(a.map((x) => (x < -DEAD[k] ? 1 : 0))), rawUp: mean(rawD.map((x) => (x > DEAD[k] ? 1 : 0))), rawDown: mean(rawD.map((x) => (x < -DEAD[k] ? 1 : 0))) };
  }
  for (const e of effects) {
    e.adj = adj(e.metric, e.o);
    const sgn = e.dir === 'up' ? 1 : -1;
    e.result = sgn * e.adj > DEAD[e.metric] ? 'hit' : sgn * e.adj < -DEAD[e.metric] ? 'miss' : 'flat';
    e.chance = e.dir === 'up' ? chance[e.metric].up : chance[e.metric].down;
  }
  const grp = (list, key) => {
    const g = {};
    for (const p of list) (g[key(p)] ||= []).push(p);
    return g;
  };
  const stat = (x) => {
    const withEst = x.filter((p) => p.est != null);
    return {
      n: x.length,
      hit: mean(x.map((p) => (p.result === 'hit' ? 1 : 0))),
      miss: mean(x.map((p) => (p.result === 'miss' ? 1 : 0))),
      chance: mean(x.map((p) => p.chance)),
      siteHit: mean(x.filter((p) => p.site).map((p) => (p.site === 'hit' ? 1 : 0))),
      mae: withEst.length ? mean(withEst.map((p) => Math.abs(p.adj - p.est))) : NaN,
      maeZero: withEst.length ? mean(withEst.map((p) => Math.abs(p.adj))) : NaN,
      avgEst: withEst.length ? mean(withEst.map((p) => p.est)) : NaN,
      avgAct: withEst.length ? mean(withEst.map((p) => p.adj)) : NaN,
    };
  };
  const row = (k, x) => {
    const a = stat(x);
    const te = stat(x.filter((p) => p.split === 'test'));
    return [k, a.n, pct(a.hit), pct(a.miss), pct(a.chance), pct(te.hit), te.n, r2(a.avgEst), r2(a.avgAct), r2(a.mae), r2(a.maeZero)];
  };
  const head = (f) => [f, 'n', 'Right direction %', 'Wrong %', 'Chance %', 'Right % 2025-26', 'n', 'Avg estimate', 'Avg actual change', 'Avg miss of estimate', 'Avg miss of "no change"'];
  const order = (o) => (a, b) => o.indexOf(a[0]) - o.indexOf(b[0]);
  const byKind = Object.entries(grp(effects, (p) => `${p.kind} ${p.srcPos} → ${p.starts ? 'backup QB starts' : p.metric === 'pts' ? 'pass catchers (points)' : p.metric === 'att' ? 'carries' : 'targets'}`)).filter(([, x]) => x.length >= 20).sort((a, b) => b[1].length - a[1].length);
  const byConf = Object.entries(grp(effects, (p) => p.conf)).sort(order(['clear', 'lean', 'toss']));
  const outs = effects.filter((p) => p.kind === 'out' && !p.starts);
  const byObs = Object.entries(grp(outs, (p) => (p.observed ? 'Seen this season (with/without split)' : 'Share rule (heuristic)')));
  const byProxy = Object.entries(grp(outs, (p) => (p.proxy ? 'Not on report (IR / early rule-out)' : 'Official Out / Doubtful')));
  const bySize = Object.entries(grp(outs.filter((p) => p.metric !== 'pts'), (p) => (Math.abs(p.est) >= 3 ? 'Estimate 3+ a game' : Math.abs(p.est) >= 1.5 ? 'Estimate 1.5-3' : 'Estimate under 1.5'))).sort(order(['Estimate 3+ a game', 'Estimate 1.5-3', 'Estimate under 1.5']));
  const bySrc = Object.entries(grp(outs.filter((p) => p.srcPos !== 'QB'), (p) => (p.srcUse >= 14 ? 'Missing player had 14+ touches/targets a game' : p.srcUse >= 8 ? '8-14' : 'under 8'))).sort(order(['Missing player had 14+ touches/targets a game', '8-14', 'under 8']));

  // refit the share constants on baseline-adjusted changes
  const fit = { baseline: Object.fromEntries(Object.entries(base).map(([k, b]) => [k, b.map(r3)])), chance: Object.fromEntries(Object.entries(chance).map(([k, c]) => [k, { up: r3(c.up), down: r3(c.down), rawUp: r3(c.rawUp), rawDown: r3(c.rawDown), n: c.n }])) };
  const refit = (rows, k, engine, cols) => {
    const y = (r) => adj(k, r.o);
    const tr = rows.filter((r) => r.split === 'train');
    const te = rows.filter((r) => r.split === 'test');
    if (tr.length < 50 || te.length < 20) return null;
    const X = (r) => cols.map((c) => r.x[c]);
    const beta = ols(tr.map(X), tr.map(y), 1e-5);
    const m = (set, f) => mean(set.map((r) => Math.abs(y(r) - f(r))));
    return { coef: beta.map(r3), n: tr.length, nTest: te.length, testMaeFitted: r2(m(te, (r) => predict(beta, X(r)))), testMaeEngine: r2(m(te, engine)), testMaeZero: r2(m(te, () => 0)) };
  };
  fit.wr = refit(fitRows.wr, 'tgt', (r) => 0.75 * r.x[0] + 0.25 * r.x[1], [0, 1]);
  fit.wrSamePos = refit(fitRows.wr, 'tgt', (r) => 0.75 * r.x[0] + 0.25 * r.x[1], [0, 1, 2]);
  fit.rb = refit(fitRows.rb, 'att', (r) => (r.x[0] + r.x[1]) / 2, [0, 1]);
  const ratio = (rows) => ({ n: rows.length, ratio: r3(sum(rows.map((r) => r.o.act)) / sum(rows.map((r) => predict(base.pts, [r.o.l3, r.o.sa])))) });
  fit.qb = { top: ratio(fitRows.qbTop), rest: ratio(fitRows.qbRest), topTest: ratio(fitRows.qbTop.filter((r) => r.split === 'test')), restTest: ratio(fitRows.qbRest.filter((r) => r.split === 'test')) };
  const pack = (list) => Object.fromEntries(list.map(([k, x]) => { const a = stat(x); const te = stat(x.filter((p) => p.split === 'test')); return [k, { n: a.n, hit: r3(a.hit), miss: r3(a.miss), chance: r3(a.chance), hitTest: r3(te.hit), nTest: te.n, mae: r2(a.mae), maeZero: r2(a.maeZero), avgEst: r2(a.avgEst), avgAct: r2(a.avgAct) }]; }));
  fit.byKind = pack(byKind);
  fit.byConf = pack(byConf);
  fit.byBasis = pack(byObs);
  fit.bySize = pack(bySize);

  const all = stat(effects);
  const k = (name) => byKind.find(([x]) => x.startsWith(name));
  const kk = (name) => { const e = k(name); return e ? stat(e[1]) : null; };
  const f = (a) => (a ? `right ${pct(a.hit)}%, wrong ${pct(a.miss)}%, chance ${pct(a.chance)}%` : 'too few cases');
  const findings = [
    `${effects.length} teammate estimates scored against what the same players would have been expected to do with no news. Overall: right direction ${pct(all.hit)}%, wrong ${pct(all.miss)}%; pure chance would be ${pct(all.chance)}%.`,
    `Running back out → carries for the remaining backs: ${f(kk('out RB → carries'))}. This is the one strong rule.`,
    `Receiver or tight end out → targets for teammates: WR ${f(kk('out WR → targets'))}; TE ${f(kk('out TE → targets'))}. The average estimate was +${r2(kk('out WR → targets')?.avgEst)} targets; the average real change was ${r2(kk('out WR → targets')?.avgAct)}.`,
    `Quarterback out → pass catchers down: ${f(kk('out QB → pass'))}. Top target scored ${pct(fit.qb.top.ratio)}% of his expected points (site assumes 90%), the others ${pct(fit.qb.rest.ratio)}% (site assumes 80%).`,
    `Confidence labels: ${byConf.map(([c, x]) => `${c} ${pct(stat(x).hit)}% right (n=${x.length})`).join(', ')}. ${stat(byConf[0][1]).hit < stat(byConf[1][1]).hit ? 'The label the site calls its surest is not its most accurate.' : ''}`,
    `"Seen this season" evidence vs the share rule: ${byObs.map(([c, x]) => `${c}: ${pct(stat(x).hit)}% right, average miss ${r2(stat(x).mae)}`).join('; ')}.`,
    fit.wr ? `Refit, WR/TE out: a teammate gains ${fit.wr.coef[1]} of his proportional share of the vacated targets, plus ${fit.wr.coef[2]} of all of them if he is the next man up (site: 0.75 and 0.25). On 2025-26 the refit misses by ${fit.wr.testMaeFitted} targets vs ${fit.wr.testMaeEngine} for the site rule and ${fit.wr.testMaeZero} for "no change".` : '',
    fit.rb ? `Refit, RB out: remaining backs gain ${fit.rb.coef[1]} of their proportional share of the vacated carries, and the lead remaining back an extra ${fit.rb.coef[2]} of all of them. Refit misses by ${fit.rb.testMaeFitted} carries vs ${fit.rb.testMaeEngine} (site rule) and ${fit.rb.testMaeZero} ("no change").` : '',
  ].filter(Boolean);
  return {
    id: 'E5', title: 'Were the teammate (ripple) estimates right?',
    tables: [
      { caption: 'By rule. "Right" means the player moved the predicted way by more than half a target or carry (1.5 points for percentage estimates) relative to his expected level with no news. "Chance" is how often a similar player on a quiet team moved that way anyway.', head: head('Rule'), rows: byKind.map(([c, x]) => row(c, x)) },
      { caption: 'By the confidence label the site shows.', head: head('Label'), rows: byConf.map(([c, x]) => row(c, x)) },
      { caption: 'Out events: this-season with/without evidence vs the share rule.', head: head('Basis'), rows: byObs.map(([c, x]) => row(c, x)) },
      { caption: 'Out events: by size of the estimate.', head: head('Size'), rows: bySize.map(([c, x]) => row(c, x)) },
      { caption: 'Out events (non-QB): by how much work the missing player had.', head: head('Missing player'), rows: bySrc.map(([c, x]) => row(c, x)) },
      { caption: 'Out events: how the absence was known.', head: head('Source'), rows: byProxy.map(([c, x]) => row(c, x)) },
      { caption: 'Why a baseline is needed: similar players on teams with no news, change vs their own last three games (raw) and vs the fitted expectation (adjusted).', head: ['Measure', 'n', 'Raw: up %', 'Raw: down %', 'Adjusted: up %', 'Adjusted: down %'], rows: Object.entries(chance).map(([c, x]) => [c === 'tgt' ? 'Targets' : c === 'att' ? 'Carries' : 'Points', x.n, pct(x.rawUp), pct(x.rawDown), pct(x.up), pct(x.down)]) },
    ],
    findings, fit,
  };
}

// ================= E6 =================
// Points allowed by each defence to each position, several ways, known before week w.
function defenseTables(s, w, P, window) {
  const raw = {};
  const adj = {};
  const games = {};
  const S = D.loadSeason(s);
  const list = Object.values(P).filter((p) => SKILL.includes(p.pos));
  for (const p of list) {
    const n = p.hist.length;
    const tot = sum(p.hist.map((h) => h.pts));
    for (const h of p.hist) {
      if (!h.opp || h.w < w - window) continue;
      const k = h.opp + '|' + p.pos;
      (raw[k] ||= {})[h.w] = (raw[k][h.w] || 0) + h.pts;
      if (n >= 3 && tot / n >= 4) {
        const loo = (tot - h.pts) / (n - 1);
        (adj[k] ||= {})[h.w] = (adj[k][h.w] || 0) + (h.pts - loo);
      }
    }
  }
  for (let wk = Math.max(1, w - window); wk < w; wk++) for (const t of Object.keys(S.games[wk] || {})) games[t] = (games[t] || 0) + 1;
  const out = {};
  for (const pos of SKILL) {
    const teams = Object.keys(games).filter((t) => games[t] >= 2);
    const val = (tbl, t) => sum(Object.values(tbl[t + '|' + pos] || {})) / games[t];
    for (const [name, tbl, shrinkK] of [['raw', raw, 0], ['adj', adj, 0], ['adjShrunk', adj, 4]]) {
      const v = teams.map((t) => val(tbl, t) * (shrinkK ? games[t] / (games[t] + shrinkK) : 1));
      const m = mean(v);
      const sdv = D.sd(v) || 1;
      teams.forEach((t, i) => (((out[name] ||= {})[pos] ||= {})[t] = { z: (v[i] - m) / sdv, v: v[i] }));
    }
  }
  return out;
}
export function e6() {
  const rows = playerWeeks().filter((r) => r.played && SKILL.includes(r.pos) && r.gp >= 3 && r.opp && r.wk >= 5);
  const variants = [['Raw points allowed, last 6 weeks (site today)', 'raw', 6], ['Raw, season to date', 'raw', 99], ['Schedule-adjusted, last 6 weeks', 'adj', 6], ['Schedule-adjusted, season to date', 'adj', 99], ['Schedule-adjusted + shrunk, season to date', 'adjShrunk', 99]];
  const cache = {};
  const z = (r, name, window) => {
    const k = `${r.season}:${r.wk}:${window}`;
    const t = (cache[k] ||= defenseTables(r.season, r.wk, asOf(r.season, r.wk), window));
    return t[name]?.[r.pos]?.[r.opp]?.z ?? null;
  };
  const out = [];
  const fit = {};
  for (const [label, name, window] of variants) {
    for (const pos of [...SKILL, 'ALL']) {
      const set = rows.filter((r) => pos === 'ALL' || r.pos === pos).map((r) => ({ ...r, z: z(r, name, window) })).filter((r) => r.z != null);
      const m = (sp, f) => {
        const x = set.filter((r) => r.split === sp);
        return { corr: pearson(x.map((r) => r.z), x.map(f)), tier: mean(x.filter((r) => r.z >= 0.75).map(f)) - mean(x.filter((r) => r.z <= -0.75).map(f)), slope: ols(x.map((r) => [r.z]), x.map(f))[1], n: x.length };
      };
      const vsProjTr = m('train', (r) => r.actual - r.proj);
      const vsProj = m('test', (r) => r.actual - r.proj);
      const vsAvg = m('test', (r) => r.actual - r.ppg);
      out.push([label, pos, r3(vsAvg.corr), r2(vsAvg.tier), r3(vsProjTr.corr), r3(vsProj.corr), r2(vsProj.tier), vsProj.n]);
      (fit[label] ||= {})[pos] = { vsAvgCorr: r3(vsAvg.corr), vsAvgTier: r2(vsAvg.tier), vsAvgSlope: r3(vsAvg.slope), vsProjCorrTrain: r3(vsProjTr.corr), vsProjCorr: r3(vsProj.corr), vsProjTier: r2(vsProj.tier), vsProjSlope: r3(vsProj.slope), slopeTrain: r3(m('train', (r) => r.actual - r.ppg).slope), n: vsProj.n };
    }
  }
  const today = fit[variants[0][0]];
  const bestLabel = variants.map((v) => v[0]).sort((a, b) => fit[b].ALL.vsAvgCorr - fit[a].ALL.vsAvgCorr)[0];
  const findings = [
    `Against a player's own average, the site's matchup number has a correlation of ${today.ALL.vsAvgCorr} with over/under-performance (soft vs tough third: ${today.ALL.vsAvgTier} points). Best variant: "${bestLabel}" at ${fit[bestLabel].ALL.vsAvgCorr} (${fit[bestLabel].ALL.vsAvgTier} points).`,
    `Against Sleeper's projection the same number is worth ${today.ALL.vsProjCorr} correlation (${today.ALL.vsProjTier} points soft vs tough): ${Math.abs(today.ALL.vsProjTier) < 0.5 ? 'the projection already prices the matchup in, so using it again as a tiebreak double-counts.' : 'some signal is left after the projection.'}`,
    `By position (best variant, vs own average): ${SKILL.map((p) => `${p} ${fit[bestLabel][p].vsAvgCorr}`).join(', ')}.`,
  ];
  return {
    id: 'E6', title: 'Does matchup strength predict anything?',
    tables: [{ caption: 'How a player did relative to (a) his own season average and (b) Sleeper\'s projection, against the opponent\'s rating. Tier gap = soft third minus tough third, in points. Hold-out 2025-26 unless marked.', head: ['Matchup measure', 'Pos', 'Corr. vs own average', 'Tier gap vs own average', 'Corr. vs projection 2022-24', 'Corr. vs projection', 'Tier gap vs projection', 'n'], rows: out }],
    findings, fit, best: bestLabel,
  };
}

// ================= E10 =================
export function e10() {
  const rows = playerWeeks().filter((r) => r.played);
  // team level: implied total vs skill-position fantasy output
  const tm = [];
  eachWeek(D.SEASONS, 1, (s, w, S) => {
    const by = {};
    for (const r of S.weeks[w].values()) if (r.played && SKILL.includes(r.pos)) by[r.team] = (by[r.team] || 0) + r.pts;
    for (const [t, pts] of Object.entries(by)) {
      const g = S.game(t, w);
      if (g?.imp != null) tm.push({ imp: g.imp, pts });
    }
  }, 18);
  const teamCorr = pearson(tm.map((x) => x.imp), tm.map((x) => x.pts));
  const slope = ols(tm.map((x) => [x.imp]), tm.map((x) => x.pts))[1];
  const sk = rows.filter((r) => SKILL.includes(r.pos) && r.imp != null);
  const afterProj = pearson(sk.map((r) => r.imp), sk.map((r) => r.actual - r.proj));
  const afterProjTier = mean(sk.filter((r) => r.imp >= 26).map((r) => r.actual - r.proj)) - mean(sk.filter((r) => r.imp <= 19).map((r) => r.actual - r.proj));
  const afterAvg = pearson(sk.filter((r) => r.gp >= 3).map((r) => r.imp), sk.filter((r) => r.gp >= 3).map((r) => r.actual - r.ppg));
  const wind = [];
  for (const pos of ['QB', 'WR', 'TE', 'RB', 'K']) {
    const x = rows.filter((r) => r.pos === pos && r.wind != null && (r.roof === 'outdoors' || r.roof === 'open'));
    const hi = x.filter((r) => r.wind >= 15);
    const lo = x.filter((r) => r.wind < 10);
    wind.push([pos, r2(mean(lo.map((r) => r.actual - r.proj))), lo.length, r2(mean(hi.map((r) => r.actual - r.proj))), hi.length, r2(mean(hi.map((r) => r.actual - r.proj)) - mean(lo.map((r) => r.actual - r.proj)))]);
  }
  const fit = { teamCorr: r3(teamCorr), ptsPerImpliedPoint: r2(slope), afterProjCorr: r3(afterProj), afterProjTier: r2(afterProjTier), afterAvgCorr: r3(afterAvg), wind: Object.fromEntries(wind.map((w) => [w[0], { calm: w[1], windy: w[3], diff: w[5], nWindy: w[4] }])) };
  return {
    id: 'E10', title: 'Game environment: betting lines and wind',
    tables: [{ caption: 'Outdoor games: actual minus projected points, calm (under 10 mph) vs windy (15+ mph).', head: ['Position', 'Calm: actual - projection', 'n', 'Windy: actual - projection', 'n', 'Difference'], rows: wind }],
    findings: [
      `A team's implied total explains its skill-position fantasy output with correlation ${r3(teamCorr)} (each implied point is worth about ${r2(slope)} team fantasy points).`,
      `After Sleeper's projection, the implied total adds ${r3(afterProj)} correlation (high-total vs low-total teams: ${r2(afterProjTier)} points per player); against a player's own average it adds ${r3(afterAvg)}.`,
      `Wind 15+ mph outdoors vs calm, relative to projection: ${wind.map((w) => `${w[0]} ${w[5]}`).join(', ')} points.`,
    ],
    fit,
  };
}

// ================= E16 =================
// Floor / ceiling. The site showed the middle half of a player's last six games. Is the actual
// score inside that range about half the time, and does a range built from the projection plus
// typical misses do better? Also: does the "favoured → higher floor, underdog → higher ceiling"
// tiebreak beat simply keeping the higher projection?
const PROJ_BANDS = [0, 5, 8, 11, 14, 18, 99];
const band = (v) => PROJ_BANDS.findIndex((b, i) => v >= b && v < PROJ_BANDS[i + 1]);
function quantile(a, q) {
  const s = a.slice().sort((x, y) => x - y);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}
export function e16() {
  const rows = [];
  eachWeek(D.SEASONS, 4, (s, w) => {
    const P = asOf(s, w);
    const act = D.actual(s, w);
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
      for (const p of D.relevant(P, pos)) {
        const a = act.get(p.id);
        if (!a?.played) continue;
        const recent = p.hist.slice(-6).map((h) => h.pts);
        rows.push({ season: s, wk: w, split: split(s), pos, proj: p.proj.pts, actual: a.pts, q25: recent.length >= 3 ? quantile(recent, 0.25) : null, q75: recent.length >= 3 ? quantile(recent, 0.75) : null, gp: recent.length });
      }
    }
  });
  // residual quantiles of actual / projection, by position and projection band (training seasons)
  const ratio = {};
  for (const r of rows.filter((x) => x.split === 'train' && x.proj > 0)) ((ratio[r.pos] ||= {})[band(r.proj)] ||= []).push(r.actual / r.proj);
  const fit = { bands: PROJ_BANDS, ratio: {} };
  for (const pos of Object.keys(ratio)) {
    fit.ratio[pos] = {};
    for (const [b, list] of Object.entries(ratio[pos])) if (list.length >= 40) fit.ratio[pos][b] = [r3(quantile(list, 0.25)), r3(quantile(list, 0.75)), list.length];
  }
  const modelRange = (r) => {
    const t = fit.ratio[r.pos];
    if (!t) return null;
    let b = band(r.proj);
    while (b >= 0 && !t[b]) b--;
    if (b < 0) return null;
    return [r.proj * t[b][0], r.proj * t[b][1]];
  };
  const cover = (set, f) => {
    const x = set.map((r) => ({ r, rg: f(r) })).filter((z) => z.rg);
    return { inside: mean(x.map((z) => (z.r.actual >= z.rg[0] && z.r.actual <= z.rg[1] ? 1 : 0))), below: mean(x.map((z) => (z.r.actual < z.rg[0] ? 1 : 0))), width: mean(x.map((z) => z.rg[1] - z.rg[0])), n: x.length };
  };
  const te = rows.filter((r) => r.split === 'test' && r.gp >= 3);
  const out = [];
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'ALL']) {
    const set = te.filter((r) => pos === 'ALL' || r.pos === pos);
    const a = cover(set, (r) => [r.q25, r.q75]);
    const b = cover(set, modelRange);
    out.push([pos, pct(a.inside), pct(a.below), r1(a.width), pct(b.inside), pct(b.below), r1(b.width), set.length]);
    fit[pos] = { recentInside: r3(a.inside), modelInside: r3(b.inside), recentBelow: r3(a.below), modelBelow: r3(b.below) };
  }
  // posture tiebreak: among same-position pairs within 2 points, does the higher recent floor
  // finish higher more often (what a favourite wants), and the higher recent ceiling beat the
  // other side's ceiling (what an underdog wants)?
  const g = {};
  for (const r of te.filter((x) => ['RB', 'WR', 'TE'].includes(x.pos))) (g[r.season + ':' + r.wk + ':' + r.pos] ||= []).push(r);
  const res = { floorPick: { n: 0, w: 0 }, ceilPick: { n: 0, w: 0 }, projPick: { n: 0, w: 0 }, ceilBoom: { n: 0, w: 0 }, projBoom: { n: 0, w: 0 }, floorSafe: { n: 0, w: 0 }, projSafe: { n: 0, w: 0 } };
  const add = (k, win) => ((res[k].n += 1), (res[k].w += win));
  for (const list of Object.values(g)) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (Math.abs(a.proj - b.proj) >= 2 || a.actual === b.actual) continue;
      const hiProj = a.proj >= b.proj ? a : b;
      const loProj = hiProj === a ? b : a;
      add('projPick', hiProj.actual > loProj.actual ? 1 : 0);
      if (Math.abs(a.q25 - b.q25) > 0.5) {
        const f = a.q25 > b.q25 ? a : b;
        add('floorPick', f.actual > (f === a ? b : a).actual ? 1 : 0);
        // a favourite cares about not busting: below 70% of projection
        add('floorSafe', f.actual >= 0.7 * f.proj ? 1 : 0);
        add('projSafe', hiProj.actual >= 0.7 * hiProj.proj ? 1 : 0);
      }
      if (Math.abs(a.q75 - b.q75) > 0.5) {
        const c = a.q75 > b.q75 ? a : b;
        add('ceilPick', c.actual > (c === a ? b : a).actual ? 1 : 0);
        // an underdog needs a big week: 140% of projection or more
        add('ceilBoom', c.actual >= 1.4 * c.proj ? 1 : 0);
        add('projBoom', hiProj.actual >= 1.4 * hiProj.proj ? 1 : 0);
      }
    }
  }
  const rate = (k) => (res[k].n ? res[k].w / res[k].n : NaN);
  fit.posture = Object.fromEntries(Object.keys(res).map((k) => [k, { rate: r3(rate(k)), n: res[k].n }]));
  const better = fit.ALL.modelInside != null && Math.abs(fit.ALL.modelInside - 0.5) < Math.abs(fit.ALL.recentInside - 0.5);
  fit.useModel = better;
  fit.keepPosture = rate('floorSafe') > rate('projSafe') + 0.01 || rate('ceilBoom') > rate('projBoom') + 0.01;
  return {
    id: 'E16', title: 'Floor and ceiling: are the ranges honest, and does playing for them help?',
    tables: [
      { caption: 'Hold-out 2025-26. A 25th-75th percentile range should contain the actual score 50% of the time, with 25% below it.', head: ['Position', 'Last 6 games: inside %', 'below %', 'width', 'Projection-based: inside %', 'below %', 'width', 'n'], rows: out },
      { caption: 'Toss-ups (same position, projections within 2): picking by recent floor or ceiling, against keeping the higher projection.', head: ['Pick', 'Measure', 'Rate', 'Pairs'], rows: [
        ['Higher projection', 'outscored the other', pct(rate('projPick')), res.projPick.n],
        ['Higher recent floor', 'outscored the other', pct(rate('floorPick')), res.floorPick.n],
        ['Higher recent ceiling', 'outscored the other', pct(rate('ceilPick')), res.ceilPick.n],
        ['Higher recent floor', 'avoided a bust (under 70% of projection)', pct(rate('floorSafe')), res.floorSafe.n],
        ['Higher projection', 'avoided a bust', pct(rate('projSafe')), res.projSafe.n],
        ['Higher recent ceiling', 'boomed (140%+ of projection)', pct(rate('ceilBoom')), res.ceilBoom.n],
        ['Higher projection', 'boomed', pct(rate('projBoom')), res.projBoom.n],
      ] },
    ],
    findings: [
      `The last-six-games range contained the actual score ${pct(fit.ALL.recentInside)}% of the time (target 50%); the projection-based range ${pct(fit.ALL.modelInside)}%. ${better ? 'The projection-based range is better calibrated and is now the one shown.' : 'The recent-games range stays.'}`,
      `Posture tiebreak: the higher recent floor avoided a bust ${pct(rate('floorSafe'))}% vs ${pct(rate('projSafe'))}% for the higher projection; the higher recent ceiling boomed ${pct(rate('ceilBoom'))}% vs ${pct(rate('projBoom'))}%. ${fit.keepPosture ? 'It earns its place.' : 'Recent floors and ceilings add nothing the projection does not, so the posture step is removed.'}`,
    ],
    fit,
  };
}

// ================= E14b =================
// Does Sleeper's projection already account for a player's first game back from an absence?
export function e14b() {
  const rows = [];
  eachWeek(D.SEASONS, 3, (s, w, S) => {
    const P = asOf(s, w);
    const act = D.actual(s, w);
    for (const p of Object.values(P)) {
      if (!SKILL.includes(p.pos) || !p.proj || p.hist.length < 3) continue;
      const last = p.hist[p.hist.length - 1];
      let missed = 0;
      for (let wk = w - 1; wk > last.w; wk--) if (!S.isBye(p.team, wk)) missed++;
      const before = mean(p.hist.slice(-4).map((h) => h.pts));
      if (before < 7) continue;
      const a = act.get(p.id);
      if (!a?.played) continue;
      rows.push({ split: split(s), missed, proj: p.proj.pts, actual: a.pts, before });
    }
  }, 18);
  const grp = [['Played last week', (r) => r.missed === 0], ['Back after 1 game out', (r) => r.missed === 1], ['Back after 2-3', (r) => r.missed >= 2 && r.missed <= 3], ['Back after 4+', (r) => r.missed >= 4]];
  const fit = {};
  const out = grp.map(([k, f]) => {
    const x = rows.filter(f);
    const tr = x.filter((r) => r.split === 'train');
    const te = x.filter((r) => r.split === 'test');
    const ratio = (set) => (set.length ? sum(set.map((r) => r.actual)) / sum(set.map((r) => r.proj)) : NaN);
    fit[k] = { n: x.length, ratio: r3(ratio(x)), train: r3(ratio(tr)), test: r3(ratio(te)), nTest: te.length, projVsBefore: r3(sum(x.map((r) => r.proj)) / sum(x.map((r) => r.before))) };
    return [k, x.length, pct(fit[k].projVsBefore), pct(fit[k].train), pct(fit[k].test), te.length];
  });
  const base = fit['Played last week'];
  const back = ['Back after 1 game out', 'Back after 2-3', 'Back after 4+'].map((k) => fit[k]);
  // a factor is applied only to a group that fell short of the projection in both periods
  fit.factors = {};
  for (const [k, key] of [['Back after 1 game out', 1], ['Back after 2-3', 2], ['Back after 4+', 4]]) {
    const f = fit[k];
    fit.factors[key] = f.train < base.train - 0.03 && f.test < base.test - 0.03 ? r3(f.train / base.train) : 1;
  }
  fit.applyFactor = Object.values(fit.factors).some((x) => x < 1);
  return {
    id: 'E14b', title: 'Does the projection already allow for a player\'s first game back?',
    tables: [{ caption: 'Skill players averaging 7+ points before the absence. Actual points as a share of the projection.', head: ['Situation', 'n', 'Projection as % of pre-absence scoring', 'Actual / projection 2022-24', 'Actual / projection 2025-26', 'n'], rows: out }],
    findings: [
      `Players who played the week before scored ${pct(base.ratio)}% of their projection; first game back after one missed game ${pct(fit['Back after 1 game out'].ratio)}%, after 2-3 ${pct(fit['Back after 2-3'].ratio)}%, after 4+ ${pct(fit['Back after 4+'].ratio)}%. Only the 2-3-game group fell short in both periods${fit.factors[2] < 1 ? `, so those players are now valued at ${pct(fit.factors[2])}% of projection in their first game back` : ''}; the other groups are inconsistent between periods and get no extra discount. The projection itself sits at ${pct(fit['Back after 1 game out'].projVsBefore)}-${pct(fit['Back after 4+'].projVsBefore)}% of pre-absence scoring for returning players.`,
    ],
    fit,
  };
}
