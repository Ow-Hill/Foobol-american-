import { esc, n1 } from '../util.js';
import { card, table, histLoading } from '../ui.js';
import { answer, suggestions } from '../historian.js';

function recordBook(M, HM) {
  const sides = HM.games.flatMap((g) => [{ g, me: g.a, op: g.b }, { g, me: g.b, op: g.a }]);
  const hi = sides.slice().sort((a, b) => b.me.pts - a.me.pts)[0];
  const lo = sides.slice().sort((a, b) => a.me.pts - b.me.pts)[0];
  const blow = HM.games.filter((g) => g.winner).slice().sort((a, b) => b.margin - a.margin)[0];
  const close = HM.games.filter((g) => g.winner).slice().sort((a, b) => a.margin - b.margin)[0];
  const seasonPF = HM.seasonList.flatMap((s) => s.teams.map((t) => ({ s: s.season, t }))).sort((a, b) => b.t.pf - a.t.pf)[0];
  const rows = [
    ['Highest score', `${n1(hi.me.pts)} — ${hi.me.owner}`, `${hi.g.season} wk ${hi.g.wk}`],
    ['Lowest score', `${n1(lo.me.pts)} — ${lo.me.owner}`, `${lo.g.season} wk ${lo.g.wk}`],
    ['Biggest blowout', `${n1(blow.margin)} — ${blow.winner.owner} over ${blow.loser.owner}`, `${blow.season} wk ${blow.wk}`],
    ['Closest game', `${close.margin.toFixed(2)} — ${close.winner.owner} over ${close.loser.owner}`, `${close.season} wk ${close.wk}`],
    ['Most points in a season', `${n1(seasonPF.t.pf)} — ${seasonPF.t.owner}`, seasonPF.s],
    ...HM.seasonList.filter((s) => HM.champion(s.season)).map((s) => [`${s.season} champion`, `${HM.champion(s.season).owner} (${HM.champion(s.season).teamName})`, `beat ${HM.runnerUp(s.season)?.owner || '—'} in the final`]),
  ];
  return table(['Record', 'Holder', 'When'], rows);
}

export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>League historian</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const ui = (ctx.ui.hist ||= { q: '', res: undefined });
  const sugg = suggestions(HM, M);
  const res = ui.res;
  const seasons = HM.seasonList.map((s) => s.season).join(' and ');
  const out = res === undefined ? '' : res === null
    ? `<div class="callout warn" style="margin-top:14px"><b>I can't answer that from the record</b>I only answer from this league's games, lineups, drafts and transactions (${seasons}). Try: highest score, closest game, a manager's record, head-to-head, trades, waiver adds, draft picks, a player's best game, a streak, or "what happened in week 8".</div>`
    : `<div class="answer" style="margin-top:14px"><div class="big-a">${esc(res.headline)}</div>${res.rows.length ? table(res.heads, res.rows.map((r) => r.map((c) => esc(c)))) : ''}<p class="source">Source: ${esc(res.src || 'league record')}</p></div>`;
  return `<div class="page-h"><div><h1>League historian</h1><p>Ask anything about the league across every season (${seasons}). Answers come only from recorded games, lineups, drafts and trades — each one shows its evidence.</p></div></div>
  <div class="stack">${card('Ask the historian', `<form id="hq" class="btn-row" style="flex-wrap:nowrap"><input id="hqIn" class="input" style="flex:1;min-width:0" value="${esc(ui.q)}" placeholder="e.g. What is the closest game ever?" aria-label="Question" autocomplete="off" /><button class="btn" type="submit">Ask</button></form><div class="btn-row" style="margin-top:10px">${sugg.map((s) => `<button class="qchip" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>${out}`)}
  ${card('Record book', recordBook(M, HM), { cls: 'flush', sub: `All ${HM.games.length} games across ${seasons}` })}</div>
  <details class="how"><summary>How it stays grounded</summary><ul><li>It is a rule-based search over the league's recorded data — not a chatbot — so it can't make things up; if it doesn't know, it says so.</li><li>Lineup questions compare what a manager started with the best legal lineup from that week's actual points.</li><li>Managers are tracked by account across seasons, so renames don't break their history.</li></ul></details>`;
}

export function mount(root, M, ctx) {
  const ui = ctx.ui.hist;
  const ask = (q) => {
    ui.q = q;
    ui.res = q.trim() ? answer(ctx.HM, M, q) : undefined;
    ctx.rerender();
  };
  root.querySelector('#hq')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(root.querySelector('#hqIn').value);
  });
  root.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
}
