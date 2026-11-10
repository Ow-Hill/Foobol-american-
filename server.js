const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cfg = require('./config.json');
const S = require('./lib/sources');
const { buildSnapshot } = require('./lib/snapshot');
const { buildHistory } = require('./lib/history');
const { playerNews: fetchPlayerNews } = require('./lib/playernews');

const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

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
      return s;
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
      const p = s?.players?.[pid];
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
