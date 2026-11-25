// Training camp and preseason research for the live draft guide: Google News headlines per player,
// searched with camp words over the last three weeks (the weekly feed in playernews.js looks back
// seven days with no camp words, which misses most of August).
// Transport only: headlines, source, link and time. public/js/draftguide.js reads them.
const fs = require('fs');
const path = require('path');
const N = require('./playernews');

const FILE = path.join(__dirname, '..', 'data', 'news-draft.json');
const WINDOW = 21 * 86400000;
const TTL = 2 * 60 * 60 * 1000; // camp news moves daily, not by the minute
const FAIL_TTL = 15 * 60 * 1000;
const CONCURRENCY = 3;
const MAX_ITEMS = 8;
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

let disk = null;
const load = () => {
  if (disk) return disk;
  try {
    disk = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    disk = { players: {} };
  }
  return disk;
};
const save = () => {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(disk));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch {}
};

const rss = (q) => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en';
// One camp-worded query and one plain query: "named the starter" headlines rarely say "camp".
function queries(p) {
  return [rss(`"${p.n}" (camp OR preseason OR practice OR OTAs OR "depth chart") when:21d`), rss(`"${p.n}" NFL when:14d`)];
}

async function text(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Same name matching and relevance rules as the weekly feed, wider window, fewer items.
function filter(p, raw, now = Date.now()) {
  const seen = new Set();
  return raw
    .filter((it) => it.time && now - it.time <= WINDOW)
    .filter((it) => N.headlineHit(p.n, it.title, p) && N.relevant(it.title, p))
    .sort((a, b) => b.time - a.time)
    .filter((it) => {
      const k = it.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_ITEMS)
    .map((it) => ({ title: it.title, src: it.src, time: it.time, url: it.url }));
}

async function fetchOne(p) {
  const raw = [];
  for (const u of queries(p)) {
    try {
      raw.push(...N.parseRss(await text(u)));
    } catch (e) {
      if (!raw.length && u === queries(p)[1]) throw e;
    }
  }
  return filter(p, raw);
}

// list: [{ id, n, pos, team }] → { items: { [pid]: [...] }, fetched, failed, pending }
async function campNews(list, { cacheOnly = false } = {}) {
  const d = load();
  const out = {};
  if (!N.ENABLED) return { items: out, disabled: true, fetched: 0, failed: 0 };
  const now = Date.now();
  const jobs = cacheOnly ? [] : list.filter((p) => {
    const c = d.players[p.id];
    return !c || now - c.t > (c.failed ? FAIL_TTL : TTL);
  });
  let i = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (i < jobs.length) {
      const p = jobs[i++];
      try {
        d.players[p.id] = { t: Date.now(), items: await fetchOne(p) };
      } catch {
        failed++;
        d.players[p.id] = { t: Date.now(), failed: true, items: d.players[p.id]?.items || [] };
      }
    }
  }));
  if (jobs.length) save();
  let missing = 0;
  for (const p of list) {
    const c = d.players[p.id];
    if (!c) missing++;
    out[p.id] = (c?.items || []).filter((it) => now - it.time <= WINDOW);
  }
  return { items: out, fetched: jobs.length, failed, missing, at: now };
}

module.exports = { campNews, filter, queries };
