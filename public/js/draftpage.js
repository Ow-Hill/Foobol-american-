// Live draft guide page: follows any Sleeper draft (league or mock) and recommends picks as it goes.
// Data: /api/draft/* (lib/draftlive.js). Logic: draftguide.js. Runs on the home computer, since
// Sleeper is only reachable from there.
import { buildDraftValues, recommend, ownerAt, slotAt, currentPick, ridOfPick, survive, grades, botPick, practicePick, rng, picksOf, DRAFT_BLEND, CAMP } from './draftguide.js';
import { fmtMetric } from './advstats.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n1 = (x) => (x == null || Number.isNaN(x) ? '–' : (Math.round(x * 10) / 10).toFixed(1));
const pct = (x) => (x >= 0.99 ? '>99%' : x <= 0.01 ? '<1%' : Math.round(x * 100) + '%');
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
async function api(path) {
  const r = await fetch(path, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j;
}

const S = { practice: null, trending: {}, tick: null, id: null, board: null, live: null, news: {}, newsAt: 0, V: null, me: null, replay: null, pos: 'ALL', q: '', username: null, timer: null, wasOnClock: false, sound: store.get('dg.sound') === '1', err: null };

// ---------- picking a draft ----------
async function start() {
  const qs = new URLSearchParams(location.search);
  const home = await api('/api/draft/find').catch((e) => ({ home: [], err: e.message }));
  S.username = home.username || null;
  S.userId = home.userId || null;
  if (qs.get('draft')) return follow(qs.get('draft'), qs.get('me'));
  showList(home.home || [], home.err ? `Could not reach Sleeper: ${home.err}` : null, true);
}
const KIND = { 'next season': "Next season's league draft", league: "This season's league draft", mock: 'Your Sleeper mock drafts', 'other league': 'Your other leagues' };
function showList(drafts, err, isHome) {
  const body = $('#body');
  const item = (d) => `<button class="btn" data-draft="${esc(d.id)}"><b>${esc(d.name)}</b> · ${esc(d.season)} · ${esc(d.type)} · ${d.teams || '?'} teams · ${esc(statusText(d.status))}${d.scoring ? ' · ' + esc(d.scoring) : ''}</button>`;
  const groups = {};
  for (const d of drafts) (groups[d.kind || 'found'] ||= []).push(d);
  const html = Object.entries(groups).map(([k, list]) => `<h3 class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:10px 0 6px">${esc(KIND[k] || 'Drafts found')}</h3>${list.map(item).join('')}`).join('');
  const noNext = isHome && !drafts.some((d) => d.kind === 'next season');
  body.innerHTML = `<section class="card"><header class="card-h"><div><h2>${isHome ? 'Your drafts' : 'Drafts found'}</h2><p class="sub">Pick one to follow live. Any Sleeper draft works: your league, another league, or a mock draft (paste its link above).</p></div></header>
    <div class="card-b dlist">${err ? `<p class="err">${esc(err)}</p>` : ''}${html || '<p class="empty">No drafts here yet.</p>'}
    ${noNext ? `<p class="muted" style="font-size:13px">Next season's league draft shows up here on its own once your commissioner renews the league on Sleeper and the draft is created.</p>` : ''}</div></section>
    ${practiceForm()}
    ${footer()}`;
  body.querySelectorAll('[data-draft]').forEach((b) => b.addEventListener('click', () => follow(b.dataset.draft)));
  wirePracticeForm();
}
// ---------- practice drafts ----------
function practiceForm() {
  const opt = (n, sel) => `<option ${n === sel ? 'selected' : ''}>${n}</option>`;
  return `<section class="card"><header class="card-h"><div><h2>Practice draft</h2><p class="sub">Draft against bots right here, with the guide advising every pick. Bots draft like real league-mates: ADP with some noise, filling their lineups, kickers and defenses last. For a practice draft on Sleeper itself, start a mock draft there and follow it above.</p></div></header>
  <div class="card-b"><form id="pf" class="dg-find">
    <label class="muted">Teams <select id="pfT">${[8, 10, 12, 14].map((n) => opt(n, 10)).join('')}</select></label>
    <label class="muted">Rounds <select id="pfR">${[13, 14, 15, 16, 18, 20].map((n) => opt(n, 15)).join('')}</select></label>
    <label class="muted">Scoring <select id="pfS"><option value="ppr">PPR</option><option value="half_ppr">Half PPR</option><option value="std">Standard</option><option value="2qb">Superflex</option></select></label>
    <label class="muted">Your slot <select id="pfM"><option value="0">Random</option>${Array.from({ length: 14 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
    <button class="btn" type="submit">Start practice draft</button></form></div></section>`;
}
function wirePracticeForm() {
  $('#pf')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = Number($('#pfT').value);
    const slot = Number($('#pfM').value) || 1 + Math.floor(Math.random() * t);
    startPractice(`practice-${t}-${$('#pfR').value}-${$('#pfS').value}`, Math.min(slot, t));
  });
}
async function startPractice(id, slot, fromBoard = null) {
  clearTimeout(S.timer);
  $('#body').innerHTML = '<div class="loading"><div class="spinner"></div><p>Setting up the practice draft…</p></div>';
  try {
    const board = fromBoard ? { ...fromBoard, draft: { ...fromBoard.draft, name: 'Practice: ' + fromBoard.draft.name }, names: {}, slotToRoster: null, practice: true } : await api('/api/draft/board?id=' + id);
    S.board = board;
    S.id = fromBoard ? fromBoard.draft.id : id;
    S.V = buildDraftValues(board, S.news);
  } catch (err) {
    $('#body').innerHTML = `<p class="err">Could not set up the practice draft: ${esc(err.message)}</p>`;
    return;
  }
  S.practice = { seed: Date.now() % 100000, slot, picks: [] };
  S.practice.rand = rng(S.practice.seed);
  S.me = slot; // no rosters in a practice draft: a slot is its own team
  S.replay = null;
  S.live = practiceLive();
  render();
  if (!fromBoard) loadNews();
  runBots();
}
function practiceLive() {
  const P = S.practice;
  const done = P.picks.length >= S.board.order.teams * S.board.order.rounds;
  return { status: done ? 'complete' : 'drafting', picks: P.picks, traded: [], slotToRoster: null, draftOrder: null };
}
// Bots pick one at a time (so you can watch the board move) until it is your turn.
function runBots() {
  clearTimeout(S.timer);
  const P = S.practice;
  if (!P) return;
  const B = S.board;
  const now = currentPick(P.picks, B.order);
  if (!now) return render();
  const rid = ownerAt(now, B.order, null, []).rid;
  if (rid === S.me) return;
  S.timer = setTimeout(() => {
    const pid = botPick(B, S.V, P.picks, rid, P.rand);
    if (!pid) return;
    P.picks.push(practicePick(B, S.V, P.picks, pid));
    S.live = practiceLive();
    render();
    runBots();
  }, P.fast ? 30 : 450);
}
function practiceDraftPick(pid) {
  const P = S.practice;
  if (!P || P.picks.some((p) => String(p.pid) === String(pid))) return;
  const now = currentPick(P.picks, S.board.order);
  if (!now || ownerAt(now, S.board.order, null, []).rid !== S.me) return;
  P.picks.push(practicePick(S.board, S.V, P.picks, pid));
  S.live = practiceLive();
  render();
  runBots();
}
$('#find').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  $('#body').innerHTML = '<div class="loading"><div class="spinner"></div><p>Looking it up on Sleeper…</p></div>';
  try {
    const r = await api('/api/draft/find?q=' + encodeURIComponent(q));
    if (r.drafts.length === 1) return follow(r.drafts[0].id);
    showList(r.drafts, r.drafts.length ? null : 'No drafts found for that.', false);
  } catch (err) {
    showList([], err.message, false);
  }
});
const statusText = (s) => ({ pre_draft: 'not started', drafting: 'live now', paused: 'paused', complete: 'finished' })[s] || s;

async function follow(id, me) {
  clearTimeout(S.timer);
  S.practice = null;
  S.id = String(id).replace(/\D/g, '');
  S.replay = null;
  $('#body').innerHTML = '<div class="loading"><div class="spinner"></div><p>Building the player board in this draft\'s scoring…</p></div>';
  try {
    const [board, live] = await Promise.all([api('/api/draft/board?id=' + S.id), api('/api/draft/live?id=' + S.id)]);
    S.board = board;
    S.live = live;
    S.V = buildDraftValues(board, S.news);
  } catch (err) {
    $('#body').innerHTML = `<p class="err">Could not load that draft: ${esc(err.message)}</p>${footer()}`;
    return;
  }
  S.me = pickMe(me);
  const u = new URL(location.href);
  u.searchParams.set('draft', S.id);
  if (S.me != null) u.searchParams.set('me', S.me);
  history.replaceState(null, '', u);
  render();
  loadNews();
  schedule();
}
// Which team is "me": the link, then what this browser remembered, then the configured username.
// The username wins once Sleeper has set the draft order, so a slot guessed before the order was
// set (or a stale link) cannot stick.
function pickMe(fromLink) {
  const s2r = S.live.slotToRoster || S.board.slotToRoster;
  const order = S.live.draftOrder || {};
  for (const [uid, slot] of Object.entries(order)) {
    const nm = S.board.names?.[slot];
    if ((S.userId && uid === S.userId) || (S.username && nm?.owner && nm.owner.toLowerCase() === S.username.toLowerCase())) return Number(s2r?.[slot] ?? slot);
  }
  if (fromLink != null && fromLink !== '') return Number(fromLink);
  const saved = store.get('dg.me.' + S.id);
  if (saved) return Number(saved);
  return null;
}
function teamOptions() {
  const s2r = S.live.slotToRoster || S.board.slotToRoster;
  const out = [];
  for (let slot = 1; slot <= S.board.order.teams; slot++) {
    const nm = S.board.names?.[slot];
    out.push({ rid: Number(s2r?.[slot] ?? slot), slot, name: nm?.name || `Slot ${slot}` });
  }
  return out;
}
const nameOfRid = (rid) => teamOptions().find((t) => t.rid === Number(rid))?.name || `Team ${rid}`;

// ---------- polling ----------
function schedule() {
  clearTimeout(S.timer);
  const st = S.live?.status;
  if (st === 'complete') return;
  // every 3 s while drafting, every 1.5 s when you are up within two picks
  const near = S.lastRec?.target && S.lastRec.now && S.lastRec.target - S.lastRec.now <= 2;
  const ms = st === 'drafting' ? (near ? 1500 : 3000) : 20000;
  S.timer = setTimeout(async () => {
    try {
      const live = await api('/api/draft/live?id=' + S.id);
      const changed = live.picks.length !== S.live.picks.length || live.status !== S.live.status || !!live.draftOrder !== !!S.live.draftOrder || live.lastPicked !== S.live.lastPicked;
      const orderArrived = live.draftOrder && !S.live.draftOrder;
      S.live = live;
      if (orderArrived) S.me = pickMe(null) ?? S.me;
      S.err = null;
      if (changed) render();
      else updateClock();
    } catch (err) {
      S.err = err.message;
      updateClock();
    }
    if (Date.now() - S.newsAt > 3 * 60 * 1000) loadNews();
    schedule();
  }, document.hidden && st !== 'drafting' ? ms * 3 : ms);
}
async function loadNews() {
  S.newsAt = Date.now();
  // research follows the pool: the guide's picks first, then the best players still on the board
  const taken = new Set((S.live?.picks || []).map((p) => String(p.pid)));
  const ids = [...(S.lastRec?.top?.map((c) => c.r.pid) || []), ...(S.V?.rows || []).filter((r) => !taken.has(String(r.pid)) && r.pos !== 'DEF').slice(0, 40).map((r) => r.pid)];
  try {
    const r = await api(`/api/draft/news?id=${encodeURIComponent(S.id)}&pids=${[...new Set(ids)].slice(0, 50).join(',')}`);
    S.news = r.items || {};
    S.trending = r.trending || {};
    S.newsInfo = r;
    S.V = buildDraftValues(S.board, S.news);
    render();
    // the first run fetches in the background: ask again shortly for the rest
    if (r.missing > 0 && Date.now() - (S.firstNews ||= Date.now()) < 5 * 60 * 1000) setTimeout(loadNews, 20000);
  } catch {}
}

// ---------- rendering ----------
function liveView() {
  if (S.replay == null) return S.live;
  return { ...S.live, picks: S.live.picks.filter((p) => p.no < S.replay), status: 'drafting' };
}
function render() {
  const B = S.board;
  const live = liveView();
  const order = B.order;
  const auction = order.type === 'auction';
  const me = S.me;
  const rec = me != null && !auction ? recommend(B, S.V, live, me) : null;
  S.lastRec = rec;
  const now = currentPick(live.picks, order);
  const onClock = !!rec?.onClock && live.status === 'drafting';
  if (onClock && !S.wasOnClock && S.replay == null) alertMe();
  S.wasOnClock = onClock;
  document.title = onClock ? '● Your pick · Live draft guide' : 'Live draft guide · Roster Monitor';

  const s2r = live.slotToRoster || B.slotToRoster;
  const clockRid = now ? ownerAt(now, order, s2r, live.traded).rid : null;
  const rp = now ? slotAt(now, order) : null;
  const P = S.practice;
  const noOrder = !P && !live.draftOrder && live.status === 'pre_draft';
  const status = `<div class="dg-status ${onClock ? 'onclock' : ''}" id="status">
    <div><small>${esc(B.draft.name)}${String(B.draft.name).includes(B.draft.season) ? '' : ' · ' + esc(B.draft.season)}</small><span class="big">${onClock ? "You're on the clock" : live.status === 'complete' ? 'Draft finished' : live.status === 'pre_draft' ? 'Not started yet' : now ? `Pick ${now} (${rp.round}.${String(((now - 1) % order.teams) + 1).padStart(2, '0')})` : '–'}</span></div>
    ${now && !onClock && live.status !== 'complete' ? `<div><small>On the clock</small><b>${esc(nameOfRid(clockRid))}</b></div>` : ''}
    ${rec && rec.target && !onClock ? `<div><small>Your next pick</small><b>#${rec.target}</b> <span class="muted">${rec.target - now} pick${rec.target - now === 1 ? '' : 's'} away</span></div>` : ''}
    <div><small>Format</small>${order.teams} teams · ${order.rounds} rounds · ${esc(order.type)}${order.reversal ? ` (reversal round ${order.reversal})` : ''}${B.dynasty ? ' · dynasty' : ''}</div>
    ${P ? `<div><small>You are</small><b>Slot ${S.me}</b></div>` : `<div><small>${noOrder ? 'Your slot (order not set yet)' : 'You are'}</small><select id="me"><option value="">Choose your team</option>${teamOptions().map((t) => `<option value="${t.rid}" ${t.rid === me ? 'selected' : ''}>${esc(t.name)} (slot ${t.slot})</option>`).join('')}</select></div>`}
    ${!P && live.status === 'drafting' && live.timer ? `<div><small>Pick clock</small><b id="pclock">${clockText(live)}</b></div>` : ''}
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="muted" id="fresh">${freshText(live)}</span>
      ${P ? `<button class="btn btn-xs" id="pFast">${P.fast ? 'Bots: fast' : 'Bots: watch'}</button><button class="btn btn-xs" id="pRestart">Restart</button><button class="btn btn-xs" id="pExit">Exit practice</button>` : `<button class="btn btn-xs" id="pThis" title="Practise this exact draft format against bots">Practice this draft</button><a class="btn btn-xs" href="https://sleeper.com/draft/nfl/${esc(S.id)}" target="_blank" rel="noopener">Open in Sleeper ↗</a>`}
      <button class="btn btn-xs" id="sound">${S.sound ? '🔔 Alert on' : '🔕 Alert off'}</button></div>
  </div>${noOrder ? `<p class="muted" style="margin:0;font-size:13px">Sleeper hasn't set the draft order yet. Choose the slot you expect to plan with; the guide switches to your real team on its own once the order is set.</p>` : ''}`;

  const replay = !P && (S.live.status === 'complete' || S.replay != null) ? `<div class="replay"><b>Replay</b> see what the guide would have said before pick <input type="range" id="replay" min="1" max="${S.live.picks.length + 1}" value="${S.replay ?? S.live.picks.length + 1}"> <span id="replayN">${S.replay ?? 'end'}</span>${S.replay != null ? ' <button class="btn btn-xs" id="replayOff">Back to the end</button>' : ''}</div>` : '';

  const left = auction ? auctionCard() : rec ? recCard(rec, live) : `<section class="card"><div class="card-b"><p>Choose your team above and the guide will plan every pick for it.</p></div></section>`;
  const right = `${rec ? rosterCard(rec) : ''}${boardCard(rec, now, live)}`;
  startTick();
  $('#body').innerHTML = `${status}${replay}<div class="dg-grid"><div class="stack">${left}${feedCard(live, me)}${live.status === 'complete' && S.replay == null ? gradesCard(live) : ''}</div><div class="stack">${right}</div></div>${footer()}`;
  wire();
}
function freshText(live) {
  if (S.practice) return live.status === 'complete' ? 'Practice finished' : 'Practice · bots pick until your turn';
  if (S.err) return `<span class="err">Sleeper: ${esc(S.err)}</span>`;
  return live.status === 'drafting' ? 'Live · checks every 3 s' : live.status === 'paused' ? 'Paused on Sleeper' : '';
}
function updateClock() {
  const f = $('#fresh');
  if (f) f.innerHTML = freshText(S.live);
}
// Sleeper's pick clock: the last pick's time (or the draft start) plus the pick timer.
function clockText(live) {
  if (live.status !== 'drafting' || !live.timer) return '';
  const from = live.lastPicked || live.start;
  if (!from) return `${live.timer}s a pick`;
  const left = Math.round((from + live.timer * 1000 - Date.now()) / 1000);
  if (left <= 0) return 'time up';
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}
function startTick() {
  if (S.tick) return;
  S.tick = setInterval(() => {
    const el = $('#pclock');
    if (el && S.live && !S.practice) el.textContent = clockText(S.live);
  }, 1000);
}

function pname(r, { team = true } = {}) {
  if (!r) return '–';
  const inj = r.inj ? ` <span class="chip ${['IR', 'PUP', 'Out', 'Sus', 'NA'].includes(r.inj) ? 'chip-red' : 'chip-amber'}">${esc(r.inj)}</span>` : '';
  const tr = S.trending[r.pid] ? ` <span class="chip chip-blue" title="Added in ${S.trending[r.pid].toLocaleString()} Sleeper leagues in the last 24 hours">trending</span>` : '';
  return `<span class="pname"><span class="pos pos-${String(r.pos).toLowerCase()}">${esc(r.pos)}</span><a class="pn" href="#" data-pid="${esc(r.pid)}" title="Details">${esc(r.n)}</a>${tr}${team && r.team ? `<span class="tm">${esc(r.team)}</span>` : ''}${inj}${campChip(r)}</span>`;
}
function campChip(r) {
  const c = r.camp;
  if (!c || !c.signals.length) return '';
  const cls = c.net > 0 ? 'camp-up' : c.net < 0 ? 'camp-down' : 'muted';
  const tip = c.signals.map((s) => `${s.kind}: ${s.title}${s.src ? ' (' + s.src + ')' : ''}`).join('\n');
  return ` <span class="chip ${cls}" title="${esc(tip)}">camp ${c.net > 0 ? '▲' : c.net < 0 ? '▼' : '•'}</span>`;
}
function usageLine(r) {
  const m = r.adv?.m;
  if (!m) return '';
  const keys = r.pos === 'QB' ? ['passAtt', 'rushAtt', 'rz'] : r.pos === 'RB' ? ['rushAtt', 'tgt', 'rzTouch', 'snap'] : ['tgt', 'tgtSh', 'air', 'rzTgt'];
  return keys.filter((k) => m[k]).map((k) => `${m[k].label} ${fmtMetric(m[k])}`).join(' · ');
}

function recCard(rec, live) {
  if (!rec.target) return `<section class="card hero"><header class="card-h"><div><h2>Your picks are done</h2><p class="sub">${live.status === 'complete' ? 'Use Replay above to see what the guide said before any pick.' : 'Nothing left for you to pick in this draft.'}</p></div></header></section>`;
  const alerts = [];
  for (const r of rec.runs) alerts.push(`<div class="a">${r.pos} run: ${r.k} of the last ${r.of} picks were ${r.pos}s.</div>`);
  if (rec.before.teams) {
    const needs = Object.entries(rec.before.need).filter(([pos, k]) => ['QB', 'TE', 'RB', 'WR'].includes(pos) && k >= Math.max(2, rec.before.teams / 2)).map(([pos, k]) => `${k} still need a starting ${pos}`);
    if (needs.length) alerts.push(`<div class="a">${rec.before.teams} teams pick before you: ${needs.join(', ')}.</div>`);
  }
  for (const t of rec.tierEnd) if (t.left <= 2 && t.drop >= 5) alerts.push(`<div class="a">Only ${t.left} ${t.pos}${t.left === 1 ? '' : 's'} left in the top available tier (${esc(t.best.n)}); the next tier is ${n1(t.drop)} value lower.</div>`);
  if (rec.wait.length) alerts.push(`<div class="a g">Can wait: ${rec.wait.map((w) => `${esc(w.r.n)} (${pct(w.there)} there at #${rec.after})`).join(', ')}.</div>`);
  const items = rec.top.map((c, i) => `<div class="rec-i ${i === 0 ? 'first' : ''}">
      <div class="rec-h">${i === 0 ? '<span class="chip chip-mine">Take</span>' : `<span class="muted">${i + 1}</span>`}${pname(c.r)}<span class="val" title="0-100 value in this draft's scoring">${n1(c.r.value)}</span>${draftBtn(c.r, rec)}</div>
      <ul>${c.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
      ${usageLine(c.r) ? `<div class="muted" style="font-size:12px;margin-top:4px">Last season: ${esc(usageLine(c.r))}</div>` : ''}
    </div>`).join('');
  const title = rec.onClock ? 'Take now' : rec.target ? `Plan for pick #${rec.target}` : 'Your picks are done';
  const sub = rec.onClock ? 'Ranked by value, what your lineup still needs, and how much you lose by waiting' : rec.target ? 'Weighted by the chance each player is still there when you pick' : '';
  return `<section class="card hero"><header class="card-h"><div><h2>${title}</h2><p class="sub">${sub}</p></div></header><div class="card-b">${alerts.length ? `<div class="alerts" style="margin-bottom:10px">${alerts.join('')}</div>` : ''}<div class="rec">${items || '<p class="empty">No players left to recommend.</p>'}</div></div></section>`;
}

function rosterCard(rec) {
  const V = S.V;
  // starting spots in the league's own order, filled or open
  const filled = rec.fill.filled.slice();
  const rows = S.board.slots.filter((s) => !['BN', 'IR', 'TAXI'].includes(s)).map((slot) => {
    const i = filled.findIndex((f) => f.slot === slot);
    const f = i >= 0 ? filled.splice(i, 1)[0] : null;
    return `<div class="roster-row"><span class="slot">${esc(slot.replace('_', ' '))}</span>${f ? pname(V.by[f.pid]) : '<span class="muted">open</span>'}</div>`;
  });
  for (const pid of rec.fill.bench) rows.push(`<div class="roster-row"><span class="slot">Bench</span>${pname(V.by[pid])}</div>`);
  const total = rec.mine.reduce((s, pid) => s + (V.by[pid]?.value || 0), 0);
  return `<section class="card"><header class="card-h"><div><h2>Your roster</h2><p class="sub">${rec.mine.length} picked · value ${n1(total)} · ${rec.picksLeft} pick${rec.picksLeft === 1 ? '' : 's'} left${rec.myNext.length ? ': ' + rec.myNext.slice(0, 6).map((n) => '#' + n).join(', ') + (rec.myNext.length > 6 ? '…' : '') : ''}</p></div></header><div class="card-b">${rows.join('')}</div></section>`;
}

function boardCard(rec, now, live) {
  const taken = new Map(live.picks.map((p) => [String(p.pid), p]));
  let rows = S.V.rows.filter((r) => S.pos === 'ALL' || r.pos === S.pos);
  if (S.q) rows = rows.filter((r) => r.n.toLowerCase().includes(S.q.toLowerCase()));
  const showTaken = S.q.length > 0;
  rows = rows.filter((r) => showTaken || !taken.has(String(r.pid))).slice(0, 60);
  const at = rec?.onClock ? rec.after : rec?.target;
  const auction = S.board.order.type === 'auction';
  const takeCol = !!(S.practice && rec?.onClock);
  const tbl = rows.map((r) => {
    const tk = taken.get(String(r.pid));
    const there = at && now && !tk ? survive(r.adpOrRank, now, at) : null;
    return `<tr class="${tk ? 'gone' : ''}"><td class="num">${r.rank}</td><td>${pname(r)}${tk ? ` <span class="muted">#${tk.no}</span>` : ''}</td><td class="num">${r.pos}${r.posRank} · T${r.tier}</td><td class="num"><b>${n1(r.value)}</b></td>${auction ? `<td class="num">$${r.dollars ?? 1}</td>` : ''}<td class="num dim">${r.adp ? Math.round(r.adp) : '–'}</td><td class="num">${n1(r.ppg)}</td>${at ? `<td class="num">${there == null ? '' : pct(there)}</td>` : ''}${takeCol ? `<td>${tk ? '' : draftBtn(r, rec)}</td>` : ''}</tr>`;
  }).join('');
  const tabs = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => `<button data-pos="${p}" class="${S.pos === p ? 'on' : ''}">${p === 'ALL' ? 'All' : p}</button>`).join('');
  return `<section class="card flush"><header class="card-h"><div><h2>Best available</h2><p class="sub">0-100 value in this draft's scoring · T = tier at his position${at ? ` · "There" = chance he lasts to your pick #${at}` : ''}</p></div></header>
    <div class="dg-tabs">${tabs}<input id="search" placeholder="Find a player" value="${esc(S.q)}" aria-label="Find a player"></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Value</th>${auction ? '<th>$</th>' : ''}<th>ADP</th><th>Pts/g</th>${at ? '<th>There</th>' : ''}${takeCol ? '<th></th>' : ''}</tr></thead><tbody>${tbl || '<tr><td colspan="8" class="empty">Nobody matches.</td></tr>'}</tbody></table></div></section>`;
}

function draftBtn(r, rec) {
  return S.practice && rec?.onClock ? ` <button class="btn btn-xs" data-take="${esc(r.pid)}">Draft</button>` : '';
}

// ---------- player detail: everything the guide knows about one player ----------
function detail(pid) {
  const r = S.V.by[pid];
  const p = S.board.pool[pid];
  if (!r || !p) return;
  const rec = S.lastRec;
  const live = liveView();
  const now = currentPick(live.picks, S.board.order);
  const mine = (rec?.myNext || []).filter((n) => n > (now || 0)).slice(0, 3);
  const parts = r.base.parts.map(([k, v, w]) => `<tr><td>${esc(k)}</td><td class="num">${n1(v)}</td><td class="num">${Math.round(w * 100)}%</td></tr>`).join('');
  const m = r.adv?.m || {};
  const adv = Object.values(m).map((x) => `<tr><td>${esc(x.label)}${x.note ? ` <span class="dim">(${esc(x.note)})</span>` : ''}</td><td class="num">${fmtMetric(x)}</td></tr>`).join('');
  const news = (S.news[pid] || []).map((it) => {
    const sig = r.camp.signals.find((s) => s.title === it.title);
    return `<li>${sig ? `<b class="${sig.w > 0 ? 'camp-up' : sig.w < 0 ? 'camp-down' : ''}">${esc(sig.kind)}</b> · ` : ''}${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title)} <span class="dim">${esc(it.src || '')} · ${new Date(it.time).toLocaleDateString()}</span></li>`;
  }).join('');
  const lines = [
    `<b>${n1(r.value)}</b> value · #${r.rank} overall · ${r.pos}${r.posRank} · tier ${r.tier}${r.adp ? ` · ADP ${Math.round(r.adp)}` : ''}${r.dollars ? ` · $${r.dollars}` : ''}`,
    `${n1(r.ppg)} points a game × ${n1(r.games)} games${r.health < 1 ? ` (health ${Math.round(r.health * 100)}%)` : ''}${r.camp.net ? ` · camp ${r.camp.net > 0 ? '+' : ''}${Math.round(r.camp.net * 100)}%` : ''}${r.dyn !== 1 ? ` · dynasty age ${r.dyn > 1 ? '+' : ''}${Math.round((r.dyn - 1) * 100)}%` : ''}`,
    [p.team ? `Team ${p.team}` : 'No team', p.age ? `age ${p.age}` : '', p.exp != null ? (p.exp === 0 ? 'rookie' : `${p.exp} yrs in the NFL`) : '', p.depth ? `depth chart ${p.dpos || r.pos}${p.depth}` : ''].filter(Boolean).join(' · '),
  ];
  if (p.inj) lines.push(`<span class="camp-down">Sleeper: ${esc(p.inj)}${p.body ? ` (${esc(p.body)})` : ''}</span>${p.note ? ` ${esc(p.note)}` : ''}`);
  if (S.trending[pid]) lines.push(`Added in ${S.trending[pid].toLocaleString()} Sleeper leagues in the last 24 hours`);
  if (now && mine.length) lines.push(`Chance he is there: ${mine.map((n) => `#${n} ${pct(survive(r.adpOrRank, now, n))}`).join(' · ')}`);
  const box = document.createElement('div');
  box.className = 'dg-modal';
  box.innerHTML = `<div class="dg-sheet" role="dialog" aria-label="${esc(r.n)}"><button class="btn btn-xs dg-x" aria-label="Close">✕</button>
    <h2 style="margin:0 0 8px">${pname(r)}</h2>${lines.map((l) => `<p style="margin:3px 0">${l}</p>`).join('')}
    <h3>Points a game, built from</h3><table class="tbl"><thead><tr><th>Input</th><th>Pts/g</th><th>Weight</th></tr></thead><tbody>${parts || '<tr><td colspan="3">No projection or history</td></tr>'}</tbody></table>
    ${adv ? `<h3>Last season${p.last ? ` (${p.last.gp} games${p.last.team ? ', ' + esc(p.last.team) : ''})` : ''}</h3><table class="tbl"><tbody>${adv}</tbody></table><p class="dim" style="font-size:12px">≈ = estimate (routes are snaps × team dropback rate).</p>` : ''}
    <h3>Camp, preseason and recent news</h3>${news ? `<ul class="dg-news">${news}</ul>` : `<p class="muted">${S.newsInfo ? 'No headlines in the last 3 weeks.' : 'Loading headlines…'}</p>`}
    ${draftBtn(r, S.lastRec)}</div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('.dg-x')) close();
    const t = e.target.closest('[data-take]');
    if (t) (close(), practiceDraftPick(t.dataset.take));
  });
  document.addEventListener('keydown', function esc_(e) {
    if (e.key === 'Escape') (close(), document.removeEventListener('keydown', esc_));
  });
}

function auctionCard() {
  return `<section class="card hero"><header class="card-h"><div><h2>Auction values</h2><p class="sub">Dollar values spend the league budget in proportion to value above replacement, after $1 for every roster spot.</p></div></header><div class="card-b"><p class="muted">Pick-by-pick advice is for snake and linear drafts. In an auction, use the $ column on the board as your price ceiling.</p></div></section>`;
}

function feedCard(live, me) {
  const s2r = live.slotToRoster || S.board.slotToRoster;
  const last = live.picks.slice().sort((a, b) => b.no - a.no).slice(0, 14);
  const rows = last.map((p) => {
    const r = S.V.by[p.pid];
    const rid = ridOfPick(p, s2r);
    const diff = r?.adp ? p.no - r.adp : null;
    const tag = diff == null || p.keeper ? '' : diff >= 12 ? ` <span class="chip camp-up">value +${Math.round(diff)}</span>` : diff <= -12 ? ` <span class="chip camp-down">reach ${Math.round(-diff)}</span>` : '';
    return `<div class="feed-i ${rid === me ? 'mine' : ''}"><span class="num">#${p.no}</span>${r ? pname(r) : esc(p.n || p.pid)}${p.keeper ? ' <span class="chip">keeper</span>' : ''}${p.amount != null ? ` <span class="num">$${p.amount}</span>` : ''}${tag}<span class="muted" style="margin-left:auto">${esc(nameOfRid(rid))}</span></div>`;
  }).join('');
  return `<section class="card flush"><header class="card-h"><div><h2>Latest picks</h2></div></header><div class="card-b">${rows || '<p class="empty">No picks yet.</p>'}</div></section>`;
}

function gradesCard(live) {
  const g = grades(S.board, S.V, live);
  const rows = g.map((t, i) => `<tr><td class="num">${i + 1}</td><td>${t.rid === S.me ? `<b style="color:var(--green)">${esc(nameOfRid(t.rid))}</b>` : esc(nameOfRid(t.rid))}</td><td class="num"><b>${n1(t.value)}</b></td><td class="muted">${t.steals.slice(0, 2).map((s) => `${esc(S.V.by[s.pid]?.n || s.pid)} (+${s.by})`).join(', ')}</td></tr>`).join('');
  return `<section class="card flush"><header class="card-h"><div><h2>Draft results by value</h2><p class="sub">Total 0-100 value drafted, on today's numbers. Steals = taken 12+ picks after ADP.</p></div></header><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Team</th><th>Value</th><th>Steals</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function footer() {
  const b = S.board;
  const src = b ? `Built ${new Date(b.builtAt).toLocaleTimeString()} from ${b.sources.projections} Sleeper ${b.sources.season} projections and ${b.sources.lastSeason} player seasons from ${b.sources.lastSeasonYear}${b.sources.projections ? '' : ' (no projections posted yet: values lean on last season and ADP)'}. ADP column: ${esc((b.adpKeys || [])[0] || '–')}.` : '';
  const news = S.newsInfo ? ` Camp and preseason headlines: ${Object.values(S.news).filter((x) => x.length).length} players with news in the last 3 weeks${S.newsInfo.missing ? `, ${S.newsInfo.missing} still loading` : ''}.` : '';
  return `<p class="dg-foot">${src}${news} How it ranks: value is points per game (projection ${Math.round(DRAFT_BLEND.same.proj * 100)}%, last season's volume ${Math.round(DRAFT_BLEND.same.usage * 100)}%, last season's results ${Math.round(DRAFT_BLEND.same.last * 100)}%) × games × health, above replacement for this draft's lineup and team count, on the site's 0-100 scale. Camp news moves points per game by ${Math.round(CAMP.cap[0] * 100)}% to +${Math.round(CAMP.cap[1] * 100)}%. The blend, camp nudges, ADP spread and roster-need weights are judgment and not backtested yet; the volume model is the backtested one the waiver scanner uses. Sleeper data is free for personal use.</p>`;
}

function wire() {
  $('#me')?.addEventListener('change', (e) => {
    S.me = e.target.value === '' ? null : Number(e.target.value);
    store.set('dg.me.' + S.id, e.target.value);
    const u = new URL(location.href);
    if (S.me != null) u.searchParams.set('me', S.me);
    else u.searchParams.delete('me');
    history.replaceState(null, '', u);
    render();
  });
  $('#sound')?.addEventListener('click', () => {
    S.sound = !S.sound;
    store.set('dg.sound', S.sound ? '1' : '0');
    if (S.sound && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    render();
  });
  document.querySelectorAll('[data-pos]').forEach((b) => b.addEventListener('click', () => ((S.pos = b.dataset.pos), render())));
  const search = $('#search');
  search?.addEventListener('input', (e) => {
    S.q = e.target.value;
    clearTimeout(S.searchT);
    S.searchT = setTimeout(() => {
      render();
      const el = $('#search');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 200);
  });
  const rp = $('#replay');
  rp?.addEventListener('input', (e) => ($('#replayN').textContent = e.target.value));
  rp?.addEventListener('change', (e) => {
    const v = Number(e.target.value);
    S.replay = v > S.live.picks.length ? null : v;
    render();
  });
  $('#replayOff')?.addEventListener('click', () => ((S.replay = null), render()));
  $('#body').querySelectorAll('[data-pid]').forEach((a) => a.addEventListener('click', (e) => (e.preventDefault(), detail(a.dataset.pid))));
  $('#body').querySelectorAll('[data-take]').forEach((b) => b.addEventListener('click', () => practiceDraftPick(b.dataset.take)));
  $('#pThis')?.addEventListener('click', () => {
    const slot = Number(Object.entries(S.live.slotToRoster || {}).find(([, rid]) => Number(rid) === S.me)?.[0]) || S.me || 1;
    startPractice(null, Math.min(slot, S.board.order.teams), S.board);
  });
  $('#pRestart')?.addEventListener('click', () => (S.board.draft.id.startsWith('practice-') ? startPractice(S.board.draft.id, S.me) : startPractice(null, S.me, { ...S.board, draft: { ...S.board.draft, name: S.board.draft.name.replace(/^Practice: /, '') } })));
  $('#pExit')?.addEventListener('click', () => {
    clearTimeout(S.timer);
    S.practice = null;
    history.replaceState(null, '', location.pathname);
    start();
  });
  $('#pFast')?.addEventListener('click', () => ((S.practice.fast = !S.practice.fast), render(), runBots()));
}

// On the clock: a short tone and a browser notification, when alerts are on.
function alertMe() {
  if (!S.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {}
  try {
    const top = S.lastRec?.top?.[0]?.r;
    if ('Notification' in window && Notification.permission === 'granted') new Notification("You're on the clock", { body: top ? `Guide says: ${top.n} (${top.pos})` : 'Your pick' });
  } catch {}
}

start();
