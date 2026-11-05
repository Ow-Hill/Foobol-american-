// Google News RSS adapter: one query per player, headline + source + link only.
// Disk-cached 10 min per player; serves stale on failure; killed by config news.search=false.
// Classification/scoring happens client-side (public/js/playernews.js) — this module is transport only.
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'news-google.json');
const TTL = 10 * 60 * 1000; // per-player refresh
const WINDOW = 3 * 86400000; // keep items younger than 3 days
const CONCURRENCY = 4;
const TIMEOUT = 15000;
const ENABLED = !(cfg.news && cfg.news.search === false);

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

// ---------- disk cache ----------
let disk = { t: 0, players: {}, err: 0 };
function loadDisk() {
  if (disk.t) return disk;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw && raw.players) disk = { t: raw.saveAt || 0, players: raw.players, err: raw.err || 0 };
  } catch {}
  return disk;
}
function saveDisk() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ saveAt: Date.now(), players: disk.players, err: disk.err }));
  } catch {}
}

// ---------- fetching ----------
async function get(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: UA, signal: ctl.signal });
    if (res.status === 429) throw Object.assign(new Error('rate limited'), { rateLimited: true });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .trim();
}

function parseRss(xml) {
  const items = [];
  for (const chunk of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const blob = chunk[1];
    const pub = tag(blob, 'pubDate');
    const time = pub ? new Date(pub).getTime() : 0;
    const title = tag(blob, 'title');
    const link = tag(blob, 'link');
    const source = tag(blob, 'source') || null;
    if (!title || !time) continue;
    // Google appends " - Outlet" to the headline; the <source> tag carries it already
    const clean = title.replace(/\s+[-–—]\s+[^\s][^-–—]{1,60}$/, '').trim() || title;
    items.push({ title: clean, src: source, time, url: link || null });
  }
  return items;
}

// ---------- name matching ----------
function nameTokens(n) {
  const t = String(n || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (t.length < 2) return null;
  return { first: t[0], last: t[t.length - 1] };
}

function headlineHit(name, title) {
  const tk = nameTokens(name);
  if (!tk) return false;
  const tt = ' ' + title.toLowerCase().replace(/[^a-z\s.']/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (!tt.includes(' ' + tk.last + ' ')) return false;
  if (tk.first.length <= 1) {
    // "A.J. Brown" style: accept "A. Brown", "A J Brown", "AJ Brown" right before the surname
    const segs = tt.trim().split(' ');
    const li = segs.lastIndexOf(tk.last);
    const prev = li > 0 ? segs[li - 1] : '';
    const bare = prev.replace(/[.']/g, '');
    const stop = ['and', 'the', 'or', 'of', 'to', 'for', 'at', 'vs', 'on', 'in', 'by', 'if', 'as', 'is', 'it', 'be', 'do', 'no', 'so', 'up', 'an', 'at'];
    if (bare.length === 1) return bare[0] === tk.first && bare !== tk.last[0] ? true : false;
    return prev !== '' && bare.length <= 3 && bare[0] === tk.first && bare.length >= 2 && !stop.includes(bare);
  }
  return tt.includes(' ' + tk.first + ' ');
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function queryFor(p) {
  const q = '"' + p.n + '" NFL when:3d';
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en';
}

async function fetchPlayer(p) {
  const xml = await get(queryFor(p));
  const now = Date.now();
  const items = parseRss(xml)
    .filter((it) => it.time && now - it.time <= WINDOW)
    .filter((it) => headlineHit(p.n, it.title))
    .filter((it) => (it.src || '').toLowerCase() !== 'facebook')
    .filter((it) => !/[\u0600-\u06FF\u4e00-\u9fff\u3040-\u30ff\u0590-\u05FF]/.test((it.title || '') + (it.src || '')))
    .map((it) => ({ id: 'g' + hash(it.title + '|' + it.time), title: it.title, src: it.src, time: it.time, url: it.url }));
  // dedupe identical titles
  const seen = new Set();
  return items.filter((it) => (seen.has(it.title) ? false : (seen.add(it.title), true)));
}

async function pool(jobs, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, Math.max(jobs.length, 1)) }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      try {
        await fn(job);
      } catch {}
    }
  });
  await Promise.all(workers);
}

// ---------- public ----------
// list: [{ id, n }] (player name used verbatim in the query)
// returns { items: [{ id, title, src, time, url, pid }], degraded, disabled, freshAt }
async function playerNews(list) {
  if (!ENABLED) return { items: [], degraded: false, disabled: true, freshAt: 0 };
  const d = loadDisk();
  const now = Date.now();
  const jobs = [];
  for (const p of list) {
    const c = d.players[p.id];
    if (!c || now - c.t >= TTL) jobs.push(p);
  }
  let errors = 0;
  await pool(jobs, CONCURRENCY, async (p) => {
    try {
      const items = await fetchPlayer(p);
      d.players[p.id] = { t: Date.now(), items };
    } catch (err) {
      errors++;
      if (!d.players[p.id]) d.players[p.id] = { t: Date.now() - TTL + 60000, items: [] };
    }
  });
  if (jobs.length) saveDisk();

  // sweep players no longer followed so the file never grows unbounded
  if (Math.random() < 0.1) {
    const keep = new Set(list.map((p) => p.id));
    for (const pid in d.players) if (!keep.has(pid) && now - (d.players[pid].items?.[0]?.time || 0) > 7 * 86400000) delete d.players[pid];
  }

  const items = [];
  let freshAt = 0;
  for (const p of list) {
    const c = d.players[p.id] || { items: [] };
    if (now - c.t < TTL) freshAt = Math.max(freshAt, c.t);
    for (const it of c.items || []) if (now - it.time <= WINDOW) items.push({ ...it, pid: p.id });
  }
  return {
    items,
    degraded: errors > 0,
    disabled: false,
    freshAt,
    scanned: list.length,
    fetched: jobs.length,
  };
}

module.exports = { playerNews, ENABLED, nameTokens, headlineHit, parseRss };
