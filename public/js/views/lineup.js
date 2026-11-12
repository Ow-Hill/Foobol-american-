import { esc, n1, signed, fmtKick, avg } from '../util.js';
import { card, table, playerName, callBadge, problemList, statusChip, spark, secondOpinionBtn } from '../ui.js';
import { matchupFor } from '../matchup.js';
import { WIND } from '../fitted.js';

export function oppCell(p, M = null) {
  if (p.avail === 'bye') return `<span class="chip chip-bye">BYE</span>`;
  if (!p.game) return '<span class="dim">–</span>';
  const g = p.game;
  const imp = g.imp != null ? `<div class="dim" style="font-size:11.5px">team total ${g.imp.toFixed(1)}${g.spread ? ` · ${g.spread.fav === p.team ? 'fav' : 'dog'} ${g.spread.pts}` : ''}</div>` : '';
  const mu = M ? matchupFor(M, p.id) : null;
  // Shown for quarterbacks only: in the 2022-2026 backtest the opponent's points allowed said
  // something about QBs (and little beyond the projection) and nothing reliable about RB/WR/TE.
  const muTxt = mu && mu.tier !== 'neutral' && p.pos === 'QB'
    ? `<div class="dim" style="font-size:11.5px" title="Average ${mu.avg.toFixed(1)} pts/g allowed to ${esc(p.pos)} over the last ${mu.games} games. Information only: the projection already accounts for most of it.">${esc(mu.label)}</div>`
    : '';
  return `<span>${g.home ? 'vs' : '@'} ${esc(g.opp)}</span>${imp}${muTxt}${windTxt(p)}`;
}
// Wind flag: outdoor games forecast at 15+ mph (backtest E10). Information only; projections
// are not changed.
export function windTxt(p) {
  const w = p.game?.wind;
  if (!w || w.mph < WIND.mph || WIND[p.pos] == null) return '';
  const eff = WIND[p.pos];
  return `<div style="font-size:11.5px;color:var(--amber)" title="Forecast at kickoff. In 2022-2026, outdoor games at ${WIND.mph}+ mph cost ${esc(p.pos)}s about ${Math.abs(eff)} points against their projection. The projection does not include it.">wind ${w.mph} mph${w.gust > w.mph + 5 ? ` (gusts ${w.gust})` : ''} · ${eff} pts typical</div>`;
}
export function kickCell(p) {
  if (!p.game) return '<span class="dim">–</span>';
  if (p.game.state === 'in') return `<span class="chip chip-red">LIVE</span>`;
  if (p.game.state === 'post' || p.game.completed) return `<span class="chip">FINAL</span>`;
  return fmtKick(p.game.date);
}
export function rangeCell(p) {
  if (p.floor == null) return '<span class="dim">–</span>';
  return `<span class="num">${n1(p.floor)}–${n1(p.ceil)}</span>`;
}
export function usageCell(p) {
  const pts = p.hist.slice(-6).map((h) => h.pts);
  const snap = p.snpNow != null ? `<div class="dim" style="font-size:11.5px">${p.snpNow}% snaps${p.snpTrend != null && Math.abs(p.snpTrend) >= 5 ? ` (${p.snpTrend > 0 ? '▲' : '▼'}${Math.abs(Math.round(p.snpTrend))})` : ''}</div>` : '';
  return `${spark(pts, { max: 35 })}${snap}`;
}

export function render(M, ctx) {
  const l = M.lineup(M.me);
  const swaps = M.swaps();
  const probs = M.problems().filter((p) => p.sev !== 'info' && (p.tab === 'lineup' || p.tab === 'injuries'));
  const postureTxt = {
    floor: ['Favored', `You project ${n1(M.margin)} ahead of ${esc(M.opp?.owner || 'your opponent')}. Start the best projections: in the 2022-2026 backtest, picking "safer" players by recent floor did not avoid busts any better.`],
    ceiling: ['Underdog', `You project ${n1(-M.margin)} behind ${esc(M.opp?.owner || 'your opponent')}. Start the best projections: picking by recent ceiling did not produce big weeks any more often.`],
    expected: ['Best expected points', `Your matchup with ${esc(M.opp?.owner || 'your opponent')} projects within ${n1(Math.abs(M.margin))} points — no need to skew the risk.`],
  }[M.posture];

  const curRows = l.cur.map((s) => {
    if (!s.pid) return `<tr class="empty-slot"><td><span class="slot">${s.slot}</span></td><td colspan="6"><b style="color:var(--red)">EMPTY — you are leaving points on the table</b></td></tr>`;
    const p = M.P(s.pid);
    return `<tr><td><span class="slot">${s.slot}</span></td><td>${playerName(M, s.pid)}</td><td>${oppCell(p, M)}</td><td>${kickCell(p)}</td><td class="num"><b>${n1(M.val(s.pid))}</b>${p.avail === 'out' ? '<div class="dim" style="font-size:11px">counts 0 — out</div>' : p.avail === 'q' ? '<div class="dim" style="font-size:11px">if he plays</div>' : ''}</td><td class="num">${rangeCell(p)}</td><td>${usageCell(p)}</td></tr>`;
  });
  const curTable = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Slot</th><th>Player</th><th>Opponent</th><th>Kickoff</th><th class="r">Proj</th><th class="r">Usual range</th><th>Last 6 · usage</th></tr></thead><tbody>${curRows.join('')}</tbody><tfoot><tr><td colspan="4" class="muted" style="padding:9px 12px">Lineup as set in Sleeper</td><td class="num" style="padding:9px 12px"><b>${n1(l.curTotal)}</b></td><td colspan="2"></td></tr></tfoot></table></div>`;

  const swapRows = swaps.map((s) => {
    const st = M.P(s.start);
    const b = s.bench ? M.P(s.bench) : null;
    const keep = s.keep;
    const tb = s.tb ? `<details class="how"><summary>Tiebreak steps</summary><ul>${['Health certainty: prefer the player with no injury tag', 'Game environment: implied team totals 4+ points apart', 'Kickoff: later game keeps swap flexibility', 'No tiebreak: keep the higher projection (wins 54% of toss-ups)'].map((x, i) => `<li ${s.tb.reasons[0] && x.startsWith(s.tb.reasons[0].step.split(' ')[0]) ? 'style="color:var(--green)"' : ''}>${x}</li>`).join('')}</ul></details>` : '';
    return [
      `<span class="slot">${s.slot}</span>`,
      keep ? `<span class="muted">Keep ${playerName(M, s.bench, { status: true })}</span>` : playerName(M, s.start),
      keep ? `<span class="muted">${playerName(M, s.start, { status: true })}</span>` : b ? playerName(M, s.bench) : '<span class="dim">— empty slot</span>',
      `<span class="num ${s.gap > 0 ? 'pos-num' : ''}">${s.empty ? '+' + n1(val(M, s.start)) : signed(s.gap)}</span>`,
      callBadge(keep ? 'Toss-up · keep' : s.call, s.band),
      `<span class="muted">${esc(s.note)}</span>${tb}`,
    ];
  });
  const changes = swaps.length
    ? table(['Slot', 'Start', 'Bench', 'Gap', 'Call', 'Why'], swapRows)
    : `<div class="allclear"><span class="dot dot-green"></span> No changes — your lineup is already the best legal one.</div>`;

  const qs = l.starters.filter((id) => id && M.P(id).avail === 'q');
  const cond = qs.length
    ? qs
        .map((id) => {
          const p = M.P(id);
          const slot = M.slotNames[l.starters.indexOf(id)];
          const fb = M.fallbackFor(slot, [id]);
          const when = p.game ? new Date(new Date(p.game.date).getTime() - 90 * 60000).toISOString() : null;
          return `<li style="margin-bottom:10px">${playerName(M, id)}<div class="muted" style="margin-top:3px">Start him if active${fb ? `; otherwise <b style="color:var(--text)">${esc(M.P(fb).n)}</b> (${n1(M.val(fb))} projected${M.P(fb).avail === 'q' ? ', but he is also questionable' : ''})` : ' — no healthy fallback on your bench'}. Re-check after Friday\u2019s practice report${when ? ` and at inactives (~${fmtKick(when)})` : ''}.</div>${p.note ? `<div class="dim" style="font-size:12.5px;margin-top:3px">Latest: ${esc(p.note.short || '')} <span class="dim">(${esc(p.note.src)}, ${esc(new Date(p.note.date).toLocaleDateString())})</span></div>` : ''}</li>`;
        })
        .join('')
    : '';

  const benchRows = l.bench.map((id) => {
    const p = M.P(id);
    return [playerName(M, id), oppCell(p, M), kickCell(p), `<span class="num">${n1(M.val(id))}</span>`, rangeCell(p), usageCell(p)];
  });

  const delta = l.opt.total - l.curTotal;
  const prompt = `Use the ff-command-center skill. Run ff-lineup-call for Week ${M.W} on roster ${M.me.id}. Pre-check from my roster site: ${probs.map((p) => p.title).join('; ') || 'no hard problems'}${swaps.some((s) => s.band === 'toss') ? '; toss-ups: ' + swaps.filter((s) => s.band === 'toss').map((s) => `${M.P(s.start).n} vs ${M.P(s.bench)?.n}`).join(', ') : ''}. Get Down Field, StatsDeck and Scout-Squad numbers side by side for every lean or toss-up.`;

  return `
    <div class="page-h"><div><h1>Lineup</h1><p>Hard problems first, then every legal change ranked by how confident the data is. Projections are Sleeper/RotoWire stat lines scored with <b>your league's exact scoring</b>.</p></div><div class="btn-row">${secondOpinionBtn(prompt)}</div></div>
    ${probs.length ? card('Fix these first', problemList(M, probs)) : ''}
    <div class="grid g2" style="margin-top:14px">
      <div class="callout ${delta > 0.5 ? 'warn' : 'good'}"><b>${delta > 0.5 ? `Best legal lineup is ${n1(delta)} points higher` : 'Lineup is optimal'}</b>As set ${n1(l.curTotal)} → best ${n1(l.opt.total)} projected points${M.opp ? ` vs ${esc(M.opp.owner)}'s ${n1(M.oppOpt)}` : ''}.</div>
      <div class="callout"><b>Risk posture: ${postureTxt[0]}</b>${postureTxt[1]}</div>
    </div>
    <div class="stack" style="margin-top:14px">
      ${card('Recommended changes', changes, { sub: 'Clear = gap ≥ 4 pts · Lean = 2–4 · Toss-up = under 2, settled by the tiebreak order below' })}
      ${cond ? card('Conditional calls waiting on injury news', `<ul style="list-style:none;margin:0;padding:0">${cond}</ul>`) : ''}
      ${card('Lineup as currently set', curTable, { cls: 'flush' })}
      ${card('Bench', table(['Player', 'Opponent', 'Kickoff', 'Proj', 'Usual range', 'Last 6 · usage'], benchRows), { cls: 'flush' })}
    </div>
    <div class="callout warn" style="margin-top:14px"><b>What this page can't verify</b>
      These calls use a single projection source. The consensus method in your command-center skill wants Down Field, StatsDeck and Scout-Squad side by side — those connectors aren't reachable from a website, so use the button above to run them, and treat anything short of a Clear call as provisional. Official inactives (about 90 minutes before kickoff) aren't checked. Wind of 15+ mph is flagged next to the opponent when the forecast is available; it is not built into projections.
      <details class="how"><summary>Tiebreak order when a call is close</summary><ul><li>Health certainty — prefer the player with no injury tag.</li><li>Game environment — the higher implied team total, only when the two are 4+ points apart (won 54.5% in the backtest).</li><li>Kickoff — the later game keeps late-swap flexibility.</li><li>Otherwise keep the higher projection: it wins 54% of toss-ups.</li><li class="dim">Dropped after the 2022-2026 backtest: position matchup (won 50%) and floor/ceiling by recent games (no better than the projection). See Track record.</li></ul></details>
    </div>`;
}

function val(M, id) {
  return M.val(id);
}
