import { esc, n1, ago, fmtDayTime } from '../util.js';
import { card, table, playerName, statusChip, secondOpinionBtn, statusLabel } from '../ui.js';

const search = (n) => `https://www.google.com/search?q=${encodeURIComponent(n + ' injury update')}&tbm=nws&tbs=qdr:w`;

function labelCell(p, M) {
  const sl = p.sl ? `<b>${esc(statusLabel[p.sl] || p.sl)}</b>` : '<span class="dim">healthy</span>';
  const es = p.es === undefined ? '<span class="dim">no entry</span>' : p.es ? `<b>${esc(statusLabel[p.es] || p.es)}</b>` : '<span class="dim">healthy</span>';
  const conflict = p.conflict ? `<div style="margin-top:4px;color:var(--amber);font-size:12px">Sources differ → treating <b>${esc(statusLabel[p.eff] || p.eff || 'healthy')}</b> as true (more severe label wins until a dated report confirms an upgrade)</div>` : '';
  return `<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:13px"><span class="dim">Sleeper</span><span>${sl} <span class="dim">${p.slAt ? '· ' + esc(ago(p.slAt, M.now)) : ''}</span></span><span class="dim">ESPN</span><span>${es} <span class="dim">${p.esAt ? '· ' + esc(ago(p.esAt, M.now)) : ''}</span></span></div>${conflict}`;
}

export function render(M, ctx) {
  const rows = M.injuryRows();
  const l = M.lineup(M.me);
  const irUsed = l.ir.length;
  const locked = l.ir.filter((id) => !M.irAllowed(M.P(id).sl));
  const s = M.L.settings;
  const eligible = [['Out', s.reserve_allow_out], ['Doubtful', s.reserve_allow_doubtful], ['Suspended', s.reserve_allow_sus], ['IR', 1], ['NA', s.reserve_allow_na], ['DNR', s.reserve_allow_dnr], ['COVID', s.reserve_allow_cov]];

  const table1 = rows.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Player</th><th>Labels (source, time)</th><th>What the news says</th><th>Verdict</th><th>Action</th></tr></thead><tbody>${rows
        .map((r) => {
          const p = r.p;
          const n = p.note;
          const news = n
            ? `<div style="max-width:380px">${esc(n.short || '')}<div class="dim" style="font-size:12px;margin-top:3px">${esc(n.src)} · ${esc(fmtDayTime(n.date))}</div>${n.long ? `<details class="how"><summary>Full note</summary><p>${esc(n.long)}</p></details>` : ''}</div>`
            : `<span class="dim">No dated report found in the feed</span>`;
          const next = r.next.length ? `<div class="dim" style="font-size:12px;margin-top:6px">Next man up: ${r.next.map((x) => `${esc(x.n)} <span class="dim">(${esc(x.ownerLabel)})</span>`).join(', ')}</div>` : '';
          const verdictCls = r.verdict === 'Playing' ? 'chip-blue' : r.verdict === 'Game-time decision' ? 'chip-amber' : 'chip-red';
          return `<tr>
            <td>${playerName(M, r.pid, { status: false })}<div class="dim" style="font-size:12px;margin-top:3px">${r.where === 'starter' ? 'Starting ' + r.slot : r.where === 'ir' ? 'On IR' : 'Bench'}${p.game ? ' · ' + (p.game.home ? 'vs' : '@') + ' ' + esc(p.game.opp) : ''}</div></td>
            <td>${labelCell(p, M)}</td>
            <td>${news}<div style="margin-top:6px"><a href="${esc(search(p.n))}" target="_blank" rel="noopener" style="font-size:12px">Verify with a web search (last 7 days) ↗</a></div></td>
            <td><span class="chip ${verdictCls}">${esc(r.verdict)}</span></td>
            <td><b ${r.action.bad ? 'style="color:var(--red)"' : ''}>${esc(r.action.t)}</b><div class="muted" style="font-size:13px;margin-top:2px">${esc(r.action.d)}</div>${r.checks.length ? `<div class="dim" style="font-size:12px;margin-top:6px">Next check: ${r.checks.map(esc).join('; ')}</div>` : ''}${next}</td>
          </tr>`;
        })
        .join('')}</tbody></table></div>`
    : `<div class="allclear"><span class="dot dot-green"></span> No injury tags on your roster.</div>`;

  const ir = `<p style="margin-bottom:8px"><b>${irUsed}/${M.irSlots}</b> IR slots used${irUsed < M.irSlots ? ` — <b style="color:var(--green)">${M.irSlots - irUsed} open</b>, so an eligible player can move there to free a roster spot, or you can scoop a talented injured player a rival drops` : ''}.</p>
  <p class="muted">Eligible tags in this league: ${eligible.map(([k, v]) => `<span class="chip ${v ? 'chip-blue' : ''}">${k}${v ? '' : ' ✕'}</span>`).join(' ')} · <b>Questionable is not eligible.</b></p>
  ${locked.length ? `<div class="callout bad" style="margin-top:10px"><b>IR lock active</b>${locked.map((id) => esc(M.P(id).n)).join(', ')} ${locked.length > 1 ? 'are' : 'is'} on IR but no longer carries an IR-eligible tag. Sleeper blocks all adds and claims until moved off IR.</div>` : `<p class="note"><b>No IR lock.</b> Every IR player still carries an eligible tag. Re-check every ${esc(M.waiverDayName())} before waivers — an upgrade to Questionable or healthy locks your claims.</p>`}
  <details class="how"><summary>Hold or cut? (league rule of thumb)</summary><ul><li>Hold any WR2-level player or better, and any RB with a clear path to 60%+ of touches — however long the absence.</li><li>Cut only low-volume depth who is out 4+ weeks, and only when IR is full.</li><li>Use open IR slots to scoop talented injured players that rivals drop during bye weeks.</li></ul></details>`;

  // League injury board
  const rival = [];
  for (const t of M.teams) {
    if (t.id === M.me.id) continue;
    const tl = M.lineup(t);
    for (const id of t.players) {
      const p = M.P(id);
      if (p.effSev < 2 || p.missing) continue;
      const starter = tl.starters.includes(id);
      if (!starter && p.effSev < 3) continue;
      rival.push({ id, t, starter, sev: p.effSev });
    }
  }
  rival.sort((a, b) => b.starter - a.starter || b.sev - a.sev);
  const board = table(['Player', 'Owner', 'Role'], rival.slice(0, 12).map((r) => [playerName(M, r.id), esc(r.t.owner), r.starter ? 'Starter' : 'Bench / IR']), { empty: 'No notable injuries on rival rosters.' });

  const prompt = `Use the ff-command-center skill. Run ff-injury-triage on my starters for Week ${M.W} (roster ${M.me.id}). Flagged on my roster site: ${rows.map((r) => `${r.p.n} (${r.p.eff})`).join(', ') || 'none'}. Reconcile Flaim, Down Field and StatsDeck labels with timestamps and a web check.`;

  return `
    <div class="page-h"><div><h1>Injuries</h1><p>Health beats projections. Every tag is shown with its source and time; when sources disagree, the more severe label is treated as true until a dated report confirms an upgrade.</p></div><div class="btn-row">${secondOpinionBtn(prompt)}</div></div>
    <div class="stack">
      ${card('Your tagged players', table1, { cls: 'flush', sub: 'Verdict: Playing / Game-time decision / Out this week / Multi-week' })}
      <div class="grid g2">
        ${card('IR rules & slots', ir)}
        ${card('Around the league', board, { cls: 'flush', sub: 'Hurt starters (and IR/Out bench) on rival rosters — who may be shopping for help' })}
      </div>
    </div>
    <p class="source">Labels: Sleeper player status and ESPN's injury report (RotoWire notes). ESPN doesn't publish practice participation in this feed, so Friday's practice report and the inactives list are still worth checking. Statuses can change after this page last synced.</p>`;
}
