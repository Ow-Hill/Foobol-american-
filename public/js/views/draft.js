import { esc, n1, n0, avg, sum, ord } from '../util.js';
import { card, table, histLoading, playerName } from '../ui.js';

const teamsN = (M) => M.teams.length;
const pickNo = (slot, round, n) => (round % 2 ? (round - 1) * n + slot : round * n - slot + 1);

function draftReview(M, HM) {
  const cur = HM.seasons[M.snap.meta.season];
  if (!cur.draft) return null;
  const rows = cur.draft.picks.filter((pk) => !pk.keeper).map((pk) => {
    const vr = M.V.rank(pk.pid);
    const ppg = M.V.ppg(pk.pid);
    const p = M.snap.players[pk.pid];
    const adp = p?.adp?.[0] ?? null;
    return { pk, owner: HM.ent(cur.season, pk.rid), vr: vr || 250, ppg, adp, edge: pk.no - (vr || 250), reach: adp != null ? pk.no - adp : null, value: M.V.value(pk.pid) };
  });
  return rows;
}

function productionByRound(HM) {
  const out = [];
  for (const s of HM.seasonList) {
    if (!s.draft || s.current) continue;
    const byRound = {};
    for (const pk of s.draft.picks) {
      if (pk.keeper) continue;
      const pts = sum(HM.perf.filter((x) => x.season === s.season && x.pid === pk.pid && x.started).map((x) => x.pts));
      const r = pk.round <= 2 ? '1–2' : pk.round <= 4 ? '3–4' : pk.round <= 8 ? '5–8' : '9+';
      (byRound[r] ||= []).push(pts);
    }
    out.push({ season: s.season, byRound });
  }
  return out;
}

function posMix(HM) {
  const rows = [];
  for (const s of HM.seasonList) {
    if (!s.draft) continue;
    for (const [label, lo, hi] of [['1–2', 1, 2], ['3–4', 3, 4], ['5–8', 5, 8], ['9+', 9, 99]]) {
      const c = {};
      s.draft.picks.filter((pk) => pk.round >= lo && pk.round <= hi && !pk.keeper).forEach((pk) => (c[pk.pos] = (c[pk.pos] || 0) + 1));
      rows.push({ season: s.season, label, c });
    }
  }
  return rows;
}

export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>Draft plan</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const season = M.snap.meta.season;
  const cur = HM.seasons[season];
  const meP = Object.values(HM.people).find((p) => p.name === M.me.owner);
  const n = teamsN(M);
  const ui = (ctx.ui.draft ||= { slot: null });
  const lastSlot = cur.draft ? cur.draft.picks.find((pk) => pk.rid === M.me.id && !pk.keeper)?.slot || cur.draft.picks.find((pk) => pk.rid === M.me.id)?.slot : null;
  const slot = ui.slot || lastSlot || Math.ceil(n / 2);
  const review = draftReview(M, HM);
  const prod = productionByRound(HM);
  const mix = posMix(HM);

  // my history
  const hist = HM.seasonList.filter((s) => s.draft && meP?.seasons[s.season]).map((s) => {
    const mine = s.draft.picks.filter((pk) => pk.rid === meP.seasons[s.season].rid);
    return { season: s.season, slot: mine[0]?.slot, mine };
  });

  // slot explorer: who went at these pick numbers last time
  const rounds = Math.min(6, cur.draft ? cur.draft.rounds : 6);
  const explorer = [];
  for (let r = 1; r <= rounds; r++) {
    const no = pickNo(slot, r, n);
    const pk = cur.draft?.picks.find((x) => x.no === no);
    explorer.push([`<span class="num">${r}</span>`, `<span class="num"><b>#${no}</b></span>`, pk ? `${esc(pk.n)} <span class="tm">${esc(pk.pos)}</span>${pk.keeper ? ' <span class="chip">keeper</span>' : ''}` : '–', pk ? `<span class="num">${M.V.rank(pk.pid) ? '#' + M.V.rank(pk.pid) : '–'}</span>` : '', pk ? esc(HM.ent(season, pk.rid).owner) : '']);
  }

  // keeper candidates
  const l = M.lineup(M.me);
  const keepers = l.active.filter((id) => M.V.vorp(id) > 0).sort((a, b) => M.V.vorp(b) - M.V.vorp(a)).slice(0, 6);
  const kept = cur.draft?.picks.filter((pk) => pk.keeper && pk.rid === M.me.id) || [];
  const keeperTbl = table(['Player', 'Age', 'Value', 'Overall rank', 'ADP', 'Note'], keepers.map((id) => {
    const p = M.P(id);
    const note = p.pos === 'RB' && p.age >= 27 ? 'RB age cliff approaching' : p.age && p.age <= 24 ? 'young — keeps value' : p.pos === 'QB' ? 'QBs are cheap to replace in this scoring' : p.eff ? `currently ${p.eff}` : '';
    return [playerName(M, id, { status: false }), `<span class="num">${p.age ?? '–'}</span>`, `<span class="num"><b>${n1(M.V.value(id))}</b></span>`, `<span class="num">#${M.V.rank(id)}</span>`, `<span class="num dim">${p.adp ? n0(p.adp[0]) : '–'}</span>`, `<span class="muted" style="font-size:13px">${esc(note)}</span>`];
  }));

  // draft review tables
  const steals = review ? review.slice().sort((a, b) => b.edge - a.edge).slice(0, 6) : [];
  const busts = review ? review.slice().sort((a, b) => a.edge - b.edge).slice(0, 6) : [];
  const revRow = (r) => [`<span class="num">#${r.pk.no}</span>`, `${esc(r.pk.n)} <span class="tm">${esc(r.pk.pos)}</span>`, esc(r.owner.owner), `<span class="num">${r.vr >= 250 ? 'outside top 250' : '#' + r.vr}</span>`, `<span class="num ${r.edge > 0 ? 'pos-num' : 'neg-num'}">${r.edge > 0 ? '+' : ''}${n0(r.edge)}</span>`];
  const byMgr = {};
  (review || []).forEach((r) => (byMgr[r.owner.owner] = (byMgr[r.owner.owner] || 0) + r.value));
  const mgrRank = Object.entries(byMgr).sort((a, b) => b[1] - a[1]);
  const reachByPos = {};
  (review || []).filter((r) => r.reach != null).forEach((r) => (reachByPos[r.pk.pos] ||= []).push(r.reach));
  const reachRows = Object.entries(reachByPos).filter(([, v]) => v.length >= 3).map(([k, v]) => [k, avg(v)]).sort((a, b) => a[1] - b[1]);

  // targets: value rank far better than ADP rank
  const adpRank = {};
  Object.values(M.snap.players).filter((p) => p.adp).sort((a, b) => a.adp[0] - b.adp[0]).forEach((p, i) => (adpRank[p.id] = i + 1));
  const undervalued = Object.values(M.snap.players).filter((p) => adpRank[p.id] && M.V.rank(p.id) && M.V.value(p.id) > 2).map((p) => ({ p, gap: adpRank[p.id] - M.V.rank(p.id) })).sort((a, b) => b.gap - a.gap).slice(0, 8);
  const young = Object.values(M.snap.players).filter((p) => p.own == null && (p.exp ?? 9) <= 2 && ['RB', 'WR', 'TE', 'QB'].includes(p.pos) && M.V.ppg(p.id) >= 5).sort((a, b) => M.V.ppg(b.id) - M.V.ppg(a.id)).slice(0, 6);

  const picksOwned = M.picksOwned(M.me.id);
  const next = [...new Set(picksOwned.own.map((p) => p.season))].sort()[0];
  const myPicks = picksOwned.own.filter((p) => p.season === next);
  const plan = [];
  plan.push(`<b>Slot:</b> you picked ${hist.length ? hist.map((h) => `${ord(h.slot)} in ${h.season}`).join(' and ') : '—'}. In a ${n}-team snake, slot ${slot} gets picks ${[1, 2, 3].map((r) => '#' + pickNo(slot, r, n)).join(', ')} in rounds 1–3.`);
  if (keepers[0]) plan.push(`<b>Keeper:</b> ${esc(M.P(keepers[0]).n)} is your highest-value player (${n1(M.V.value(keepers[0]))}); ${kept.length ? `you kept ${kept.map((k) => esc(k.n)).join(', ')} this year.` : 'keeper cost is not recorded by Sleeper, so check it before the deadline.'}`);
  const old = l.active.filter((id) => (M.P(id).age || 0) >= 28 && M.V.vorp(id) > 5);
  if (old.length) plan.push(`<b>Aging core:</b> ${old.map((id) => `${esc(M.P(id).n)} (${M.P(id).age})`).join(', ')} — plan replacements in the first rounds.`);
  if (reachRows.length) plan.push(`<b>This league's tendency:</b> ${esc(reachRows[0][0])}s go ${n0(Math.abs(reachRows[0][1]))} picks ${reachRows[0][1] < 0 ? 'earlier' : 'later'} than ADP; ${esc(reachRows[reachRows.length - 1][0])}s go ${n0(Math.abs(reachRows[reachRows.length - 1][1]))} picks ${reachRows[reachRows.length - 1][1] < 0 ? 'earlier' : 'later'}.`);
  if (prod.length) {
    const p0 = prod[prod.length - 1];
    const a = avg(p0.byRound['1–2'] || []);
    const b = avg(p0.byRound['3–4'] || []);
    const c = avg(p0.byRound['5–8'] || []);
    plan.push(`<b>Where value lived in ${p0.season}:</b> picks in rounds 1–2 produced ${n0(a)} starter points on average, rounds 3–4 ${n0(b)}, rounds 5–8 ${n0(c)}.`);
  }
  plan.push(`<b>Draft capital:</b> ${myPicks.length ? `you own ${myPicks.map((p) => 'round ' + p.round).join(', ')} in ${next}` : 'no tracked picks'}${picksOwned.acquired.length ? `, plus ${picksOwned.acquired.length} acquired` : ''}${picksOwned.sold.length ? `, minus ${picksOwned.sold.length} traded away` : ''}.`);

  const prodTbl = prod.length ? table(['Season', ...['1–2', '3–4', '5–8', '9+'].map((r) => 'Rounds ' + r)], prod.map((p) => [p.season, ...['1–2', '3–4', '5–8', '9+'].map((r) => `<span class="num">${p.byRound[r] ? n0(avg(p.byRound[r])) : '–'}</span>`)])) : '<p class="empty">No completed draft to learn from yet.</p>';
  const mixTbl = table(['Season', 'Rounds', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'], mix.map((m) => [m.season, m.label, ...['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => `<span class="num">${m.c[p] || 0}</span>`)]));

  return `<div class="page-h"><div><h1>Draft plan</h1><p>Plan your next draft with this league's own history: where players actually went, which rounds paid off, who undervalues what — plus your keeper options and pick slots.</p></div></div>
  <div class="stack">
    ${card('Your plan', `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px">${plan.map((x) => `<li>${x}</li>`).join('')}</ul>`, { cls: 'hero', sub: `${cur.draft ? `${season} draft: ${cur.draft.type} · ${cur.draft.rounds} rounds · ${n} teams` : ''}` })}
    <div class="grid g2">
      ${card('Slot explorer', `<label class="muted">If you pick from slot <select id="dpSlot" style="margin-left:6px">${Array.from({ length: n }, (_, i) => i + 1).map((s) => `<option ${s === slot ? 'selected' : ''}>${s}</option>`).join('')}</select></label><div style="margin-top:10px">${table(['Rd', 'Pick', `Who went there in ${season}`, 'Rank today', 'Taken by'], explorer)}</div><p class="note">"Rank today" is that player's current league-adjusted value rank — a read on whether the slot paid off.</p>`, { cls: 'flush' })}
      ${card('Keeper candidates', keeperTbl, { cls: 'flush', sub: `${M.L.settings.max_keepers} keeper per team — highest-value players on your roster` })}
    </div>
    <div class="grid g2">
      ${card(`${season} draft: biggest steals`, table(['Pick', 'Player', 'Manager', 'Value rank now', 'Edge'], steals.map(revRow)), { cls: 'flush', sub: 'Edge = pick number minus current value rank (positive = outperformed his slot)' })}
      ${card(`${season} draft: biggest misses`, table(['Pick', 'Player', 'Manager', 'Value rank now', 'Edge'], busts.map(revRow)), { cls: 'flush' })}
    </div>
    <div class="grid g2">
      ${card('Best drafters so far', table(['#', 'Manager', 'Value drafted'], mgrRank.map(([nme, v], i) => [`<span class="num">${i + 1}</span>`, `<b ${nme === M.me.owner ? 'style="color:var(--green)"' : ''}>${esc(nme)}</b>`, `<span class="num">${n1(v)}</span>`])), { cls: 'flush', sub: 'Total league-adjusted value of non-keeper picks' })}
      ${card('Reach vs ADP by position', table(['Position', 'Avg pick vs ADP'], reachRows.map(([k, v]) => [k, `<span class="num ${v < 0 ? 'neg-num' : 'pos-num'}">${v < 0 ? n1(-v) + ' picks early' : n1(v) + ' picks late'}</span>`])), { cls: 'flush', sub: 'Uses current ADP from Sleeper' })}
    </div>
    <div class="grid g2">
      ${card('Value by round (starter points)', prodTbl, { cls: 'flush', sub: 'Average points scored as a starter by non-keeper picks, completed drafts' })}
      ${card('Positions by round', mixTbl, { cls: 'flush', sub: 'What this league actually drafts' })}
    </div>
    <div class="grid g2">
      ${card('Undervalued by ADP', table(['Player', 'Owner', 'ADP rank', 'Value rank', 'Gap'], undervalued.map((x) => [playerName(M, x.p.id, { status: false, team: true }), x.p.own == null ? 'Free agent' : esc(M.ownerName(x.p.own)), `<span class="num">#${adpRank[x.p.id]}</span>`, `<span class="num">#${M.V.rank(x.p.id)}</span>`, `<span class="num pos-num">+${x.gap}</span>`])), { cls: 'flush', sub: 'Players producing far better than their ADP — draft and trade targets' })}
      ${card('Young free agents to track', table(['Player', 'PPG', 'Snaps', 'Exp'], young.map((p) => [playerName(M, p.id), `<span class="num">${n1(M.V.ppg(p.id))}</span>`, `<span class="num">${M.P(p.id).snpNow != null ? M.P(p.id).snpNow + '%' : '–'}</span>`, `<span class="num">${p.exp}y</span>`]), { empty: 'No young free agent is producing yet.' }), { cls: 'flush', sub: 'Unrostered, two years or fewer in the league' })}
    </div>
  </div>
  <p class="source">No tool in this league records keeper costs or next year's draft order, and rookies aren't in the data until they join an NFL team — re-check after the season and before the keeper deadline.</p>`;
}

export function mount(root, M, ctx) {
  root.querySelector('#dpSlot')?.addEventListener('change', (e) => ((ctx.ui.draft.slot = Number(e.target.value)), ctx.rerender()));
}
