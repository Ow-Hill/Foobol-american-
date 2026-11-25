import { esc, n1, pct, sum, signed } from '../util.js';
import { card, table, bar } from '../ui.js';
import { rooting, scout, BLOCK_MIN } from '../playoffs.js';

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
  return (M._path = { base, remaining, scen, root: rooting(M, base), sc: scout(M, base) });
}

export function render(M, ctx) {
  const { base, remaining, scen, root, sc } = compute(M);
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

  const rootCard = rootingCard(M, root);
  const scoutCard = scoutingCard(M, sc);

  return `<div class="page-h"><div><h1>Playoff path</h1><p>${esc(me.name.trim())}: ${pct(r.playoff)} to make it, ${pct(p.title / n)} to win it all. Seeds, likely opponents, and your win chance in every game left.</p></div></div>
  <div class="kpis" style="margin-bottom:14px"><div class="kpi"><small>Make playoffs</small><b>${pct(r.playoff)}</b><span>${me.w}-${me.l} · avg final ${n1(r.wins)} wins</span></div><div class="kpi"><small>First-round bye</small><b>${pct(r.bye)}</b><span>top 2 seeds</span></div><div class="kpi"><small>Reach the final</small><b>${pct(p.final / n)}</b><span>Week ${rounds + 2}</span></div><div class="kpi"><small>Title odds</small><b>${pct(p.title / n)}</b><span>${exp ? `${n1(exp)} expected wins from ${remaining.length} games` : ''}</span></div></div>
  <div class="stack"><div class="grid g2">${card('Where you finish', seedRows + `<div class="fullbar" style="display:grid;grid-template-columns:90px 1fr 52px;gap:10px;align-items:center;margin-top:8px"><span class="muted">Miss</span>${bar(missPct, 'red')}<span class="num">${pct(missPct)}</span></div>`, { sub: 'Final seed after the regular season' })}${card('Bracket odds', bracket, { cls: 'flush' })}</div>
  <div class="grid g2">${card('Likely opponents', oppTables || '<p class="empty">No bracket paths in the simulation.</p>', { sub: 'Who you meet, given you get that far' })}${card('Games left', sched + `<p class="note">Win chance is the normal-curve odds from each team's scoring average and spread; this week uses your projected lineups instead.</p>`, { cls: 'flush' })}</div>
  <div class="grid g2">${card('What you need', needTbl, { cls: 'flush', sub: 'Playoff chance by final regular-season win total' })}${card('What-if scenarios', scenTbl, { cls: 'flush', sub: 'Odds if you pin the result of upcoming games' })}</div>
  ${rootCard}
  ${scoutCard}</div>
  <details class="how"><summary>How this is calculated</summary><ul><li>${base.n.toLocaleString()} simulated seasons of the real remaining schedule; each team's score blends its season scoring with its current roster's projected best lineup for that week (injuries, byes and pickups count). No future roster moves are assumed.</li><li>Bracket assumption: 6 teams, seeds 1–2 on a bye; 3v6 and 4v5 in the wild card; seed 1 plays the 4/5 winner and seed 2 the 3/6 winner. Every division winner makes the playoffs (Sleeper's rule); seeds follow wins, then points.</li><li>Pinning a result keeps the scoring noise but flips the winner if the draw disagrees — an approximation of the conditional odds.</li></ul></details>`;
}

// exported for the Live page
export function pathFor(M) {
  return compute(M);
}

function rootingCard(M, root) {
  if (M.W >= M.L.settings.playoff_week_start) return '';
  const rows = root.games.map((g) => [
    `<span class="num">${g.wk}</span>`,
    `<b>${esc(M.teamBy[g.want].owner)}</b> <span class="dim">over ${esc(M.teamBy[g.other].owner)}</span>`,
    `<span class="num">${pct(g.ifWant)}</span> <span class="dim">vs ${pct(g.ifOther)}</span>`,
    `<span class="num pos-num"><b>${signed(g.swing * 100)}</b></span> ${bar(Math.min(1, g.swing * 4))}`,
    `<span class="num muted">${pct(g.wantChance)}</span>`,
  ]);
  const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  const tie = root.tie.share >= 0.01
    ? `In ${pct(root.tie.share)} of simulated seasons you finish tied in wins with a team on the other side of the playoff line, and points for decides it. You come out ahead ${pct(root.tie.won)} of those times; you're ${ord(root.pfRank)} in points for.`
    : `Points for rarely decides your spot (under 1% of simulated seasons); you're ${ord(root.pfRank)} in points for.`;
  const body = rows.length
    ? table(['Week', 'Root for', 'Your playoff odds if they win', 'Swing', 'Their chance'], rows)
    : '<p class="empty">No other game moves your playoff odds by a point or more.</p>';
  return card('Who to root for', `${body}<p class="note"><b>Tiebreak:</b> ${tie} Your own games are in What-if scenarios above.</p>`, { cls: 'flush', sub: 'Other teams’ games left, by how much each result moves your playoff odds' });
}

function scoutingCard(M, sc) {
  if (!sc || !sc.opps.length) return '';
  const rname = { 1: 'wild-card round', 2: 'semifinal', 3: 'championship' }[sc.round] || 'playoff game';
  const name = (id) => `${esc(M.P(id).n)} <span class="tm">${esc(M.P(id).pos)} ${esc(M.P(id).team || '')}</span>`;
  const blocks = sc.opps.map((o) => {
    const head = `<h3 style="margin:10px 0 6px">${esc(o.t.owner)} <span class="dim" style="font-weight:400">${sc.opps.length > 1 || o.share < 1 ? `· ${pct(o.share)} of the time` : ''} · best lineup ${n1(o.total)} vs your ${n1(sc.myTotal)}</span></h3>`;
    const weak = o.weak.length
      ? `<p style="margin:4px 0">Weak spots: ${o.weak.map((w) => `<b>${esc(w.slot)}</b> ${w.pid ? esc(M.P(w.pid).n) : 'empty'} (${n1(w.v)} vs league ${n1(w.avg)})`).join(' · ')}</p>`
      : '<p class="muted" style="margin:4px 0">No starting spot more than 20% below the league average.</p>';
    const rows = o.blocks.map((b) => {
      const d = M.dropFor({ id: b.id, p: M.P(b.id) });
      return [name(b.id), `<span class="num"><b>+${n1(b.gain)}</b></span>`, `<span class="num">${b.mine > 0.05 ? '+' + n1(b.mine) : '—'}</span>`, `<span class="muted">${esc(d.text)}</span>`];
    });
    const tbl = rows.length
      ? table(['Free agent', 'Adds to their lineup', 'Adds to yours', 'Your roster spot'], rows)
      : `<p class="empty">No free agent adds ${BLOCK_MIN}+ points to their Week ${sc.wk} lineup.</p>`;
    const cuffs = o.cuffs.length
      ? `<p class="note">Their backs' backups still on waivers: ${o.cuffs.map((c) => `<b>${esc(M.P(c.id).n)}</b> (behind ${esc(M.P(c.of).n)})`).join(', ')}. Only worth a spare spot; they score only if the starter goes down.</p>`
      : '';
    return head + weak + tbl + cuffs;
  }).join('');
  const sub = M.W >= M.L.settings.playoff_week_start
    ? `Your Week ${sc.wk} opponent`
    : `Who you most likely meet in the ${rname} (Week ${sc.wk}), if you get there`;
  return card('Scout your playoff opponent', `${blocks}<p class="note">Their best lineup and the pickups use each player's points per game for Week ${sc.wk} (kickers and defenses: Sleeper's projection for that week). A block only pays if you have a spare spot: it never replaces a player you start. Waivers here roll in priority order, so after they clear it's first come, first served.</p>`, { sub });
}
