import { XP, xpGame, BUY_SELL_GAP } from './fitted.js';
// Position-specific usage and efficiency for the waiver scanner, measured against named benchmark
// players. Reads the per-game rows lib/snapshot.js builds from Sleeper's weekly stats.
//
// What the data can and cannot supply (see SOURCES): Sleeper's weekly feed gives snaps, attempts,
// targets, red-zone attempts/targets and air yards; team shares are computed in the snapshot.
// Routes run are NOT in the feed, so routes, YPRR and targets per route are estimates
// (snaps x team dropback rate) and are always labelled "≈". Inside-10 touches, slot/wide splits
// and completed air yards for QBs are not available at all and are never shown as numbers.

// Benchmarks: 2026 season to date through Week 11, per game, checked against StatsDeck
// (nflverse data) on 2026-11-25. Update `asOf` and the numbers when you refresh them.
export const BENCHMARKS = {
  asOf: '2026-11-25 (through Week 11)',
  QB: [
    { n: 'Joe Burrow', team: 'CIN', gp: 10, passAtt: 38.0, passYd: 309.5, passTd: 2.9, rushAtt: 2.6, ppg: 25.8 },
    { n: 'Jordan Love', team: 'GB', gp: 10, passAtt: 36.8, passYd: 283.8, passTd: 2.0, rushAtt: 1.3, ppg: 20.3 },
    { n: 'Josh Allen', team: 'BUF', gp: 10, passAtt: 30.2, passYd: 252.7, passTd: 1.4, rushAtt: 6.6, rushTd: 1.1, rushPts: 9.5, ppg: 24.4 },
  ],
  RB: [{ n: 'Jahmyr Gibbs', team: 'DET', gp: 10, rushAtt: 22.2, rushYd: 109.8, rushTd: 1.3, tgt: 5.8, rec: 4.5, tgtSh: 0.18, ppg: 28.1 }],
  WR: [{ n: 'Jaxon Smith-Njigba', team: 'SEA', gp: 10, tgt: 10.9, rec: 7.9, recYd: 120.7, tgtSh: 0.37, airSh: 0.53, wopr: 0.93, ppg: 26.3 }],
  TE: [{ n: 'Trey McBride', team: 'ARI', gp: 11, tgt: 10.3, rec: 7.9, recYd: 62.6, tgtSh: 0.29, airSh: 0.22, wopr: 0.59, ppg: 16.9 }],
};

// Which of Owen's metrics each source can supply. 'feed' = straight from Sleeper weekly stats,
// 'computed' = derived exactly from feed fields, 'estimate' = approximation, 'missing' = not available.
export const SOURCES = {
  QB: {
    'Dropbacks': 'computed (pass attempts + sacks)',
    'Pass attempts': 'feed', 'Rushing attempts': 'feed',
    'Red-zone attempts': 'feed (pass + rush red-zone attempts)',
    'Passer rating': 'feed (when Sleeper sends it)',
    'Rushing points': 'computed (rush yards ÷ 10 + 6 per rush TD)',
    'Completed air yards': 'missing — feed has intended pass air yards only',
    'Goal-line attempts': 'missing — red zone is the closest field',
  },
  RB: {
    'Snap share': 'feed', 'Rushing attempts': 'feed', 'Receptions': 'feed',
    'Rush share': 'computed (team rush attempts that week)',
    'Red-zone touches': 'feed (red-zone rushes + red-zone targets)',
    'Expected vs actual points': 'estimate (volume model fitted on 2022–24 player-games)',
    'Inside-10 / green-zone touches': 'missing',
  },
  WR: {
    'Targets': 'feed', 'Team target share': 'computed',
    'Air yards': 'feed (receiving air yards on catches only)',
    'Weighted opportunity (WOPR)': 'estimate — 1.5 × target share + 0.7 × air-yard share, air share from catches only',
    'Routes run': 'estimate — snaps × team dropback rate',
    'Yards per route run': 'estimate — uses estimated routes',
    'Slot / wide splits': 'missing',
  },
  TE: {
    'Routes run': 'estimate — snaps × team dropback rate (overstates blocking TEs)',
    'Target share': 'computed', 'Red-zone targets': 'feed',
    'Targets per route run': 'estimate — uses estimated routes',
    'Expected fantasy points': 'estimate (volume model)',
    'Slot / wide splits': 'missing',
  },
};

// Volume-expected points (XP, xpGame) and the cool-off gap are measured in the backtest and live in
// fitted.js (E11/E12): one copy, so a refit reaches the scanner too.
export { xpGame };
export const XP_GAP = BUY_SELL_GAP;

const has = (rows, k) => rows.some((h) => h[k] != null);
const per = (rows, f) => (rows.length ? rows.reduce((s, h) => s + (f(h) || 0), 0) / rows.length : null);
const sum = (rows, k) => rows.reduce((s, h) => s + (h[k] || 0), 0);


// Advanced line for one player over his last `n` games. Every metric carries `approx` when it is an
// estimate, and is left out (not zeroed) when the feed did not send the fields behind it.
export function advancedOf(pos, hist, n = 3) {
  const rows = (hist || []).slice(-n);
  if (!rows.length) return null;
  const m = {};
  const put = (k, v, label, extra = {}) => {
    if (v != null && Number.isFinite(v)) m[k] = { v, label, ...extra };
  };
  const g = rows.length;
  if (has(rows, 'snp')) put('snap', per(rows.filter((h) => h.snp != null), (h) => h.snp) / 100, 'Snap share', { pct: true });

  if (pos === 'QB') {
    if (has(rows, 'passAtt')) {
      put('passAtt', per(rows, (h) => h.passAtt), 'Pass att/g');
      put('dropbacks', per(rows, (h) => (h.passAtt || 0) + (h.sack || 0)), 'Dropbacks/g');
    }
    put('rushAtt', per(rows, (h) => h.att), 'Rush att/g');
    if (has(rows, 'passRz') || has(rows, 'rzAtt')) put('rz', per(rows, (h) => (h.passRz || 0) + (h.rzAtt || 0)), 'Red-zone att/g');
    if (has(rows, 'passRtg')) put('rtg', per(rows.filter((h) => h.passRtg != null), (h) => h.passRtg), 'Passer rating');
    if (has(rows, 'rushYd')) put('rushPts', per(rows, (h) => (h.rushYd || 0) / 10 + 6 * (h.rushTd || 0)), 'Rush pts/g');
    if (has(rows, 'passAir')) put('passAir', per(rows, (h) => h.passAir), 'Pass air yds/g', { note: 'intended, not completed' });
  } else {
    put('tgt', per(rows, (h) => h.tgt), 'Targets/g');
    if (has(rows, 'tgtSh')) put('tgtSh', per(rows, (h) => h.tgtSh), 'Target share', { pct: true });
    if (has(rows, 'rzTgt')) put('rzTgt', per(rows, (h) => h.rzTgt), 'RZ targets/g');
    if (pos === 'RB') {
      put('rushAtt', per(rows, (h) => h.att), 'Carries/g');
      if (has(rows, 'attSh')) put('attSh', per(rows, (h) => h.attSh), 'Rush share', { pct: true });
      put('rec', per(rows, (h) => h.rec), 'Rec/g');
      if (has(rows, 'rzAtt') || has(rows, 'rzTgt')) put('rzTouch', per(rows, (h) => (h.rzAtt || 0) + (h.rzTgt || 0)), 'RZ touches/g');
    }
    if (pos === 'WR' || pos === 'TE') {
      if (has(rows, 'air')) put('air', per(rows, (h) => h.air), 'Air yds/g', { note: 'on catches' });
      if (has(rows, 'tgtSh') && has(rows, 'airSh')) put('wopr', 1.5 * per(rows, (h) => h.tgtSh) + 0.7 * per(rows, (h) => h.airSh), 'WOPR', { approx: true });
      const routes = sum(rows, 'routesEst');
      if (has(rows, 'routesEst') && routes > 0) {
        put('routes', routes / g, 'Routes/g', { approx: true });
        if (has(rows, 'recYd')) put('yprr', sum(rows, 'recYd') / routes, 'Yds/route', { approx: true });
        put('tprr', sum(rows, 'tgt') / routes, 'Tgt/route', { approx: true, pct: true });
      }
    }
  }
  // expected vs actual points: only when the red-zone/air fields the model needs were sent
  const needs = { QB: ['passAtt'], RB: ['rzAtt'], WR: ['air'], TE: ['air'] }[pos] || [];
  if (XP[pos] && needs.every((k) => has(rows, k))) {
    const xp = per(rows, (h) => xpGame(pos, h));
    const act = per(rows, (h) => h.pts);
    put('xp', xp, 'Expected pts/g', { approx: true });
    put('xpGap', act - xp, 'Actual − expected');
  }
  return { games: g, m };
}

// 0..1 usage score from the position's volume metrics, each as a share of the benchmark player's
// number (capped at 1), so "half of Gibbs' carries" reads as 0.5. Falls back to null when the
// player has no advanced fields, and the caller uses the basic score instead.
const KEYS = {
  QB: [['dropbacks', 'passAtt', 1], ['rushAtt', 'rushAtt', 1.5], ['rz', null, 1]],
  RB: [['rushAtt', 'rushAtt', 1.5], ['tgt', 'tgt', 1], ['attSh', null, 1], ['rzTouch', null, 1]],
  WR: [['tgt', 'tgt', 1], ['tgtSh', 'tgtSh', 1.5], ['wopr', 'wopr', 1]],
  TE: [['tgt', 'tgt', 1], ['tgtSh', 'tgtSh', 1.5], ['routes', null, 0.5], ['rzTgt', null, 0.5]],
};
const FIXED = { rz: 3, attSh: 0.65, rzTouch: 3, routes: 30, rzTgt: 1.2 }; // league-good marks where no benchmark player number exists

export function benchUsage(pos, adv) {
  if (!adv || !KEYS[pos]) return null;
  const b = BENCHMARKS[pos][0];
  let s = 0;
  let w = 0;
  const vs = [];
  for (const [k, bk, wt] of KEYS[pos]) {
    const mm = adv.m[k];
    if (!mm) continue;
    const ref = bk ? (pos === 'QB' && k === 'rushAtt' ? BENCHMARKS.QB[2].rushAtt : bk === 'passAtt' ? b.passAtt : b[bk]) : FIXED[k];
    if (!ref) continue;
    const r = Math.max(0, Math.min(1, mm.v / ref));
    s += r * wt;
    w += wt;
    vs.push({ k, label: mm.label, v: mm.v, ref, refName: bk ? (pos === 'QB' && k === 'rushAtt' ? BENCHMARKS.QB[2].n : b.n) : null, ratio: r, approx: !!mm.approx, pct: !!mm.pct });
  }
  if (!w) return null;
  return { score: s / w, vs };
}

export function fmtMetric(mm) {
  if (!mm) return '';
  const v = mm.pct ? `${Math.round(mm.v * 100)}%` : Math.abs(mm.v) >= 100 ? String(Math.round(mm.v)) : (Math.round(mm.v * 10) / 10).toFixed(1);
  return `${mm.approx ? '≈' : ''}${v}`;
}
