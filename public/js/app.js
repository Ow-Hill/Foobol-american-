import { buildModel } from './model.js';
import { buildHist } from './history.js';
import { esc, fmtKick, fmtDayTime, countdown, ago, setTz, copyText } from './util.js';
import * as briefing from './views/briefing.js';
import * as lineup from './views/lineup.js';
import * as injuries from './views/injuries.js';
import * as waivers from './views/waivers.js';
import * as trades from './views/trades.js';
import * as season from './views/season.js';
import * as news from './views/news.js';
import * as values from './views/values.js';
import * as finder from './views/finder.js';
import * as path from './views/path.js';
import * as report from './views/report.js';
import * as historian from './views/historian.js';
import * as recap from './views/recap.js';
import * as rate from './views/rate.js';
import * as rivalry from './views/rivalry.js';
import * as story from './views/story.js';
import * as turning from './views/turning.js';
import * as managers from './views/managers.js';
import * as draft from './views/draft.js';

const ROUTES = [
  { section: 'Manage' },
  { id: 'briefing', label: 'Briefing', ico: '◉', mod: briefing },
  { id: 'lineup', label: 'Lineup', ico: '▤', mod: lineup },
  { id: 'injuries', label: 'Injuries', ico: '✚', mod: injuries },
  { id: 'waivers', label: 'Waivers', ico: '⇄', mod: waivers },
  { id: 'trades', label: 'Trade lab', ico: '⇋', mod: trades },
  { id: 'season', label: 'Season', ico: '◔', mod: season },
  { id: 'news', label: 'News', ico: '≣', mod: news },
  { section: 'Compete' },
  { id: 'values', label: 'Values & start/sit', ico: '⚖', mod: values },
  { id: 'finder', label: 'Trade finder', ico: '⌕', mod: finder },
  { id: 'path', label: 'Playoff path', ico: '⛳', mod: path },
  { section: 'Share & remember' },
  { id: 'report', label: 'Weekly report', ico: '✎', mod: report },
  { id: 'historian', label: 'League historian', ico: '⌛', mod: historian },
  { id: 'recap', label: 'Video recaps', ico: '▶', mod: recap },
  { id: 'rate', label: 'Rate my team', ico: '★', mod: rate },
  { id: 'rivalry', label: 'Rivalry reports', ico: '⚔', mod: rivalry },
  { id: 'story', label: 'League story', ico: '❡', mod: story },
  { section: 'Plan ahead' },
  { id: 'turning', label: 'Turning points', ico: '↯', mod: turning },
  { id: 'managers', label: 'Manager profiles', ico: '☺', mod: managers },
  { id: 'draft', label: 'Draft plan', ico: '✦', mod: draft },
];
const PAGES = ROUTES.filter((r) => r.id);

const state = { hist: null, HM: null, histAt: 0, snap: null, M: null, rosterId: null, route: 'briefing', ui: {}, loading: false, lastFetch: 0 };
const $ = (s) => document.querySelector(s);
const viewEl = $('#view');

function routeFromHash() {
  const id = location.hash.replace('#/', '').replace('#', '');
  return PAGES.some((r) => r.id === id) ? id : 'briefing';
}

async function load(fresh = false) {
  if (state.loading) return;
  state.loading = true;
  $('#refresh').disabled = true;
  try {
    const res = await fetch('/api/snapshot' + (fresh ? '?fresh=1' : ''));
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    state.snap = await res.json();
    state.lastFetch = Date.now();
    setTz(state.snap.meta.tz);
    if (state.rosterId == null || !state.snap.teams.some((t) => t.id === state.rosterId)) state.rosterId = state.snap.meta.defaultRosterId;
    rebuild();
    loadHistory();
  } catch (err) {
    if (!state.snap) viewEl.innerHTML = `<div class="err callout bad"><b>Couldn't load league data</b><p class="muted">${esc(err.message)}</p><p style="margin-top:10px"><button class="btn" data-act="retry">Try again</button></p></div>`;
    else $('#fresh').textContent = 'refresh failed';
  } finally {
    state.loading = false;
    $('#refresh').disabled = false;
  }
}

async function loadHistory() {
  if (state.hist && Date.now() - state.histAt < 120000) return;
  try {
    const res = await fetch('/api/history');
    if (!res.ok) throw new Error(res.statusText);
    state.hist = await res.json();
    state.histAt = Date.now();
    state.HM = buildHist(state.hist, state.snap);
    rebuild();
  } catch (err) {
    console.warn('History unavailable:', err.message);
  }
}

function rebuild() {
  state.M = buildModel(state.snap, state.rosterId, Date.now(), state.hist);
  renderChrome();
  renderView();
}

function renderChrome() {
  const { snap, M } = state;
  $('#leagueName').textContent = snap.league.name + ' · ' + snap.meta.season;
  const sel = $('#teamSelect');
  sel.innerHTML = snap.teams.map((t) => `<option value="${t.id}" ${t.id === state.rosterId ? 'selected' : ''}>${esc(t.owner)}${t.isMe ? ' (you)' : ''}</option>`).join('');
  const probs = M.problems();
  const crit = probs.filter((p) => p.sev === 'critical').length;
  const warn = probs.filter((p) => p.sev === 'warn').length;
  const injBad = M.injuryRows().filter((r) => r.action.bad).length;
  const badge = (n, amber) => (n ? `<span class="badge ${amber ? 'amber' : ''}">${n}</span>` : '');
  $('#nav').innerHTML =
    ROUTES.map((r) => {
      if (r.section) return `<h4>${r.section}</h4>`;
      let b = '';
      if (r.id === 'briefing') b = badge(crit || warn, !crit);
      if (r.id === 'lineup') b = badge(M.swaps().filter((s) => s.band === 'hard').length || '', false);
      if (r.id === 'injuries') b = badge(injBad, false);
      return `<a href="#/${r.id}" data-route="${r.id}" class="${r.id === state.route ? 'active' : ''}"><span class="ico">${r.ico}</span>${r.label}${b}</a>`;
    }).join('') + `<div class="foot">Advice only. Every move is made in the Sleeper app.<br /><a href="https://sleeper.com/leagues/${snap.meta.leagueId}" target="_blank" rel="noopener">Open league in Sleeper ↗</a></div>`;
  document.title = (crit ? `(${crit}) ` : '') + 'Roster Monitor · ' + snap.league.name;
  tick();
}

function renderView() {
  const { M } = state;
  const route = PAGES.find((r) => r.id === state.route);
  const scroll = window.scrollY;
  const ctx = { state, ui: state.ui, rerender: renderView, go, HM: state.HM };
  viewEl.innerHTML = route.mod.render(M, ctx);
  route.mod.mount?.(viewEl, M, ctx);
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === state.route));
  document.querySelector('#nav a.active')?.scrollIntoView({ block: 'nearest' });
  window.scrollTo(0, scroll);
}

function go(id) {
  if (location.hash !== '#/' + id) location.hash = '#/' + id;
  else onRoute();
}

function onRoute() {
  const next = routeFromHash();
  const changed = next !== state.route;
  state.route = next;
  if (state.M) {
    renderView();
    if (changed) window.scrollTo(0, 0);
  }
}

// ---------- clocks ----------
function tick() {
  const { M, snap } = state;
  if (!M) return;
  const now = Date.now();
  const clocks = [];
  const mine = M.lineup(M.me).active
    .map((id) => M.P(id))
    .filter((p) => p.game && p.game.state === 'pre' && new Date(p.game.date).getTime() > now)
    .sort((a, b) => new Date(a.game.date) - new Date(b.game.date));
  if (mine.length) {
    const g = mine[0].game;
    const ms = new Date(g.date).getTime() - now;
    const same = mine.filter((p) => p.game.date === g.date).length;
    clocks.push({ label: `Next lineup lock · ${mine[0].team} ${g.home ? 'vs' : '@'} ${g.opp}`, value: countdown(ms), sub: fmtKick(g.date), cls: ms < 3 * 3600000 ? 'urgent' : ms < 24 * 3600000 ? 'soon' : '', tip: `${same} of your players` });
  }
  const wv = M.nextWaiverRun();
  clocks.push({ label: 'Waivers process', value: countdown(wv - now), sub: 'Tuesday', cls: '' });
  if (M.deadlineAt && !M.deadlinePassed) {
    const ms = M.acceptBy - now;
    clocks.push({ label: `Trade deadline (Wk ${M.deadlineWeek}) · accept by`, value: countdown(ms), sub: fmtDayTime(M.acceptBy), cls: ms < 24 * 3600000 ? 'urgent' : ms < 4 * 86400000 ? 'soon' : '' });
  }
  $('#clocks').innerHTML = clocks.map((c) => `<div class="clock ${c.cls}" title="${esc(c.tip || '')}"><small>${esc(c.label)}</small><b>${esc(c.value)} <span class="dim" style="font-weight:500;font-family:var(--sans);font-size:12px">${esc(c.sub)}</span></b></div>`).join('');
  $('#fresh').textContent = state.lastFetch ? 'synced ' + ago(snap.meta.builtAt, now) : '';
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const go_ = e.target.closest('[data-go]');
  if (go_) {
    e.preventDefault();
    go(go_.dataset.go);
    return;
  }
  const cp = e.target.closest('[data-copy]');
  if (cp) return copyText(cp.dataset.copy, cp);
  const sh = e.target.closest('[data-share]');
  if (sh) {
    if (navigator.share) return navigator.share({ title: sh.dataset.shareTitle || 'League update', text: sh.dataset.share }).catch(() => {});
    return copyText(sh.dataset.share, sh);
  }
  if (e.target.closest('[data-print]')) return window.print();
  if (e.target.closest('[data-act="retry"]')) return load();
});
$('#refresh').addEventListener('click', () => load(true));
$('#teamSelect').addEventListener('change', (e) => {
  state.rosterId = Number(e.target.value);
  state.ui = {};
  rebuild();
});
window.addEventListener('hashchange', onRoute);

state.route = routeFromHash();
load();
setInterval(tick, 1000);
setInterval(() => {
  if (document.visibilityState === 'visible' && Date.now() - state.lastFetch > 120000) load();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - state.lastFetch > 120000) load();
});
