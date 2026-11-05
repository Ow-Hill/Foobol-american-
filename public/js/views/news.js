import { esc, ago, fmtDayTime } from '../util.js';
import { buildFeed } from '../newsfeed.js';
import { card } from '../ui.js';
import { playerNewsFor } from '../playernews.js';

const KIND = { article: 'Article', note: 'Player note', wire: 'League move' };

const BUCKETS = [
  ['act', 'Act now'],
  ['week', 'This week'],
  ['watch', 'Watch'],
  ['background', 'Background'],
];

const CAT_LABEL = { injury: 'Injury', practice: 'Practice', trade: 'Trade', depth: 'Role', suspension: 'Suspension', performance: 'Performance' };

// The engine is pure for a given model and memoised in playernews.js.
const engineFor = playerNewsFor;

export function feedItem(M, it) {
  const owners = it.pids
    .slice(0, 3)
    .map((id) => {
      const p = M.P(id);
      const o = p.own;
      const chip = o == null ? `<span class="chip chip-fa">FA</span>` : o === M.me.id ? `<span class="chip chip-mine">Yours</span>` : `<span class="chip chip-rival">${esc(M.ownerName(o))}</span>`;
      return `<span class="pname"><span class="pos pos-${p.pos.toLowerCase()}">${esc(p.pos)}</span> <span>${esc(p.n)}</span> ${chip}</span>`;
    })
    .join(' ');
  const teamHit = it.teamHit ? `<span class="chip chip-mine" style="background:transparent;color:var(--green)">Your ${esc(it.teamHit.join('/'))} players</span>` : '';
  const title = it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title);
  const long = it.long && it.long !== it.text ? `<details><summary>Read the full note</summary><p>${esc(it.long)}</p></details>` : '';
  return `<li class="${it.rel === 'mine' ? 'mine' : it.rel === 'league' ? 'rival' : ''}">
    <div class="meta"><span class="chip">${KIND[it.kind]}</span>${owners}${teamHit}<span>${esc(it.src)}</span><span title="${esc(fmtDayTime(it.time))}">${esc(ago(it.time, M.now))}</span></div>
    <div class="title">${title}</div>
    ${it.text ? `<div class="text">${esc(it.text)}</div>` : ''}${long}
  </li>`;
}

// ---------- my players ----------
const dayShort = (t) => new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(t));

function trendText(row) {
  if (!row.trend.length) return '';
  const seq = row.trend.slice(-5).map((t) => `${t.v} ${dayShort(t.t)}`).join(' → ');
  return `<span class="pn-trend" title="RotoWire practice reports, oldest to newest">${esc(seq)}</span>`;
}

function practiceChip(v) {
  return `<span class="chip chip-prac chip-prac-${esc(v)}">${esc(v)}</span>`;
}

function itemMeta(M, i) {
  const bits = [];
  bits.push(`<span class="chip">${i.kind === 'note' ? 'RotoWire note' : i.kind === 'article' ? 'ESPN' : 'Headline'}</span>`);
  if (i.tier === 1) bits.push('<span class="chip chip-tier">Tier 1</span>');
  else if (i.tier === 2) bits.push('<span class="chip chip-tier">Tier 2</span>');
  if (i.practice) bits.push(practiceChip(i.practice));
  if (i.status) bits.push(`<span class="chip ${i.status === 'Out' || i.status === 'IR' ? 'chip-red' : i.status === 'Doubtful' ? 'chip-amber' : 'chip-blue'}">${esc(i.status)}</span>`);
  for (const c of i.cats) if (c !== 'practice' && c !== 'injury') bits.push(`<span class="chip">${esc(CAT_LABEL[c] || c)}</span>`);
  if (i.posture === 'speculative') bits.push('<span class="chip chip-spec">Speculative</span>');
  if (i.direction === 'worse') bits.push('<span class="pn-dir worse">↓ worse</span>');
  else if (i.direction === 'better') bits.push('<span class="pn-dir better">↑ better</span>');
  bits.push(`<span>${esc(i.src)}</span>`);
  bits.push(`<span title="${esc(fmtDayTime(i.time))}">${esc(ago(i.time, M.now))}</span>`);
  if (i.reps > 1) bits.push(`<span class="pn-reps" title="${i.reps} outlets carried this">${i.reps} outlets</span>`);
  return bits.join('');
}

function itemRow(M, i) {
  const body = i.title || i.text || '';
  const title = i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(body)}</a>` : esc(body);
  const text = i.kind !== 'search' && i.text && i.title ? `<div class="pn-item-text">${esc(i.text)}</div>` : '';
  return `<li class="pn-item posture-${esc(i.posture)}">
    <div class="pn-item-meta">${itemMeta(M, i)}</div>
    <div class="pn-item-title">${title}</div>${text}
  </li>`;
}

function playerRow(M, row, open) {
  const p = row.p;
  const where = row.spot ? (row.spot.where === 'starter' ? `Starter · ${row.spot.slot}` : row.spot.where === 'ir' ? 'IR' : 'Bench') : 'Not on roster';
  const score = row.top ? `<span class="pn-score ${row.bucket}">${BUCKETS.find((b) => b[0] === row.bucket)?.[1] || row.bucket} · ${Math.round(row.top.relScore)}</span>` : `<span class="pn-score ${row.bucket}">${BUCKETS.find((b) => b[0] === row.bucket)?.[1] || row.bucket}</span>`;
  const soWhat = row.top?.soWhat;
  const advice = soWhat
    ? `<p class="pn-sowhat">${esc(soWhat.text)}${soWhat.link ? ` <button class="btn btn-ghost btn-xs" data-go="${esc(soWhat.link)}">${soWhat.link === 'lineup' ? 'Lineup' : soWhat.link === 'injuries' ? 'Injuries' : soWhat.link === 'finder' ? 'Trade finder' : 'News'}</button>` : ''}</p>`
    : '';
  const items = row.items.length
    ? `<ul class="pn-items">${row.items.slice(0, 12).map((i) => itemRow(M, i)).join('')}</ul>${row.items.length > 12 ? `<p class="pn-more">${row.items.length - 12} more reports hidden</p>` : ''}`
    : `<p class="empty" style="padding:8px 0">No reports in the last 7 days. Check Sunday inactives before kickoff.</p>`;
  return `<li class="pn-row pn-${row.bucket}">
    <button class="pn-head" data-pn-open="${esc(row.pid)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="pn-body-${esc(row.pid)}">
      <span class="pn-id"><span class="pos pos-${esc((p.pos || 'x').toLowerCase())}">${esc(p.pos || '?')}</span><span class="pn-nm">${esc(p.n)}</span>${p.team ? `<span class="tm">${esc(p.team)}</span>` : ''}</span>
      <span class="pn-where">${esc(where)}</span>
      ${trendText(row)}
      ${score}
      <span class="pn-when">${row.sinceMs != null ? esc(ago(M.now - row.sinceMs, M.now)) : '—'}</span>
      <span class="pn-chev" aria-hidden="true">${open ? '▾' : '▸'}</span>
    </button>
    <div class="pn-body" id="pn-body-${esc(row.pid)}" ${open ? '' : 'hidden'}>
      ${advice}
      ${items}
    </div>
  </li>`;
}

function minePanel(M, openPid) {
  const res = engineFor(M);
  const PN = M.snap.playerNews || {};
  const flags = res.flags;
  let banner = '';
  if (flags.disabled) {
    banner = `<div class="callout">Headline search is off, so this tab shows RotoWire notes and ESPN articles only. Turn it back on in <code>config.json</code> (<code>news.search</code>).</div>`;
  } else if (flags.degraded) {
    banner = `<div class="callout warn">Some headlines couldn't be refreshed. Cached headlines are shown, and older reports are marked so nothing looks newer than it is.</div>`;
  }
  const fresh = PN.freshAt ? `Headlines refreshed ${esc(ago(PN.freshAt, M.now))}` : 'No headline refresh yet';
  const groups = BUCKETS.map(([key, label]) => {
    const rows = res.players.filter((r) => r.bucket === key);
    if (!rows.length) return '';
    return `<li class="pn-group"><div class="pn-group-h"><span>${label}</span><span class="n">${rows.length}</span></div><ul class="pn-list">${rows.map((r) => playerRow(M, r, openPid === r.pid)).join('')}</ul></li>`;
  }).join('');
  const panel = groups ? `<ul class="pn-groups">${groups}</ul>` : '<p class="empty">No players on this roster.</p>';
  return `${banner}
    ${card(
      'Your players',
      panel,
      { cls: 'flush', sub: `Ranked by what it means for your lineup this week · ${fresh}${PN.scanned ? ` · ${PN.scanned} players scanned` : ''}` }
    )}
    <p class="source">Headlines come from Google News RSS (headline + source + link only). Practice reports and status changes are read from RotoWire notes as published by ESPN. A worse-news label always wins until a dated report says otherwise; speculative items never flip a start or sit on their own.</p>`;
}

export function render(M, ctx) {
  const ui = (ctx.ui.news ||= { tab: 'mine', kind: 'all', open: null });
  const mine = engineFor(M);
  const feed = buildFeed(M);
  const tabs = [
    ['mine', 'Your players', () => false, mine.players.length],
    ['team', 'Your NFL teams', (i) => i.rel === 'team', null],
    ['league', 'League', (i) => i.rel === 'league' || i.rel === 'mine', null],
    ['fa', 'Free agents', (i) => i.rel === 'fa' && i.kind !== 'wire', null],
    ['all', 'All NFL', () => true, null],
  ];
  const cur = tabs.find((t) => t[0] === ui.tab) || tabs[0];
  const kindOk = (i) => ui.kind === 'all' || i.kind === ui.kind;
  const rows = feed.filter(cur[2]).filter(kindOk);
  const counts = Object.fromEntries(tabs.map((t) => [t[0], t[3] != null ? t[3] : feed.filter(t[2]).filter(kindOk).length]));
  const body = ui.tab === 'mine'
    ? minePanel(M, ui.open)
    : card('Feed', rows.length ? `<ul class="feed">${rows.slice(0, 80).map((i) => feedItem(M, i)).join('')}</ul>` : `<p class="empty">Nothing in the last 7 days for this filter.</p>`, { cls: 'flush', sub: `Last 7 days · ${rows.length} items · ESPN articles, RotoWire player notes via ESPN, and Sleeper league transactions` });
  return `
    <div class="page-h"><div><h1>News</h1><p>Every report is filtered through your roster, your league and this week's matchups, then ranked by what it would change.</p></div></div>
    <div class="tabs" role="tablist">${tabs.map((t) => `<button class="tab ${t[0] === ui.tab ? 'active' : ''}" data-news-tab="${t[0]}" role="tab" aria-selected="${t[0] === ui.tab}">${t[1]}<small>${counts[t[0]]}</small></button>`).join('')}
      <span style="flex:1"></span>
      ${['all', 'article', 'note', 'wire'].map((k) => `<button class="tab ${ui.kind === k ? 'active' : ''}" data-news-kind="${k}">${k === 'all' ? 'Everything' : k === 'wire' ? 'League moves' : KIND[k] + 's'}</button>`).join('')}
    </div>
    ${body}`;
}

export function mount(root, M, ctx) {
  root.querySelectorAll('[data-news-tab]').forEach((b) => b.addEventListener('click', () => ((ctx.ui.news.tab = b.dataset.newsTab), ctx.rerender())));
  root.querySelectorAll('[data-news-kind]').forEach((b) => b.addEventListener('click', () => ((ctx.ui.news.kind = b.dataset.newsKind), ctx.rerender())));
  root.querySelectorAll('[data-pn-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const pid = b.dataset.pnOpen;
      ctx.ui.news.open = ctx.ui.news.open === pid ? null : pid;
      ctx.ui.news.focusPid = pid;
      ctx.rerender();
    })
  );
  if (ctx.ui.news.focusPid) {
    root.querySelector(`[data-pn-open="${ctx.ui.news.focusPid}"]`)?.focus();
    ctx.ui.news.focusPid = null;
  }
}
