const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cfg = require('./config.json');
const S = require('./lib/sources');
const { buildSnapshot } = require('./lib/snapshot');
const { buildHistory } = require('./lib/history');
const { playerNews: fetchPlayerNews } = require('./lib/playernews');
const { checkAlerts } = require('./lib/alerts');

const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

// Last good snapshot on disk: if Sleeper or ESPN is down at start-up, serve it with a
// staleness banner instead of a blank site.
const LAST_FILE = path.join(__dirname, 'data', 'snapshot-last.json');
const LAST_EVERY = 5 * 60 * 1000;
let lastSaved = 0;
function saveLast(s) {
  if (Date.now() - lastSaved < LAST_EVERY) return;
  lastSaved = Date.now();
  fs.promises
    .mkdir(path.dirname(LAST_FILE), { recursive: true })
    .then(() => fs.promises.writeFile(LAST_FILE + '.tmp', JSON.stringify(s)))
    .then(() => fs.promises.rename(LAST_FILE + '.tmp', LAST_FILE))
    .catch((e) => console.warn('Could not save last snapshot:', e.message));
}
async function loadLast(reason) {
  try {
    const s = JSON.parse(await fs.promises.readFile(LAST_FILE, 'utf8'));
    s.meta = { ...s.meta, staleSince: s.meta.builtAt, staleReason: reason };
    return s;
  } catch {
    return null;
  }
}

let lastForce = 0;
let snap = null;
let snapAt = 0;
let inflight = null;
let hist = null;
let histAt = 0;
let histInflight = null;
const newsHits = new Map();
let newsWindow = [];

async function getSnapshot(force) {
  if (force && Date.now() - lastForce > 15000) {
    lastForce = Date.now();
    S.clearCache();
    snapAt = 0;
  }
  if (snap && Date.now() - snapAt < 45000) return snap;
  if (inflight) return inflight;
  inflight = buildSnapshot()
    .then((s) => {
      snap = s;
      snapAt = Date.now();
      saveLast(s);
      // Fire and forget: alerting must never slow or break the page.
      checkAlerts(s, cfg.alerts).then((r) => r.sent && console.log(`Sent ${r.sent} alert(s)`)).catch(() => {});
      return s;
    })
    .catch(async (err) => {
      const reason = /fetch failed|ENOTFOUND|ECONNRE|ETIMEDOUT|abort/i.test(String(err.message || err))
        ? 'Sleeper or ESPN did not answer'
        : String(err.message || err);
      if (snap) {
        // Keep serving what we have; mark it stale so the page says so.
        snap.meta = { ...snap.meta, staleSince: snap.meta.staleSince || snap.meta.builtAt, staleReason: reason };
        snapAt = Date.now(); // retry the live build after the normal 45s
        return snap;
      }
      const last = await loadLast(reason);
      if (!last) throw err;
      console.warn('Live build failed, serving last saved snapshot:', err.message);
      snap = last;
      snapAt = Date.now();
      return last;
    })
    .finally(() => (inflight = null));
  if (snap) return snap; // serve stale while rebuilding
  return inflight;
}

function send(req, res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
  if (/gzip/.test(req.headers['accept-encoding'] || '') && buf.length > 1024) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(status, headers);
    res.end(zlib.gzipSync(buf));
  } else {
    res.writeHead(status, headers);
    res.end(buf);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/snapshot') {
      const s = await getSnapshot(url.searchParams.get('fresh') === '1');
      return send(req, res, 200, JSON.stringify(s), MIME['.json']);
    }
    if (url.pathname === '/api/history') {
      if (!hist || Date.now() - histAt > 5 * 60 * 1000) {
        histInflight ||= buildHistory().then((h) => ((hist = h), (histAt = Date.now()), h)).finally(() => (histInflight = null));
        if (!hist) await histInflight;
      }
      return send(req, res, 200, JSON.stringify(hist), MIME['.json']);
    }
    if (url.pathname === '/api/news') {
      const pid = url.searchParams.get('pid');
      const s = snap || (await getSnapshot());
      // Any NFL player can be looked up, not only the snapshot's set: a backup who just got
      // the job is exactly who you search for.
      const p = s?.players?.[pid] || (pid ? (await S.slimPlayers().catch(() => ({})))[pid] : null);
      if (!p) return send(req, res, 404, JSON.stringify({ error: 'Unknown player' }), MIME['.json']);
      const now = Date.now();
      const last = newsHits.get(pid) || 0;
      newsWindow = newsWindow.filter((t) => now - t < 60000);
      if (now - last < 5000 || newsWindow.length >= 30) {
        return send(req, res, 429, JSON.stringify({ error: 'News lookup is rate limited. Try again in a few seconds.' }), MIME['.json']);
      }
      newsHits.set(pid, now);
      newsWindow.push(now);
      const r = await fetchPlayerNews([{ id: pid, n: p.n, pos: p.pos, team: p.team, hot: true }], { force: true });
      const items = (r.items || []).filter((x) => x.pid === pid);
      return send(req, res, 200, JSON.stringify({ pid, items, diag: r.diag, perPlayer: r.perPlayer }), MIME['.json']);
    }
    if (url.pathname === '/api/players') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      if (q.length < 3) return send(req, res, 400, JSON.stringify({ error: 'Type at least 3 letters' }), MIME['.json']);
      const slim = await S.slimPlayers();
      const players = Object.values(slim)
        .filter((p) => p.n && p.n.toLowerCase().includes(q))
        .sort((a, b) => (a.team ? 0 : 1) - (b.team ? 0 : 1) || (a.rank ?? 1e9) - (b.rank ?? 1e9))
        .slice(0, 8)
        .map((p) => ({ id: p.id, n: p.n, pos: p.pos, team: p.team }));
      return send(req, res, 200, JSON.stringify({ players }), MIME['.json']);
    }
    if (url.pathname === '/api/health') return send(req, res, 200, JSON.stringify({ ok: true, snapshotAgeMs: snap ? Date.now() - snapAt : null }), MIME['.json']);

    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.join(PUBLIC, path.normalize(rel));
    if (!file.startsWith(PUBLIC)) return send(req, res, 403, 'Forbidden', 'text/plain');
    const data = await fs.promises.readFile(file).catch(() => null);
    if (!data) return send(req, res, 404, 'Not found', 'text/plain');
    send(req, res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  } catch (err) {
    console.error(err);
    send(req, res, 502, JSON.stringify({ error: String(err.message || err) }), MIME['.json']);
  }
});

const port = process.env.PORT || cfg.port;
server.listen(port, () => {
  console.log(`Roster monitor running at http://localhost:${port}`);
  getSnapshot().then((s) => console.log(`Warm snapshot ready in ${s.meta.buildMs}ms`)).catch((e) => console.error('Warm-up failed:', e.message));
  buildHistory().then((h) => ((hist = h), (histAt = Date.now()), console.log(`History ready: ${h.seasons.map((s) => s.season).join(', ')}`))).catch((e) => console.error('History failed:', e.message));
});
