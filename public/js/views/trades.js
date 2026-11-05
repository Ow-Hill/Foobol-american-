import { esc, n1, signed, fmtDay, fmtDayTime, pct, countdown, ago } from '../util.js';
import { card, table, playerName, statusChip, ownerChip, secondOpinionBtn, callBadge } from '../ui.js';

const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

function pickLabel(p) {
  return `${p.season} round ${p.r}`;
}

export function diligence(M, id) {
  const p = M.P(id);
  const bits = [];
  if (p.eff) bits.push(`<span class="chip ${p.effSev >= 3 ? 'chip-red' : 'chip-amber'}">${esc(p.eff)}</span>`);
  const byeWeeks = [M.W + 1, M.W + 2].filter((wk) => M.isBye(p.team, wk));
  if (byeWeeks.length) bits.push(`<span class="chip chip-bye">bye wk ${byeWeeks.join(', ')}</span>`);
  const po = M.snap.meta.playoffWeeks.filter((wk) => M.isBye(p.team, wk));
  if (po.length) bits.push(`<span class="chip chip-red">bye in playoffs wk ${po.join(', ')}</span>`);
  if (p.snpTrend != null && p.snpTrend <= -8) bits.push(`<span class="chip chip-amber">snaps ▼${Math.abs(Math.round(p.snpTrend))}</span>`);
  if (p.snpTrend != null && p.snpTrend >= 8) bits.push(`<span class="chip chip-fa">snaps ▲${Math.round(p.snpTrend)}</span>`);
  return bits.join(' ');
}

export function pickList(M, t, kind, sel, max = 3) {
  const ids = [...t.players].sort((a, b) => POS_ORDER[M.P(a).pos] - POS_ORDER[M.P(b).pos] || M.P(b).proj - M.P(a).proj);
  return `<div class="pick-list">${ids
    .map((id) => {
      const p = M.P(id);
      const on = sel.includes(id);
      const off = !on && sel.length >= max;
      return `<label class="pick ${on ? 'on' : ''}" ${off ? 'style="opacity:.45" title="Up to ' + max + ' players per side"' : ''}><input type="checkbox" data-kind="${kind}" value="${id}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''}/><span class="pos pos-${p.pos.toLowerCase()}">${p.pos}</span><span style="flex:1;min-width:0"><span class="pn">${esc(p.n)}</span> ${statusChip(p, { showConflict: false })}<div class="dim" style="font-size:11.5px">${esc(p.team || '')} · ${n1(M.val(id))} proj${M.P(id).avail === 'out' ? ' (out)' : ''}</div></span></label>`;
    })
    .join('')}</div>`;
}

function names(M, ids) {
  return ids.map((id) => M.P(id).n).join(' + ');
}

function buildPitches(M, partner, give, get, ev) {
  if (!give.length && !get.length) return null;
  const mineNames = names(M, give) || 'nothing yet';
  const theirNames = names(M, get) || 'nothing yet';
  const l = M.lineup(M.me);
  const optSet = new Set(l.opt.slots.map((s) => s.pid));
  // sweetener: healthy depth that doesn't start for me, else a late pick (a judgment call, not a valuation)
  const sweet = l.active.filter((id) => !give.includes(id) && !optSet.has(id) && M.P(id).avail === 'ok' && ['RB', 'WR', 'TE'].includes(M.P(id).pos)).sort((a, b) => M.val(b) - M.val(a))[0];
  const picks = M.picksOwned(M.me.id);
  const latePick = [...picks.own].sort((a, b) => b.round - a.round || b.season - a.season)[0];
  const first = partner.owner;
  const poSpan = `${M.snap.meta.playoffWeeks[0]}–${M.snap.meta.playoffWeeks[M.snap.meta.playoffWeeks.length - 1]}`;

  // their hole: weakest group among the positions I'm sending
  const givePos = [...new Set(give.map((id) => M.P(id).pos))].filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p));
  const hole = givePos.map((p) => ({ p, s: needScoreFor(M, partner, p) })).sort((a, b) => b.s - a.s)[0];
  const theirGain = ev.theirs.delta;
  const forThem = theirGain >= 0.5 ? `It lifts your best lineup by about ${n1(theirGain)} points a week.` : theirGain > -0.5 ? 'It keeps your best lineup about where it is.' : `I know it costs your lineup about ${n1(-theirGain)} points a week, so here is why it can still work for you:`;
  const myGain = ev.mine.delta;
  const myReason = myGain >= 0.5 ? `it upgrades my lineup by about ${n1(myGain)} points a week` : get.length && give.length ? 'it consolidates my depth into the spot I actually start' : 'it fills a gap on my roster';

  const anchor = `Hey ${first}, would you do my ${mineNames} for your ${theirNames}? ${forThem} Let me know what you think.`;
  const sweetened = `Hey ${first}, how about my ${mineNames} for your ${theirNames}, and I'll add ${sweet ? M.P(sweet).n + ' as depth' : latePick ? `my ${latePick.season} round ${latePick.round} pick` : 'a late pick'} to get it done? ${forThem}`;
  const holeTxt = hole && hole.s > 0 ? `your ${hole.p} spot looks like one of the thinner parts of your roster (about ${n1(hole.s)} points under the league's typical starter)` : `I looked at your lineup and this lines up with where you could use help`;
  const needs = `Hey ${first}, ${holeTxt}, and I have ${givePos.join('/') || 'depth'} to spare: my ${mineNames}. I'd like your ${theirNames} because ${myReason}. ${forThem.replace('I know it costs', 'It costs')} Want me to send it?`;
  const gainFloor = Math.max(1, Math.round(Math.max(myGain, 0) * 0.5 * 10) / 10);
  const walk = [
    `my best lineup improves by less than ${n1(gainFloor)} points a week (it is ${signed(myGain)} now)`,
    `any player I'm receiving is Out or on IR, or has a bye in the fantasy playoffs (Weeks ${poSpan})`,
    ev.rosterAfter > ev.rosterMax ? `it puts me at ${ev.rosterAfter}/${ev.rosterMax} and forces me to drop a needed player` : null,
    `they ask for a pick on top of a deal that already lowers my lineup`,
  ].filter(Boolean);
  return { anchor, sweetened, needs, walk };
}

function needScoreFor(M, t, pos) {
  const p = M.profile[t.id];
  const vals = p.byPos[pos] || [];
  if (!vals.length) return 12;
  return (M.posMedian[pos] || 0) - vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function render(M, ctx) {
  const ui = (ctx.ui.trade ||= { partner: null, give: [], get: [] });
  const mk = M.marketFor();
  const o = M.odds();
  const dl = M.deadlineAt;
  const open = !M.deadlinePassed;

  const dlCard = open
    ? `<div class="callout ${M.acceptBy - M.now < 4 * 86400000 ? 'warn' : 'good'}"><b>Window open — ${countdown(M.acceptBy - M.now)} left to get a deal accepted</b>The deadline is Week ${M.deadlineWeek}${dl ? ` (locks around ${esc(fmtDayTime(dl))} — confirm the exact time in Sleeper)` : ''}. Trades have a 1-day review and need ${M.L.settings.veto_votes_needed} veto votes to be blocked, so the other manager has to accept by <b>${esc(fmtDayTime(M.acceptBy))}</b>.</div>`
    : `<div class="callout bad"><b>The trade deadline has passed</b>Treat everything here as offseason or keeper planning.</div>`;

  const sellRows = mk.rows.map((r) => [
    playerName(M, r.give),
    `<b>${esc(r.team.owner)}</b> <span class="dim">${r.team.w}-${r.team.l}</span>`,
    `<span class="num pos-num">${signed(r.gain)}</span>`,
    r.hurt ? '<span class="chip chip-red">starter is out</span>' : r.buyer ? '<span class="chip chip-fa">contending</span>' : '<span class="chip">low playoff odds</span>',
    `<button class="btn btn-ghost" data-load="${r.team.id}|${r.give}|">Load</button>`,
  ]);
  const targetRows = mk.targets.map((r) => [
    playerName(M, r.id),
    `<b>${esc(r.team.owner)}</b> <span class="dim">${r.team.w}-${r.team.l}</span>`,
    `<span class="num pos-num">${signed(r.gainMe)}</span> <span class="dim" style="font-size:12px">over your ${r.need}</span>`,
    [r.bench ? '<span class="chip chip-fa">bench piece for them</span>' : '', r.seller ? '<span class="chip">likely seller</span>' : ''].join(' '),
    `<button class="btn btn-ghost" data-load="${r.team.id}||${r.id}">Load</button>`,
  ]);

  const needsTxt = mk.myNeeds.map((n) => `<span class="chip">${n.pos}</span> ${n.score > 0 ? `<span class="muted">${n1(n.score)} below league-typical</span>` : `<span class="muted">${n1(-n.score)} above league-typical (still your relatively thinnest)</span>`}`).join(' &nbsp; ');
  const marketBody = `
    <p class="muted" style="margin-bottom:10px">Your relatively thinnest spots: ${needsTxt}</p>
    <h3 style="font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin:6px 0">Sell: spare pieces that would start elsewhere</h3>
    ${table(['You give', 'Who could use him', 'Gain for them', 'Context', ''], sellRows, { empty: 'No spare piece would start for another team.' })}
    ${spareQb(M)}
    <h3 style="font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 6px">Buy: upgrades at your thinnest spots, from sellers or teams where he sits on the bench</h3>
    ${table(['Target', 'Owner', 'Upgrade', 'Why they might deal', ''], targetRows, { empty: 'No obvious upgrade from sellers or benches.' })}`;

  // ----- builder -----
  const partners = M.teams.filter((t) => t.id !== M.me.id);
  const partner = ui.partner ? M.teamBy[ui.partner] : null;
  const give = ui.give.filter((id) => M.me.players.includes(id));
  const get = partner ? ui.get.filter((id) => partner.players.includes(id)) : [];
  let evalHtml = '';
  if (partner && (give.length || get.length)) {
    const ev = M.evalTrade(partner.id, give, get);
    const pitches = buildPitches(M, partner, give, get, ev);
    const theirOdds = o[partner.id];
    const expect = ev.theirs.delta >= 0.5 ? ['good', 'Plausible yes', `${esc(partner.owner)}'s best lineup improves by ${n1(ev.theirs.delta)} pts.`] : ev.theirs.delta > -0.5 ? ['warn', 'Neutral for them', 'Their lineup barely moves — the pitch has to win on need or future value.'] : ev.theirs.delta > -3 || theirOdds.playoff < 0.3 ? ['warn', 'Needs a reason to say yes', `${esc(partner.owner)}'s best lineup drops ${n1(-ev.theirs.delta)} pts${theirOdds.playoff < 0.3 ? ' — but they are a likely seller, so picks may matter more to them.' : '.'}`] : ['bad', 'Expect a no', `${esc(partner.owner)}'s best lineup drops ${n1(-ev.theirs.delta)} pts and they are still in the race.`];
    const both = (ids) => (ids.length ? `<ul style="list-style:none;margin:0;padding:0">${ids.map((id) => `<li style="margin-bottom:6px">${playerName(M, id, { status: false })}<div style="margin-top:2px">${diligence(M, id) || '<span class="dim" style="font-size:12px">no health, bye or usage flags</span>'}</div></li>`).join('')}</ul>` : '<span class="dim">nothing selected</span>');
    evalHtml = `
      <div class="grid g2" style="margin-top:12px">
        <div class="kpi"><small>Your best lineup (this week)</small><b>${n1(ev.mine.before)} → ${n1(ev.mine.after)}</b><span class="${ev.mine.delta >= 0 ? 'pos-num' : 'neg-num'}">${signed(ev.mine.delta)} pts · roster ${ev.rosterAfter}/${ev.rosterMax}${ev.rosterAfter > ev.rosterMax ? ' — over the limit, a drop is required' : ''}</span></div>
        <div class="kpi"><small>${esc(partner.owner)}'s best lineup</small><b>${n1(ev.theirs.before)} → ${n1(ev.theirs.after)}</b><span class="${ev.theirs.delta >= 0 ? 'pos-num' : 'neg-num'}">${signed(ev.theirs.delta)} pts · playoff odds ${pct(theirOdds.playoff)}</span></div>
      </div>
      <div class="callout ${expect[0]}" style="margin-top:10px"><b>${expect[1]}</b>${expect[2]} <span class="dim">(Lean based on lineup math, not a prediction of what they'll say.)</span></div>
      <div class="two" style="margin-top:12px"><div><h3 class="dimh">You send — diligence</h3>${both(give)}</div><div><h3 class="dimh">You get — diligence</h3>${both(get)}</div></div>
      ${pitches ? `<h3 class="dimh" style="margin-top:18px">Pitch · three versions</h3>
      <div class="stack">
        ${[['Anchor — the deal you want', pitches.anchor], ['Sweetened — adds depth or a late pick', pitches.sweetened], ['Needs-based — framed around their hole', pitches.needs]].map(([h, t]) => `<div class="pitch"><h4>${h}</h4>${esc(t)}<div style="margin-top:8px"><button class="btn btn-ghost" data-copy="${esc(t)}">Copy</button></div></div>`).join('')}
        <div class="pitch walk"><h4 style="color:var(--red)">Walk-away line</h4>Walk away if: <ul style="margin:6px 0 0 18px;padding:0">${pitches.walk.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
      </div>
      <p class="source">Pitch before Sunday's games while your pieces are healthy and their situation is uncertain. Picks are a clean sweetener for a contender — nothing here values draft picks, so any pick value is your judgment.</p>` : ''}`;
  }

  const builder = `
    <div class="two">
      <label class="muted" style="display:block">Trade partner<br /><select id="tradePartner" style="margin-top:4px;max-width:none;width:100%"><option value="">Choose a team…</option>${partners.map((t) => `<option value="${t.id}" ${ui.partner === t.id ? 'selected' : ''}>${esc(t.owner)} · ${t.w}-${t.l} · playoff odds ${pct(o[t.id].playoff)}</option>`).join('')}</select></label>
      <div class="muted">${partner ? `<b style="color:var(--text)">${esc(partner.name.trim())}</b><br />${partner.w}-${partner.l} · ${n1(partner.pf)} points for` : 'Pick a partner, then tick the players going each way — or use <b>Load</b> on an idea above.'}</div>
    </div>
    ${partner ? `<div class="two" style="margin-top:12px"><div><h3 class="dimh">You send <span class="dim" style="text-transform:none;letter-spacing:0">(${give.length}/3)</span></h3>${pickList(M, M.me, 'give', give, 3)}</div><div><h3 class="dimh">You get from ${esc(partner.owner)} <span class="dim" style="text-transform:none;letter-spacing:0">(${get.length}/3)</span></h3>${pickList(M, partner, 'get', get, 3)}</div></div>` : ''}
    ${evalHtml}
    ${partner ? `<div class="btn-row" style="margin-top:12px"><button class="btn btn-ghost" data-clear-trade>Clear</button></div>` : ''}`;

  // ----- trade log + picks -----
  const log = M.tradeLog();
  const logRows = log.slice(0, 12).map((t) => {
    const moves = {};
    for (const pid in t.adds || {}) (moves[t.adds[pid]] ||= []).push(M.P(pid).n);
    for (const pk of t.picks) (moves[pk.to] ||= []).push(pickLabel(pk));
    return [`<span class="dim">${esc(fmtDay(t.created))}</span>`, Object.keys(moves).map((rid) => `<b>${esc(M.ownerName(Number(rid)))}</b> gets ${esc(moves[rid].join(', '))}`).join('<br />')];
  });
  const picks = M.picksOwned(M.me.id);
  const pickTxt = `<p><b>${picks.own.length}</b> of your own picks${picks.own.length ? ` (${[...new Set(picks.own.map((p) => p.season))].join(', ')} · rounds 1–${M.L.settings.draft_rounds})` : ''}${picks.acquired.length ? ` · acquired: ${picks.acquired.map((p) => `${p.season} R${p.round} from ${esc(M.ownerName(p.from))}`).join(', ')}` : ''}${picks.sold.length ? ` · traded away: ${picks.sold.map((p) => `${p.season} R${p.round}`).join(', ')}` : ''}.</p><p class="note">${M.L.settings.max_keepers} keeper per team, ${M.L.settings.draft_rounds}-round drafts, pick trading is on. Picks are a clean sweetener for a contender, but no data source values them — treat any value as judgment.</p>`;

  const prompt = `Use the ff-command-center skill. Run ff-trade-lab for roster ${M.me.id} before the Week ${M.deadlineWeek} deadline. Ideas from my roster site: ${mk.rows.slice(0, 3).map((r) => `${M.P(r.give).n} to ${r.team.owner}`).join('; ') || 'none'}. Score each version with Down Field evaluate_moves for both teams, check Weeks 15–17 schedules, and give anchor / sweetened / needs-based pitches with a walk-away line.`;

  return `
    <div class="page-h"><div><h1>Trade lab</h1><p>Find the trade that moves a spare piece into a real upgrade, check both teams' lineups, then write the pitch. "No trade" is a valid answer.</p></div><div class="btn-row">${secondOpinionBtn(prompt)}</div></div>
    ${dlCard}
    <div class="stack" style="margin-top:14px">
      ${card('Market', marketBody, { sub: 'Built from every roster in the league — lineup math with Sleeper/RotoWire projections, not market values', cls: '' })}
      ${card('Trade builder', builder, { sub: 'Both teams\u2019 best-lineup projections before and after, health and bye checks on every player' })}
      <div class="grid g2">
        ${card('What this league has paid', table(['When', 'Deal'], logRows, { empty: 'No trades yet this season.' }), { cls: 'flush', sub: 'Past trades — your market prices' })}
        ${card('Keepers & picks', pickTxt)}
      </div>
    </div>
    <style>.dimh{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px;font-weight:700}</style>`;
}

function spareQb(M) {
  const qbs = M.lineup(M.me).active.filter((id) => M.P(id).pos === 'QB');
  if (qbs.length < 2) return '';
  return `<p class="note"><b>Spare QB:</b> you roster ${qbs.map((id) => esc(M.P(id).n)).join(' and ')} but start one. Per your trade playbook, move the spare in a 2-for-1 that turns depth into a starter — not straight up.</p>`;
}

export function mount(root, M, ctx) {
  const ui = ctx.ui.trade;
  root.querySelector('#tradePartner')?.addEventListener('change', (e) => {
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
  root.querySelectorAll('[data-load]').forEach((b) =>
    b.addEventListener('click', () => {
      const [team, give, get] = b.dataset.load.split('|');
      ui.partner = Number(team);
      ui.give = give ? [give] : [];
      ui.get = get ? [get] : [];
      ctx.rerender();
      document.querySelector('#tradePartner')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }),
  );
  root.querySelector('[data-clear-trade]')?.addEventListener('click', () => {
    ui.give = [];
    ui.get = [];
    ctx.rerender();
  });
}
