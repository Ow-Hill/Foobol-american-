// Trade-market values: what managers actually pay for a player in real Sleeper trades, from
// Dynasty Dealer's free API (values built from 600k+ real Sleeper trades, redraft model,
// recalculated daily). Their terms: free for any use with a visible link to dynastydealer.com,
// so every page that shows these numbers says "Values by Dynasty Dealer" with that link.
// Shown as a second opinion next to the site's own trade value; it does not change any
// recommendation until the calibration in backtest/market.mjs says it should.
// Best effort and cached for a day: a failure means no market column, never a broken page.
// MARKET_VALUES=0 turns it off.
const fs = require('fs');
const path = require('path');
const { memo } = require('./sources');

const URL = 'https://www.dynastydealer.com/api/player-values?format=redraft&scoring=ppr';
const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'market-values.json');
const DAY = 24 * 3600 * 1000;
const ENABLED = process.env.MARKET_VALUES !== '0';
const SOURCE = { name: 'Dynasty Dealer', url: 'https://www.dynastydealer.com' };

// The response is a list of { sleeper_id, name, position, base_value, current_value, ... };
// accept a bare array or one wrapped in { players | data | values }.
function parse(json) {
  const list = Array.isArray(json) ? json : json?.players || json?.data || json?.values || [];
  const rows = [];
  for (const r of list) {
    const id = r.sleeper_id ?? r.sleeperId;
    const raw = Number(r.base_value ?? r.value ?? r.current_value);
    if (id == null || !(raw > 0)) continue;
    rows.push({ id: String(id), raw, pos: r.position || null });
  }
  rows.sort((a, b) => b.raw - a.raw);
  const max = rows[0]?.raw || 1;
  const by = {};
  rows.forEach((r, i) => (by[r.id] = { v: Math.round((r.raw / max) * 1000) / 10, raw: r.raw, rank: i + 1, pos: r.pos }));
  return by;
}

async function marketValues() {
  if (!ENABLED) return null;
  return memo('market:values', DAY, async () => {
    try {
      const st = fs.statSync(FILE);
      if (Date.now() - st.mtimeMs < DAY) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {}
    const res = await fetch(URL, { headers: { 'User-Agent': 'ff-roster-monitor/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`${res.status} ${URL}`);
    const out = { at: Date.now(), by: parse(await res.json()) };
    try {
      fs.mkdirSync(DATA, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(out));
    } catch {}
    return out;
  });
}

// Adds p.mkt = { v (0-100, best player 100), rank } to matching players. Returns how many matched.
function attach(players, m) {
  if (!m?.by) return 0;
  let n = 0;
  for (const p of Object.values(players)) {
    const e = m.by[p.id];
    if (e) {
      p.mkt = { v: e.v, rank: e.rank };
      n++;
    }
  }
  return n;
}

module.exports = { marketValues, attach, parse, SOURCE, ENABLED };
