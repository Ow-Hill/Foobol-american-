// Official NFL injury report (game status + practice participation) from nflverse's public
// release files. This is the signal the headline scanner tries to read second-hand; taking it
// directly means practice status no longer depends on a headline being found, and it is what the
// "chance to play" numbers in public/js/fitted.js were measured on. Off when the fetch fails.
const { memo } = require('./sources');

const URL = (season) => `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;
const TEAM_FIX = { LA: 'LAR', WSH: 'WAS', JAC: 'JAX' };
const key = (n) => String(n || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const prac = (s) => (/Full/.test(s) ? 'FP' : /Limited/.test(s) ? 'LP' : /Did Not/.test(s) ? 'DNP' : null);

// { "name|POS|TEAM": { status, prac, injury } } for one week; {} when unavailable.
async function officialReport(season, week) {
  return memo(`nflverse:inj:${season}:${week}`, 30 * 60 * 1000, async () => {
    const res = await fetch(URL(season), { headers: { 'User-Agent': 'ff-roster-monitor/1.0' }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`nflverse injuries ${res.status}`);
    const out = {};
    for (const r of parseCsv(await res.text())) {
      if (Number(r.week) !== Number(week) || (r.game_type && r.game_type !== 'REG')) continue;
      if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(r.position)) continue;
      const team = TEAM_FIX[r.team] || r.team;
      out[`${key(r.full_name)}|${r.position}|${team}`] = { status: r.report_status || null, prac: prac(r.practice_status), injury: (r.report_primary_injury || r.practice_primary_injury || '').trim() || null };
    }
    return out;
  });
}

// Adds p.off = { status, prac, injury } to matching players. Returns how many matched.
function attach(players, report) {
  let n = 0;
  for (const p of Object.values(players)) {
    const hit = report[`${key(p.n)}|${p.pos}|${p.team}`];
    if (hit) {
      p.off = hit;
      n++;
    }
  }
  return n;
}

module.exports = { officialReport, attach, parseCsv };
