import { esc, n1, pct, ord, fmtDay } from '../util.js';
import { card, histLoading, shareBar } from '../ui.js';

const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function seasonFacts(HM, s) {
  const teams = s.teams.slice().sort((a, b) => b.w - a.w || b.pf - a.pf);
  const pfLeader = s.teams.slice().sort((a, b) => b.pf - a.pf)[0];
  const games = HM.games.filter((g) => g.season === s.season);
  const sides = games.flatMap((g) => [{ g, me: g.a, op: g.b }, { g, me: g.b, op: g.a }]);
  const hi = sides.slice().sort((a, b) => b.me.pts - a.me.pts)[0];
  const close = games.filter((g) => g.winner && g.period === 'regular').sort((a, b) => a.margin - b.margin)[0];
  const blow = games.filter((g) => g.winner && g.period === 'regular').sort((a, b) => b.margin - a.margin)[0];
  const trades = HM.txs.filter((t) => t.season === s.season && t.type === 'trade');
  const tCount = {};
  trades.forEach((t) => t.who.forEach((w) => (tCount[w.owner] = (tCount[w.owner] || 0) + 1)));
  const topTrader = Object.entries(tCount).sort((a, b) => b[1] - a[1])[0];
  const adds = {};
  HM.txs.filter((t) => t.season === s.season && t.type !== 'trade').forEach((t) => t.addList.forEach((a) => (adds[a.owner] = (adds[a.owner] || 0) + 1)));
  const topAdder = Object.entries(adds).sort((a, b) => b[1] - a[1])[0];
  const draft = s.draft;
  const first = draft && draft.picks.find((p) => p.no === 1);
  const keepers = draft ? draft.picks.filter((p) => p.keeper) : [];
  const champ = HM.champion(s.season);
  const ru = HM.runnerUp(s.season);
  const finalWk = s.playoffStart + 2;
  const fin = champ && ru ? games.find((g) => g.wk === finalWk && [g.a.rid, g.b.rid].includes(champ.rid) && [g.a.rid, g.b.rid].includes(ru.rid)) : null;
  return { s, teams, pfLeader, hi, close, blow, trades, topTrader, topAdder, first, keepers, champ, ru, fin, finalWk, draft };
}

export function chapters(M, HM) {
  const out = [];
  const seasons = HM.seasonList;
  const done = seasons.filter((s) => !s.current);
  const cur = seasons.find((s) => s.current);
  const fx = Object.fromEntries(seasons.map((s) => [s.season, seasonFacts(HM, s)]));
  const meName = M.me.owner;

  // ---- completed seasons
  done.forEach((s, i) => {
    const f = fx[s.season];
    const best = f.teams[0];
    const paras = [];
    paras.push(`${s.teams.length} managers sat down to draft "${s.name}" — ${f.draft ? `${f.draft.picks.length} picks over ${f.draft.rounds} rounds` : 'a fresh league'}${f.first ? `, and ${HM.ent(s.season, f.first.rid).owner} opened the board by taking ${f.first.n}` : ''}.`);
    paras.push(`The regular season belonged to ${best.owner}, who finished ${best.w}-${best.l}${f.pfLeader.rid !== best.rid ? `, while ${f.pfLeader.owner} scored the most points (${n1(f.pfLeader.pf)})` : ` and led the league in scoring with ${n1(best.pf)}`}. The top score of the year was ${n1(f.hi.me.pts)} by ${f.hi.me.owner} in week ${f.hi.g.wk}${f.close ? `; the closest finish was ${f.close.winner.owner} over ${f.close.loser.owner} by ${f.close.margin.toFixed(2)} in week ${f.close.wk}` : ''}.`);
    if (f.topTrader) paras.push(`The market never slept: ${f.trades.length} trades were made, with ${f.topTrader[0]} involved in ${f.topTrader[1]} of them${f.topAdder ? `, and ${f.topAdder[0]} working the wire hardest with ${f.topAdder[1]} adds` : ''}.`);
    let moment = null;
    if (f.champ && f.ru && f.fin) {
      const loserLine = HM.lineup(s.season, f.finalWk, f.ru.rid);
      const w = f.fin.winner;
      const l = f.fin.loser;
      paras.push(`${f.champ.owner} (${f.champ.teamName}) ${w.ownerId === f.champ.ownerId ? 'beat' : 'edged'} ${f.ru.owner} ${n1(w.pts)}–${n1(l.pts)} in the championship to take the title.`);
      moment = `Championship, week ${f.finalWk}: ${f.champ.owner} ${n1(w.pts)}, ${f.ru.owner} ${n1(l.pts)}.${loserLine && loserLine.left > 8 ? ` ${f.ru.owner} left ${n1(loserLine.left)} points on the bench that day — ${l.pts + loserLine.left > w.pts ? 'enough to have changed the result' : 'though it would not have changed the result'}.` : ''}`;
      const ruRec = f.teams.find((t) => t.rid === f.ru.rid);
      if (ruRec && ruRec.rid === best.rid) paras.push(`It was a cruel ending for ${ruRec.owner}, who went ${ruRec.w}-${ruRec.l} in the regular season and still came up one game short.`);
    }
    out.push({ kicker: '', title: `The ${s.season} season: ${f.champ ? f.champ.owner + ' takes the crown' : s.name}`, paras, moment, facts: [`${s.teams.length} teams`, f.draft ? `${f.draft.picks.length} draft picks` : null, `${f.trades.length} trades`, f.champ ? `champion: ${f.champ.owner}` : null].filter(Boolean) });
  });

  // ---- current season
  if (cur) {
    const f = fx[cur.season];
    const prev = done[done.length - 1];
    const newcomers = prev ? cur.teams.filter((t) => !prev.teams.some((p) => p.ownerId === t.ownerId)).map((t) => t.owner) : [];
    const paras = [];
    paras.push(`${cur.name} came back ${prev ? `bigger — ${cur.teams.length} teams instead of ${prev.teams.length}${newcomers.length ? `, with ${list(newcomers)} joining the field` : ''}` : 'with a new season'}. ${f.keepers.length ? `${f.keepers.length} keepers carried over: ${f.keepers.slice(0, 4).map((k) => `${k.n} (${HM.ent(cur.season, k.rid).owner})`).join(', ')}${f.keepers.length > 4 ? ' and more' : ''}.` : ''}`);
    if (f.first) paras.push(`The ${cur.season} draft ran ${f.draft.rounds} rounds; ${f.first.n} went first overall${f.first.keeper ? ' as a keeper' : ''} to ${HM.ent(cur.season, f.first.rid).owner}.`);
    const wk = HM.lastWeek(cur.season);
    const stand = M.teams.slice().sort((a, b) => b.w - a.w || b.pf - a.pf);
    const pfRank = [...M.teams].sort((a, b) => b.pf - a.pf);
    const paradox = M.teams.map((t) => ({ t, gap: stand.findIndex((x) => x.id === t.id) - pfRank.findIndex((x) => x.id === t.id) })).sort((a, b) => b.gap - a.gap)[0];
    paras.push(`Through week ${wk}, ${stand[0].owner} leads at ${stand[0].w}-${stand[0].l}. The highest score so far is ${n1(f.hi.me.pts)} by ${f.hi.me.owner} (week ${f.hi.g.wk}); the biggest beating was ${f.blow.winner.owner} over ${f.blow.loser.owner} by ${n1(f.blow.margin)}.`);
    if (paradox && paradox.gap >= 3) paras.push(`The strangest story is ${paradox.t.owner}: ${ord(pfRank.findIndex((x) => x.id === paradox.t.id) + 1)} in points scored but only ${ord(stand.findIndex((x) => x.id === paradox.t.id) + 1)} in the standings at ${paradox.t.w}-${paradox.t.l}.`);
    out.push({ kicker: 'Chapter', title: `The ${cur.season} season: ${stand[0].owner} sets the pace`, paras, moment: `Closest game so far: ${f.close.winner.owner} over ${f.close.loser.owner} by ${f.close.margin.toFixed(2)} (week ${f.close.wk}).`, facts: [`${cur.teams.length} teams`, `${f.keepers.length} keepers`, `through week ${wk}`] });

    // trades chapter
    const recent = f.trades.slice().sort((a, b) => b.created - a.created);
    if (recent.length) {
      const big = f.trades.slice().sort((a, b) => b.addList.length - a.addList.length)[0];
      const latest = recent[0];
      const fmtDeal = (t) => t.who.map((w) => `${w.owner} gets ${list(t.addList.filter((x) => x.rid === w.rid).map((x) => x.n).concat(t.picks.filter((pk) => pk.to === w.rid).map((pk) => `${pk.s} round ${pk.r}`))) || 'nothing'}`).join('; ');
      const paras2 = [`${f.trades.length} trades have been struck this season${f.topTrader ? `, ${f.topTrader[0]} in ${f.topTrader[1]} of them` : ''}.`, `The biggest move sent ${big.addList.length} players across the table in week ${big.leg}: ${fmtDeal(big)}.`, `The latest, on ${fmtDay(latest.created)}: ${fmtDeal(latest)}.`, `The deadline is Week ${M.deadlineWeek} — ${M.deadlinePassed ? 'it has passed' : 'every contender still has time to buy'}.`];
      out.push({ kicker: 'Chapter', title: 'The trade market heats up', paras: paras2, moment: null, facts: [`${f.trades.length} trades`, `deadline week ${M.deadlineWeek}`] });
    }

    // now
    const o = M.odds();
    const fav = M.teams.slice().sort((a, b) => o[b.id].title - o[a.id].title)[0];
    const me = M.me;
    const paras3 = [`With ${cur.playoffStart - 1 - wk} regular-season games left, ${fav.owner} is the title favorite at ${pct(o[fav.id].title)}. ${me.owner === fav.owner ? '' : `${me.name.trim()} (${me.w}-${me.l}) is at ${pct(o[me.id].playoff)} to make the playoffs and ${pct(o[me.id].title)} to win it all.`}`, (M.teams.filter((t) => o[t.id].playoff < 0.05).length ? `${list(M.teams.filter((t) => o[t.id].playoff < 0.05).map((t) => t.owner))} would need a miracle; ` : '') + 'everyone else is still fighting for six playoff spots.'];
    out.push({ kicker: 'The present day', title: 'The road to the playoffs', paras: paras3, moment: `Odds are from this site's simulation of the remaining schedule.`, facts: [`${pct(o[me.id].playoff)} you make it`, `${pct(o[fav.id].title)} ${fav.owner} wins it`] });
  }
  return out;
}

export function storyText(M, HM, chs) {
  return `${M.snap.league.name}: the story so far\n\n` + chs.map((c) => `${c.title.toUpperCase()}\n${c.paras.join('\n')}${c.moment ? '\n★ ' + c.moment : ''}`).join('\n\n');
}

export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>Your league's story</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const chs = chapters(M, HM);
  const text = storyText(M, HM, chs);
  return `<div class="page-h"><div><h1>Your league's story</h1><p>${esc(M.snap.league.name)}, told in chapters — written from the real record of every season, draft, trade and championship.</p></div>${shareBar(text, { title: M.snap.league.name + ' — the story so far' })}</div>
  <div class="grid g-main"><div class="stack">${chs.map((c, i) => card(`<span class="chapter"><span class="kicker">${c.kicker || 'Chapter ' + (i + 1)}</span></span>`, `<div class="chapter" id="ch${i}"><h3>${esc(c.title)}</h3><div class="prose">${c.paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div>${c.moment ? `<div class="moment"><b>Defining moment.</b> ${esc(c.moment)}</div>` : ''}<div class="facts">${c.facts.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</div></div>`)).join('')}</div>
  <div class="stack">${card('Chapters', `<ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px">${chs.map((c, i) => `<li><a href="#/story" data-scroll="ch${i}">${esc(c.title)}</a></li>`).join('')}</ol>`)}${card('About this story', `<p class="muted">Every sentence is generated from the league's recorded results, so names, scores and dates are facts — the storytelling is the only creative layer. It updates as the season does.</p>`)}</div></div>`;
}

export function mount(root) {
  root.querySelectorAll('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); root.querySelector('#' + a.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}
