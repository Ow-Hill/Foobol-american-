// Google News RSS adapter: one query per player, headline + source + link only.
// Disk-cached per player (adaptive TTL), serves stale on failure, killed by config news.search=false.
// Classification/scoring happens client-side (public/js/playernews.js) — this module is transport only.
//
// Search contract (v2):
// - exact-name query, 7-day window, optional extra queries for team defenses
// - normalised name matching (apostrophes, hyphens, initials, suffixes, DEF aliases)
// - per-player failure backoff + diagnostics, so one bad query cannot blank the feed
// - global story ids so the same headline is not shown under several players
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'news-google.json');
const WINDOW = 7 * 86400000; // keep items younger than 7 days
const BASE_TTL = 10 * 60 * 1000;
const HOT_TTL = 3 * 60 * 1000; // starters / game-day names
const COLD_TTL = 30 * 60 * 1000; // wire names
const CONCURRENCY = 3;
const TIMEOUT = 15000;
const MAX_PER_SOURCE = 8;
const CACHE_VERSION = 2;
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
    fs.writeFileSync(FILE, JSON.stringify({ v: CACHE_VERSION, saveAt: Date.now(), players: disk.players, err: disk.err }));
  } catch {}
}

// ---------- fetching ----------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getOnce(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: UA, signal: ctl.signal });
    if (res.status === 429) {
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      throw Object.assign(new Error('rate limited'), {
        rateLimited: true,
        status: 429,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter * 1000 : null,
      });
    }
    if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function get(url) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await getOnce(url);
    } catch (err) {
      lastErr = err;
      const retryable = err.rateLimited || (err.status >= 500 && err.status <= 599) || err.name === 'AbortError';
      if (!retryable || attempt === 1) break;
      const wait = err.retryAfter ?? 400 * 2 ** attempt + Math.random() * 250;
      await sleep(Math.min(wait, 5000));
    }
  }
  throw lastErr;
}

// ---------- RSS parsing ----------
function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Google appends " - Outlet" to the headline. Only strip it when the trailing
// segment is the RSS <source>, otherwise a legitimate " - report" subtitle is eaten.
function cleanTitle(title, src) {
  const t = String(title || '').trim();
  if (!src) return t;
  const m = t.match(/\s+[-–—]\s+([^-–—]{1,80})$/);
  if (!m) return t;
  return m[1].trim().toLowerCase() === String(src).toLowerCase() ? t.slice(0, m.index).trim() : t;
}

function parseRss(xml) {
  const items = [];
  for (const chunk of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const blob = chunk[1];
    const pub = tag(blob, 'pubDate');
    const time = pub ? new Date(pub).getTime() : 0;
    const rawTitle = tag(blob, 'title');
    const link = tag(blob, 'link');
    const srcMatch = blob.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
    const src = srcMatch ? decode(srcMatch[2]) || null : null;
    const srcUrl = srcMatch ? (srcMatch[1].match(/url="([^"]*)"/i)?.[1] || null) : null;
    if (!rawTitle || !time) continue;
    items.push({
      title: cleanTitle(rawTitle, src),
      src,
      srcUrl,
      domain: srcUrl ? hostOf(srcUrl) : null,
      time,
      url: link || null,
    });
  }
  return items;
}

// ---------- name matching ----------
const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// Reject a headline that only shares the player's name but has no NFL/fantasy signal.
// Google's `NFL` term is a hint, not a filter, so lifestyle and other-sport stories leak in.
const NFL_CUE = /\b(nfl|football|fantasy|quarterback|running back|wide ?receiver|tight end|touchdown|touchdowns|yards|carries|targets|snaps?|week\s*\d+|injur\w*|practice\w*|practic\w*|trade\w*|waiver\w*|depth chart|coach\w*|game\w*|season\w*|contract\w*|suspend\w*|roster\w*|draft\w*|playoff\w*|matchup\w*|kickoff|inactive|active|return\w*|playing|play|out|questionable|doubtful|\bir\b|defense|d\/st|dst|points?|scor\w*|pass\w*|rush\w*|catch\w*|receptions?|field goal|extra point|kick\w*|kicker)\b/i;
const TEAM_ALIASES = {
  ARI: ['arizona', 'cardinals'], ATL: ['atlanta', 'falcons'], BAL: ['baltimore', 'ravens'], BUF: ['buffalo', 'bills'],
  CAR: ['carolina', 'panthers'], CHI: ['chicago', 'bears'], CIN: ['cincinnati', 'bengals'], CLE: ['cleveland', 'browns'],
  DAL: ['dallas', 'cowboys'], DEN: ['denver', 'broncos'], DET: ['detroit', 'lions'], GB: ['green bay', 'packers'],
  HOU: ['houston', 'texans'], IND: ['indianapolis', 'colts'], JAX: ['jacksonville', 'jaguars'], KC: ['kansas city', 'chiefs'],
  LV: ['las vegas', 'raiders'], LAC: ['los angeles chargers', 'chargers'], LAR: ['los angeles rams', 'rams'], MIA: ['miami', 'dolphins'],
  MIN: ['minnesota', 'vikings'], NE: ['new england', 'patriots'], NO: ['new orleans', 'saints'], NYG: ['new york giants', 'giants'],
  NYJ: ['new york jets', 'jets'], PHI: ['philadelphia', 'eagles'], PIT: ['pittsburgh', 'steelers'], SF: ['san francisco', '49ers'],
  SEA: ['seattle', 'seahawks'], TB: ['tampa bay', 'buccaneers'], TEN: ['tennessee', 'titans'], WAS: ['washington', 'commanders'],
};

function relevant(title, p) {
  if (NFL_CUE.test(title)) return true;
  const aliases = TEAM_ALIASES[p.team] || [];
  return aliases.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title));
}

function normalizeName(n) {
  return String(n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\./g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(n) {
  const t = normalizeName(n).split(' ').filter(Boolean);
  while (t.length > 1 && SUFFIX.has(t[t.length - 1])) t.pop();
  if (!t.length) return null;
  return { first: t[0], last: t[t.length - 1], all: t };
}

// True when the title contains a plausible rendering of the first name before the
// surname. Handles "A.J." / "AJ" / "A. Brown", "Ja'Marr", "Amon-Ra St. Brown".
function firstMatches(first, toks, lastIdx) {
  const before = toks.slice(0, lastIdx);
  if (before.includes(first)) return true;
  if (first.length <= 3) {
    for (let i = 0; i < before.length; i++) {
      let seg = '';
      for (let k = 1; k <= 3 && i + k <= before.length; k++) {
        seg += before[i + k - 1];
        if (seg === first) return true;
      }
      if (first.length === 1 && before[i].startsWith(first)) return true;
      if (before[i].length === 1 && first.startsWith(before[i])) return true;
    }
  }
  return false;
}

function headlineHit(name, title, opts = {}) {
  const toks = normalizeName(title).split(' ').filter(Boolean);
  if (!toks.length) return false;

  // Team defenses are searched by nickname ("Bears defense"), not by city.
  if (opts.pos === 'DEF' || /\b(d\/st|dst|defense)$/i.test(String(name))) {
    const tk = nameTokens(name);
    const nick = tk && tk.last;
    const city = normalizeName(name).split(' ').slice(0, -1).join(' ');
    const cue = /\b(defense|d\/st|dst|unit|def)\b/i.test(title);
    if (!cue) return false;
    const nickHit = nick && toks.includes(nick);
    const cityHit = city && ` ${toks.join(' ')} `.includes(` ${city} `);
    const abbrHit = opts.team && toks.includes(String(opts.team).toLowerCase());
    return !!(nickHit || cityHit || abbrHit);
  }

  const tk = nameTokens(name);
  if (!tk) return false;
  if (!toks.includes(tk.last)) return false;
  const li = toks.lastIndexOf(tk.last);
  return firstMatches(tk.first, toks, li);
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------- queries ----------
function rssUrl(q) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en';
}

function queryFor(p) {
  return rssUrl(`"${p.n}" NFL when:7d`);
}

function queriesFor(p) {
  const qs = [queryFor(p)];
  if (p.pos === 'DEF') {
    const tk = nameTokens(p.n);
    const nick = tk && tk.last;
    if (nick) {
      qs.push(rssUrl(`"${nick} defense" NFL when:7d`));
      qs.push(rssUrl(`"${nick} D/ST" NFL when:7d`));
    }
  }
  return qs;
}

async function fetchPlayer(p) {
  const now = Date.now();
  const raw = [];
  for (const url of queriesFor(p)) {
    try {
      raw.push(...parseRss(await get(url)));
    } catch (err) {
      // A DEF's extra query failing should not discard the exact-name results.
      if (!raw.length) throw err;
    }
  }
  const seen = new Set();
  const perSource = {};
  return raw
    .filter((it) => it.time && now - it.time <= WINDOW)
    .filter((it) => headlineHit(p.n, it.title, p))
    .filter((it) => relevant(it.title, p))
    .filter((it) => (it.src || '').toLowerCase() !== 'facebook')
    .filter((it) => !/[\u0600-\u06FF\u4e00-\u9fff\u3040-\u30ff\u0590-\u05FF]/.test((it.title || '') + (it.src || '')))
    .sort((a, b) => b.time - a.time)
    .filter((it) => {
      const key = it.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((it) => {
      const key = it.src || '(none)';
      perSource[key] = (perSource[key] || 0) + 1;
      return perSource[key] <= MAX_PER_SOURCE;
    })
    .map((it) => ({
      id: 'g' + hash(it.title + '|' + it.time),
      title: it.title,
      src: it.src,
      domain: it.domain,
      time: it.time,
      url: it.url,
    }));
}

// ---------- cross-player story clustering ----------
const STOP = new Set(
  'week weeks game games team teams players their about after before could would should might said says report reports news nfl fantasy football start started stadium official officially season seasons being have has had been more most than when where which while during draft look ahead opens vs take takes win wins playing player this that with from and the for are was were will just'.split(' ')
);

function sigTokens(title) {
  const out = new Set();
  for (const w of normalizeName(title).split(' ')) if (w.length > 3 && !STOP.has(w)) out.add(w);
  return out;
}

function overlap(a, b) {
  if (!a.size || !b.size) return { inter: 0, jac: 0 };
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return { inter, jac: inter / Math.max(a.size, b.size) };
}

// Give every item a storyId. League/Wire/Rumours then show one row per story even
// when Google returned it for three different players. Compare against any member,
// and require both a real token overlap and a high Jaccard: generic injury wording
// ("limited in practice") must not merge two different players' reports.
function attachStories(items) {
  const sets = items.map((it) => sigTokens(it.title));
  const clusters = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let cluster = null;
    for (const c of clusters) {
      if (Math.abs(c.time - it.time) > 72 * 3600e3) continue;
      if (c.sets.some((set) => {
        const { inter, jac } = overlap(sets[i], set);
        return inter >= 3 && jac >= 0.7;
      })) {
        cluster = c;
        break;
      }
    }
    if (!cluster) {
      cluster = { id: 's' + hash(it.title), time: it.time, sets: [], items: [] };
      clusters.push(cluster);
    }
    cluster.sets.push(sets[i]);
    cluster.items.push(it);
  }
  for (const c of clusters) {
    const pids = [...new Set(c.items.map((x) => x.pid))];
    for (const it of c.items) {
      it.storyId = c.id;
      it.alsoPids = pids.filter((pid) => pid !== it.pid);
    }
  }
}

// ---------- pool / TTL / backoff ----------
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

function ttlFor(p) {
  if (p.hot) return HOT_TTL;
  if (p.cold) return COLD_TTL;
  return BASE_TTL;
}

function backoffMs(failCount) {
  return Math.min(15 * 60 * 1000, 60 * 1000 * 2 ** Math.min(failCount - 1, 4)) + Math.floor(Math.random() * 5000);
}

// ---------- public ----------
// list: [{ id, n, pos?, team?, hot?, cold? }]
// returns { items, degraded, disabled, freshAt, scanned, fetched, failed, perPlayer, diag }
async function playerNews(list, opts = {}) {
  if (!ENABLED) return { items: [], degraded: false, disabled: true, freshAt: 0, scanned: 0, fetched: 0, failed: [], perPlayer: {}, diag: null };

  const d = loadDisk();
  const now = Date.now();
  const players = list.map((p) => ({ id: String(p.id), n: p.n, pos: p.pos, team: p.team, hot: !!p.hot, cold: !!p.cold }));
  const jobs = [];
  for (const p of players) {
    const c = d.players[p.id];
    if (!opts.force && c && now - c.t < ttlFor(p)) continue;
    if (!opts.force && c && now < (c.nextTry || 0)) continue;
    jobs.push(p);
  }

  let errors = 0;
  const failed = [];
  await pool(jobs, CONCURRENCY, async (p) => {
    try {
      const items = await fetchPlayer(p);
      d.players[p.id] = { t: Date.now(), items, failCount: 0, nextTry: 0, lastErr: null };
    } catch (err) {
      errors++;
      failed.push({ id: p.id, error: String(err.message || err) });
      const prev = d.players[p.id] || { items: [] };
      const failCount = (prev.failCount || 0) + 1;
      d.players[p.id] = {
        ...prev,
        failCount,
        nextTry: Date.now() + backoffMs(failCount),
        lastErr: String(err.message || err),
        t: prev.t || 0,
      };
    }
  });
  if (jobs.length) saveDisk();

  // Sweep players no longer followed so the file never grows unbounded.
  if (Math.random() < 0.1) {
    const keep = new Set(players.map((p) => p.id));
    for (const pid in d.players) if (!keep.has(pid) && now - (d.players[pid].t || 0) > 7 * 86400000) delete d.players[pid];
  }

  const items = [];
  const perPlayer = {};
  const bySource = {};
  let freshAt = 0;
  for (const p of players) {
    const c = d.players[p.id] || { items: [], t: 0 };
    const ttl = ttlFor(p);
    const stale = !c.t || now - c.t > ttl;
    perPlayer[p.id] = {
      t: c.t || 0,
      stale,
      failed: !!(c.failCount > 0),
      failCount: c.failCount || 0,
      nextTry: c.nextTry || 0,
      lastErr: c.lastErr || null,
    };
    if (c.t && now - c.t < ttl) freshAt = Math.max(freshAt, c.t);
    for (const it of c.items || []) {
      if (now - it.time > WINDOW) continue;
      items.push({ ...it, pid: p.id });
      const key = it.src || '(none)';
      bySource[key] = (bySource[key] || 0) + 1;
    }
  }

  attachStories(items);
  items.sort((a, b) => b.time - a.time);
  const oldestItemAt = items.length ? Math.min(...items.map((x) => x.time)) : 0;

  return {
    items,
    degraded: errors > 0,
    disabled: false,
    freshAt,
    scanned: players.length,
    fetched: jobs.length,
    failed,
    perPlayer,
    diag: {
      version: CACHE_VERSION,
      windowDays: 7,
      scanned: players.length,
      fetched: jobs.length,
      failed: failed.length,
      items: items.length,
      oldestItemAt,
      bySource,
      ttlMs: { hot: HOT_TTL, base: BASE_TTL, cold: COLD_TTL },
    },
  };
}

module.exports = { playerNews, ENABLED, nameTokens, headlineHit, parseRss, queryFor, queriesFor, cleanTitle, normalizeName, attachStories, relevant };
