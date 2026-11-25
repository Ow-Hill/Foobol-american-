// Optional shared password for when the site is reachable from outside your machine (a Cloudflare
// Tunnel, a host). Set SITE_PASSWORD in the environment to turn it on; without it the site is open,
// as before. HTTP Basic auth: the browser asks once and remembers it, and the page's own fetches
// to /api/* carry it automatically. Any username works; only the password is checked.
const crypto = require('crypto');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10; // per client per 10 minutes, then 429 until the window passes

function makeAuth(password = process.env.SITE_PASSWORD, now = () => Date.now()) {
  const want = password ? crypto.createHash('sha256').update(String(password)).digest() : null;
  const fails = new Map();
  const clientOf = (req) => String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || 'unknown');

  // Returns null when the request may go on, or { status, headers, body } to send instead.
  function check(req) {
    if (!want) return null;
    const url = req.url || '/';
    if (url === '/api/health' || url.startsWith('/api/health?')) return null; // uptime checks
    const who = clientOf(req);
    const t = now();
    const f = (fails.get(who) || []).filter((x) => t - x < WINDOW_MS);
    if (f.length >= MAX_FAILS) return { status: 429, headers: { 'Content-Type': 'text/plain', 'Retry-After': '600' }, body: 'Too many wrong passwords. Try again in 10 minutes.' };
    const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
    if (m) {
      const dec = Buffer.from(m[1], 'base64').toString('utf8');
      const pass = dec.slice(dec.indexOf(':') + 1);
      const got = crypto.createHash('sha256').update(pass).digest();
      if (crypto.timingSafeEqual(got, want)) {
        fails.delete(who);
        return null;
      }
      f.push(t);
      fails.set(who, f);
    }
    return { status: 401, headers: { 'Content-Type': 'text/plain', 'WWW-Authenticate': 'Basic realm="Roster Monitor", charset="UTF-8"' }, body: 'Password required.' };
  }
  return { check, enabled: !!want };
}

module.exports = { makeAuth };
