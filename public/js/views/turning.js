import { esc, n1, pct, signed } from '../util.js';
import { card, table, histLoading, bar } from '../ui.js';

function personGames(HM, season, pid) {
  const out = [];
  for (const g of HM.games) {
    if (g.season !== season || g.period === 'consolation') continue;
    const mine = g.a.ownerId === pid ? g.a : g.b.ownerId === pid ? g.b : null;
    if (!mine) continue;
    const opp = mine === g.a ? g.b : g.a;
    const L = HM.lineup(season, g.wk, mine.rid);
    if (!L) continue;
    const won = mine.pts > opp.pts;
    const lost = mine.pts < opp.pts;
    const margin = Math.abs(mine.pts - opp.pts);
    const optWin = L.opt > opp.pts;
    // who should have started
    const startSet = new Set(L.starters);
    const optSet = new Set(L.optSlots.filter(Boolean));
    const ins = [...optSet].filter((id) => !startSet.has(id)).map((id) => ({ id, pts: L.pp[id] || 0 })).sort((a, b) => b.pts - a.pts);
    const outs = [...startSet].filter((id) => !optSet.has(id)).map((id) => ({ id, pts: L.pp[id] || 0 })).sort((a, b) => a.pts - b.pts);
    out.push({ g, mine, opp, L, won, lost, margin, optWin, ins, outs, period: g.period, wk: g.wk });
  }
  return out.sort((a, b) => a.wk - b.wk);
}

function recordOf(gs, pick) {
  let w = 0;
  let l = 0;
  gs.filter((x) => x.period === 'regular').forEach((x) => (pick(x) ? w++ : l++));
  return { w, l };
}

export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>Season turning points</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const ui = (ctx.ui.turn ||= { season: null });
  const season = ui.season || M.snap.meta.season;
  const meP = Object.values(HM.people).find((p) => p.name === M.me.owner);
  const s = HM.seasons[season];
  if (!meP || !meP.seasons[season]) return `<div class="page-h"><div><h1>Season turning points</h1></div></div><p class="empty">${esc(M.me.owner)} was not in the ${season} league.</p>`;
  const gs = personGames(HM, season, meP.id);
  const act = recordOf(gs, (x) => x.won);
  const opt = recordOf(gs, (x) => x.optWin);
  const flipped = gs.filter((x) => x.lost && x.optWin);
  const close = gs.filter((x) => x.lost && x.margin < 10 && x.period === 'regular');
  const closeFlip = recordOf(gs, (x) => x.won || (x.lost && x.margin < 10));

  const moments = [];
  gs.forEach((x) => {
    const best = x.ins[0];
    const swap = best && x.outs[0] ? `Starting ${HM.nm(best.id)} (${n1(best.pts)}) over ${HM.nm(x.outs[0].id)} (${n1(x.outs[0].pts)}) was the difference-maker.` : '';
    if (x.lost && x.optWin) moments.push({ score: 9 + (10 - Math.min(x.margin, 10)) / 10, wk: x.wk, tag: 'Bench flipped it', cls: 'bad', text: `Week ${x.wk}: lost ${n1(x.mine.pts)}–${n1(x.opp.pts)} to ${x.opp.owner}, but the best lineup scored ${n1(x.L.opt)} — a win by ${n1(x.L.opt - x.opp.pts)}. ${swap}` });
    else if (x.lost && x.margin < 10) moments.push({ score: 6, wk: x.wk, tag: 'Close loss', cls: 'warn', text: `Week ${x.wk}: lost to ${x.opp.owner} by just ${n1(x.margin)} (${n1(x.mine.pts)}–${n1(x.opp.pts)}).` });
    else if (x.won && x.margin < 5) moments.push({ score: 5, wk: x.wk, tag: 'Narrow escape', cls: 'good', text: `Week ${x.wk}: survived ${x.opp.owner} by ${x.margin.toFixed(2)} (${n1(x.mine.pts)}–${n1(x.opp.pts)}).` });
    if (x.period === 'playoff') moments.push({ score: 8, wk: x.wk, tag: x.won ? 'Playoff win' : 'Playoff loss', cls: x.won ? 'good' : 'bad', text: `Week ${x.wk} playoffs: ${x.won ? 'beat' : 'lost to'} ${x.opp.owner} ${n1(x.mine.pts)}–${n1(x.opp.pts)}${x.L.left > 8 ? `; ${n1(x.L.left)} points stayed on the bench` : ''}.` });
  });
  moments.sort((a, b) => b.score - a.score);
  const momTbl = moments.length ? `<ul class="feed">${moments.slice(0, 8).map((m) => `<li class="${m.cls === 'good' ? 'mine' : ''}"><div class="meta"><span class="chip ${m.cls === 'bad' ? 'chip-red' : m.cls === 'warn' ? 'chip-amber' : 'chip-fa'}">${m.tag}</span><span>Week ${m.wk}</span></div><div class="title" style="font-weight:550">${esc(m.text)}</div></li>`).join('')}</ul>` : '<p class="empty">No close calls yet.</p>';

  // league: actual vs optimal records
  const leagueRows = Object.values(HM.people).filter((p) => p.seasons[season]).map((p) => {
    const g2 = personGames(HM, season, p.id);
    return { p, a: recordOf(g2, (x) => x.won), o: recordOf(g2, (x) => x.optWin) };
  }).sort((x, y) => y.o.w - y.a.w - (x.o.w - x.a.w));
  const league = table(['Manager', 'Actual', 'With best lineups', 'Difference'], leagueRows.map((r) => [`<b ${r.p.id === meP.id ? 'style="color:var(--green)"' : ''}>${esc(r.p.name)}</b>`, `<span class="num">${r.a.w}-${r.a.l}</span>`, `<span class="num">${r.o.w}-${r.o.l}</span>`, `<span class="num ${r.o.w - r.a.w > 0 ? 'pos-num' : ''}">${signed(r.o.w - r.a.w)} wins</span>`]));

  // upcoming swing games (current season only)
  let swing = '';
  if (s.current) {
    const me = M.me.id;
    const regEnd = M.L.settings.playoff_week_start - 1;
    const base = M.odds()[me].playoff;
    const rows = [];
    for (let wk = M.W; wk <= regEnd; wk++) {
      const ms = M.snap.matchups[wk] || [];
      const m = ms.find((x) => x.rid === me);
      const o = m && ms.find((x) => x.mid === m.mid && x.rid !== me);
      if (!o) continue;
      const w = M.runSim({ n: 3000, force: [{ rid: me, wk, win: true }], seed: 7 + wk }).res[me];
      const l = M.runSim({ n: 3000, force: [{ rid: me, wk, win: false }], seed: 7 + wk }).res[me];
      rows.push({ wk, opp: M.teamBy[o.rid], w: w.playoff, l: l.playoff, wt: w.title, lt: l.title, swing: w.playoff - l.playoff });
    }
    const maxS = Math.max(...rows.map((r) => r.swing), 0.01);
    swing = card('Games still to swing your season', table(['Week', 'Opponent', 'Playoffs if you win', 'if you lose', 'Swing'], rows.map((r) => [`<span class="num">${r.wk}</span>`, `<b>${esc(r.opp.owner)}</b>`, `<span class="num pos-num">${pct(r.w)}</span>`, `<span class="num neg-num">${pct(r.l)}</span>`, `${bar(r.swing / maxS, r.swing === maxS ? '' : 'blue')} <span class="num">${n1(r.swing * 100)} pts</span>`])) + `<p class="note">Right now: <b>${pct(base)}</b> to make the playoffs. The biggest swing game is Week ${rows.slice().sort((a, b) => b.swing - a.swing)[0].wk}.</p>`, { cls: 'flush', sub: 'How different results would change your playoff odds' });
  }

  const seasonOpts = HM.seasonList.filter((x) => x.teams.some((t) => t.ownerId === meP.id)).map((x) => `<option value="${x.season}" ${x.season === season ? 'selected' : ''}>${x.season}</option>`).join('');
  const headline = flipped.length ? `Your best lineup each week would have turned ${flipped.length === 1 ? 'a loss into a win' : flipped.length + ' losses into wins'} — ${act.w}-${act.l} would have been ${opt.w}-${opt.l}.` : `You started the winning lineup almost every week — the record matches what the bench allowed.`;
  return `<div class="page-h"><div><h1>Season turning points</h1><p>The moments that shaped ${esc(meP.name)}'s ${season}, and how different results would have changed it.</p></div><select id="tpSeason" aria-label="Season">${seasonOpts}</select></div>
  <div class="kpis" style="margin-bottom:14px"><div class="kpi"><small>Actual record</small><b>${act.w}-${act.l}</b><span>regular season</span></div><div class="kpi"><small>With best lineups</small><b class="pos-num">${opt.w}-${opt.l}</b><span>same opponents, optimal starters</span></div><div class="kpi"><small>Losses by under 10</small><b>${close.length}</b><span>flip them all: ${closeFlip.w}-${closeFlip.l}</span></div><div class="kpi"><small>Bench-flipped losses</small><b>${flipped.length}</b><span>${n1(gs.reduce((t, x) => t + x.L.left, 0))} points left in total</span></div></div>
  <div class="callout" style="margin-bottom:14px"><b>${esc(headline)}</b>This replays your real matchups with the lineup that would have scored the most from the players you actually had — hindsight, so it grades results, not decisions.</div>
  <div class="stack"><div class="grid g2">${card('Defining moments', momTbl, { cls: 'flush' })}${card('Who was hurt most by lineup mistakes?', league, { cls: 'flush', sub: `${season} regular season: actual wins vs wins with perfect lineups` })}</div>${swing}</div>`;
}

export function mount(root, M, ctx) {
  root.querySelector('#tpSeason')?.addEventListener('change', (e) => ((ctx.ui.turn.season = e.target.value), ctx.rerender()));
}
