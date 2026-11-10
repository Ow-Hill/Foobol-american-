import { esc, ago, fmtDayTime } from '../util.js';
import { buildFeed } from '../newsfeed.js';
import { card, ownerChip } from '../ui.js';
import { playerNewsFor, bucketOf, lookupItems } from '../playernews.js';

const KIND = { article: 'Article', note: 'Player note', wire: 'League move' };

const BUCKETS = [
  ['act', 'Act now'],
  ['week', 'This week'],
  ['watch', 'Watch'],
  ['background', 'Background'],
];

const CAT_LABEL = { injury: 'Injury', practice: 'Practice', trade: 'Trade', depth: 'Role', suspension: 'Suspension', performance: 'Performance' };

const RUMOUR_MS = 5 * 86400000;
const CATS = [
  ['all', 'Everything'],
  ['injury', 'Injury'],
  ['practice', 'Practice'],
  ['trade', 'Trade'],
  ['depth', 'Role'],
  ['suspension', 'Suspension'],
];

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
  const srcHost = String(i.src || '').toLowerCase().replace(/^www\./, '');
  const outlet = i.domain && i.domain.toLowerCase() !== srcHost ? `${i.src} · ${i.domain}` : i.src;
  bits.push(`<span title="Publisher: ${esc(i.src || 'unknown')}">${esc(outlet)}</span>`);
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

// ---------- league / wire / rumours ----------
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

// League and wire use their own weight profiles; a rumour uses the profile of
// whoever owns the player, so my own trade noise still outranks a rival's.
function profileScore(M, it, tab) {
  if (tab === 'league') return it.scores.league;
  if (tab === 'wire') return it.scores.wire;
  if (it.isMine) return it.scores.mine;
  return M.P(it.pId).own != null ? it.scores.league : it.scores.wire;
}

function rankList(M, res, tab, cat) {
  const seenStories = new Set();
  return res.items
    .filter((i) => !i.dupe)
    .filter((i) => {
      if (tab === 'league') return !i.isMine && M.P(i.pId).own != null;
      if (tab === 'wire') return M.P(i.pId).own == null;
      return i.posture === 'speculative' && M.now - i.time <= RUMOUR_MS;
    })
    .filter((i) => cat === 'all' || i.cats.includes(cat))
    .map((it) => {
      const score = profileScore(M, it, tab);
      return { it, score, bucket: bucketOf(score) };
    })
    .filter((r) => tab === 'rumours' || r.bucket !== 'background')
    .sort((a, b) => b.score - a.score || b.it.time - a.it.time)
    .filter((r) => {
      // One row per story across players: Google often returns the same headline
      // for every player it mentions.
      const key = r.it.storyId;
      if (!key) return true;
      if (seenStories.has(key)) return false;
      seenStories.add(key);
      return true;
    });
}

function rankRow(M, it, score, bucket, tab) {
  const p = M.P(it.pId);
  const head = it.title || it.text || '';
  const title = it.url
    ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(clip(head, 220))}</a>`
    : esc(clip(head, 220));
  const extra = it.title && it.text ? `<div class="pn-item-text">${esc(clip(it.text, 260))}</div>` : '';
  const owner = tab === 'wire' ? '' : `<span class="pn-owner">${ownerChip(M, it.pId)}</span>`;
  return `<li class="pn-item pn-rank posture-${esc(it.posture)}">
    <div class="pn-rank-head">
      <span class="pn-id"><span class="pos pos-${esc((p.pos || 'x').toLowerCase())}">${esc(p.pos || '?')}</span><span class="pn-nm">${esc(p.n)}</span>${p.team ? `<span class="tm">${esc(p.team)}</span>` : ''}</span>
      ${owner}
      <span class="pn-score ${bucket}">${BUCKETS.find((b) => b[0] === bucket)?.[1] || bucket} · ${Math.round(score)}</span>
    </div>
    <div class="pn-item-meta">${itemMeta(M, it)}</div>
    <div class="pn-item-title">${title}</div>${extra}
  </li>`;
}

function leagueMoves(M) {
  const moves = M.wireItems().slice(0, 6);
  if (!moves.length) return '';
  return `<div class="pn-moves-wrap"><div class="pn-moves-h">Recent league moves</div><ul class="pn-moves">${moves
    .map((w) => `<li><span class="chip">${esc(w.kind)}</span><span class="${w.mine ? 'pn-mine-move' : ''}">${esc(w.text)}</span><span class="pn-when">${esc(ago(w.time, M.now))}</span></li>`)
    .join('')}</ul></div>`;
}

function rankedPanel(M, tab, cat, rows) {
  const flags = engineFor(M).flags;
  const shown = rows.slice(0, tab === 'league' ? 24 : tab === 'rumours' ? 40 : 30);
  const title = tab === 'league' ? 'League' : tab === 'wire' ? 'Wire' : 'Rumours';
  const sub =
    tab === 'league'
      ? `Other rosters, ranked for your league · ${rows.length} notable report${rows.length === 1 ? '' : 's'}`
      : tab === 'wire'
        ? `Unrostered players · ${rows.length} notable report${rows.length === 1 ? '' : 's'}`
        : `Speculation from the last 5 days · ${rows.length} report${rows.length === 1 ? '' : 's'}`;
  const degrade = feedBanner(flags, tab);
  const rumourBanner =
    tab === 'rumours'
      ? `<div class="callout warn"><b>Speculation, not a status change</b>Rumours can raise a flag. They cannot flip a start or sit, or count as a confirmed report.</div>`
      : '';
  const banner = degrade || rumourBanner ? `<div class="pn-banners">${degrade}${rumourBanner}</div>` : '';
  const cats = `<div class="pn-cats" role="group" aria-label="Filter by category">${CATS.map(([k, l]) => `<button class="tab ${cat === k ? 'active' : ''}" data-news-cat="${k}" aria-pressed="${cat === k}">${l}</button>`).join('')}</div>`;
  const moves = tab === 'league' ? leagueMoves(M) : '';
  const emptyText = tab === 'rumours' && flags.disabled ? 'No rumours without headline search. Turn news.search back on in config.json.' : 'No reports match this filter.';
  const list = shown.length
    ? `<ul class="pn-rank-list">${shown.map((r) => rankRow(M, r.it, r.score, r.bucket, tab)).join('')}</ul>`
    : `<p class="empty" style="padding:12px 16px">${esc(emptyText)}</p>`;
  const more = rows.length > shown.length ? `<p class="pn-more" style="padding:8px 16px 12px">Showing the top ${shown.length} of ${rows.length} — narrow it with a category.</p>` : '';
  const note = {
    league: "A rival's injury only matters here if it changes a matchup, a trade or the wire. Background items are hidden.",
    wire: 'Wire relevance weights lineup upgrade, availability (next man up), urgency, severity and source tier. Rolling waivers: claims process Tuesday.',
    rumours: 'Only reports from the last 5 days. Speculation is discounted; official news appears in League or on the player himself.',
  }[tab];
  return `${banner}${card(title, `${cats}${moves}${list}${more}`, { cls: 'flush', sub })}<p class="source">${note}</p>`;
}

// ---------- player search / lookup ----------
// Search is local-first: it ranks my roster, then league rosters, then free agents,
// and opens the cached report drawer. An explicit lookup can fetch one player on demand.
function searchPlayers(M, q) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const rank = (p) => (p.own === M.me.id ? 0 : p.own != null ? 1 : 2);
  return Object.values(M.snap.players)
    .filter((p) => p.n && !M.P(p.id).missing && p.n.toLowerCase().includes(t))
    .sort((a, b) => rank(a) - rank(b) || (M.val(b.id) || 0) - (M.val(a.id) || 0))
    .slice(0, 8);
}

function searchCard(M, ui) {
  const q = ui.q || '';
  const rows = searchPlayers(M, q);
  const active = Math.max(0, Math.min(ui.active || 0, rows.length - 1));
  const list = rows.length
    ? `<ul id="pn-search-results" class="pn-search-list" role="listbox">${rows
        .map(
          (p, i) =>
            `<li role="option" aria-selected="${i === active}"><button type="button" id="pn-opt-${esc(p.id)}" class="pn-search-opt ${i === active ? 'active' : ''}" data-pn-pick="${esc(p.id)}"><span class="pn-nm">${esc(p.n)}</span><span class="tm">${esc(p.pos || '?')}${p.team ? ` · ${esc(p.team)}` : ''}</span><span class="pn-owner">${ownerChip(M, p.id)}</span></button></li>`
        )
        .join('')}</ul>`
    : q.trim()
      ? `<p class="pn-search-empty">No player matches “${esc(q.trim())}”.</p>`
      : '';
  const activeId = rows.length ? `pn-opt-${rows[active].id}` : '';
  return `<div class="pn-search" role="search">
    <label for="pn-q">Search player news</label>
    <div class="pn-search-box"><input id="pn-q" type="search" value="${esc(q)}" placeholder="Player name — e.g. Ja'Marr Chase" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="${rows.length > 0}" aria-controls="pn-search-results" aria-activedescendant="${esc(activeId)}" aria-autocomplete="list"><span class="pn-search-kbd" aria-hidden="true">/</span></div>
    ${list}
    <p class="pn-search-hint">Searches cached headlines for your roster, league and trending names. Pick a player to open the report; fetch on demand if it is not cached.</p>
  </div>`;
}

function lookupPanel(M, ui, pid) {
  const p = M.P(pid);
  const res = engineFor(M);
  const cached = (res.byPid.get(pid) || []).filter((x) => !x.dupe);
  const fetched = ui.lookup?.[pid];
  const items = fetched
    ? [...lookupItems(M, pid, fetched), ...cached.filter((x) => x.kind !== 'search')].sort((a, b) => b.time - a.time)
    : cached;
  const fetching = ui.fetching === pid;
  const error = ui.lookupError && ui.fetching === null ? `<p class="callout bad" style="margin:8px 0">Couldn't fetch headlines: ${esc(ui.lookupError)}</p>` : '';
  const body = items.length
    ? `<ul class="pn-items">${items.slice(0, 12).map((i) => itemRow(M, i)).join('')}</ul>`
    : fetching
      ? '<p class="empty">Searching Google News…</p>'
      : `<p class="empty">No cached headlines for ${esc(p.n)}. Headlines are fetched for your roster and trending names, not every player. <button class="btn btn-ghost btn-xs" data-pn-fetch="${esc(pid)}">Search Google News now</button></p>`;
  const web = `https://news.google.com/search?q=${encodeURIComponent(`"${p.n}" NFL`)}`;
  const close = `<button class="btn btn-ghost btn-xs" data-pn-close="1" style="float:right">Close</button>`;
  const refresh = !fetching && items.length ? ` · <button class="btn btn-ghost btn-xs" data-pn-fetch="${esc(pid)}">Refresh headlines</button>` : '';
  return `<div class="pn-lookup">${card(
    `${p.n} · ${p.pos || '?'}${p.team ? ` ${p.team}` : ''}`,
    `${close}${error}${body}<p class="source">${items.length ? `${items.length} headline${items.length === 1 ? '' : 's'} · Google News RSS · headline + source + link only` : 'Player lookup'}${refresh} · <a href="${esc(web)}" target="_blank" rel="noopener">Open Google News ↗</a></p>`,
    { cls: 'flush', sub: 'Player lookup' }
  )}</div>`;
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
      <span class="pn-when" ${row.stale ? 'title="Cached headlines are older than the refresh window"' : ''}>${row.sinceMs != null ? esc(ago(M.now - row.sinceMs, M.now)) : '—'}${row.stale ? ' · stale' : ''}</span>
      <span class="pn-chev" aria-hidden="true">${open ? '▾' : '▸'}</span>
    </button>
    <div class="pn-body" id="pn-body-${esc(row.pid)}" ${open ? '' : 'hidden'}>
      ${advice}
      ${items}
    </div>
  </li>`;
}

// One banner for every tab: a missing or stale headline feed changes what the
// page can claim, not just what the "Your players" tab shows.
function feedBanner(flags, tab) {
  if (flags.disabled) {
    return `<div class="callout">Headline search is off, so this tab shows RotoWire notes and ESPN articles only.${
      tab === 'rumours' ? ' Rumours need headlines and will be empty.' : ''
    } Turn it back on in <code>config.json</code> (<code>news.search</code>).</div>`;
  }
  if (flags.degraded) {
    return `<div class="callout warn">Some headlines couldn't be refreshed. Cached headlines are shown, and older reports are marked so nothing looks newer than it is.</div>`;
  }
  return '';
}

function minePanel(M, openPid) {
  const res = engineFor(M);
  const PN = M.snap.playerNews || {};
  const flags = res.flags;
  const banner = feedBanner(flags, 'mine');
  const fresh = PN.freshAt ? `Headlines refreshed ${esc(ago(PN.freshAt, M.now))}` : 'No headline refresh yet';
  const per = Object.values(PN.perPlayer || {});
  const stale = per.filter((x) => x.stale).length;
  const failed = (PN.failed || []).length;
  const diag = PN.diag || {};
  const coverage = `${PN.scanned || diag.scanned || 0} players scanned · ${PN.items?.length || diag.items || 0} headlines${stale ? ` · ${stale} stale` : ''}${failed ? ` · ${failed} failed` : ''}`;
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
      { cls: 'flush', sub: `Ranked by what it means for your lineup this week · ${fresh} · ${coverage}` }
    )}
    <p class="source">Headlines come from Google News RSS (headline + source + link only). Practice reports and status changes are read from RotoWire notes as published by ESPN. A worse-news label always wins until a dated report says otherwise; speculative items never flip a start or sit on their own.</p>`;
}

export function render(M, ctx) {
  const ui = (ctx.ui.news ||= { tab: 'mine', kind: 'all', cat: 'all', open: null });
  if (ui.tab === 'fa') ui.tab = 'wire'; // old tab id
  if (!ui.cat) ui.cat = 'all';
  if (ui.q == null) ui.q = '';
  if (ui.sel === undefined) ui.sel = null;
  if (ui.active == null) ui.active = 0;
  if (!ui.lookup) ui.lookup = {};
  if (ui.fetching === undefined) ui.fetching = null;
  const mine = engineFor(M);
  const feed = buildFeed(M);
  const kindOk = (i) => ui.kind === 'all' || i.kind === ui.kind;

  // One pass per ranked tab; the category filter applies to all three.
  const ranked = {
    league: rankList(M, mine, 'league', ui.cat),
    wire: rankList(M, mine, 'wire', ui.cat),
    rumours: rankList(M, mine, 'rumours', ui.cat),
  };

  const tabs = [
    ['mine', 'Your players', mine.players.length],
    ['league', 'League', ranked.league.length],
    ['wire', 'Wire', ranked.wire.length],
    ['rumours', 'Rumours', ranked.rumours.length],
    ['team', 'Your NFL teams', feed.filter((i) => i.rel === 'team').filter(kindOk).length],
    ['all', 'All NFL', feed.filter(kindOk).length],
  ];

  let body;
  if (ui.tab === 'mine') {
    body = minePanel(M, ui.open);
  } else if (ranked[ui.tab]) {
    body = rankedPanel(M, ui.tab, ui.cat, ranked[ui.tab]);
  } else {
    const filter = ui.tab === 'team' ? (i) => i.rel === 'team' : () => true;
    const rows = feed.filter(filter).filter(kindOk);
    const title = ui.tab === 'team' ? 'Your NFL teams' : 'All NFL';
    body = card(
      title,
      rows.length
        ? `<ul class="feed">${rows.slice(0, 80).map((i) => feedItem(M, i)).join('')}</ul>`
        : `<p class="empty">Nothing in the last 7 days for this filter.</p>`,
      { cls: 'flush', sub: `Last 7 days · ${rows.length} items · ESPN articles, RotoWire player notes via ESPN, and Sleeper league transactions` }
    );
  }

  const search = searchCard(M, ui);
  const lookup = ui.sel ? lookupPanel(M, ui, ui.sel) : '';
  return `
    <div class="page-h"><div><h1>News</h1><p>Every report is filtered through your roster, your league and this week's matchups, then ranked by what it would change.</p></div></div>
    ${search}${lookup}
    <div class="tabs" role="tablist">${tabs.map((t) => `<button class="tab ${t[0] === ui.tab ? 'active' : ''}" data-news-tab="${t[0]}" role="tab" aria-selected="${t[0] === ui.tab}">${t[1]}<small>${t[2]}</small></button>`).join('')}
      <span style="flex:1"></span>
      ${ranked[ui.tab] ? '' : ['all', 'article', 'note', 'wire'].map((k) => `<button class="tab ${ui.kind === k ? 'active' : ''}" data-news-kind="${k}" aria-pressed="${ui.kind === k}">${k === 'all' ? 'Everything' : k === 'wire' ? 'League moves' : KIND[k] + 's'}</button>`).join('')}
    </div>
    ${body}`;
}

export function mount(root, M, ctx) {
  root.querySelectorAll('[data-news-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      ctx.ui.news.tab = b.dataset.newsTab;
      ctx.ui.news.cat = 'all';
      ctx.rerender();
    })
  );
  root.querySelectorAll('[data-news-kind]').forEach((b) => b.addEventListener('click', () => ((ctx.ui.news.kind = b.dataset.newsKind), ctx.rerender())));
  root.querySelectorAll('[data-news-cat]').forEach((b) => b.addEventListener('click', () => ((ctx.ui.news.cat = b.dataset.newsCat), ctx.rerender())));
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

  // ---------- player search ----------
  const ui = ctx.ui.news;
  const qEl = root.querySelector('#pn-q');
  if (qEl) {
    qEl.addEventListener('input', () => {
      ui.q = qEl.value;
      ui.active = 0;
      ui.searchFocus = true;
      ctx.rerender();
    });
    qEl.addEventListener('keydown', (e) => {
      const opts = [...root.querySelectorAll('[data-pn-pick]')];
      if (!opts.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const cur = ui.active || 0;
        const next = e.key === 'ArrowDown' ? Math.min(cur + 1, opts.length - 1) : Math.max(cur - 1, 0);
        ui.active = next;
        opts.forEach((el, i) => el.classList.toggle('active', i === next));
        qEl.setAttribute('aria-activedescendant', opts[next].id);
        opts[next].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        const pick = opts[ui.active || 0];
        if (pick) {
          e.preventDefault();
          ui.sel = pick.dataset.pnPick;
          ui.q = '';
          ui.active = 0;
          ui.lookupError = null;
          ctx.rerender();
        }
      } else if (e.key === 'Escape') {
        ui.q = '';
        ui.sel = null;
        ctx.rerender();
      }
    });
  }
  root.querySelectorAll('[data-pn-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      ui.sel = b.dataset.pnPick;
      ui.q = '';
      ui.active = 0;
      ui.lookupError = null;
      ctx.rerender();
    })
  );
  root.querySelectorAll('[data-pn-close]').forEach((b) =>
    b.addEventListener('click', () => {
      ui.sel = null;
      ui.lookupError = null;
      ctx.rerender();
    })
  );
  root.querySelectorAll('[data-pn-fetch]').forEach((b) =>
    b.addEventListener('click', async () => {
      const pid = b.dataset.pnFetch;
      ui.fetching = pid;
      ui.lookupError = null;
      ctx.rerender();
      try {
        const res = await fetch('/api/news?pid=' + encodeURIComponent(pid));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        ui.lookup[pid] = data.items || [];
      } catch (err) {
        ui.lookup[pid] = [];
        ui.lookupError = err.message;
      }
      ui.fetching = null;
      ctx.rerender();
    })
  );
  if (ui.searchFocus) {
    ui.searchFocus = false;
    qEl?.focus();
    if (qEl) qEl.setSelectionRange(qEl.value.length, qEl.value.length);
  }

  // "/" focuses the search from anywhere on the page.
  if (window._pnSearchKey) window.removeEventListener('keydown', window._pnSearchKey);
  window._pnSearchKey = (e) => {
    if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    const el = root.querySelector('#pn-q');
    if (el) {
      e.preventDefault();
      el.focus();
    }
  };
  window.addEventListener('keydown', window._pnSearchKey);
}
