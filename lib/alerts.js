// Push alerts for status changes on my roster: the site only helps when it is open, and the
// changes that flip a lineup (Questionable → Out, a depth-chart demotion, a trade) happen when it
// is not. Sends one batched message per snapshot build to an ntfy topic or a Discord/Slack/JSON
// webhook. Off unless config.json has an `alerts` block. Only dated, confirmed changes are sent:
// never headlines, speculation or ripple estimates.
//
// config.json:
//   "alerts": { "ntfy": "https://ntfy.sh/<topic>" }                          or
//   "alerts": { "webhook": "<url>", "format": "discord" | "slack" | "json" }
//   optional: "quietHours": [23, 7]  (league time zone; held, then sent after)
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

function payload(cfg, items, league) {
  const title = `${items.some((i) => i.urgent) ? '⚠ ' : ''}${league}: ${items.length} roster update${items.length > 1 ? 's' : ''}`;
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
  if (inQuiet(now, snap.meta?.tz, cfg.quietHours)) return { sent: 0, skipped: 'quiet hours' };
  const sent = readSent(file);
  const items = pending(snap, sent, { now, scope: cfg.scope });
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

module.exports = { checkAlerts, pending, payload, inQuiet };
