// December weather flags from the Open-Meteo hourly forecast (lib/weather.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { conditions, addWind } = require('../lib/weather');

const hours = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const fc = (over = {}) => ({
  time: hours(6, (i) => `2026-12-20T${String(17 + i).padStart(2, '0')}:00`),
  wind_speed_10m: hours(6, () => 8), wind_gusts_10m: hours(6, () => 12),
  temperature_2m: hours(6, () => 40), precipitation: hours(6, () => 0), snowfall: hours(6, () => 0), weather_code: hours(6, () => 3),
  ...over,
});

test('a mild dry game is no flag, only the temperature', () => {
  assert.deepEqual(conditions(fc(), 1), { tempF: 40 });
});

test('snow over the first three hours is flagged with an amount', () => {
  const w = conditions(fc({ snowfall: hours(6, () => 0.4), precipitation: hours(6, () => 0.04), weather_code: hours(6, () => 73), temperature_2m: hours(6, () => 28) }), 1);
  assert.equal(w.snow, true);
  assert.equal(w.rain, false, 'snow is not also called rain');
  assert.equal(w.snowIn, 1.2);
});

test('steady rain and a freezing kickoff are flagged', () => {
  assert.equal(conditions(fc({ precipitation: hours(6, () => 0.08) }), 1).rain, true);
  assert.equal(conditions(fc({ precipitation: hours(6, () => 0.01) }), 1).rain, undefined, 'drizzle is not a flag');
  const c = conditions(fc({ temperature_2m: hours(6, () => 18) }), 1);
  assert.equal(c.cold, true);
  assert.equal(c.tempF, 18);
});

test('addWind sets wind and weather on outdoor games and skips domes', async () => {
  const now = Date.parse('2026-12-18T12:00:00Z');
  const out = { date: '2026-12-20T18:00:00Z', venue: { name: 'Highmark Stadium', indoor: false } };
  const dome = { date: '2026-12-20T18:00:00Z', venue: { name: 'Ford Field', indoor: true } };
  const body = fc({ snowfall: hours(6, () => 0.3), weather_code: hours(6, () => 75), temperature_2m: hours(6, () => 22) });
  const n = await addWind([out, dome], { now, fetch: async () => ({ hourly: body }) });
  assert.equal(n, 1);
  assert.equal(out.wind.mph, 8);
  assert.equal(out.wx.snow, true);
  assert.equal(out.wx.cold, true);
  assert.equal(dome.wx, undefined);
});
