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
  { section: 'This week' },
  { id: 'briefing', label: 'Briefing', ico: '◉', mod: briefing },
  { id: 'lineup', label: 'Lineup', ico: '▤', mod: lineup },
  { id: 'injuries', label: 'Injuries', ico: '✚', mod: injuries },
  { id: 'waivers', label: 'Waivers', ico: '⇄', mod: waivers },
  { id: 'news', label: 'News', ico: '≣', mod: news },
  { section: 'Make moves' },
  { id: 'trades', label: 'Trade lab', ico: '⇋', mod: trades },
  { id: 'finder', label: 'Trade finder', ico: '⌕', mod: finder },
  { id: 'values', label: 'Values & start/sit', ico: '⚖', mod: values },
  { section: 'Season' },
  { id: 'season', label: 'Season', ico: '◔', mod: season },
  { id: 'path', label: 'Playoff path', ico: '⛳', mod: path },
  { id: 'rate', label: 'Rate my team', ico: '★', mod: rate },
  { id: 'turning', label: 'Turning points', ico: '↯', mod: turning },
  { id: 'draft', label: 'Draft plan', ico: '✦', mod: draft },
  { section: 'League' },
  { id: 'report', label: 'Weekly report', ico: '✎', mod: report },
  { id: 'recap', label: 'Video recaps', ico: '▶', mod: recap },
  { id: 'historian', label: 'League historian', ico: '⌛', mod: historian },
  { id: 'rivalry', label: 'Rivalry reports', ico: '⚔', mod: rivalry },
  { id: 'story', label: 'League story', ico: '❡', mod: story },
  { id: 'managers', label: 'Manager profiles', ico: '☺', mod: managers },
];
const PAGES = ROUTES.filter((r) => r.id);

// Group routes by section for collapsible nav
const GROUPS = [];
let currentGroup = null;
for (const r of ROUTES) {
  if (r.section) {
    currentGroup = { section: r.section, items: [] };
    GROUPS.push(currentGroup);
  } else if (currentGroup) {
    currentGroup.items.push(r);
  }
}

// Nav collapse state from localStorage
function loadNavState() {
  try {
    return JSON.parse(localStorage.getItem('nav.open') || '{}');
  } catch { return {}; }
}
function saveNavState(open) {
  try { localStorage.setItem('nav.open', JSON.stringify(open)); } catch {}
}

const state = { hist: null, HM: null, histAt: 0, snap: null, M: null, rosterId: null, route: 'briefing', ui: {}, loading: false, lastFetch: 0, navBuilt: false, navOpen: loadNavState() };
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

function groupSlug(section) {
  return section.toLowerCase().replace(/[^a-z]+/g, '-');
}

function buildNavOnce() {
  if (state.navBuilt) return;
  const nav = $('#nav');
  nav.setAttribute('aria-label', 'Main');

  // Default: the two working groups open, season/league collapsed
  const defaultOpen = { 'this-week': true, 'make-moves': true };
  for (const g of GROUPS) {
    const slug = groupSlug(g.section);
    if (state.navOpen[slug] === undefined) state.navOpen[slug] = defaultOpen[slug] ?? false;
  }

  nav.innerHTML = `<div class="drawer-head"><b>${esc(state.snap.league.name)}</b><span>${state.snap.meta.season} season</span><span class="dh-as"></span></div>` + GROUPS.map((g) => {
    const slug = groupSlug(g.section);
    const open = state.navOpen[slug];
    const groupId = `nav-group-${slug}`;
    return `
      <button class="nav-group" aria-expanded="${open}" aria-controls="${groupId}" data-group="${slug}">
        <span class="nav-group-label">${g.section}</span>
        <span class="nav-group-meta"><span class="nav-group-count">${g.items.length}</span><span class="nav-group-badge" data-group-badge="${slug}"></span><span class="chev">›</span></span>
      </button>
      <div class="nav-items ${open ? '' : 'collapsed'}" id="${groupId}" data-group-items="${slug}">
        ${g.items.map((r) => `<a href="#/${r.id}" data-route="${r.id}" title="${r.label}"><span class="ico">${r.ico}</span><span class="lbl">${r.label}</span><span class="badge" data-badge="${r.id}"></span></a>`).join('')}
      </div>`;
  }).join('') + `<div class="foot">Advice only.</div>`;

  // Group toggle handler
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-group');
    if (!btn) return;
    const slug = btn.dataset.group;
    const items = nav.querySelector(`[data-group-items="${slug}"]`);
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', !open);
    items.classList.toggle('collapsed', open);
    state.navOpen[slug] = !open;
    saveNavState(state.navOpen);
  });

  state.navBuilt = true;
}

function updateNavBadges() {
  const { M } = state;
  const probs = M.problems();
  const crit = probs.filter((p) => p.sev === 'critical').length;
  const warn = probs.filter((p) => p.sev === 'warn').length;
  const injBad = M.injuryRows().filter((r) => r.action.bad).length;
  const hardSwaps = M.swaps().filter((s) => s.band === 'hard').length;

  const badges = { briefing: crit || warn, lineup: hardSwaps, injuries: injBad };
  const amberIds = new Set(crit ? [] : ['briefing']);
  const badgeMeaning = { briefing: 'problems need attention', lineup: 'hard lineup swaps', injuries: 'players need an injury check' };

  // Update individual link badges + fold the count into the accessible name
  document.querySelectorAll('#nav .badge[data-badge]').forEach((el) => {
    const id = el.dataset.badge;
    const n = badges[id] || 0;
    el.textContent = n || '';
    el.classList.toggle('amber', amberIds.has(id) && n);
    el.classList.toggle('show', !!n);
    const link = el.closest('a');
    const lbl = link.querySelector('.lbl')?.textContent || '';
    link.setAttribute('aria-label', n ? `${lbl}, ${n} ${badgeMeaning[id] || 'alerts'}` : lbl);
  });

  // Update group rolled-up badges (sum of badges in that group)
  for (const g of GROUPS) {
    const slug = groupSlug(g.section);
    const groupBadgeEl = document.querySelector(`[data-group-badge="${slug}"]`);
    if (!groupBadgeEl) continue;
    const total = g.items.reduce((sum, r) => sum + (badges[r.id] || 0), 0);
    const hasAmber = g.items.some((r) => amberIds.has(r.id) && badges[r.id]);
    groupBadgeEl.textContent = total || '';
    groupBadgeEl.classList.toggle('show', total > 0);
    groupBadgeEl.classList.toggle('amber', hasAmber && !crit);
  }
}

function renderChrome() {
  const { snap, M } = state;
  $('#leagueName').textContent = snap.league.name + ' · ' + snap.meta.season;
  const sel = $('#teamSelect');
  sel.innerHTML = snap.teams.map((t) => `<option value="${t.id}" ${t.id === state.rosterId ? 'selected' : ''}>${esc(t.owner)}${t.isMe ? ' (you)' : ''}</option>`).join('');
  buildNavOnce();
  updateNavBadges();
  const dhAs = document.querySelector('#nav .drawer-head .dh-as');
  if (dhAs) dhAs.textContent = 'Viewing as · ' + M.ownerName(M.me.id);
  $('#sleeperLink').href = 'https://sleeper.com/leagues/' + snap.meta.leagueId;
  const crit = M.problems().filter((p) => p.sev === 'critical').length;
  document.title = (crit ? `(${crit}) ` : '') + 'Roster Monitor · ' + snap.league.name;
  tick();
}

function updateNavActive() {
  let activeGroup = null;
  document.querySelectorAll('#nav a').forEach((a) => {
    const isActive = a.dataset.route === state.route;
    a.classList.toggle('active', isActive);
    a.setAttribute('aria-current', isActive ? 'page' : '');
    if (isActive) {
      const items = a.closest('.nav-items');
      if (items) activeGroup = items.dataset.groupItems;
    }
  });
  // The group containing the current page is always open
  if (activeGroup && state.navBuilt) {
    const btn = document.querySelector(`.nav-group[data-group="${activeGroup}"]`);
    const items = document.querySelector(`.nav-items[data-group-items="${activeGroup}"]`);
    if (btn && items && btn.getAttribute('aria-expanded') === 'false') {
      btn.setAttribute('aria-expanded', 'true');
      items.classList.remove('collapsed');
      state.navOpen[activeGroup] = true;
      saveNavState(state.navOpen);
    }
  }
}

function renderView() {
  const { M } = state;
  const route = PAGES.find((r) => r.id === state.route);
  const scroll = window.scrollY;
  const ctx = { state, ui: state.ui, rerender: renderView, go, HM: state.HM };
  viewEl.innerHTML = route.mod.render(M, ctx);
  route.mod.mount?.(viewEl, M, ctx);
  updateNavActive();
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
  clocks.push({ label: 'Waivers process', value: countdown(wv - now), sub: M.waiverDayName(), cls: '' });
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

// ---------- mobile drawer ----------
const mqDesktop = window.matchMedia('(min-width: 980px)');
function setDrawer(open, { noFocus = false } = {}) {
  const nav = $('#nav');
  const bd = $('#navBackdrop');
  const btn = $('#menuBtn');
  nav.classList.toggle('open', open);
  bd.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.classList.toggle('drawer-open', open);
  if (!noFocus) {
    if (open) nav.querySelector('a')?.focus();
    else btn.focus();
  }
}
const drawerOpen = () => $('#nav').classList.contains('open');
$('#menuBtn').addEventListener('click', () => setDrawer(!drawerOpen()));
$('#navBackdrop').addEventListener('click', () => setDrawer(false, { noFocus: false }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawerOpen()) setDrawer(false);
});
// close the drawer when a nav link is chosen; keep focus from landing in the hidden panel
$('#nav').addEventListener('click', (e) => {
  if (e.target.closest('a') && drawerOpen()) {
    setDrawer(false, { noFocus: true });
    $('#view').focus({ preventScroll: true });
  }
});
mqDesktop.addEventListener('change', () => {
  if (mqDesktop.matches && drawerOpen()) setDrawer(false, { noFocus: true });
});

state.route = routeFromHash();
load();
setInterval(tick, 1000);
setInterval(() => {
  if (document.visibilityState === 'visible' && Date.now() - state.lastFetch > 120000) load();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - state.lastFetch > 120000) load();
});
