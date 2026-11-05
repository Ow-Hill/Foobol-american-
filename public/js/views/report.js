import { esc, n1, pct, signed, avg, ord } from '../util.js';
import { card, table, shareBar, histLoading, playerName } from '../ui.js';

const rec = (t) => `${t.w}-${t.l}`;

export function awards(HM, f) {
  const out = [];
  const nm = (x) => x.owner;
  if (f.top) out.push(['🔥', 'Highest score', `${nm(f.top)} put up ${n1(f.top.pts)}`, `${f.top.teamName}`]);
  if (f.blowout) {
    const g = f.blowout;
    out.push(['💥', 'Beatdown of the week', `${g.winner.owner} routed ${g.loser.owner} ${n1(g.winner.pts)}–${n1(g.loser.pts)}`, `Margin ${n1(g.margin)}`]);
  }
  if (f.closest) {
    const g = f.closest;
    out.push(['😬', 'Nail-biter', `${g.winner.owner} edged ${g.loser.owner} ${n1(g.winner.pts)}–${n1(g.loser.pts)}`, `Decided by ${n1(g.margin)}`]);
  }
  if (f.topPlayers[0]) {
    const p = f.topPlayers[0];
    out.push(['⭐', 'Player of the week', `${p.n} (${p.pos}) scored ${n1(p.pts)} for ${p.owner}`, '']);
  }
  if (f.upset) {
    const g = f.upset.game;
    out.push(['🚨', 'Upset special', `${g.winner.owner} (${f.upset.rw.w}-${f.upset.rw.l}) beat ${g.loser.owner} (${f.upset.rl.w}-${f.upset.rl.l})`, '']);
  }
  if (f.blunder && f.blunder.left > 5) {
    const bh = f.lines.find((l) => l.rid === f.blunder.rid);
    const g = f.games.find((x) => x.a.rid === bh.rid || x.b.rid === bh.rid);
    const lost = g && g.loser && g.loser.rid === bh.rid;
    out.push(['🪑', 'Left it on the bench', `${f.blunder.owner} left ${n1(f.blunder.left)} points on the bench${lost && g.margin < f.blunder.left ? ' — and lost by less than that' : ''}`, `Scored ${n1(f.blunder.pts)} of a possible ${n1(f.blunder.opt)}`]);
  }
  if (f.effKing) out.push(['🎯', 'Lineup wizard', `${f.effKing.owner} scored ${Math.round((f.effKing.pts / f.effKing.opt) * 100)}% of the best possible lineup`, '']);
  if (f.low) out.push(['🧊', 'Rough week', `${f.low.owner} managed just ${n1(f.low.pts)}`, '']);
  return out;
}

function power(M, HM) {
  const rows = M.teams.map((t) => {
    const s = M.weekScores[t.id].filter((x) => x > 0);
    return { t, score: 0.5 * avg(s.slice(-3)) + 0.5 * avg(s), recent: avg(s.slice(-3)), season: avg(s) };
  });
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function myStory(M, HM, wk) {
  const season = M.snap.meta.season;
  const meP = Object.values(HM.people).find((p) => p.name === M.me.owner);
  if (!meP) return '';
  const g = HM.games.find((x) => x.season === season && x.wk === wk && (x.a.ownerId === meP.id || x.b.ownerId === meP.id));
  if (!g) return '';
  const mine = g.a.ownerId === meP.id ? g.a : g.b;
  const opp = g.a.ownerId === meP.id ? g.b : g.a;
  const L = HM.lineup(season, wk, mine.rid);
  const won = mine.pts > opp.pts;
  const top = L.starters.map((id) => ({ id, pts: L.pp[id] || 0 })).sort((a, b) => b.pts - a.pts)[0];
  const bench = L.bench.map((id) => ({ id, pts: L.pp[id] || 0 })).sort((a, b) => b.pts - a.pts)[0];
  const o = M.odds()[M.me.id];
  const parts = [`${M.me.name.trim()} ${won ? 'beat' : 'fell to'} ${opp.owner} ${n1(mine.pts)}–${n1(opp.pts)} in Week ${wk}${g.margin < 6 ? ', a game that came down to the wire' : g.margin > 40 ? ', and it was never close' : ''}.`];
  if (top) parts.push(`${HM.nm(top.id)} led the way with ${n1(top.pts)}.`);
  if (L.left > 6) parts.push(`The lineup left ${n1(L.left)} points on the table${bench && bench.pts > 15 ? ` — ${HM.nm(bench.id)} scored ${n1(bench.pts)} from the bench` : ''}${!won && L.left > g.margin ? `, more than the ${n1(g.margin)}-point margin of defeat` : ''}.`);
  else parts.push('The lineup was close to the best possible.');
  parts.push(`You sit at ${rec(M.me)} with the league's ${ord([...M.teams].sort((a, b) => b.pf - a.pf).findIndex((t) => t.id === M.me.id) + 1)}-best scoring, and the odds say ${pct(o.playoff)} to make the playoffs.`);
  return parts.join(' ');
}

function previewRows(M) {
  const ms = M.snap.matchups[M.W] || [];
  const by = {};
  ms.forEach((m) => (by[m.mid] ||= []).push(m.rid));
  return Object.values(by)
    .filter((p) => p.length === 2)
    .map(([a, b]) => {
      const ta = M.teamBy[a];
      const tb = M.teamBy[b];
      const pa = M.lineup(ta).opt.total;
      const pb = M.lineup(tb).opt.total;
      return { a: ta, b: tb, pa, pb, wa: M.winProb(a, b, [pa, pb]) };
    });
}

function buildText(M, HM, wk, f, prev, story, pw) {
  const L = [];
  L.push(`${M.snap.league.name} — Week ${wk} report`);
  L.push('');
  L.push(`YOUR WEEK: ${story}`);
  L.push('');
  L.push(`AWARDS`);
  awards(HM, f).forEach((a) => L.push(`${a[0]} ${a[1]}: ${a[2]}${a[3] ? ' (' + a[3] + ')' : ''}`));
  L.push('');
  L.push(`SCORES`);
  f.games.forEach((g) => L.push(`${g.a.owner} ${n1(g.a.pts)} – ${n1(g.b.pts)} ${g.b.owner}`));
  L.push('');
  L.push(`WEEK ${M.W} PREVIEW`);
  prev.forEach((p) => L.push(`${p.a.owner} (${n1(p.pa)}) vs ${p.b.owner} (${n1(p.pb)}) — ${p.a.owner} wins ${pct(p.wa)}`));
  L.push('');
  L.push('POWER RANKINGS');
  pw.slice(0, 5).forEach((r, i) => L.push(`${i + 1}. ${r.t.owner} (${rec(r.t)}) — ${n1(r.score)}`));
  return L.join('\n');
}

export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>Weekly report</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const season = M.snap.meta.season;
  const ui = (ctx.ui.report ||= { wk: null });
  const last = HM.lastWeek(season);
  const wk = ui.wk && ui.wk <= last ? ui.wk : last;
  const f = HM.weekFacts(season, wk);
  if (!f) return `<div class="page-h"><div><h1>Weekly report</h1></div></div><p class="empty">No completed week yet.</p>`;
  const story = myStory(M, HM, wk);
  const prev = previewRows(M);
  const pw = power(M, HM);
  const aw = awards(HM, f);
  const text = buildText(M, HM, wk, f, prev, story, pw);
  const wkOpts = Array.from({ length: last }, (_, i) => last - i).map((w) => `<option value="${w}" ${w === wk ? 'selected' : ''}>Week ${w}</option>`).join('');
  const myPrev = prev.find((p) => p.a.id === M.me.id || p.b.id === M.me.id);

  const previewCard = card(`Week ${M.W} preview`, (myPrev ? (() => {
    const meIsA = myPrev.a.id === M.me.id;
    const mine = meIsA ? myPrev.a : myPrev.b;
    const opp = meIsA ? myPrev.b : myPrev.a;
    const pw_ = meIsA ? myPrev.wa : 1 - myPrev.wa;
    const mp = meIsA ? myPrev.pa : myPrev.pb;
    const op = meIsA ? myPrev.pb : myPrev.pa;
    const key = (t) => M.lineup(t).opt.slots.filter((s) => s.pid).sort((a, b) => b.v - a.v)[0];
    const kp = key(M.me);
    const ko = key(opp);
    const risks = [...M.lineup(M.me).starters.filter(Boolean).filter((id) => M.P(id).avail === 'q' || M.P(id).avail === 'out')].map((id) => M.P(id).n);
    return `<div class="vs"><div class="side"><span class="name">${esc(mine.name.trim())}</span><span class="muted">${rec(mine)}</span><span class="big">${n1(mp)}</span></div><div class="mid">${pct(pw_)}<br /><span class="dim" style="font-size:11px;letter-spacing:0">you win</span></div><div class="side r"><span class="name">${esc(opp.name.trim())}</span><span class="muted">${rec(opp)} · ${esc(opp.owner)}</span><span class="big">${n1(op)}</span></div></div>
    <p class="note"><b>Story of the matchup:</b> ${pw_ >= 0.55 ? 'You are the favorite' : pw_ <= 0.45 ? 'You are the underdog' : 'This is a coin flip'} (${signed(mp - op)} on projections). ${kp ? `Your best projected piece is ${esc(M.P(kp.pid).n)} at ${n1(kp.v)}; ` : ''}${ko ? `theirs is ${esc(M.P(ko.pid).n)} at ${n1(ko.v)}. ` : ''}${risks.length ? `Watch the health of ${esc(risks.join(', '))}.` : 'Your starters are all healthy.'}</p>`;
  })() : '') + table(['Matchup', 'Projected', 'Win chance'], prev.map((p) => [`<b>${esc(p.a.owner)}</b> vs <b>${esc(p.b.owner)}</b>`, `<span class="num">${n1(p.pa)} – ${n1(p.pb)}</span>`, `<span class="num">${esc(p.wa >= 0.5 ? p.a.owner : p.b.owner)} ${pct(Math.max(p.wa, 1 - p.wa))}</span>`])), { sub: 'Projected best legal lineups, win chance from each team\u2019s scoring spread' });

  const scores = table(['Home', '', 'Away'], f.games.map((g) => [`<span ${g.winner && g.winner.rid === g.a.rid ? 'style="color:var(--green);font-weight:700"' : ''}>${esc(g.a.owner)}</span>`, `<span class="num">${n1(g.a.pts)} – ${n1(g.b.pts)}</span>`, `<span ${g.winner && g.winner.rid === g.b.rid ? 'style="color:var(--green);font-weight:700"' : ''}>${esc(g.b.owner)}</span>`]));

  return `<div class="page-h"><div><h1>Weekly report</h1><p>Matchup preview, personalised recap, awards and power rankings — ready to share with the league.</p></div><div class="btn-row"><select id="rpWeek" aria-label="Recap week">${wkOpts}</select>${shareBar(text, { title: `${M.snap.league.name} — Week ${wk}` })}</div></div>
  <div class="stack">
    ${card(`Your week ${wk}`, `<div class="prose"><p>${esc(story)}</p></div>`, { cls: 'hero', sub: 'Written from your actual results' })}
    <div class="grid g2">${previewCard}${card(`Week ${wk} awards`, aw.map((a) => `<div class="award"><div class="ico">${a[0]}</div><div><small>${esc(a[1])}</small><b>${esc(a[2])}</b>${a[3] ? `<div class="dim" style="font-size:12.5px">${esc(a[3])}</div>` : ''}</div></div>`).join(''))}</div>
    <div class="grid g2">${card(`Week ${wk} scores`, scores, { cls: 'flush' })}${card('Power rankings', table(['#', 'Team', 'Record', 'Power'], pw.map((r, i) => [`<span class="num">${i + 1}</span>`, `<b ${r.t.id === M.me.id ? 'style="color:var(--green)"' : ''}>${esc(r.t.owner)}</b>`, `<span class="num">${rec(r.t)}</span>`, `<span class="num">${n1(r.score)}</span>`]), {}), { cls: 'flush', sub: 'Half last-3-weeks scoring, half the season average' })}</div>
    ${card('Share-ready text', `<pre class="pitch" style="margin:0">${esc(text)}</pre>`, { sub: 'Copy it into your league chat' })}
  </div>`;
}

export function mount(root, M, ctx) {
  root.querySelector('#rpWeek')?.addEventListener('change', (e) => ((ctx.ui.report.wk = Number(e.target.value)), ctx.rerender()));
}
