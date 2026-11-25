// Push alerts for status changes on my roster: the site only helps when it is open, and the
// changes that flip a lineup (Questionable → Out, a depth-chart demotion, a trade) happen when it
// is not. Sends one batched message per snapshot build to an ntfy topic or a Discord/Slack/JSON
// webhook. Off unless config.json has an `alerts` block. Only dated, confirmed changes are sent:
// never headlines, speculation or ripple estimates.
//
// config.json:
//   "alerts": { "ntfy": "https://ntfy.sh/<topic>" }                          or
//   "alerts": { "webhook": "<url>", "format": "discord" | "slack" | "json" }
//   optional: "quietHours": [23, 7]  (league time zone; held, then sent after; lock alerts still go out)
//             "scope": "starters" | "roster"  (default roster)
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'alerts-sent.json');
const MAX_AGE = 12 * 3600 * 1000; // never backfill changes older than this
const KEEP = 8 * 86400000;
const SEV = { IR: 5, 'INJURED RESERVE': 5, PUP: 5, SUS: 5, SUSPENDED: 5, NA: 4, OUT: 4, DOUBTFUL: 3, QUESTIONABLE: 2, PROBABLE: 1 };
const sev = (v) => (v ? SEV[String(v).toUpperCase()] || 0 : 0);

function readSent(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

function inQuiet(now, tz, quiet) {
  if (!Array.isArray(quiet) || quiet.length !== 2) return false;
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
  const [from, to] = quiet;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

// Pure: which changes on my roster deserve an alert. Returns [{ id, urgent, text }].
function pending(snap, sent, opts = {}) {
  const now = opts.now ?? Date.now();
  const me = (snap.teams || []).find((t) => t.isMe);
  if (!me) return [];
  const starters = new Set((me.starters || []).filter((x) => x && x !== '0'));
  const roster = opts.scope === 'starters' ? [...starters] : [...new Set([...(me.players || []), ...(me.reserve || [])])];
  const out = [];
  for (const pid of roster) {
    const p = snap.players?.[pid];
    for (const ch of snap.changes?.[pid] || []) {
      const id = `${pid}|${ch.field}|${ch.at}`;
      if (sent[id] || now - ch.at > MAX_AGE) continue;
      const role = starters.has(pid) ? 'starter' : (me.reserve || []).includes(pid) ? 'IR' : 'bench';
      const who = `${p?.n || pid} (${p?.pos || '?'}, ${role})`;
      let text = null;
      let urgent = false;
      if (ch.field === 'inj' || ch.field === 'es' || ch.field === 'off') {
        const worse = sev(ch.to) > sev(ch.from);
        urgent = worse && role === 'starter' && sev(ch.to) >= 3;
        text = `${who}: ${ch.field === 'inj' ? 'Sleeper' : ch.field === 'es' ? 'ESPN' : 'official'} status ${ch.from || 'no tag'} → ${ch.to || 'no tag'}`;
      } else if (ch.field === 'prac' && role === 'starter') {
        // a starter who stops practising: Questionable players who missed the last practice played 55% of the time
        const word = { FP: 'full', LP: 'limited', DNP: 'did not practice' };
        urgent = ch.to === 'DNP';
        text = `${who}: practice ${word[ch.from] || 'not listed'} → ${word[ch.to] || 'not listed'}`;
      } else if (ch.field === 'depth' && role === 'starter') {
        const down = ch.to == null || (ch.from != null && ch.to > ch.from);
        urgent = down;
        text = `${who}: depth chart ${ch.from != null ? '#' + ch.from : 'unlisted'} → ${ch.to != null ? '#' + ch.to : 'unlisted'}`;
      } else if (ch.field === 'team') {
        urgent = role === 'starter';
        text = `${who}: team ${ch.from || 'FA'} → ${ch.to || 'FA'}`;
      }
      if (text) out.push({ id, urgent, text, at: ch.at });
    }
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.at - b.at).slice(0, 10);
}

// ---------- before kickoff ----------
// Weeks 15-17 have Saturday games, and Christmas can fall on any weekday. Those starters lock before
// the usual Sunday check. Within LOCK_LEAD of a kickoff that isn't Thursday night, Sunday or Monday
// night, send one heads-up naming your starters in it; on any day, a starter in a game about to
// start who is Out, Doubtful or Questionable gets an alert with the bench player to swap in.
const LOCK_LEAD = 100 * 60000; // inactives come out about 90 minutes before kickoff
const FLEX = { FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'] };
const DAY = { Fri: 'Friday', Sat: 'Saturday', Tue: 'Tuesday', Wed: 'Wednesday' };
const fits = (slot, pos) => (FLEX[slot] ? FLEX[slot].includes(pos) : slot === pos);

function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { wd: parts.weekday, label: `${parts.weekday} ${parts.hour}:${parts.minute} ${parts.dayPeriod || ''}`.trim(), md: `${parts.month} ${parts.day}` };
}

// worst of Sleeper, the official report and ESPN
function statusOf(snap, pid) {
  const p = snap.players?.[pid] || {};
  let best = p.inj || null;
  for (const v of [p.off?.status, ...(snap.notes || []).filter((n) => n.pid === pid).map((n) => n.status)]) if (sev(v) > sev(best)) best = v;
  return best;
}

function lockItems(snap, sent, opts = {}) {
  const now = opts.now ?? Date.now();
  const tz = snap.meta?.tz;
  const W = snap.meta?.week;
  const me = (snap.teams || []).find((t) => t.isMe);
  const games = snap.schedule?.[W]?.games || [];
  if (!me || !games.length) return [];
  const kick = {};
  for (const g of games) {
    const t = Date.parse(g.date);
    if (!Number.isFinite(t) || g.state !== 'pre') continue;
    kick[g.home.t] = t;
    kick[g.away.t] = t;
  }
  const slots = (snap.league?.rosterPositions || []).filter((s) => s !== 'BN');
  const starters = (me.starters || []).map((x) => (x && x !== '0' ? x : null));
  const startSet = new Set(starters.filter(Boolean));
  const bench = (me.players || []).filter((id) => !startSet.has(id) && !(me.reserve || []).includes(id) && !(me.taxi || []).includes(id));
  const out = [];
  const used = new Set();
  const bySlot = {};
  starters.forEach((pid, i) => {
    if (!pid) return;
    const p = snap.players?.[pid];
    const t = kick[p?.team];
    if (t == null || t - now > LOCK_LEAD || t <= now) return;
    (bySlot[t] ||= []).push(pid);
    const st = statusOf(snap, pid);
    if (sev(st) < 2) return;
    const id = `lock|${pid}|${t}|${st}`;
    if (sent[id]) return;
    // best healthy bench player whose game hasn't started and who can fill this slot
    const slot = slots[i] || p.pos;
    const sub = bench
      .filter((b) => !used.has(b) && fits(slot, snap.players?.[b]?.pos) && sev(statusOf(snap, b)) < 2 && kick[snap.players?.[b]?.team] != null && kick[snap.players[b].team] > now)
      .sort((a, b) => (snap.players[b].proj?.pts || 0) - (snap.players[a].proj?.pts || 0))[0];
    if (sub) used.add(sub);
    const when = localParts(t, tz).label;
    const subTxt = sub ? ` Swap in ${snap.players[sub].n} (${(snap.players[sub].proj?.pts || 0).toFixed(1)} proj, kicks off ${localParts(kick[snap.players[sub].team], tz).label}).` : ' No healthy bench player fits that spot.';
    const text = sev(st) >= 3
      ? `${p.n} (${p.pos}, ${slot}) is ${st} and locks ${when}.${subTxt}`
      : `${p.n} (${p.pos}, ${slot}) is Questionable, game ${when}. Check inactives ~90 min before kickoff.${sub ? ` Backup: ${snap.players[sub].n}.` : ''}`;
    out.push({ id, urgent: sev(st) >= 3, text, at: t, lock: true });
  });
  // A hole in the lineup: an empty starting slot, or a starter whose team has no game this week
  // (bye) or no team. Nothing else catches these. Sent once per game day, before that day's first
  // kickoff, while it is still unfixed.
  const playing = new Set(games.flatMap((g) => [g.home?.t, g.away?.t]).filter(Boolean));
  const soon = Object.values(kick).filter((t) => t > now && t - now <= LOCK_LEAD);
  if (soon.length) {
    const first = Math.min(...soon);
    const { md, label } = localParts(first, tz);
    starters.forEach((pid, i) => {
      const slot = slots[i];
      if (!slot) return;
      const p = pid ? snap.players?.[pid] : null;
      const why = !pid ? 'empty' : !p?.team ? 'no team' : !playing.has(p.team) ? 'bye' : null;
      if (!why) return;
      const id = `hole|${W}|${i}|${pid || '-'}|${md}`;
      if (sent[id]) return;
      const sub = bench
        .filter((b) => !used.has(b) && fits(slot, snap.players?.[b]?.pos) && sev(statusOf(snap, b)) < 2 && kick[snap.players?.[b]?.team] > now)
        .sort((a, b) => (snap.players[b].proj?.pts || 0) - (snap.players[a].proj?.pts || 0))[0];
      if (sub) used.add(sub);
      const subTxt = sub ? ` Start ${snap.players[sub].n} (${(snap.players[sub].proj?.pts || 0).toFixed(1)} proj).` : ' No healthy bench player fits: add a free agent.';
      const what = why === 'empty' ? `Your ${slot} spot is empty` : why === 'bye' ? `${p.n} (${slot}) is on a bye` : `${p.n} (${slot}) has no NFL team`;
      out.push({ id, urgent: true, text: `${what}; games start ${label}.${subTxt}`, at: first, lock: true });
    });
  }
  // heads-up for an unusual day (Saturday, Christmas, Friday, ...): your starters lock early
  for (const [t, pids] of Object.entries(bySlot)) {
    const { wd, label, md } = localParts(Number(t), tz);
    if (['Thu', 'Sun', 'Mon'].includes(wd) && md !== 'Dec 25') continue;
    const id = `slate|${t}`;
    if (sent[id]) continue;
    const names = pids.map((pid) => snap.players[pid].n).join(', ');
    out.push({ id, urgent: false, text: `${md === 'Dec 25' ? 'Christmas' : DAY[wd] || wd} game: ${names} lock${pids.length === 1 ? 's' : ''} at ${label}. Set your lineup now.`, at: Number(t), lock: true });
  }
  return out;
}

// Server: build the snapshot on a timer only around kickoffs, so lock alerts go out with the site closed.
function kickoffSoon(snap, now = Date.now()) {
  if (!snap) return true;
  const games = snap.schedule?.[snap.meta?.week]?.games || [];
  return games.some((g) => {
    const t = Date.parse(g.date);
    return g.state === 'in' || (g.state === 'pre' && Number.isFinite(t) && t - now <= LOCK_LEAD + 15 * 60000 && t > now - 15 * 60000);
  });
}

// Server timer: rebuild every 5 minutes around kickoffs (lock alerts), and otherwise every
// `everyMin` minutes (default 30, from config alerts.everyMin) so a Wednesday-night IR move or an
// overnight Questionable -> Out reaches your phone with the site closed. Before, status changes were
// only noticed when someone opened the site. 0 turns the background refresh off (kickoffs only).
const EVERY_MIN = 30;
function refreshDue(snap, builtAt, now = Date.now(), everyMin = EVERY_MIN) {
  if (!snap || !builtAt) return true;
  if (kickoffSoon(snap, now)) return true;
  const every = Number(everyMin);
  if (!(every > 0)) return false;
  return now - builtAt >= Math.max(10, every) * 60000 - 30000; // 30s slack so a 5-minute tick doesn't skip a beat
}

function payload(cfg, items, league) {
  const title = items.every((i) => i.lock)
    ? `${items.some((i) => i.urgent) ? '⚠ ' : ''}${league}: lineup locks soon`
    : `${items.some((i) => i.urgent) ? '⚠ ' : ''}${league}: ${items.length} roster update${items.length > 1 ? 's' : ''}`;
  const body = items.map((i) => `${i.urgent ? '• ⚠ ' : '• '}${i.text}`).join('\n');
  if (cfg.ntfy) {
    return {
      url: cfg.ntfy,
      init: { method: 'POST', body, headers: { Title: title, Priority: items.some((i) => i.urgent) ? '4' : '3', Tags: 'football' } },
    };
  }
  const fmt = cfg.format || 'json';
  const json = fmt === 'discord' ? { content: `**${title}**\n${body}` } : fmt === 'slack' ? { text: `*${title}*\n${body}` } : { title, items };
  return { url: cfg.webhook, init: { method: 'POST', body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } } };
}

// Side effects: reads/writes the sent log and POSTs. Never throws.
async function checkAlerts(snap, cfg, opts = {}) {
  if (!cfg || (!cfg.ntfy && !cfg.webhook)) return { sent: 0, skipped: 'not configured' };
  const now = opts.now ?? Date.now();
  const file = opts.file || DEFAULT_FILE;
  const doFetch = opts.fetch || fetch;
  if (snap.meta?.staleSince) return { sent: 0, skipped: 'stale snapshot' };
  const sent = readSent(file);
  // lock alerts are tied to a kickoff, so they go out even in quiet hours
  const lock = lockItems(snap, sent, { now });
  const quiet = inQuiet(now, snap.meta?.tz, cfg.quietHours);
  if (quiet && !lock.length) return { sent: 0, skipped: 'quiet hours' };
  const items = [...lock.sort((a, b) => Number(b.urgent) - Number(a.urgent)), ...(quiet ? [] : pending(snap, sent, { now, scope: cfg.scope }))].slice(0, 12);
  if (!items.length) return { sent: 0 };
  const { url, init } = payload(cfg, items, snap.league?.name || 'Roster Monitor');
  try {
    const res = await doFetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn('Alert not sent:', err.message);
    return { sent: 0, error: err.message };
  }
  for (const i of items) sent[i.id] = now;
  for (const k of Object.keys(sent)) if (now - sent[k] > KEEP) delete sent[k];
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(sent));
  } catch {}
  return { sent: items.length };
}

module.exports = { checkAlerts, pending, payload, inQuiet, lockItems, kickoffSoon, refreshDue };
