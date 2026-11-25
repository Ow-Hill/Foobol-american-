// Offseason trades: once the deadline has passed, only next season can change hands (keeper slots
// and draft picks), so every deal here is valued for next season only. See keepertrade.js.
import { esc, n1, signed, fmtDayTime } from '../util.js';
import { card, table, playerName } from '../ui.js';
import { buildKeeperMarket } from '../keepertrade.js';

const cache = new WeakMap();
const market = (M) => {
  let k = cache.get(M.snap);
  if (!k) cache.set(M.snap, (k = { K: buildKeeperMarket(M) }));
  return k;
};

const num = (x) => `<span class="num ${x > 0.05 ? 'pos-num' : x < -0.05 ? 'neg-num' : ''}">${signed(x)}</span>`;

function names(K, keys) {
  return keys.length ? keys.map((k) => esc(K.label(k))).join(' + ') : 'nothing';
}

function dealLine(M, K, d) {
  return `<b>Give</b> ${names(K, d.give)} <span class="dim">→</span> <b>get</b> ${names(K, d.get)}`;
}

// The offer, both sides, and why.
function sideBox(M, K, title, s) {
  const kn = (ids) => (ids.length ? ids.map((id) => esc(M.P(id).n)).join(', ') : '<span class="dim">no keeper worth a 1st</span>');
  return `<div class="kpi"><small>${title}</small><b class="${s.delta >= 0 ? 'pos-num' : 'neg-num'}">${signed(s.delta)}</b><span>Keeper ${kn(s.keepBefore)} → ${kn(s.keepAfter)} (${signed(s.keeper)}) · picks ${signed(s.picks)}</span></div>`;
}

function pitch(M, K, d) {
  const who = d.partner.owner;
  const theirKeep = d.theirs.keepAfter.filter((id) => !d.theirs.keepBefore.includes(id));
  const why = theirKeep.length
    ? `${M.P(theirKeep[0]).n} would be your keeper next year${d.theirs.keepBefore.length ? ` over ${M.P(d.theirs.keepBefore[0]).n}` : ''}`
    : d.theirs.picks > 0
      ? 'you pick up draft capital for a player you could not keep anyway'
      : 'it works for both of our keeper plans';
  return `Hey ${who}, offseason idea: my ${names(K, d.give).replace(/<[^>]+>/g, '')} for your ${names(K, d.get).replace(/<[^>]+>/g, '')}. ${why}. Want to do it once trades open?`;
}

function verdict(d) {
  if (d.mine.delta >= 0.5 && d.theirs.delta >= 0) return ['good', 'Works for both teams', 'Both keeper plans come out ahead.'];
  if (d.mine.delta >= 0.5) return ['warn', 'Good for you, a hard sell', `${esc(d.partner.owner)} loses ${n1(-d.theirs.delta)} in next-season value. Expect a no unless they rate a player differently.`];
  if (d.mine.delta > -0.5) return ['warn', 'About even for you', 'You neither gain nor lose much next season.'];
  return ['bad', 'Costs you', `You lose ${n1(-d.mine.delta)} in next-season value.`];
}

function checker(M, K, ui) {
  const partners = M.teams.filter((t) => t.id !== M.me.id);
  const partner = ui.partner ? M.teamBy[ui.partner] : null;
  const sel = `<label class="muted">Trade partner<br /><select id="osPartner" style="margin-top:4px;width:100%;max-width:none"><option value="">Choose a team…</option>${partners.map((t) => `<option value="${t.id}" ${ui.partner === t.id ? 'selected' : ''}>${esc(t.owner)}</option>`).join('')}</select></label>`;
  if (!partner) return `${sel}<p class="dim" style="margin-top:8px">Pick a team, then tick what goes each way. Use <b>Check</b> on any deal above to load it here.</p>`;
  const assets = (t, kind, chosen) => {
    const x = K.byTeam[t.id];
    const kvIds = new Set(x.keepers.map((k) => k.id));
    const players = [...x.keepers.map((k) => k.id), ...t.players.filter((id) => !kvIds.has(id) && !['K', 'DEF'].includes(M.P(id).pos)).slice(0, 6)];
    const row = (key, label, v, extra = '') => `<label class="pick ${chosen.includes(key) ? 'on' : ''}"><input type="checkbox" data-os="${kind}" value="${esc(key)}" ${chosen.includes(key) ? 'checked' : ''}/><span style="flex:1;min-width:0">${label}${extra}</span><span class="num dim">${n1(v)}</span></label>`;
    return `<div class="pick-list">${players.map((id) => row(id, `<span class="pos pos-${M.P(id).pos.toLowerCase()}">${M.P(id).pos}</span> <span class="pn">${esc(M.P(id).n)}</span>`, K.kv(id), M.P(id).age ? ` <span class="dim" style="font-size:11.5px">age ${M.P(id).age}</span>` : '')).join('')}${x.picks.map((p) => row(p.key, esc(K.label(p.key)), p.v)).join('')}</div>`;
  };
  const give = ui.give.filter((k) => K.isPick(k) ? K.byTeam[M.me.id].picks.some((p) => p.key === k) : M.me.players.includes(k));
  const get = ui.get.filter((k) => K.isPick(k) ? K.byTeam[partner.id].picks.some((p) => p.key === k) : partner.players.includes(k));
  let out = '';
  if (give.length || get.length) {
    const c = K.counter(partner.id, give, get);
    const d = c.asIs;
    const [cls, head, body] = verdict(d);
    const alt = (x, h) => (x && (x.give.join() !== give.join() || x.get.join() !== get.join())
      ? `<div class="pitch"><h4>${h}</h4>${dealLine(M, K, x)}<div class="dim" style="font-size:12.5px;margin-top:4px">You ${signed(x.mine.delta)} · ${esc(partner.owner)} ${signed(x.theirs.delta)}</div><div style="margin-top:8px"><button class="btn btn-ghost" data-os-load="${partner.id}|${x.give.join(',')}|${x.get.join(',')}">Load</button> <button class="btn btn-ghost" data-copy="${esc(pitch(M, K, x))}">Copy pitch</button></div></div>`
      : '');
    const counters = [alt(c.fair, 'Fair counter: splits the value about evenly'), alt(c.ask, 'Your best ask: the most you can take while they still come out ahead')].filter(Boolean).join('');
    const noFix = c.core.surplus < 0
      ? `<p class="note">No pick package fixes this one: the players are worth ${n1(-c.core.surplus)} more where they are now, because ${d.mine.keeper < 0 ? 'you would be giving up your keeper' : 'they already keep someone better'}.</p>`
      : !counters ? '<p class="note">This is already about as fair as picks can make it.</p>' : '';
    out = `<div class="grid g2" style="margin-top:12px">${sideBox(M, K, 'You, next season', d.mine)}${sideBox(M, K, `${esc(partner.owner)}, next season`, d.theirs)}</div>
      <div class="callout ${cls}" style="margin-top:10px"><b>${head}</b>${body}</div>
      ${counters ? `<div class="stack" style="margin-top:10px">${counters}</div>` : ''}${noFix}
      <div style="margin-top:8px"><button class="btn btn-ghost" data-copy="${esc(pitch(M, K, d))}">Copy pitch for this deal</button> <button class="btn btn-ghost" data-os-clear>Clear</button></div>`;
  }
  return `${sel}<div class="two" style="margin-top:12px"><div><h3 class="dimh">You send</h3>${assets(M.me, 'give', give)}</div><div><h3 class="dimh">You get from ${esc(partner.owner)}</h3>${assets(partner, 'get', get)}</div></div>${out}`;
}

export function render(M, ctx) {
  const ui = (ctx.ui.offseason ||= { partner: null, give: [], get: [] });
  const { K } = market(M);
  const mine = K.byTeam[M.me.id];
  const deals = (market(M).deals ||= K.search());

  const status = M.deadlinePassed
    ? `<div class="callout warn"><b>The Week ${M.deadlineWeek} trade deadline has passed</b>No more trades count for this season. Trading opens again in Sleeper once the league is renewed for ${K.season + 1}; deals made then are about keepers and draft picks, which is all this page values. The ${K.season + 1} deadline should again be Week ${M.deadlineWeek} if the commissioner keeps the setting: use Trade lab and Trade finder for in-season deals then.</div>`
    : `<div class="callout"><b>The trade window is open until Week ${M.deadlineWeek}${M.deadlineAt ? ` (about ${esc(fmtDayTime(M.deadlineAt))})` : ''}</b>This page values next season only. For deals that help this season, use Trade lab and Trade finder.</div>`;

  const keepTxt = mine.keepers.length
    ? `<p>Your keeper: <b>${esc(M.P(mine.keepers[0].id).n)}</b>, worth ${n1(mine.keepers[0].v)} next season over the first-round pick he replaces.${mine.keepers.length > K.nKeep ? ` You also have ${mine.keepers.slice(K.nKeep).map((k) => `<b>${esc(M.P(k.id).n)}</b> (${n1(k.v)})`).join(', ')}: keeper-quality, but you can keep only ${K.nKeep}, so ${mine.keepers.length - K.nKeep > 1 ? 'they are' : 'he is'} worth nothing to you next season and a lot to a team without a keeper. That is your best trade chip.` : ' Nobody else on your roster beats a first-round pick, so a trade for a better keeper has to cost you that keeper or picks.'}</p>`
    : '<p>Nobody on your roster beats a first-round pick as a keeper, so any keeper-quality player you get is pure gain next season.</p>';

  // The same player to every team without a keeper is one idea: show it for two teams at most.
  const seen = {};
  const shown = deals.filter((x) => {
    const k = x.core.give.join() + '>' + x.core.get.join();
    return (seen[k] = (seen[k] || 0) + 1) <= 2;
  });
  const dealRows = shown.slice(0, 8).map((x) => {
    const f = x.fair;
    const a = x.ask;
    return `<div class="tier-row" style="grid-template-columns:1.4fr 1fr auto;gap:12px;align-items:center">
      <div><span class="dim">${esc(f.partner.owner)}:</span> ${dealLine(M, K, f)}${a && (a.give.join() !== f.give.join() || a.get.join() !== f.get.join()) ? `<div class="dim" style="font-size:12px;margin-top:2px">Opening ask: ${dealLine(M, K, a)} (you ${signed(a.mine.delta)}, them ${signed(a.theirs.delta)})</div>` : ''}</div>
      <div style="font-size:12.5px">You ${num(f.mine.delta)} · them ${num(f.theirs.delta)}<br /><span class="dim">value created ${n1(x.core.surplus)}</span></div>
      <div><button class="btn btn-ghost" data-os-load="${f.partner.id}|${f.give.join(',')}|${f.get.join(',')}">Check</button></div></div>`;
  }).join('');

  const partnerRows = K.partners
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((x) => [
      `<b>${esc(x.t.owner)}</b>`,
      x.keepers[0] ? `${playerName(M, x.keepers[0].id, { status: false })} <span class="dim">${n1(x.keepers[0].v)}</span>` : '<span class="dim">none worth a 1st</span>',
      x.keepers[K.nKeep] ? `${playerName(M, x.keepers[K.nKeep].id, { status: false })} <span class="dim">${n1(x.spare)}</span>` : '<span class="dim">–</span>',
      `${x.picks.length} <span class="dim">(${n1(x.pickTotal)})</span>`,
      x.slot < 1 ? '<span class="chip chip-fa">needs a keeper: buyer</span>' : x.spare > 0 ? '<span class="chip chip-amber">spare keeper: seller</span>' : '<span class="chip">set</span>',
    ]);

  return `
    <div class="page-h"><div><h1>Offseason trades</h1><p>Every deal valued for next season: keeper slots and draft picks, both teams, with a fair counter. In a ${K.nKeep}-keeper league a player is only worth something to a team he would become the keeper for.</p></div></div>
    ${status}
    <div class="stack" style="margin-top:14px">
      ${card('Your keeper slot', `<div style="padding:12px 16px">${keepTxt}</div>`, { cls: 'flush' })}
      ${card('Deals that work for both teams', `<div style="padding:12px 16px">${dealRows || '<p class="empty" style="margin:0">No deal creates enough keeper value for both sides right now. That changes when a team without a keeper wants one of your spares, or a team with two keepers will sell one.</p>'}<p class="source" style="margin-top:8px">One player each way at most, priced with up to two picks a side. "Value created" is what moving the players adds to the two teams' keeper slots together; picks only split it. The fair version splits it about evenly; the opening ask is the most you can take while they still come out ahead. None of this league's 50 player trades has used a pick yet, so expect to explain the idea.</p></div>`, { cls: 'flush', sub: 'Searched across every team' })}
      ${card('Offer checker', checker(M, K, ui), { sub: 'Build or paste in an offer you received: both sides, a verdict, and a counter' })}
      ${card('Who to call', table(['Team', 'Best keeper', 'Spare keeper-quality player', 'Picks (value)', 'Role'], partnerRows), { cls: 'flush', sub: 'Teams without a keeper buy; teams with a spare sell' })}
      <p class="note">Values on the site's 0-100 player scale. A keeper is worth what he should score above a replacement player next season (this season's points per game, times the share players of his position and age kept the next year, E15), less the first-round pick he takes the place of. A pick is what that round returned in this league's 2025 and 2026 drafts, less a fifth for the wait and a tenth for each extra year. Two drafts is a small sample, and a player hurt now is valued on this season's form: check the news before you offer. Ask the commissioner how a keeper is charged if a team trades its first-round pick.</p>
    </div>
    <style>.dimh{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px;font-weight:700}</style>`;
}

export function mount(root, M, ctx) {
  const ui = ctx.ui.offseason;
  root.querySelector('#osPartner')?.addEventListener('change', (e) => {
    ui.partner = e.target.value ? Number(e.target.value) : null;
    ui.give = [];
    ui.get = [];
    ctx.rerender();
  });
  root.querySelectorAll('input[data-os]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const list = ui[cb.dataset.os];
      if (cb.checked) list.push(cb.value);
      else list.splice(list.indexOf(cb.value), 1);
      ctx.rerender();
    }),
  );
  root.querySelectorAll('[data-os-load]').forEach((b) =>
    b.addEventListener('click', () => {
      const [team, give, get] = b.dataset.osLoad.split('|');
      ui.partner = Number(team);
      ui.give = give ? give.split(',') : [];
      ui.get = get ? get.split(',') : [];
      ctx.rerender();
      document.querySelector('#osPartner')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }),
  );
  root.querySelector('[data-os-clear]')?.addEventListener('click', () => {
    ui.give = [];
    ui.get = [];
    ctx.rerender();
  });
}
