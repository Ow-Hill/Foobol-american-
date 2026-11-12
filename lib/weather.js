// Wind at kickoff for outdoor games. In 2022-2026, at 15+ mph outdoors, quarterbacks scored about
// 2 points under their projection and kickers 1.3 (backtest E10); projections don't account for
// it. Forecast from Open-Meteo (free, no key), one request per stadium per hour, only for
// outdoor games in the next five days. Any failure means no flag, never a broken page.
const { memo, getJson } = require('./sources');

// Outdoor (and open-air international) venues. Domes and retractable roofs are left out:
// ESPN marks them indoor and wind doesn't matter there.
const VENUES = [
  ['metlife', 40.8135, -74.0745], ['huntington bank', 41.5061, -81.6995], ['cleveland browns stadium', 41.5061, -81.6995],
  ['lambeau', 44.5013, -88.0622], ['nissan stadium', 36.1665, -86.7713], ['paycor', 39.0954, -84.516],
  ['m&t bank', 39.278, -76.6227], ['highmark', 42.7738, -78.787], ['gillette', 42.0909, -71.2643],
  ['lincoln financial', 39.9008, -75.1675], ['acrisure', 40.4468, -80.0158], ['soldier field', 41.8623, -87.6167],
  ['arrowhead', 39.0489, -94.4839], ['mile high', 39.7439, -105.0201], ['hard rock', 25.958, -80.2389],
  ['raymond james', 27.9759, -82.5033], ['everbank', 30.3239, -81.6373], ['tiaa bank', 30.3239, -81.6373],
  ['bank of america', 35.2258, -80.8528], ['northwest stadium', 38.9078, -76.8645], ['fedexfield', 38.9078, -76.8645],
  ['levi', 37.403, -121.97], ['lumen', 47.5952, -122.3316], ['bayern', 48.2188, 11.6247], ['allianz arena', 48.2188, 11.6247],
  ['tottenham', 51.6043, -0.0664], ['wembley', 51.556, -0.2796], ['croke park', 53.3607, -6.2512],
];
const WINDOW = 5 * 86400000;

function coords(venueName) {
  const v = String(venueName || '').toLowerCase();
  const hit = VENUES.find(([k]) => v.includes(k));
  return hit ? { lat: hit[1], lon: hit[2] } : null;
}

// Hourly wind (mph) for a location; memoised an hour.
const hourly = (lat, lon, doFetch) =>
  memo(`wind:${lat},${lon}`, 3600 * 1000, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m&wind_speed_unit=mph&timezone=UTC&forecast_days=6`;
    const j = doFetch ? await doFetch(url) : await getJson(url, 15000);
    if (!j?.hourly?.time) throw new Error(j?.reason || 'no forecast');
    return j.hourly;
  });

// games: parsed scoreboard games (with .venue {name, indoor}); sets g.wind = { mph, gust } in place.
async function addWind(games, opts = {}) {
  const now = opts.now ?? Date.now();
  let n = 0;
  await Promise.all(
    (games || []).map(async (g) => {
      const t = new Date(g.date).getTime();
      if (!g.venue || g.venue.indoor || !(t > now - 3 * 3600000 && t < now + WINDOW)) return;
      const c = coords(g.venue.name);
      if (!c) return;
      try {
        const h = await hourly(c.lat, c.lon, opts.fetch);
        const hour = new Date(Math.round(t / 3600000) * 3600000).toISOString().slice(0, 13);
        const i = h.time.findIndex((x) => x.startsWith(hour));
        if (i < 0) return;
        g.wind = { mph: Math.round(h.wind_speed_10m[i]), gust: Math.round(h.wind_gusts_10m?.[i] ?? h.wind_speed_10m[i]) };
        n++;
      } catch {}
    }),
  );
  return n;
}

module.exports = { addWind, coords };
