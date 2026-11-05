export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const n1 = (n) => (n == null || Number.isNaN(n) ? '–' : (Math.round(n * 10) / 10).toFixed(1));
export const n0 = (n) => (n == null || Number.isNaN(n) ? '–' : Math.round(n).toString());
export const signed = (n) => (n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n * 10) / 10).toFixed(1));
export const pct = (n) => (n == null ? '–' : n < 0.005 ? '<1%' : n > 0.995 ? '>99%' : Math.round(n * 100) + '%');
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const sum = (a) => a.reduce((x, y) => x + y, 0);

let TZ = 'America/Toronto';
export const setTz = (tz) => (TZ = tz);

export function fmtKick(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ }).format(d);
  const t = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ, timeZoneName: 'short' }).format(d);
  return `${day} ${t.replace(' ', '\u00a0')}`;
}
export function fmtDay(msOrIso) {
  const d = new Date(msOrIso);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ }).format(d);
}
export function fmtDayTime(msOrIso) {
  const d = new Date(msOrIso);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(d);
}
export function weekdayName(iso) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ }).format(new Date(iso));
}
export function ago(ms, now = Date.now()) {
  if (!ms) return '';
  const s = Math.max(0, (now - new Date(ms).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  const d = Math.round(s / 86400);
  return d + 'd ago';
}
export function countdown(ms) {
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}
export const ord = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const posClass = (pos) => 'pos pos-' + String(pos || 'x').toLowerCase();
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function quantile(arr, q) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export function copyText(text, btn) {
  const done = () => {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => (btn.textContent = old), 1500);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done);
  else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  }
}
