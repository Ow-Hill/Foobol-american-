import { esc, n1, pct, sum, signed } from '../util.js';
import { card, table, bar } from '../ui.js';

function compute(M) {
  if (M._path) return M._path;
  const me = M.me.id;
  const base = M.runSim({ n: 10000, track: me });
  const lastReg = M.L.settings.playoff_week_start - 1;
  const remaining = [];
  for (let wk = M.W; wk <= lastReg; wk++) {
    const ms = M.snap.matchups[wk] || [];
    const mine = ms.find((m) => m.rid === me);
    const opp = mine && ms.find((m) => m.mid === mine.mid && m.rid !== me);
    if (!opp) continue;
    const useProj = wk === M.W && M.oppOpt != null && M.opp && M.opp.id === opp.rid;
    const p = M.winProb(me, opp.rid, useProj ? [M.myOpt, M.oppOpt] : null);
    remaining.push({ wk, opp: M.teamBy[opp.rid], p, proj: useProj });
  }
  const scen = [];
  const mk = (label, force) => {
    const r = M.runSim({ n: 6000, force });
    scen.push({ label, playoff: r.res[me].playoff, bye: r.res[me].bye, title: r.res[me].title });
  };
  if (remaining.length) {
    mk(`Win Week ${remaining[0].wk} vs ${remaining[0].opp.owner}`, [{ rid: me, wk: remaining[0].wk, win: true }]);
    mk(`Lose Week ${remaining[0].wk} vs ${remaining[0].opp.owner}`, [{ rid: me, wk: remaining[0].wk, win: false }]);
    mk(`Win out (${remaining.length} games)`, remaining.map((r) => ({ rid: me, wk: r.wk, win: true })));
    mk(`Lose out (${remaining.length} games)`, remaining.map((r) => ({ rid: me, wk: r.wk, win: false })));
  }
  return (M._path = { base, remaining, scen });
}

export function render(M, ctx) {
  const { base, remaining, scen } = compute(M);
  const me = M.me;
  const r = base.res[me.id];
  const p = base.path;
  const n = base.n;
  const pcount = M.L.settings.playoff_teams;
  const rounds = M.L.settings.playoff_week_start;

  const seedRows = p.seed.slice(1, pcount + 1).map((c, i) => `<div class="fullbar" style="display:grid;grid-template-columns:90px 1fr 52px;gap:10px;align-items:center;margin-bottom:6px"><span class="muted">#${i + 1} seed${i < 2 ? ' · bye' : ''}</span>${bar(c / n, i < 2 ? '' : 'blue')}<span class="num">${pct(c / n)}</span></div>`).join('');
  const missPct = 1 - sum(p.seed.slice(1, pcount + 1)) / n;
  const bracket = table(
    ['Stage', 'Chance', 'Detail'],
    [
      ['Make the playoffs', `<span class="num"><b>${pct(r.playoff)}</b></span>`, `Top ${pcount} of ${M.teams.length}`],
      ['Win the wild-card round', `<span class="num"><b>${pct(p.r1Play ? p.r1Win / n : 0)}</b></span>`, p.r1Play ? `You play it in ${pct(p.r1Play / n)} of seasons and win ${pct(p.r1Win / p.r1Play)} of those` : 'Only seeds 3–6 play it'],
      ['Reach the semifinal', `<span class="num"><b>${pct(p.r2 / n)}</b></span>`, `Week ${rounds + 1} — seeds 1–2 start here on a bye`],
      ['Reach the championship', `<span class="num"><b>${pct(p.final / n)}</b></span>`, `Week ${rounds + 2}`],
      ['Win the title', `<span class="num"><b>${pct(p.title / n)}</b></span>`, `League-best is ${esc(M.teams.slice().sort((a, b) => base.res[b.id].title - base.res[a.id].title)[0].owner)} at ${pct(Math.max(...M.teams.map((t) => base.res[t.id].title)))}`],
    ],
  );
  const roundNames = { 1: `Wild card (Week ${rounds})`, 2: `Semifinal (Week ${rounds + 1})`, 3: `Championship (Week ${rounds + 2})` };
  const oppTables = [1, 2, 3]
    .map((rd) => {
      const total = Object.values(p.opp[rd]).reduce((a, b) => a + b, 0);
      if (!total) return '';
      const list = Object.entries(p.opp[rd]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return `<div style="margin-bottom:12px"><h3 class="dimh">${roundNames[rd]} <span class="dim" style="text-transform:none;letter-spacing:0">· in ${pct(total / n)} of seasons</span></h3>${list.map(([rid, c]) => `<div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:4px 0"><span><b>${esc(M.teamBy[rid].owner)}</b> <span class="dim">${M.teamBy[rid].w}-${M.teamBy[rid].l}</span></span><span class="num">${pct(c / total)}</span><span class="num muted" title="Your chance to beat them">you win ${pct(M.winProb(me.id, Number(rid)))}</span></div>`).join('')}</div>`;
    })
    .join('');
  const sched = table(
    ['Week', 'Opponent', 'Record', 'Your win chance', ''],
    remaining.map((x) => [`<span class="num">${x.wk}</span>`, `<b>${esc(x.opp.owner)}</b>`, `<span class="num">${x.opp.w}-${x.opp.l}</span>`, `<span class="num"><b>${pct(x.p)}</b></span> ${bar(x.p, x.p < 0.4 ? 'red' : x.p < 0.55 ? 'amber' : '')}`, x.proj ? '<span class="dim" style="font-size:12px">from this week\u2019s lineup projections</span>' : '<span class="dim" style="font-size:12px">from season scoring</span>']),
  );
  const exp = sum(remaining.map((x) => x.p));
  const wins = Object.entries(p.byWins).map(([k, v]) => ({ w: Number(k), n: v.n, made: v.made })).filter((x) => x.n / n >= 0.01).sort((a, b) => a.w - b.w);
  const needTbl = table(['Final wins', 'Chance it happens', 'Chance you make it'], wins.map((x) => [`<span class="num"><b>${x.w}</b></span>`, `<span class="num">${pct(x.n / n)}</span>`, `<span class="num"><b>${pct(x.made / x.n)}</b></span> ${bar(x.made / x.n)}`]));
  const cur = r;
  const scenTbl = table(['Scenario', 'Playoffs', 'Bye', 'Title'], [['<span class="muted">Right now</span>', pct(cur.playoff), pct(cur.bye), pct(cur.title)], ...scen.map((s) => [`<b>${esc(s.label)}</b>`, `<span class="num">${pct(s.playoff)} <span class="${s.playoff >= cur.playoff ? 'pos-num' : 'neg-num'}" style="font-size:12px">${signed((s.playoff - cur.playoff) * 100)}</span></span>`, `<span class="num">${pct(s.bye)}</span>`, `<span class="num">${pct(s.title)}</span>`])]);

  return `<div class="page-h"><div><h1>Playoff path</h1><p>${esc(me.name.trim())}: ${pct(r.playoff)} to make it, ${pct(p.title / n)} to win it all. Seeds, likely opponents, and your win chance in every game left.</p></div></div>
  <div class="kpis" style="margin-bottom:14px"><div class="kpi"><small>Make playoffs</small><b>${pct(r.playoff)}</b><span>${me.w}-${me.l} · avg final ${n1(r.wins)} wins</span></div><div class="kpi"><small>First-round bye</small><b>${pct(r.bye)}</b><span>top 2 seeds</span></div><div class="kpi"><small>Reach the final</small><b>${pct(p.final / n)}</b><span>Week ${rounds + 2}</span></div><div class="kpi"><small>Title odds</small><b>${pct(p.title / n)}</b><span>${exp ? `${n1(exp)} expected wins from ${remaining.length} games` : ''}</span></div></div>
  <div class="stack"><div class="grid g2">${card('Where you finish', seedRows + `<div class="fullbar" style="display:grid;grid-template-columns:90px 1fr 52px;gap:10px;align-items:center;margin-top:8px"><span class="muted">Miss</span>${bar(missPct, 'red')}<span class="num">${pct(missPct)}</span></div>`, { sub: 'Final seed after the regular season' })}${card('Bracket odds', bracket, { cls: 'flush' })}</div>
  <div class="grid g2">${card('Likely opponents', oppTables || '<p class="empty">No bracket paths in the simulation.</p>', { sub: 'Who you meet, given you get that far' })}${card('Games left', sched + `<p class="note">Win chance is the normal-curve odds from each team's scoring average and spread; this week uses your projected lineups instead.</p>`, { cls: 'flush' })}</div>
  <div class="grid g2">${card('What you need', needTbl, { cls: 'flush', sub: 'Playoff chance by final regular-season win total' })}${card('What-if scenarios', scenTbl, { cls: 'flush', sub: 'Odds if you pin the result of upcoming games' })}</div></div>
  <details class="how"><summary>How this is calculated</summary><ul><li>${base.n.toLocaleString()} simulated seasons of the real remaining schedule; each team's score comes from its own season scoring and spread. No roster moves are assumed.</li><li>Bracket assumption: 6 teams, seeds 1–2 on a bye; 3v6 and 4v5 in the wild card; seed 1 plays the 4/5 winner and seed 2 the 3/6 winner. Divisions are ignored for seeding.</li><li>Pinning a result keeps the scoring noise but flips the winner if the draw disagrees — an approximation of the conditional odds.</li></ul></details>`;
}
