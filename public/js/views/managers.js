import { esc, n1, n0, avg, sum, pct, ord } from '../util.js';
import { card, table, histLoading } from '../ui.js';

const sd = (a) => {
  if (a.length < 2) return 0;
  const m = avg(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function profile(HM, p) {
  const seasons = Object.keys(p.seasons);
  const games = HM.games.filter((g) => g.a.ownerId === p.id || g.b.ownerId === p.id);
  const pts = games.map((g) => (g.a.ownerId === p.id ? g.a.pts : g.b.pts));
  const lines = [];
  for (const s of seasons) for (const wk of Object.keys(HM.seasons[s].matchups)) { const l = HM.lineup(s, Number(wk), p.seasons[s].rid); if (l) lines.push(l); }
  const eff = sum(lines.map((l) => l.pts)) / Math.max(sum(lines.map((l) => l.opt)), 1);
  const left = avg(lines.map((l) => l.left)) || 0;
  const tx = HM.txs.filter((t) => t.who.some((w) => w.ownerId === p.id));
  const adds = tx.filter((t) => t.type !== 'trade').flatMap((t) => t.addList.filter((a) => a.ownerId === p.id).map((a) => ({ ...a, tx: t })));
  const drops = tx.filter((t) => t.type !== 'trade').flatMap((t) => t.dropList.filter((a) => a.ownerId === p.id));
  const trades = tx.filter((t) => t.type === 'trade');
  const partners = {};
  trades.forEach((t) => t.who.forEach((w) => w.ownerId !== p.id && (partners[w.owner] = (partners[w.owner] || 0) + 1)));
  // best pickup: points from the player while on this manager's roster after the add
  const pickups = adds.map((a) => {
    const total = sum(HM.perf.filter((x) => x.season === a.tx.season && x.pid === a.pid && x.rid === a.rid && x.wk >= a.tx.leg && x.started).map((x) => x.pts));
    return { n: a.n, pos: a.pos, season: a.tx.season, total };
  }).sort((x, y) => y.total - x.total);
  // draft habits
  const picks = HM.seasonList.flatMap((s) => (s.draft ? s.draft.picks.filter((pk) => HM.ent(s.season, pk.rid).ownerId === p.id && !pk.keeper).map((pk) => ({ ...pk, season: s.season })) : []));
  const early = picks.filter((pk) => pk.round <= 3);
  const posEarly = {};
  early.forEach((pk) => (posEarly[pk.pos] = (posEarly[pk.pos] || 0) + 1));
  const firstQb = picks.filter((pk) => pk.pos === 'QB').map((pk) => pk.round);
  const titles = seasons.filter((s) => HM.champion(s)?.ownerId === p.id).length;
  const finals = seasons.filter((s) => HM.runnerUp(s)?.ownerId === p.id).length;
  let w = 0;
  let l = 0;
  seasons.forEach((s) => ((w += p.seasons[s].w), (l += p.seasons[s].l)));
  const nSeasons = seasons.length;
  return { p, seasons, w, l, titles, finals, avgPts: avg(pts) || 0, sd: sd(pts), eff, left, adds, drops, trades, partners, pickups, posEarly, early, firstQb: firstQb.length ? Math.min(...firstQb) : null, nSeasons, addsPer: adds.length / nSeasons, tradesPer: trades.length / nSeasons, games: pts.length };
}

function tagsFor(pr, all) {
  const med = (k) => median(all.map((x) => x[k]));
  const t = [];
  if (pr.titles) t.push(['Champion', 'good']);
  if (pr.addsPer >= med('addsPer') * 1.3 && pr.addsPer > 15) t.push(['Tinkerer', 'blue']);
  if (pr.addsPer <= med('addsPer') * 0.6) t.push(['Hands-off', 'blue']);
  if (pr.tradesPer >= Math.max(2, med('tradesPer') * 1.3)) t.push(['Dealmaker', 'amber']);
  if (pr.tradesPer < 1 && pr.nSeasons >= 1) t.push(['Rarely trades', 'blue']);
  if (pr.eff >= med('eff') + 0.015) t.push(['Lineup optimizer', 'good']);
  if (pr.left >= med('left') * 1.3 && pr.left > 15) t.push(['Bench blunderer', 'red']);
  if (pr.sd >= med('sd') * 1.15) t.push(['Boom or bust', 'amber']);
  if (pr.sd <= med('sd') * 0.85) t.push(['Steady scorer', 'good']);
  if (pr.avgPts >= med('avgPts') * 1.04) t.push(['High-octane', 'good']);
  if (pr.firstQb && pr.firstQb <= 3) t.push(['Early-QB drafter', 'blue']);
  return t.slice(0, 4);
}

function tradeTips(pr, all) {
  const tips = [];
  const top = Object.entries(pr.partners).sort((a, b) => b[1] - a[1])[0];
  if (pr.tradesPer >= 3) tips.push(`Active in the trade market (${pr.trades.length} trade${pr.trades.length > 1 ? 's' : ''} across ${pr.nSeasons} season${pr.nSeasons > 1 ? 's' : ''}) — a fair, well-framed offer gets a real look.`);
  else tips.push(pr.trades.length ? `Only ${pr.trades.length} trade${pr.trades.length > 1 ? 's' : ''} on record — expect to have to sell the idea.` : 'Has never traded — a long shot, make the pitch easy to accept.');
  if (top) tips.push(`Most frequent trade partner: ${top[0]} (${top[1]}).`);
  if (pr.addsPer > 30) tips.push('Churns the waiver wire constantly — they will notice a rival\u2019s drop quickly.');
  if (pr.left > 20) tips.push('Often leaves points on the bench — might value depth less than they should.');
  if (pr.sd > 24) tips.push('Scores in big swings — a safe, high-floor piece may appeal to them.');
  return tips;
}

export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>Manager profiles</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const cur = HM.seasons[M.snap.meta.season];
  const people = Object.values(HM.people).filter((p) => p.seasons[cur.season]);
  const all = people.map((p) => profile(HM, p));
  all.sort((a, b) => b.avgPts - a.avgPts);
  const meP = people.find((p) => p.name === M.me.owner);
  const ui = (ctx.ui.mgr ||= { id: null });
  const sel = all.find((x) => x.p.id === ui.id) || all.find((x) => x.p.id === meP?.id) || all[0];
  const tags = (pr) => tagsFor(pr, all).map(([t, c]) => `<span class="chip ${c === 'good' ? 'chip-fa' : c === 'red' ? 'chip-red' : c === 'amber' ? 'chip-amber' : 'chip-blue'}">${t}</span>`).join('');
  const cards = all.map((pr) => `<button class="mgr ${pr.p.id === sel.p.id ? 'on' : ''}" data-mgr="${pr.p.id}"><b>${esc(pr.p.name)}</b><span class="muted" style="font-size:12.5px">${esc(pr.p.seasons[cur.season].teamName)}</span><span class="num" style="text-align:left;font-size:13px">${pr.w}-${pr.l} all-time · ${n1(pr.avgPts)} ppg${pr.titles ? ' · 🏆' + pr.titles : ''}</span><span class="tags">${tags(pr)}</span></button>`).join('');
  const rankOf = (key, hi = true) => ord([...all].sort((a, b) => (hi ? b[key] - a[key] : a[key] - b[key])).findIndex((x) => x === sel) + 1);
  const detail = `<div class="kpis"><div class="kpi"><small>Scoring</small><b>${n1(sel.avgPts)}</b><span>${rankOf('avgPts')} of ${all.length} · ${sel.games} games</span></div><div class="kpi"><small>Consistency</small><b>±${n1(sel.sd)}</b><span>${rankOf('sd', false)} most steady</span></div><div class="kpi"><small>Lineup efficiency</small><b>${n1(sel.eff * 100)}%</b><span>${rankOf('eff')} · ${n1(sel.left)} left/week</span></div><div class="kpi"><small>Waiver adds / season</small><b>${n0(sel.addsPer)}</b><span>${rankOf('addsPer')} busiest</span></div><div class="kpi"><small>Trades / season</small><b>${n1(sel.tradesPer)}</b><span>${sel.trades.length} total</span></div></div>`;
  const seasonTbl = table(['Season', 'Team', 'Record', 'Points', 'Result'], sel.seasons.map((s) => { const t = sel.p.seasons[s]; return [s, esc(t.teamName), `<span class="num">${t.w}-${t.l}</span>`, `<span class="num">${n1(t.pf)}</span>`, HM.champion(s)?.ownerId === sel.p.id ? '🏆 Champion' : HM.runnerUp(s)?.ownerId === sel.p.id ? 'Runner-up' : HM.seasons[s].current ? 'in progress' : '']; }));
  const draftTxt = sel.early.length ? `In rounds 1–3 they have taken ${Object.entries(sel.posEarly).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}${sel.firstQb ? `; first QB came in round ${sel.firstQb}` : ''}.` : 'Only keepers on record so far.';
  const pick = sel.pickups.filter((x) => x.total > 0).slice(0, 3);
  const parts = Object.entries(sel.partners).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<div class="page-h"><div><h1>Manager profiles</h1><p>Habits, strengths and tendencies for every manager — built from every game, lineup, draft pick and transaction on record.</p></div></div>
  <div class="grid g3" style="margin-bottom:14px">${cards}</div>
  <div class="stack">${card(`${esc(sel.p.name)} — ${esc(sel.p.seasons[cur.season].teamName)}`, `${detail}<div style="margin-top:10px" class="tags">${tags(sel)}</div>`, { cls: 'hero' })}
  <div class="grid g2">${card('Seasons', seasonTbl, { cls: 'flush' })}${card('Habits', `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:9px"><li><b>Draft:</b> ${esc(draftTxt)}</li><li><b>Waiver wire:</b> ${sel.adds.length} adds and ${sel.drops.length} drops on record${pick.length ? `; best pickups: ${pick.map((x) => `${esc(x.n)} (${n0(x.total)} pts as a starter, ${x.season})`).join(', ')}` : ''}.</li><li><b>Trades:</b> ${sel.trades.length}${parts.length ? ` — most with ${parts.map(([n, c]) => `${esc(n)} (${c})`).join(', ')}` : ''}.</li><li><b>Titles:</b> ${sel.titles}${sel.finals ? `, finals losses: ${sel.finals}` : ''}.</li></ul>`)}</div>
  ${card('Dealing with them', `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:9px">${tradeTips(sel, all).map((t) => `<li>${esc(t)}</li>`).join('')}</ul><div class="btn-row" style="margin-top:12px"><button class="btn" data-go="rivalry">Rivalry report</button><button class="btn" data-go="finder">Trade finder</button></div>`, { sub: 'Grounded in their actual trade and waiver history — not a prediction of what they will say' })}</div>
  <details class="how"><summary>How tags are assigned</summary><ul><li>Tags compare each manager with the league median: Tinkerer / Hands-off (waiver adds per season), Dealmaker (trades per season), Lineup optimizer / Bench blunderer (points scored vs best possible lineup), Boom or bust / Steady scorer (week-to-week scoring spread), High-octane (points per game).</li><li>With only ${HM.seasonList.length} season${HM.seasonList.length > 1 ? 's' : ''} of history, newer managers have fewer data points.</li></ul></details>`;
}

export function mount(root, M, ctx) {
  root.querySelectorAll('[data-mgr]').forEach((b) => b.addEventListener('click', () => ((ctx.ui.mgr.id = b.dataset.mgr), ctx.rerender())));
}
