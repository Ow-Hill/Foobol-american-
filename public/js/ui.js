import { esc, n1, ago } from './util.js';

export const statusLabel = { IR: 'IR', PUP: 'PUP', Sus: 'SUSP', NA: 'NA', DNR: 'DNR', COV: 'COV', Out: 'OUT', Doubtful: 'DOUBT', Questionable: 'Q', Probable: 'PROB' };

export function statusChip(p, { showConflict = true } = {}) {
  if (p.avail === 'bye') return `<span class="chip chip-bye" title="Bye week">BYE</span>`;
  if (!p.eff) return '';
  const cls = p.effSev >= 3 ? 'chip-red' : p.effSev === 2 ? 'chip-amber' : 'chip-blue';
  const body = p.body ? ` · ${esc(p.body)}` : '';
  const conf = showConflict && p.conflict ? `<span class="chip chip-conflict" title="Sleeper says ${esc(p.sl || 'healthy')}, ESPN says ${esc(p.es || 'healthy')} — the more severe label is used until a dated report confirms the upgrade">sources differ</span>` : '';
  return `<span class="chip ${cls}">${esc(statusLabel[p.eff] || p.eff)}${body}</span>${conf}`;
}

export function ownerChip(M, pid) {
  const o = M.P(pid).own;
  if (o == null) return `<span class="chip chip-fa">FA</span>`;
  if (o === M.me.id) return `<span class="chip chip-mine">Yours</span>`;
  return `<span class="chip chip-rival">${esc(M.ownerName(o))}</span>`;
}

export function playerName(M, pid, { owner = false, team = true, status = true } = {}) {
  const p = M.P(pid);
  return `<span class="pname"><span class="${'pos pos-' + (p.pos || 'x').toLowerCase()}">${esc(p.pos)}</span><span class="pn">${esc(p.n)}</span>${team && p.team ? `<span class="tm">${esc(p.team)}</span>` : ''}${status ? statusChip(p) : ''}${owner ? ownerChip(M, pid) : ''}</span>`;
}

export function callBadge(call, band) {
  return `<span class="call call-${band}">${esc(call)}</span>`;
}

export function card(title, body, { right = '', cls = '', sub = '' } = {}) {
  return `<section class="card ${cls}"><header class="card-h"><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right ? `<div class="card-r">${right}</div>` : ''}</header><div class="card-b">${body}</div></section>`;
}

export function table(heads, rows, { cls = '', empty = 'Nothing to show.' } = {}) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<div class="tbl-wrap"><table class="tbl ${cls}"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function note(html) {
  return `<p class="note">${html}</p>`;
}

export function problemList(M, list, { limit = 99 } = {}) {
  if (!list.length) return `<div class="allclear"><span class="dot dot-green"></span> No hard problems found. Lineup is legal and every starter is healthy.</div>`;
  return `<ul class="problems">${list
    .slice(0, limit)
    .map((p) => `<li class="problem problem-${p.sev}"><span class="sev-bar"></span><div><strong>${esc(p.title)}</strong><p>${esc(p.body)}</p></div><button class="btn btn-ghost" data-go="${p.tab}">${p.tab === 'lineup' ? 'Lineup' : p.tab === 'injuries' ? 'Injuries' : p.tab === 'waivers' ? 'Waivers' : p.tab}</button></li>`)
    .join('')}</ul>`;
}

export function sourceLine(M, parts) {
  return `<p class="source">${parts.join(' · ')}</p>`;
}

export function secondOpinionBtn(text) {
  return `<button class="btn btn-ghost" data-copy="${esc(text)}" title="Copy a prompt for your Flaim / Down Field / StatsDeck / Scout-Squad setup">Copy second-opinion prompt</button>`;
}

export function bar(frac, cls = '') {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return `<span class="bar ${cls}"><span style="width:${w.toFixed(1)}%"></span></span>`;
}

export function spark(values, { max = null, h = 28 } = {}) {
  if (!values.length) return '';
  const m = max ?? Math.max(...values, 1);
  return `<span class="spark">${values.map((v) => `<i style="height:${Math.max(2, (v / m) * h)}px" title="${n1(v)}"></i>`).join('')}</span>`;
}

export function when(ms, now) {
  return ms ? `<span class="when" title="${new Date(ms).toLocaleString()}">${esc(ago(ms, now))}</span>` : '';
}

export function histLoading(ctx) {
  if (ctx.HM) return null;
  return `<div class="loading" style="padding:80px 0"><div class="spinner"></div><p>Loading league history (every season, draft and transaction)…</p></div>`;
}

export function shareBar(text, { title = '', print = true } = {}) {
  return `<div class="btn-row no-print"><button class="btn" data-copy="${esc(text)}">Copy as text</button><button class="btn" data-share="${esc(text)}" data-share-title="${esc(title)}">Share…</button>${print ? '<button class="btn btn-ghost" data-print>Print / save as PDF</button>' : ''}</div>`;
}
