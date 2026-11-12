// Ripple calibration: record each week's teammate estimates the first time the server sees them,
// then, once that week has been played, compare each estimate with what actually happened
// (the player's targets/carries/points that week vs his own average in the 3 games before).
// Answers "how often were the estimates right?" per rule, so the share constants can be tuned.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'ripple-log.json');
const KEEP_WEEKS = 8;
let ripplePromise = null;
const loadRipple = () => (ripplePromise ||= import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'ripple.js')).href));

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r1 = (v) => Math.round(v * 10) / 10;

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

// Score one stored prediction against the player's history. null when he did not play that week.
function score(pred, p, week) {
  const h = (p?.hist || []).find((x) => x.w === week);
  if (!h) return null;
  const before = (p.hist || []).filter((x) => x.w < week).slice(-3);
  if (!before.length) return null;
  const base = { tgt: avg(before.map((x) => x.tgt || 0)), att: avg(before.map((x) => x.att || 0)), pts: avg(before.map((x) => x.pts || 0)) };
  const act = { tgt: (h.tgt || 0) - base.tgt, att: (h.att || 0) - base.att, pts: (h.pts || 0) - base.pts };
  // What the estimate is about: targets for pass catchers, carries for backs, points for % moves.
  let metric = 'pts';
  if (pred.pct == null && !pred.starts) metric = Math.abs(pred.att || 0) > Math.abs(pred.tgt || 0) ? 'att' : 'tgt';
  const est = metric === 'pts' ? null : pred[metric] || 0;
  const actual = act[metric];
  const sign = pred.dir === 'up' ? 1 : -1;
  // Right direction, with a small dead zone so noise is not scored as a hit.
  const dead = metric === 'pts' ? 1.5 : 0.5;
  const hit = sign * actual > dead;
  const miss = sign * actual < -dead;
  return {
    metric,
    est: est != null ? r1(est) : null,
    actual: r1(actual),
    result: hit ? 'hit' : miss ? 'miss' : 'flat',
    err: est != null ? r1(actual - est) : null,
  };
}

// players: snapshot players; W: current week; opts.file, opts.now, opts.isBye
async function calibrate(players, W, opts = {}) {
  const file = opts.file || DEFAULT_FILE;
  const now = opts.now ?? Date.now();
  let db = read(file);
  let dirty = false;

  // 1. record this week's estimates (first sighting wins: that is what the page showed)
  try {
    const { buildRipple } = await loadRipple();
    const r = buildRipple(players, { W, now, isBye: opts.isBye, lines: opts.lines });
    const wk = (db[W] ||= {});
    for (const e of r.effects) {
      const key = `${e.kind}|${e.src}|${e.pid}`;
      if (wk[key]) continue;
      wk[key] = { kind: e.kind, src: e.src, pid: e.pid, dir: e.dir, tgt: e.tgt ?? null, att: e.att ?? null, pct: e.pct ?? null, starts: !!e.starts, conf: e.conf, observed: !!e.observed, at: now };
      dirty = true;
    }
  } catch (err) {
    console.warn('Ripple calibration skipped:', err.message);
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

  // 2. score finished weeks
  const rows = [];
  const byKind = {};
  const byConf = {};
  for (const wkKey of Object.keys(db)) {
    const week = Number(wkKey);
    if (!(week < W)) continue;
    for (const pred of Object.values(db[wkKey])) {
      const s = score(pred, players[pred.pid], week);
      if (!s) continue;
      rows.push({ week, ...pred, ...s });
      for (const [bucket, key] of [[byKind, pred.kind], [byConf, pred.conf]]) {
        const b = (bucket[key] ||= { n: 0, hit: 0, miss: 0, flat: 0 });
        b.n++;
        b[s.result]++;
      }
    }
  }
  rows.sort((a, b) => b.week - a.week || Math.abs(b.actual) - Math.abs(a.actual));
  const total = rows.length;
  const hits = rows.filter((r) => r.result === 'hit').length;
  return { rows: rows.slice(0, 60), byKind, byConf, total, hitRate: total ? hits / total : null, weeks: Object.keys(db).map(Number).filter((w) => w < W).sort((a, b) => b - a) };
}

module.exports = { calibrate, score };
