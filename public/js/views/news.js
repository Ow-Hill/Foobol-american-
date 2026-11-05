import { esc, ago, fmtDayTime } from '../util.js';
import { buildFeed, REL_LABEL } from '../newsfeed.js';
import { card } from '../ui.js';

const KIND = { article: 'Article', note: 'Player note', wire: 'League move' };

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

export function render(M, ctx) {
  const ui = (ctx.ui.news ||= { tab: 'mine', kind: 'all' });
  const feed = buildFeed(M);
  const tabs = [
    ['mine', 'Your roster', (i) => i.rel === 'mine'],
    ['team', 'Your NFL teams', (i) => i.rel === 'team'],
    ['league', 'League', (i) => i.rel === 'league' || i.rel === 'mine'],
    ['fa', 'Free agents', (i) => i.rel === 'fa' && i.kind !== 'wire'],
    ['all', 'All NFL', () => true],
  ];
  const cur = tabs.find((t) => t[0] === ui.tab) || tabs[0];
  const kindOk = (i) => ui.kind === 'all' || i.kind === ui.kind;
  const rows = feed.filter(cur[2]).filter(kindOk);
  const counts = Object.fromEntries(tabs.map((t) => [t[0], feed.filter(t[2]).filter(kindOk).length]));
  return `
    <div class="page-h"><div><h1>News</h1><p>Every item is tagged with who owns the players in it, so you can tell at a glance what touches your roster, a rival's, or the waiver wire.</p></div></div>
    <div class="tabs" role="tablist">${tabs.map((t) => `<button class="tab ${t[0] === ui.tab ? 'active' : ''}" data-news-tab="${t[0]}">${t[1]}<small>${counts[t[0]]}</small></button>`).join('')}
      <span style="flex:1"></span>
      ${['all', 'article', 'note', 'wire'].map((k) => `<button class="tab ${ui.kind === k ? 'active' : ''}" data-news-kind="${k}">${k === 'all' ? 'Everything' : k === 'wire' ? 'League moves' : KIND[k] + 's'}</button>`).join('')}
    </div>
    ${card('Feed', rows.length ? `<ul class="feed">${rows.slice(0, 80).map((i) => feedItem(M, i)).join('')}</ul>` : `<p class="empty">Nothing in the last 7 days for this filter.</p>`, { cls: 'flush', sub: `Last 7 days · ${rows.length} items · ESPN articles, RotoWire player notes via ESPN, and Sleeper league transactions` })}
    <p class="source">Player notes are summaries from RotoWire as published by ESPN. Open the linked story for the original reporting; a worse-news label always wins until a dated report says otherwise.</p>`;
}

export function mount(root, M, ctx) {
  root.querySelectorAll('[data-news-tab]').forEach((b) => b.addEventListener('click', () => ((ctx.ui.news.tab = b.dataset.newsTab), ctx.rerender())));
  root.querySelectorAll('[data-news-kind]').forEach((b) => b.addEventListener('click', () => ((ctx.ui.news.kind = b.dataset.newsKind), ctx.rerender())));
}
