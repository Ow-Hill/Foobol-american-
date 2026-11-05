import { esc, n1, n0, signed, pct, clamp } from '../util.js';
import { card, table, playerName, secondOpinionBtn, statusChip } from '../ui.js';
import { diligence, pickList } from './trades.js';

const POS4 = ['QB', 'RB', 'WR', 'TE'];
const MAX_SIDE = 3;
const GOALS = {
  winwin: { label: 'Win-win', help: 'Balanced on value, your lineup improves, theirs holds steady', give: [1, 2], get: [1, 2], minMe: 0.5, minThem: -0.05 },
  upgrade: { label: 'Upgrade a position', help: 'Land a better starter at the spot you pick', give: [1, 2, 3], get: [1], minMe: 0.5, minThem: -0.6 },
  consolidate: { label: 'Consolidate depth', help: 'Turn 2–3 pieces into fewer, better ones (e.g. a spare QB + depth for a starter)', give: [2, 3], get: [1, 2], minMe: 0.5, minThem: -0.4 },
  depth: { label: 'Sell one, get more', help: 'Trade one star for 2–3 useful starters (bye/injury cover)', give: [1, 2], get: [2, 3], minMe: 0.2, minThem: -0.05 },
};

function* subsets(arr, k, start = 0, cur = []) {
  if (cur.length === k) return yield cur.slice();
  for (let i = start; i < arr.length; i++) {
    cur.push(arr[i]);
    yield* subsets(arr, k, i + 1, cur);
    cur.pop();
  }
}

// ---------- one deal, fully evaluated ----------
export function evaluateDeal(M, partner, give, get, horizon = 'now') {
  const V = M.V;
  const me = M.me;
  const gv = V.tsumH(give, horizon);
  const rv = V.tsumH(get, horizon);
  const bal = (rv - gv) / Math.max(gv, rv, 5);
  const dropsFor = (t, out, inn) => {
    const need = Math.max(0, t.players.length - out.length + inn.length - M.maxRoster);
    if (!need) return { ids: [], ok: true };
    const typ = new Set(V.lineup(t).slots.map((s) => s.pid));
    const bench = M.lineup(t).active.filter((id) => !typ.has(id) && !out.includes(id) && !inn.includes(id)).sort((a, b) => V.tvH(a, horizon) - V.tvH(b, horizon));
    return { ids: bench.slice(0, need), ok: bench.length >= need };
  };
  const dm = dropsFor(me, give, get);
  const dt = dropsFor(partner, get, give);
  const base = (t) => (M._fb ||= {})[t.id] ||= { typ: V.lineup(t), ros: V.rosLineup(t) };
  const bm = base(me);
  const bt = base(partner);
  const myAfter = V.lineup(me, get, give.concat(dm.ids));
  const thAfter = V.lineup(partner, give, get.concat(dt.ids));
  const dMe = myAfter.total - bm.typ.total;
  const dThem = thAfter.total - bt.typ.total;
  const rosMe = V.rosLineup(me, get, give.concat(dm.ids)) - bm.ros;
  const rosThem = V.rosLineup(partner, give, get.concat(dt.ids)) - bt.ros;
  const changes = (before, after) =>
    after.slots
      .map((s, i) => ({ slot: s.slot, inn: s.pid, out: before.slots[i].pid, gain: s.v - before.slots[i].v }))
      .filter((x) => x.inn !== x.out && x.gain > 0.4)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 2);
  const flags = [];
  for (const id of get) {
    const p = M.P(id);
    if (p.avail === 'out' || (p.eff && p.effSev >= 3)) flags.push(`${p.n} is ${p.eff}`);
    if (M.snap.meta.playoffWeeks.some((wk) => M.isBye(p.team, wk))) flags.push(`${p.n} has a playoff-week bye`);
  }
  return { partner, give, get, gv, rv, bal, dMe, dThem, rosMe, rosThem, dropsMe: dm.ids, dropsThem: dt.ids, dropOk: dm.ok && dt.ok, changesMe: changes(bm.typ, myAfter), changesThem: changes(bt.typ, thAfter), flags, rosterAfter: me.players.length - give.length + get.length - dm.ids.length };
}

// ---------- rough acceptance likelihood (heuristic, not a prediction) ----------
function accept(M, d, odds, tradeCounts) {
  let a = 50 + 9 * clamp(d.dThem, -3, 3) - d.bal * 55;
  if (odds) a += clamp(odds.them.playoff * 100, -10, 10) * 1.2;
  const o = M.odds()[d.partner.id].playoff;
  if (o < 0.3 && d.bal < 0.05) a += 4;
  const tc = tradeCounts?.[d.partner.owner];
  if (tc != null) a += tc >= 10 ? 5 : tc <= 3 ? -3 : 0;
  if (d.dropsThem.length) a -= 4 * d.dropsThem.length;
  return Math.round(clamp(a, 5, 95));
}
const accLabel = (a) => (a >= 65 ? ['Likely', 'chip-fa'] : a >= 45 ? ['Possible', 'chip-amber'] : ['Long shot', 'chip-red']);

// ---------- the search ----------
function search(M, o, tradeCounts) {
  const V = M.V;
  const me = M.me;
  const t0 = performance.now();
  const budget = 1600;
  const prot = new Set(o.protect);
  const pool = (t, must, cut) => {
    const l = M.lineup(t);
    let ids = l.active.filter((id) => !M.P(id).missing && POS4.includes(M.P(id).pos) && V.tvH(id, o.horizon) > 1);
    ids.sort((a, b) => V.tvH(b, o.horizon) - V.tvH(a, o.horizon));
    ids = ids.slice(0, cut);
    for (const m of must) if (t.players.includes(m) && !ids.includes(m)) ids.push(m);
    return ids;
  };
  const myPool = pool(me, o.mustGive, 10).filter((id) => !prot.has(id) || o.mustGive.includes(id));
  const myTyp = V.lineup(me);
  const floor = {};
  for (const s of myTyp.slots) {
    for (const pos of POS4) if (M.slotEligible(s.slot, pos)) floor[pos] = Math.min(floor[pos] ?? 99, s.v);
  }
  const vEff = (id) => V.ppg(id) * Math.min(1, V.avail(id) + 0.1);
  const potential = (id) => Math.max(0, vEff(id) - (floor[M.P(id).pos] ?? 0));
  const myBase = myTyp.total;
  const cands = [];
  let evals = 0;
  let stopped = false;
  const goal = GOALS[o.goal];
  const mySets = {};
  for (const k of o.giveN) mySets[k] = [...subsets(myPool, k)].filter((s) => o.mustGive.every((m) => s.includes(m))).map((ids) => ({ ids, tv: V.tsumH(ids, o.horizon) }));

  outer: for (const t of M.teams) {
    if (t.id === me.id || (o.partner && t.id !== o.partner)) continue;
    if (o.mustGet.length && !o.mustGet.every((m) => t.players.includes(m))) continue;
    const th = pool(t, o.mustGet, 11).filter((id) => !(M.P(id).avail === 'out' && M.P(id).eff !== 'Questionable'));
    const base = V.lineup(t).total;
    const theirSets = {};
    for (const k of o.getN) theirSets[k] = [...subsets(th, k)].filter((s) => o.mustGet.every((m) => s.includes(m))).map((ids) => ({ ids, tv: V.tsumH(ids, o.horizon), pot: ids.reduce((a, id) => a + potential(id), 0) }));
    for (const gk of o.giveN) for (const rk of o.getN) {
      if (o.goal === 'consolidate' && !(gk > rk)) continue;
      if (o.goal === 'depth' && !(rk > gk)) continue;
      for (const g of mySets[gk]) for (const r of theirSets[rk]) {
        const top = Math.max(g.tv, r.tv, 5);
        const bal = (r.tv - g.tv) / top;
        if (Math.abs(bal) > o.tol) continue;
        if (r.pot < goal.minMe) continue; // can't possibly help my lineup enough
        if (o.goal === 'upgrade' && !r.ids.some((id) => M.P(id).pos === o.upPos)) continue;
        if (performance.now() - t0 > budget) { stopped = true; break outer; }
        evals++;
        const d = evaluateLite(M, t, g.ids, r.ids, base, o.horizon, myBase, V);
        if (!d) continue;
        if (d.dMe < goal.minMe || d.dThem < goal.minThem) continue;
        cands.push({ t, give: g.ids, get: r.ids, bal, dMe: d.dMe, dThem: d.dThem, quick: d.dMe + 0.6 * Math.max(d.dThem, 0) - 1.5 * Math.max(-d.dThem, 0) - 3 * Math.abs(bal) });
      }
    }
  }
  cands.sort((a, b) => b.quick - a.quick);
  const diag = {};
  if (o.mustGet.length) {
    diag.target = o.mustGet.map((id) => M.P(id).n).join(' + ');
    diag.targetTv = V.tsumH(o.mustGet, o.horizon);
    diag.offer = V.tsumH([...myPool].sort((a, b) => V.tvH(b, o.horizon) - V.tvH(a, o.horizon)).slice(0, MAX_SIDE), o.horizon);
    diag.protectedTop = o.protect.map((id) => M.P(id).n);
  }
  const seen = {};
  const per = {};
  const short = [];
  for (const c of cands) {
    const keys = [c.t.id + '|' + c.give.join(','), ...c.get.map((id) => 'g' + id)];
    if (keys.some((k) => (seen[k] || 0) >= 2)) continue;
    if ((per[c.t.id] || 0) >= 4) continue;
    keys.forEach((k) => (seen[k] = (seen[k] || 0) + 1));
    per[c.t.id] = (per[c.t.id] || 0) + 1;
    short.push(c);
    if (short.length >= 24) break;
  }
  // stage 2: bye-aware rest-of-season, drops, acceptance
  const full = short.map((c) => {
    const d = evaluateDeal(M, c.t, c.give, c.get, o.horizon);
    const wTotal = V.weeks.reduce((a, x) => a + x.w, 0) || 1;
    const score = 0.5 * d.dMe + 0.5 * (d.rosMe / wTotal) + 0.6 * Math.max(d.dThem, 0) - 1.5 * Math.max(-d.dThem, 0) - 3 * Math.abs(d.bal) - 0.6 * d.dropsMe.length - (d.dropOk ? 0 : 99);
    return { ...d, score, acc0: accept(M, d, null, tradeCounts) };
  }).filter((d) => d.dropOk && d.rosMe > -2);
  const sorter = { best: (a, b) => b.score - a.score, balanced: (a, b) => Math.abs(a.bal) - Math.abs(b.bal) || b.score - a.score, accept: (a, b) => b.acc0 - a.acc0 || b.score - a.score }[o.sort];
  full.sort(sorter);
  const top = full.slice(0, 10).map((d) => {
    const odds = M.tradeOdds(d.partner.id, d.dMe, d.dThem);
    return { ...d, odds, acc: accept(M, d, odds, tradeCounts) };
  });
  if (o.sort === 'accept') top.sort((a, b) => b.acc - a.acc || b.score - a.score);
  return { results: top, scanned: evals, kept: cands.length, stopped, diag, ms: Math.round(performance.now() - t0) };
}

// lighter version used inside the hot loop
function evaluateLite(M, t, give, get, theirBase, horizon, myBase, V) {
  const tv = (id) => V.tvH(id, horizon);
  const needMe = Math.max(0, M.me.players.length - give.length + get.length - M.maxRoster);
  const needTh = Math.max(0, t.players.length - get.length + give.length - M.maxRoster);
  const dropPick = (team, out, inn, n) => {
    if (!n) return [];
    const typ = ((M._typSet ||= {})[team.id] ||= new Set(V.lineup(team).slots.map((s) => s.pid)));
    const bench = M.lineup(team).active.filter((id) => !typ.has(id) && !out.includes(id) && !inn.includes(id)).sort((a, b) => tv(a) - tv(b));
    return bench.length >= n ? bench.slice(0, n) : null;
  };
  const dm = dropPick(M.me, give, get, needMe);
  const dt = dropPick(t, get, give, needTh);
  if (dm === null || dt === null) return null;
  return { dMe: V.lineup(M.me, get, give.concat(dm)).total - myBase, dThem: V.lineup(t, give, get.concat(dt)).total - theirBase };
}

// ---------- UI ----------
function balanceMeter(gv, rv) {
  const total = Math.max(gv + rv, 1);
  const left = (gv / total) * 100;
  return `<div style="display:flex;height:10px;border-radius:6px;overflow:hidden;background:#1c2938"><span style="width:${left}%;background:var(--blue)"></span><span style="width:${100 - left}%;background:var(--green)"></span></div><div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--dim);margin-top:3px"><span>You give ${n1(gv)}</span><span>You get ${n1(rv)}</span></div>`;
}

function verdict(d) {
  const fair = Math.abs(d.bal) <= 0.15;
  if (fair && d.dMe > 0.5 && d.dThem > 0.3) return ['good', 'Balanced and good for both', 'Values are within 15% and both lineups improve — the kind of deal that gets accepted.'];
  if (fair && d.dMe > 0.5 && d.dThem >= -0.05) return ['good', 'Balanced — you gain, they lose nothing', 'Fair on value and your lineup improves while theirs holds steady. The pitch has to win on fit.'];
  if (d.bal > 0.15) return ['good', 'Favors you on value', `You receive about ${Math.round(d.bal * 100)}% more trade value than you send — expect pushback unless they need the fit.`];
  if (d.bal < -0.15) return ['warn', 'Favors them on value', `You send about ${Math.round(-d.bal * 100)}% more trade value than you get. Only worth it if your lineup gain is real.`];
  if (d.dMe < 0) return ['bad', 'Hurts your lineup', 'Fair on value, but your typical lineup gets worse.'];
  return ['warn', 'Fair, little lineup gain', 'Balanced on value, but neither lineup moves much.'];
}

function oddsLine(o, who) {
  const f = (x) => `<span class="${x >= 0 ? 'pos-num' : 'neg-num'}">${signed(x * 100)}</span>`;
  return `<span class="dim">${who}</span> playoffs ${f(o.playoff)} · title ${f(o.title)}`;
}

function why(M, d) {
  const ch = (list, who) => (list.length ? list.map((c) => `${who} ${c.slot} +${n1(c.gain)} (${esc(M.P(c.inn).n)} in)`).join(', ') : '');
  const bits = [ch(d.changesMe, 'Your'), ch(d.changesThem, `${esc(d.partner.owner)}'s`)].filter(Boolean);
  return bits.join(' · ') || 'Value-neutral swap with a small depth effect.';
}

function resultCard(M, d, i) {
  const [al, ac] = accLabel(d.acc);
  const names = (ids, status) => ids.map((id) => `<div style="margin-bottom:3px">${playerName(M, id, { status })} <span class="dim" style="font-size:12px">${n1(M.V.tv(id))}</span></div>`).join('');
  const flags = [...d.flags.map((f) => `<span class="chip chip-red">${esc(f)}</span>`), ...d.get.map((id) => diligence(M, id)).filter(Boolean)].join(' ');
  return `<div class="tier-row" style="grid-template-columns:1.1fr 1.1fr 1.4fr;gap:16px;align-items:start">
    <div><h3 class="dimh">You give</h3>${names(d.give, false)}${d.dropsMe.length ? `<div class="drop" style="margin-top:6px">↳ also drop ${d.dropsMe.map((id) => esc(M.P(id).n)).join(', ')} to stay at ${M.maxRoster}</div>` : ''}</div>
    <div><h3 class="dimh">You get from ${esc(d.partner.owner)}</h3>${names(d.get, true)}${d.dropsThem.length ? `<div class="drop" style="margin-top:6px">↳ they'd need to drop ${d.dropsThem.map((id) => esc(M.P(id).n)).join(', ')}</div>` : ''}</div>
    <div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><span class="chip ${ac}">${al} · ${d.acc}</span><span class="dim" style="font-size:12px">${d.partner.w}-${d.partner.l} · ${pct(M.odds()[d.partner.id].playoff)} to make playoffs</span></div>
      ${balanceMeter(d.gv, d.rv)}
      <div class="stats" style="text-align:left;margin-top:8px;font-size:12.5px;line-height:1.6">Typical lineup: you <b class="${d.dMe >= 0 ? 'pos-num' : 'neg-num'}">${signed(d.dMe)}</b> · them <b class="${d.dThem >= -0.05 ? 'pos-num' : 'neg-num'}">${signed(d.dThem)}</b> a week<br />Rest of season (byes in): you <b>${signed(d.rosMe)}</b> pts<br />${oddsLine(d.odds.me, 'You:')}<br />${oddsLine(d.odds.them, esc(d.partner.owner) + ':')}</div>
      <div class="why" style="margin-top:6px">${why(M, d)}</div>
      ${flags ? `<div style="margin-top:6px">${flags}</div>` : ''}
      <div class="btn-row" style="margin-top:8px"><button class="btn btn-ghost" data-fload="${d.partner.id}|${d.give.join(',')}|${d.get.join(',')}">Analyze</button></div>
    </div>
  </div>`;
}

function analyzer(M, ui) {
  const partner = ui.partner ? M.teamBy[ui.partner] : null;
  const give = ui.give.filter((id) => M.me.players.includes(id));
  const get = partner ? ui.get.filter((id) => partner.players.includes(id)) : [];
  const opts = M.teams.filter((t) => t.id !== M.me.id).map((t) => `<option value="${t.id}" ${ui.partner === t.id ? 'selected' : ''}>${esc(t.owner)} · ${t.w}-${t.l}</option>`).join('');
  let res = '';
  if (partner && (give.length || get.length)) {
    const d = evaluateDeal(M, partner, give, get, ui.horizon);
    const odds = M.tradeOdds(partner.id, d.dMe, d.dThem);
    const acc = accept(M, d, odds, ui.tradeCounts);
    const [al, ac] = accLabel(acc);
    const wk = M.evalTrade(partner.id, give, get);
    const v = verdict(d);
    const list = (ids) => ids.map((id) => `<div style="margin-bottom:6px">${playerName(M, id, { status: false })} <span class="chip">trade value ${n1(M.V.tv(id))}</span><div>${diligence(M, id)}</div></div>`).join('') || '<span class="dim">nothing</span>';
    res = `<div class="callout ${v[0]}" style="margin-top:12px"><b>${v[1]}</b>${v[2]} <span class="chip ${ac}" style="margin-left:6px">${al} · ${acc}</span></div>
    <div class="grid g2" style="margin-top:12px"><div class="kpi"><small>Value balance</small>${balanceMeter(d.gv, d.rv)}</div>
    <div class="kpi"><small>Roster after trade</small><b>${d.rosterAfter}/${M.maxRoster}</b><span>${d.dropsMe.length ? `drops ${d.dropsMe.map((id) => esc(M.P(id).n)).join(', ')} to fit` : 'fits'}${d.dropsThem.length ? ` · they drop ${d.dropsThem.map((id) => esc(M.P(id).n)).join(', ')}` : ''}</span></div>
    <div class="kpi"><small>Your typical lineup</small><b class="${d.dMe >= 0 ? 'pos-num' : 'neg-num'}">${signed(d.dMe)}</b><span>a week · rest of season ${signed(d.rosMe)} pts · this week ${signed(wk.mine.delta)}</span></div>
    <div class="kpi"><small>${esc(partner.owner)}'s typical lineup</small><b class="${d.dThem >= -0.05 ? 'pos-num' : 'neg-num'}">${signed(d.dThem)}</b><span>a week · rest of season ${signed(d.rosThem)} pts · this week ${signed(wk.theirs.delta)}</span></div>
    <div class="kpi"><small>Your odds change</small><b>${signed(odds.me.playoff * 100)}</b><span>playoff pts · title ${signed(odds.me.title * 100)} · now ${pct(odds.me.after)}</span></div>
    <div class="kpi"><small>${esc(partner.owner)}'s odds change</small><b>${signed(odds.them.playoff * 100)}</b><span>playoff pts · title ${signed(odds.them.title * 100)} — ${odds.them.playoff < -0.02 ? 'their odds fall, expect a no' : 'their odds hold or rise'}</span></div></div>
    <p class="note"><b>Why:</b> ${why(M, d)}</p>
    <div class="two" style="margin-top:12px"><div><h3 class="dimh">You send</h3>${list(give)}</div><div><h3 class="dimh">You get</h3>${list(get)}</div></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn" data-to-lab>Write the pitch in Trade lab →</button></div>
    <p class="note">Picks aren't valued here — no data source prices them — so treat any pick you add as your own judgment call. The odds change comes from this site's simulation with each team's weekly scoring shifted by the lineup change.</p>`;
  }
  return `<div class="btn-row" style="align-items:flex-end"><label class="muted" style="display:block;min-width:260px">Partner<br /><select id="fPartner" style="margin-top:4px;max-width:none;width:100%"><option value="">Choose a team…</option>${opts}</select></label>${partner ? `<span class="muted">Up to ${MAX_SIDE} players each side · you: ${give.length}/${MAX_SIDE} · them: ${get.length}/${MAX_SIDE}</span>` : ''}</div>
  ${partner ? `<div class="two" style="margin-top:12px"><div><h3 class="dimh">You send</h3>${pickList(M, M.me, 'give', give, MAX_SIDE)}</div><div><h3 class="dimh">You get</h3>${pickList(M, partner, 'get', get, MAX_SIDE)}</div></div>` : ''}${res}`;
}

export { search, GOALS };
const chipBtn = (on, attrs, label) => `<button class="tab ${on ? 'active' : ''}" ${attrs}>${label}</button>`;

export function render(M, ctx) {
  const ui = (ctx.ui.finder ||= { partner: null, give: [], get: [], goal: 'winwin', giveN: [1, 2], getN: [1, 2], tol: 0.2, horizon: 'now', sort: 'best', upPos: 'WR', target: '', mustGive: '', protect: null, found: null, wp: '' });
  if (!GOALS[ui.goal]) Object.assign(ui, { goal: 'winwin', giveN: [1, 2], getN: [1, 2], horizon: 'now', sort: 'best', tol: 0.2, upPos: 'WR', found: null });
  ui.giveN ||= [1, 2];
  ui.getN ||= [1, 2];
  ui.give ||= [];
  ui.get ||= [];
  ui.tradeCounts = (() => {
    if (!ctx.HM) return null;
    const c = {};
    ctx.HM.txs.filter((t) => t.type === 'trade').forEach((t) => t.who.forEach((w) => (c[w.owner] = (c[w.owner] || 0) + 1)));
    return c;
  })();
  if (ui.protect == null) ui.protect = [M.V.rows.find((r) => M.me.players.includes(r.pid))?.pid].filter(Boolean);
  const f = ui.found;
  const myPlayers = M.lineup(M.me).active.filter((id) => !M.P(id).missing).sort((a, b) => M.V.tv(b) - M.V.tv(a));
  const others = Object.values(M.snap.players).filter((p) => p.own != null && p.own !== M.me.id && POS4.includes(p.pos)).sort((a, b) => M.V.tv(b.id) - M.V.tv(a.id)).slice(0, 160);
  const goalBtns = Object.entries(GOALS).map(([k, g]) => chipBtn(ui.goal === k, `data-goal="${k}" title="${esc(g.help)}"`, g.label)).join('');
  const cnt = (kind, n) => `<label class="pick ${ui[kind].includes(n) ? 'on' : ''}" style="padding:5px 10px"><input type="checkbox" data-cnt="${kind}|${n}" ${ui[kind].includes(n) ? 'checked' : ''}/>${n}</label>`;
  const sel = (id, opts, cur, label) => `<label class="muted">${label}<br /><select id="${id}" style="margin-top:4px">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;

  const controls = `
    <div class="btn-row" style="margin-bottom:10px">${goalBtns}</div>
    <p class="muted" style="margin:-2px 0 12px">${esc(GOALS[ui.goal].help)}</p>
    <div class="btn-row" style="align-items:flex-end;margin-bottom:12px">
      ${sel('fWith', [['', 'Every team'], ...M.teams.filter((t) => t.id !== M.me.id).map((t) => [t.id, t.owner])], ui.wp, 'With')}
      <div class="muted">You give<br /><span class="btn-row" style="margin-top:4px">${[1, 2, 3].map((n) => cnt('giveN', n)).join('')}</span></div>
      <div class="muted">You get<br /><span class="btn-row" style="margin-top:4px">${[1, 2, 3].map((n) => cnt('getN', n)).join('')}</span></div>
      ${ui.goal === 'upgrade' ? sel('fUpPos', POS4.map((p) => [p, p]), ui.upPos, 'Position') : ''}
      ${sel('fTol', [[0.1, '10%'], [0.2, '20%'], [0.3, '30%']], ui.tol, 'Max value gap')}
      ${sel('fHor', [['now', 'Win now'], ['balanced', 'Balanced'], ['future', 'Future (age-weighted)']], ui.horizon, 'Value horizon')}
      ${sel('fSort', [['best', 'Best overall'], ['balanced', 'Most balanced'], ['accept', 'Most likely accepted']], ui.sort, 'Sort')}
    </div>
    <div class="btn-row" style="align-items:flex-end;margin-bottom:12px">
      <label class="muted">Target a player<br /><input id="fTarget" list="tplist" class="input" placeholder="e.g. a WR you want…" value="${esc(ui.target)}" style="margin-top:4px;min-width:220px" /><datalist id="tplist">${others.map((p) => `<option value="${esc(p.n)}"></option>`).join('')}</datalist></label>
      ${sel('fShop', [['', '— none —'], ...myPlayers.map((id) => [id, M.P(id).n])], ui.mustGive, 'Shop one of mine')}
      <button class="btn" id="fRun">Find trades</button>
    </div>
    <details class="how" ${ui.protectOpen ? 'open' : ''}><summary>Hands-off players (${ui.protect.length}) — never offered</summary><div class="btn-row" style="margin-top:8px">${myPlayers.slice(0, 14).map((id) => chipBtn(ui.protect.includes(id), `data-prot="${id}"`, esc(M.P(id).n))).join('')}</div></details>`;

  const resHtml = !f ? '<p class="empty">Pick a goal and press <b>Find trades</b>. The search covers up to 3 players on each side, checks both rosters, and ranks by value balance, lineup gain, bye weeks and your odds.</p>'
    : f.results.length ? `<div>${f.results.map((d, i) => resultCard(M, d, i)).join('')}</div><p class="source">Searched ${f.scanned.toLocaleString()} balanced combinations in ${f.ms} ms${f.stopped ? ' (time limit hit — narrow the search for a fuller scan)' : ''}; ${f.kept} met the goal. Acceptance = a heuristic from value fairness, their lineup change, their odds change, whether they're a seller and how often they trade — not a prediction.</p>`
      : `<p class="empty">No trade meets this goal. ${f.diag?.target ? `<b>${esc(f.diag.target)}</b> carries about ${n0(f.diag.targetTv)} trade value, and the best 3 pieces you're offering add up to ${n0(f.diag.offer)}${f.diag.targetTv > f.diag.offer * 1.2 ? ' — not enough to land him without touching a hands-off player' : ''}. Try a wider value gap, release a hands-off player, or target someone cheaper.` : 'Try a wider value gap, more player counts, or a different goal.'} "No trade" is a valid answer.</p>`;

  const prompt = `Use the ff-command-center skill. Run ff-trade-lab for roster ${M.me.id}. Score these candidate trades with Down Field evaluate_moves for both teams: ${f ? f.results.slice(0, 3).map((r) => `${r.give.map((id) => M.P(id).n).join(' + ')} for ${r.get.map((id) => M.P(id).n).join(' + ')} (${r.partner.owner})`).join('; ') : 'none yet'}.`;
  return `<div class="page-h"><div><h1>Trade finder & analyzer</h1><p>Search deals of up to 3 players per side, balanced on league-adjusted value, ranked by what they do for both lineups and your playoff odds — then analyze any deal in detail.</p></div><div class="btn-row">${secondOpinionBtn(prompt)}</div></div>
  <div class="stack">${card('Trade finder', controls + resHtml, { sub: 'Goals, 1–3 players each way, target or shop a player, bye-aware ranking' })}${card('Trade analyzer', analyzer(M, ui), { sub: 'Value balance, both lineups, odds change for both teams, health and bye checks' })}</div><style>.dimh{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px;font-weight:700}</style>`;
}

export function mount(root, M, ctx) {
  const ui = ctx.ui.finder;
  const idByName = (name) => Object.values(M.snap.players).find((p) => p.n.toLowerCase() === name.trim().toLowerCase())?.id || null;
  root.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
    ui.goal = b.dataset.goal;
    ui.giveN = [...GOALS[ui.goal].give];
    ui.getN = [...GOALS[ui.goal].get];
    ui.found = null;
    ctx.rerender();
  }));
  root.querySelectorAll('[data-cnt]').forEach((c) => c.addEventListener('change', () => {
    const [k, n] = c.dataset.cnt.split('|');
    const v = Number(n);
    ui[k] = c.checked ? [...new Set([...ui[k], v])].sort() : ui[k].filter((x) => x !== v);
    if (!ui[k].length) ui[k] = [v];
    ctx.rerender();
  }));
  root.querySelectorAll('[data-prot]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.prot;
    ui.protect = ui.protect.includes(id) ? ui.protect.filter((x) => x !== id) : [...ui.protect, id];
    ui.protectOpen = true;
    ctx.rerender();
  }));
  root.querySelector('#fRun')?.addEventListener('click', (e) => {
    ui.wp = root.querySelector('#fWith').value;
    ui.tol = Number(root.querySelector('#fTol').value);
    ui.horizon = root.querySelector('#fHor').value;
    ui.sort = root.querySelector('#fSort').value;
    ui.upPos = root.querySelector('#fUpPos')?.value || ui.upPos;
    ui.target = root.querySelector('#fTarget').value;
    ui.mustGive = root.querySelector('#fShop').value;
    e.target.textContent = 'Searching…';
    e.target.disabled = true;
    setTimeout(() => {
      const target = ui.target.trim() ? idByName(ui.target) : null;
      const o = {
        partner: ui.wp ? Number(ui.wp) : null, goal: ui.goal, giveN: ui.giveN, getN: ui.getN, tol: ui.tol, horizon: ui.horizon, sort: ui.sort, upPos: ui.upPos,
        protect: ui.protect, mustGive: ui.mustGive ? [ui.mustGive] : [], mustGet: target ? [target] : [],
      };
      ui.found = search(M, o, ui.tradeCounts);
      ctx.rerender();
    }, 30);
  });
  root.querySelector('#fPartner')?.addEventListener('change', (e) => {
    ui.partner = e.target.value ? Number(e.target.value) : null;
    ui.give = [];
    ui.get = [];
    ctx.rerender();
  });
  root.querySelectorAll('input[data-kind]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const list = ui[cb.dataset.kind];
      if (cb.checked) list.push(cb.value);
      else list.splice(list.indexOf(cb.value), 1);
      ctx.rerender();
    }),
  );
  root.querySelectorAll('[data-fload]').forEach((b) =>
    b.addEventListener('click', () => {
      const [t, g, r] = b.dataset.fload.split('|');
      ui.partner = Number(t);
      ui.give = g.split(',').filter(Boolean);
      ui.get = r.split(',').filter(Boolean);
      ctx.rerender();
      document.querySelector('#fPartner')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }),
  );
  root.querySelector('[data-to-lab]')?.addEventListener('click', () => {
    ctx.ui.trade = { partner: ui.partner, give: [...ui.give], get: [...ui.get] };
    ctx.go('trades');
  });
}
