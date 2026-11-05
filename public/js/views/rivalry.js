import { esc, n1, pct, avg } from '../util.js';
import { card, table, histLoading, shareBar } from '../ui.js';

function pairStats(HM, a, b) {
  const r = HM.h2h(a, b);
  const gs = r.games.slice().sort((x, y) => x.season.localeCompare(y.season) || x.wk - y.wk);
  const trades = HM.txs.filter((t) => t.type === 'trade' && t.who.some((w) => w.ownerId === a) && t.who.some((w) => w.ownerId === b));
  const playoff = gs.filter((g) => g.period === 'playoff').length;
  const margins = gs.map((g) => g.margin);
  let streak = { who: null, n: 0 };
  for (const g of gs) {
    const w = g.winner?.ownerId;
    if (!w) { streak = { who: null, n: 0 }; continue; }
    streak = streak.who === w ? { who: w, n: streak.n + 1 } : { who: w, n: 1 };
  }
  const score = gs.length * 2 + playoff * 3 + trades.length * 1.5 + (gs.length && avg(margins) < 15 ? 2 : 0) + (gs.length && Math.abs(r.aw - r.bw) <= 1 ? 2 : 0);
  return { r, gs, trades, playoff, streak, score, avgMargin: margins.length ? avg(margins) : null };
}

function dealText(t) {
  return t.who.map((w) => `${w.owner} gets ${t.addList.filter((x) => x.rid === w.rid).map((x) => x.n).concat(t.picks.filter((pk) => pk.to === w.rid).map((pk) => `${pk.s} R${pk.r}`)).join(', ') || '—'}`).join(' · ');
}

export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>Rivalry reports</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const people = Object.values(HM.people).sort((x, y) => x.name.localeCompare(y.name));
  const meP = people.find((p) => p.name === M.me.owner);
  const oppP = M.opp && people.find((p) => p.name === M.opp.owner);
  const ui = (ctx.ui.rival ||= { a: null, b: null });
  const a = HM.people[ui.a] || meP || people[0];
  const b = HM.people[ui.b] || (oppP && oppP.id !== a.id ? oppP : people.find((p) => p.id !== a.id));
  const st = pairStats(HM, a.id, b.id);
  const r = st.r;
  const opts = (sel) => people.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const leader = r.aw === r.bw ? null : r.aw > r.bw ? a : b;
  const last = st.gs[st.gs.length - 1];
  const closest = st.gs.slice().filter((g) => g.winner).sort((x, y) => x.margin - y.margin)[0];
  const biggest = st.gs.slice().filter((g) => g.winner).sort((x, y) => y.margin - x.margin)[0];
  const finals = st.gs.filter((g) => g.period === 'playoff');

  const headline = !st.gs.length
    ? `${esc(a.name)} and ${esc(b.name)} have never met.`
    : leader
      ? `${esc(leader.name)} owns the series ${Math.max(r.aw, r.bw)}–${Math.min(r.aw, r.bw)}${r.ties ? `–${r.ties}` : ''}.`
      : `Dead even: ${r.aw}–${r.bw}${r.ties ? `–${r.ties}` : ''}.`;
  const lines = [];
  if (st.gs.length) {
    lines.push(`Over ${st.gs.length} meeting${st.gs.length > 1 ? 's' : ''}, ${esc(a.name)} has scored ${n1(r.aPts)} to ${esc(b.name)}'s ${n1(r.bPts)} (${n1(Math.abs(r.aPts - r.bPts) / st.gs.length)} points a game in favor of ${esc(r.aPts >= r.bPts ? a.name : b.name)}).`);
    if (st.streak.who) lines.push(`${esc(HM.people[st.streak.who].name)} has won ${st.streak.n === 1 ? 'the last meeting' : 'the last ' + st.streak.n + ' in a row'}.`);
    if (closest) lines.push(`The closest was ${closest.season} week ${closest.wk}: ${esc(closest.winner.owner)} by ${closest.margin.toFixed(2)}.`);
    if (finals.length) lines.push(`They have met ${finals.length} time${finals.length > 1 ? 's' : ''} in the playoffs${finals.some((g) => g.wk - HM.seasons[g.season].playoffStart + 1 >= 3) ? ', including the championship game' : ''}.`);
  }
  if (st.trades.length) lines.push(`They have also done ${st.trades.length} trade${st.trades.length > 1 ? 's' : ''} together.`);

  // upcoming
  const up = [];
  const mus = M.snap.matchups;
  const aTeam = a.seasons[M.snap.meta.season];
  const bTeam = b.seasons[M.snap.meta.season];
  if (aTeam && bTeam) {
    for (const wk of Object.keys(mus).map(Number).filter((w) => w >= M.W)) {
      const ma = mus[wk].find((m) => m.rid === aTeam.rid);
      if (ma && mus[wk].find((m) => m.mid === ma.mid && m.rid === bTeam.rid)) {
        const mu = wk === M.W ? [M.lineup(M.teamBy[aTeam.rid]).opt.total, M.lineup(M.teamBy[bTeam.rid]).opt.total] : null;
        up.push({ wk, p: M.winProb(aTeam.rid, bTeam.rid, mu), mu });
      }
    }
  }

  const text = `${a.name} vs ${b.name}\n${headline.replace(/<[^>]+>/g, '')}\n${lines.join(' ').replace(/<[^>]+>/g, '')}`;
  const meet = table(['When', 'Score', 'Winner', 'Margin'], st.gs.slice().reverse().map((g) => {
    const s = g.a.ownerId === a.id ? [g.a, g.b] : [g.b, g.a];
    return [`${g.season} wk ${g.wk}${g.period === 'playoff' ? ' <span class="chip">playoffs</span>' : ''}`, `<span class="num">${n1(s[0].pts)} – ${n1(s[1].pts)}</span>`, `<b ${g.winner && g.winner.ownerId === a.id ? 'style="color:var(--green)"' : ''}>${g.winner ? esc(g.winner.owner) : 'tie'}</b>`, `<span class="num">${n1(g.margin)}</span>`];
  }), { empty: 'No meetings yet.' });

  // leaderboard
  const pairs = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) { const s = pairStats(HM, people[i].id, people[j].id); if (s.gs.length || s.trades.length) pairs.push({ x: people[i], y: people[j], s }); }
  pairs.sort((p, q) => q.s.score - p.s.score);
  const board = table(['Rivalry', 'Series', 'Avg margin', 'Playoff', 'Trades', ''], pairs.slice(0, 10).map((p) => [`<b>${esc(p.x.name)}</b> vs <b>${esc(p.y.name)}</b>`, `<span class="num">${p.s.r.aw}–${p.s.r.bw}${p.s.r.ties ? '–' + p.s.r.ties : ''}</span>`, `<span class="num">${p.s.avgMargin != null ? n1(p.s.avgMargin) : '–'}</span>`, `<span class="num">${p.s.playoff}</span>`, `<span class="num">${p.s.trades.length}</span>`, `<button class="btn btn-ghost" data-rv="${p.x.id}|${p.y.id}">Open</button>`]));

  return `<div class="page-h"><div><h1>Rivalry reports</h1><p>Settle bragging rights with head-to-head history across every season — scores, streaks, playoff meetings and trades.</p></div>${shareBar(text, { title: `${a.name} vs ${b.name}` })}</div>
  <div class="stack">
    ${card('Pick a rivalry', `<div class="btn-row"><select id="rvA" aria-label="Manager A">${opts(a.id)}</select><span class="muted">vs</span><select id="rvB" aria-label="Manager B">${opts(b.id)}</select></div>`)}
    ${card(`${esc(a.name)} vs ${esc(b.name)}`, `<div class="vs"><div class="side"><span class="name">${esc(a.name)}</span><span class="big" style="color:${leader && leader.id === a.id ? 'var(--green)' : '#fff'}">${r.aw}</span><span class="dim">${esc(a.seasons[M.snap.meta.season]?.teamName || '')}</span></div><div class="mid">${r.ties ? r.ties + ' T' : 'H2H'}</div><div class="side r"><span class="name">${esc(b.name)}</span><span class="big" style="color:${leader && leader.id === b.id ? 'var(--green)' : '#fff'}">${r.bw}</span><span class="dim">${esc(b.seasons[M.snap.meta.season]?.teamName || '')}</span></div></div>
      <div class="prose" style="margin-top:14px"><p><b>${headline}</b> ${lines.join(' ')}</p></div>
      ${up.length ? `<div class="callout" style="margin-top:10px"><b>Next meeting: Week ${up[0].wk}</b>${esc(a.name)} has a ${pct(up[0].p)} chance${up[0].mu ? ' (from this week\u2019s lineup projections)' : ''}.</div>` : ''}`, { cls: 'hero' })}
    <div class="grid g2">${card('Every meeting', meet, { cls: 'flush' })}${card('Trades between them', st.trades.length ? `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px">${st.trades.map((t) => `<li><span class="dim">${t.season} wk ${t.leg}</span><br />${esc(dealText(t))}</li>`).join('')}</ul>` : '<p class="empty">No trades between these two.</p>')}</div>
    ${card('League rivalry board', board, { cls: 'flush', sub: 'Ranked by meetings, playoff games, trades and how close the games are' })}
  </div>`;
}

export function mount(root, M, ctx) {
  const ui = ctx.ui.rival;
  if (!ui) return;
  const set = () => { ui.a = root.querySelector('#rvA').value; ui.b = root.querySelector('#rvB').value; ctx.rerender(); };
  root.querySelector('#rvA')?.addEventListener('change', set);
  root.querySelector('#rvB')?.addEventListener('change', set);
  root.querySelectorAll('[data-rv]').forEach((b) => b.addEventListener('click', () => { [ui.a, ui.b] = b.dataset.rv.split('|'); ctx.rerender(); window.scrollTo(0, 0); }));
}
