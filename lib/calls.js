// Keeps score of the site's own lineup advice. Each week the first version of every "start X
// over Y" call for my roster is stored; once the week is played each call is marked right or
// wrong from the points the two players actually scored. Shown on the Track record page next to
// the 2022-2026 backtest, so a rule that stops working is visible.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'calls-log.json');
const KEEP_WEEKS = 18;
let modelPromise = null;
const loadModel = () => (modelPromise ||= import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'model.js')).href));

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

async function recordCalls(snap, rosterId, opts = {}) {
  const file = opts.file || DEFAULT_FILE;
  const now = opts.now ?? Date.now();
  const W = snap.meta.week;
  const db = read(file);
  let dirty = false;
  try {
    const { buildModel } = await loadModel();
    const M = buildModel(snap, rosterId, now);
    const wk = (db[W] ||= {});
    const add = (c) => {
      const key = `${c.start}|${c.bench}`;
      if (wk[key]) return;
      wk[key] = { ...c, at: now };
      dirty = true;
    };
    for (const s of M.swaps()) {
      if (!s.bench || s.band === 'hard') continue;
      if (s.band === 'toss' && s.keep) continue; // the tiebreak said leave the lineup alone
      add({ kind: 'swap', start: s.start, bench: s.bench, band: s.band, gap: Math.round(s.gap * 10) / 10, rate: s.rate ?? null });
    }
    // the top waiver suggestion: right if the add outscores the drop over this week and next
    try {
      const w = M.waiverPlan();
      // the top claim is for the lineup now; injured stashes are a separate, longer bet (E20)
      const cands = [...(w.groups?.risers || []), ...(w.groups?.lottery || []), ...(w.groups?.cuffs || [])].filter((c) => c.drop?.pid && c.p?.avail !== 'out');
      cands.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || (b.p?.proj || 0) - (a.p?.proj || 0));
      const top = cands[0];
      if (top) add({ kind: 'waiver', start: top.id, bench: top.drop.pid, band: `tier ${top.tier ?? '?'}`, gap: Math.round((top.impact || 0) * 10) / 10, rate: null });
    } catch {}
    const l = M.lineup(M.me);
    l.starters.forEach((pid, i) => {
      if (!pid || M.P(pid).avail !== 'q') return;
      const q = M.qCall(pid, M.slotNames[i]);
      if (q.swapNow) add({ kind: 'questionable', start: q.fb, bench: pid, band: 'lean', gap: Math.round((M.val(q.fb) - q.ev) * 10) / 10, rate: null });
    });
  } catch (err) {
    console.warn('Call log skipped:', err.message);
  }
  for (const k of Object.keys(db)) {
    if (Number(k) < W - KEEP_WEEKS) {
      delete db[k];
      dirty = true;
    }
  }
  if (dirty && !opts.dryRun) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(db));
    } catch {}
  }

  // score finished weeks
  const rows = [];
  const byBand = {};
  const pts = (pid, week) => (snap.players[pid]?.hist || []).find((h) => h.w === week)?.pts ?? null;
  const byKind = {};
  for (const wkKey of Object.keys(db)) {
    const week = Number(wkKey);
    if (!(week < W)) continue;
    for (const c of Object.values(db[wkKey])) {
      let a;
      let b;
      if (c.kind === 'waiver') {
        // two weeks of evidence, and both players must still be in the snapshot to be scored
        if (!(week + 1 < W) || !snap.players[c.start] || !snap.players[c.bench]) continue;
        a = (pts(c.start, week) ?? 0) + (pts(c.start, week + 1) ?? 0);
        b = (pts(c.bench, week) ?? 0) + (pts(c.bench, week + 1) ?? 0);
      } else {
        a = pts(c.start, week);
        b = pts(c.bench, week);
      }
      if (a == null && b == null) continue; // neither played or both left the snapshot
      const sa = a ?? 0;
      const sb = b ?? 0;
      const result = sa > sb ? 'hit' : sa < sb ? 'miss' : 'flat';
      rows.push({ week, ...c, startPts: sa, benchPts: sb, result });
      const bandKey = c.kind === 'waiver' ? 'waiver' : c.band;
      const g = (byBand[bandKey] ||= { n: 0, hit: 0, miss: 0, flat: 0, rateSum: 0, rateN: 0 });
      g.n++;
      g[result]++;
      if (c.rate != null) {
        g.rateSum += c.rate / 100;
        g.rateN++;
      }
      const k = (byKind[c.kind] ||= { n: 0, hit: 0 });
      k.n++;
      if (result === 'hit') k.hit++;
    }
  }
  rows.sort((x, y) => y.week - x.week);
  const decided = rows.filter((r) => r.result !== 'flat');
  // A label is slipping when its live hit rate sits below what the backtest said to expect
  // (one-sided, 90%), once it has 10+ scored calls.
  const flags = [];
  for (const [band, g] of Object.entries(byBand)) {
    const decided = g.hit + g.miss;
    if (decided < 10 || !g.rateN) continue;
    const expect = g.rateSum / g.rateN;
    const seen = g.hit / decided;
    const floor = expect - 1.645 * Math.sqrt((expect * (1 - expect)) / decided);
    if (seen < floor) flags.push({ band, seen, expect, n: decided });
  }
  return { rows: rows.slice(0, 40), byBand, byKind, flags, total: rows.length, hitRate: decided.length ? decided.filter((r) => r.result === 'hit').length / decided.length : null, open: Object.keys(db[W] || {}).length };
}

module.exports = { recordCalls };
