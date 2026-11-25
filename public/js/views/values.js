import { esc, n1, n0, signed } from '../util.js';
import { card, table, playerName, statusChip, callBadge, bar, secondOpinionBtn, marketCredit } from '../ui.js';

const POS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function searchable(M) {
  return Object.values(M.snap.players)
    .filter((p) => !M.P(p.id).missing && (M.V.value(p.id) > 0 || p.own != null || (p.proj || {}).pts >= 3))
    .sort((a, b) => M.V.vorp(b.id) - M.V.vorp(a.id));
}

function findByName(M, text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const all = Object.values(M.snap.players);
  return (all.find((p) => p.n.toLowerCase() === t) || all.find((p) => p.n.toLowerCase().includes(t)))?.id || null;
}

function rankingsBody(M, ui) {
  const q = (ui.q || '').toLowerCase();
  const rows = M.V.rows
    .filter((r) => (ui.pos === 'ALL' || r.pos === ui.pos) && M.snap.players[r.pid])
    .filter((r) => (ui.owner === 'ALL' ? true : ui.owner === 'FA' ? M.P(r.pid).own == null : ui.owner === 'MINE' ? M.P(r.pid).own === M.me.id : M.P(r.pid).own != null))
    .filter((r) => !q || M.P(r.pid).n.toLowerCase().includes(q))
    .slice(0, 60);
  const mkt = !!M.V.marketSource();
  const out = table(
    ['#', 'Player', 'Value', ...(mkt ? ['Market'] : []), 'Trend', 'Experts ROS', 'Pos rank', 'PPG est.', 'This week', 'Games left', 'ROS pts', 'ADP'],
    rows.map((r) => {
      const p = M.P(r.pid);
      const s = M.V.signal(r.pid);
      const trend = !s ? '<span class="dim">–</span>' : `<span class="chip ${s.tag === 'Sell' ? 'chip-amber' : s.tag === 'Buy' ? 'chip-fa' : ''}" title="${esc(s.why)}">${s.tag}</span>`;
      const rr = M.V.rosRank(r.pid);
      const mv = M.V.market(r.pid);
      const mcell = mv == null ? '<span class="dim">–</span>' : `<span class="num ${Math.abs(mv - r.value) >= 15 ? (mv > r.value ? 'pos-num' : 'neg-num') : ''}" title="What managers pay for him in real Sleeper trades (0-100). Green: the market pays more than the site's value (a sell); red: less (a buy).">${n1(mv)}</span>`;
      return [`<span class="num">${r.rank}</span>`, playerName(M, r.pid, { owner: true }), `<span class="num"><b>${n1(r.value)}</b></span> ${bar(r.value / 100)}`, ...(mkt ? [mcell] : []), trend, rr ? `<span class="num">${p.pos}${Math.round(rr)}</span>` : '<span class="dim">–</span>', `<span class="num">${p.pos}${r.posRank}</span>`, `<span class="num">${n1(r.ppg)}</span>`, `<span class="num">${p.avail === 'bye' ? 'bye' : n1(p.proj)}</span>`, `<span class="num">${n1(r.games)}</span>`, `<span class="num">${n0(r.ros)}</span>`, `<span class="num dim">${p.adp ? n0(p.adp[0]) : '–'}</span>`];
    }),
    { empty: 'No players match.' },
  );
  return mkt ? out + `<p class="note">${marketCredit(M)}</p>` : out;
}

function compareBody(M, ui) {
  const ids = ui.sel.filter((id) => M.snap.players[id]);
  if (ids.length < 2) return `<p class="empty">Add at least two players above to compare them side by side.</p>`;
  const rowsDef = [
    ['League-adjusted value', (id) => M.V.value(id), (v) => n1(v), 'hi'],
    ['Overall rank', (id) => M.V.rank(id), (v) => '#' + v, 'lo'],
    ['Position rank', (id) => M.V.posRank(id), (v, id) => M.P(id).pos + v, 'lo'],
    ['Points per game (est.)', (id) => M.V.ppg(id), n1, 'hi'],
    ['This week projection', (id) => M.val(id), n1, 'hi'],
    ['Rest-of-season points', (id) => M.V.ros(id), n0, 'hi'],
    ['Games left (byes out)', (id) => M.V.games(M.P(id).team), n1, 'hi'],
    ['Last 3 games avg', (id) => M.P(id).ppg3, n1, 'hi'],
    ['Season avg', (id) => M.P(id).ppg, n1, 'hi'],
    ['Usual range (last 6)', (id) => (M.P(id).floor != null ? (M.P(id).floor + M.P(id).ceil) / 2 : null), (v, id) => `${n1(M.P(id).floor)}–${n1(M.P(id).ceil)}`, null],
    ['Snap share', (id) => M.P(id).snpNow, (v) => v + '%', 'hi'],
  ];
  const best = (def) => {
    const vals = ids.map((id) => def[1](id));
    if (!def[3] || vals.some((v) => v == null)) return null;
    const t = def[3] === 'hi' ? Math.max(...vals) : Math.min(...vals);
    return vals.filter((v) => v === t).length === ids.length ? null : t;
  };
  const trs = rowsDef.map((def) => {
    const b = best(def);
    return `<tr><th scope="row" style="text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">${def[0]}</th>${ids.map((id) => {
      const v = def[1](id);
      return `<td class="num" ${b != null && v === b ? 'style="color:var(--green);font-weight:700"' : ''}>${v == null ? '–' : def[2](v, id)}</td>`;
    }).join('')}</tr>`;
  });
  const extra = [
    ['Opponent', (id) => (M.P(id).avail === 'bye' ? 'BYE' : M.P(id).game ? `${M.P(id).game.home ? 'vs' : '@'} ${M.P(id).game.opp}` : '–')],
    ['Team total (implied)', (id) => (M.P(id).game?.imp != null ? M.P(id).game.imp.toFixed(1) : '–')],
    ['Next bye', (id) => { const wk = Object.keys(M.snap.schedule).map(Number).find((w) => w >= M.W && M.isBye(M.P(id).team, w)); return wk ? 'Week ' + wk : 'none left'; }],
    ['Health', (id) => (M.P(id).eff ? statusChip(M.P(id)) : '<span class="chip chip-fa">healthy</span>')],
    ['Owner', (id) => (M.P(id).own == null ? 'Free agent' : esc(M.ownerName(M.P(id).own)))],
  ].map((d) => `<tr><th scope="row" style="text-align:left;color:var(--muted);font-weight:600">${d[0]}</th>${ids.map((id) => `<td class="num" style="font-family:var(--sans)">${d[1](id)}</td>`).join('')}</tr>`);
  const byValue = [...ids].sort((a, b) => M.V.vorp(b) - M.V.vorp(a));
  const byWeek = [...ids].sort((a, b) => M.val(b) - M.val(a));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${ids.map((id) => `<th class="r" style="text-align:right">${esc(M.P(id).n)} <button class="btn btn-ghost" data-rm="${id}" aria-label="Remove ${esc(M.P(id).n)}">✕</button></th>`).join('')}</tr></thead><tbody>${trs.join('')}${extra.join('')}</tbody></table></div>
  <div class="grid g2" style="margin-top:12px"><div class="callout good"><b>Best for the rest of the season: ${esc(M.P(byValue[0]).n)}</b>Highest league-adjusted value (${n1(M.V.value(byValue[0]))}) after accounting for byes and health.</div><div class="callout"><b>Best this week: ${esc(M.P(byWeek[0]).n)}</b>${n1(M.val(byWeek[0]))} projected${M.P(byWeek[0]).eff ? ` — but tagged ${esc(M.P(byWeek[0]).eff)}` : ''}.</div></div>`;
}

function startSitBody(M, ui) {
  const [a, b] = ui.ss;
  if (!a || !b) {
    const toss = M.swaps().find((s) => s.bench && s.start);
    let pair = toss ? [toss.start, toss.bench] : null;
    if (!pair) {
      const l = M.lineup(M.me);
      const flexy = ['RB', 'WR', 'TE'];
      const weakest = l.starters.filter((id) => id && flexy.includes(M.P(id).pos)).sort((x, y) => M.val(x) - M.val(y))[0];
      const bench = l.bench.filter((id) => flexy.includes(M.P(id).pos) && M.P(id).avail !== 'out').sort((x, y) => M.val(y) - M.val(x))[0];
      if (weakest && bench) pair = [bench, weakest];
    }
    return `<p class="empty">Type two names above. ${pair ? `<button class="btn btn-ghost" data-ss-load="${pair[0]}|${pair[1]}">Try my ${esc(M.P(pair[0]).n)} vs ${esc(M.P(pair[1]).n)} decision</button>` : ''}</p>`;
  }
  const r = M.startSit(a, b);
  const P = M.P(r.pick);
  const O = M.P(r.other);
  const callName = { clear: 'Clear', lean: 'Lean', toss: 'Toss-up' }[r.band];
  const cmp = (p) => `<div class="side"><span class="name">${esc(p.n)}</span><span class="muted">${esc(p.team || '')} · ${p.avail === 'bye' ? 'BYE' : p.game ? (p.game.home ? 'vs ' : '@ ') + esc(p.game.opp) : '–'}</span><span class="big">${n1(M.val(p.id))}</span><span class="dim">${p.floor != null ? `usually ${n1(p.floor)}–${n1(p.ceil)}` : 'no range yet'}</span>${p.eff ? `<span>${statusChip(p)}</span>` : ''}</div>`;
  return `<div class="vs">${cmp(M.P(a))}<div class="mid">VS</div>${cmp(M.P(b))}</div>
  <div class="callout ${r.band === 'clear' ? 'good' : r.band === 'lean' ? '' : 'warn'}" style="margin-top:14px"><b>Start ${esc(P.n)} ${callBadge(callName, r.band)}</b>${r.why.map(esc).join(' · ')}. Gap: ${n1(r.gap)} points this week.</div>
  <p class="note">Rest-of-season value: <b>${esc(P.n)}</b> ${n1(M.V.value(P.id))} vs <b>${esc(O.n)}</b> ${n1(M.V.value(O.id))}. The call uses one projection source plus the league's tiebreak order (health → matchup posture → game environment → kickoff). Check inactives before kickoff if either is questionable.</p>`;
}

// Keepers and draft picks on the same 0-100 scale as player values (values.js keeperValue,
// pickValue): a keeper is worth his expected points above replacement next season (age-adjusted,
// E15) less the first-round pick he takes the place of.
function keeperRows(M, t) {
  return t.players
    .map((id) => ({ id, k: M.V.keeperValue(id) }))
    .filter((r) => r.k && M.snap.players[r.id] && !['K', 'DEF'].includes(M.P(r.id).pos))
    .sort((a, b) => b.k.net - a.k.net);
}
function nearestPlayer(M, value) {
  let best = null;
  for (const r of M.V.rows) if (r.value > 0 && (!best || Math.abs(r.value - value) < Math.abs(best.value - value))) best = r;
  return best;
}
function keepersBody(M) {
  const n = M.L.settings.max_keepers || 1;
  const mine = keeperRows(M, M.me);
  const top = mine[0];
  const advice = !top
    ? '<p class="empty">No keeper candidates found on your roster.</p>'
    : top.k.net > 0
      ? `<div class="callout good"><b>Keep ${esc(M.P(top.id).n)}</b>He should score about ${n0(top.k.points)} points above a replacement player next season, ${n0(top.k.net)} more than the first-round pick he replaces.${mine[1] && mine[1].k.net > 0 ? ` Next best: ${esc(M.P(mine[1].id).n)} (${signed(mine[1].k.net)}).` : ''}</div>`
      : `<div class="callout warn"><b>No keeper beats a first-round pick</b>Your best, ${esc(M.P(top.id).n)}, projects ${n0(-top.k.net)} points below what this league's first-round picks have delivered. Keep him only if keeping costs a later pick than a first.</div>`;
  const myTable = table(
    ['Player', 'Age', 'Next season, pts above replacement', 'Share kept at his age', 'vs a 1st-round pick', 'Keeper value'],
    mine.slice(0, 8).map((r) => {
      const p = M.P(r.id);
      return [playerName(M, r.id), `<span class="num">${p.age ?? '–'}</span>`, `<span class="num">${n0(r.k.points)}</span>`, `<span class="num">${Math.round(r.k.share * 100)}%</span>`, `<span class="num ${r.k.net >= 0 ? 'pos-num' : 'neg-num'}">${signed(r.k.net)}</span>`, `<span class="num"><b>${n1(r.k.value)}</b></span>`];
    }),
    { empty: 'No candidates.' },
  );
  const picks = M.picksOwned(M.me.id);
  const allPicks = [...picks.own.map((p) => ({ ...p, how: 'own' })), ...picks.acquired.map((p) => ({ ...p, how: `from ${M.ownerName(p.from)}` }))].sort((a, b) => a.season - b.season || a.round - b.round);
  const pickTable = table(
    ['Pick', 'Value', 'About the same as', ''],
    allPicks.map((pk) => {
      const v = M.V.pickValue(pk.round);
      const near = v > 0 ? nearestPlayer(M, v) : null;
      return [`${pk.season} round ${pk.round}`, `<span class="num"><b>${n1(v)}</b></span>`, near ? playerName(M, near.pid, { owner: true }) : '<span class="dim">–</span>', `<span class="dim">${esc(pk.how)}</span>`];
    }),
    { empty: 'You have no picks in future drafts.' },
  ) + (picks.sold.length ? `<p class="note">Traded away: ${picks.sold.map((p) => `${p.season} R${p.round} to ${esc(M.ownerName(p.to))}`).join(', ')}.</p>` : '');
  const rivals = M.teams.filter((t) => t.id !== M.me.id).map((t) => ({ t, r: keeperRows(M, t)[0] })).filter((x) => x.r).sort((a, b) => b.r.k.net - a.r.k.net);
  const rivalTable = table(
    ['Team', 'Best keeper', 'vs a 1st', 'Keeper value'],
    rivals.map(({ t, r }) => [esc(t.owner), playerName(M, r.id), `<span class="num ${r.k.net >= 0 ? 'pos-num' : 'neg-num'}">${signed(r.k.net)}</span>`, `<span class="num">${n1(r.k.value)}</span>`]),
  );
  return `<div class="stack">${card(`Your keeper (${n} per team)`, advice + myTable + '<p class="note">Next season = this season\'s points per game x the share players of his position and age kept the next year (this league\'s 2022-25 history, E15), above replacement, over a regular season. A first-round pick is what this league\'s first-rounders delivered. Keeper value is on the same 0-100 scale as player values.</p>', { cls: 'flush', sub: 'Who is worth more than the first-round pick he replaces' })}
  ${card('Your draft picks', pickTable + '<p class="note">Pick value = what this league\'s picks in that round delivered the next season, less a fifth for the wait, on the player value scale. Use it to price a pick in a trade.</p>', { cls: 'flush', sub: 'Same 0-100 scale as players' })}
  ${card('Rival keepers', rivalTable + '<p class="note">A team whose best keeper is far below a first-round pick may pay for one of yours.</p>', { cls: 'flush', sub: 'Each team\'s best keeper candidate' })}</div>`;
}

export function render(M, ctx) {
  const ui = (ctx.ui.values ||= { tab: 'rank', pos: 'ALL', owner: 'ALL', q: '', sel: [], ss: [null, null] });
  const opts = searchable(M).slice(0, 400).map((p) => `<option value="${esc(p.n)}"></option>`).join('');
  const tabs = [['rank', 'Rankings'], ['compare', 'Compare players'], ['ss', 'Start / Sit'], ['keep', 'Keepers & picks']];
  const intro = `<details class="how"><summary>How league-adjusted value works</summary><ul><li><b>Points per game</b> blends this week's projection (35%), last 3 games (35%) and the season average (30%), scored with <b>your league's exact scoring</b>.</li><li><b>Games left</b> counts every remaining week through the title game, minus byes; playoff weeks count 60% since only some teams get there.</li><li><b>Health</b> discounts IR (50%), Out (85%), Doubtful (92%) and Questionable (97%) — a heuristic, not a medical estimate.</li><li><b>Replacement level</b> is the best player left after all 10 teams fill QB, 2 RB, 2 WR, TE, 2 FLEX, K and DEF: QB ${n1(M.V.rep.QB)}, RB ${n1(M.V.rep.RB)}, WR ${n1(M.V.rep.WR)}, TE ${n1(M.V.rep.TE)} points a game. Value is points above that line, scaled so the top player is 100.</li></ul></details>`;
  const head = `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'active' : ''}" data-vtab="${k}">${l}</button>`).join('')}</div><datalist id="plist">${opts}</datalist>`;
  let body = '';
  if (ui.tab === 'rank') {
    body = card('League-adjusted rankings', `<div class="btn-row" style="margin-bottom:10px">${POS.map((p) => `<button class="tab ${ui.pos === p ? 'active' : ''}" data-vpos="${p}">${p}</button>`).join('')}<span style="flex:1"></span>${[['ALL', 'Everyone'], ['MINE', 'Mine'], ['FA', 'Free agents'], ['ROSTERED', 'Rostered']].map(([k, l]) => `<button class="tab ${ui.owner === k ? 'active' : ''}" data-vown="${k}">${l}</button>`).join('')}<input id="vq" type="search" placeholder="Search player…" value="${esc(ui.q)}" style="background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:6px 10px;color:var(--text);min-width:170px" aria-label="Search players" /></div><div id="rk">${rankingsBody(M, ui)}</div>${intro}`, { cls: 'flush', sub: 'Value = points above replacement over the rest of the season, adjusted for byes and health' });
  } else if (ui.tab === 'compare') {
    body = card('Compare players', `<div class="btn-row" style="margin-bottom:12px"><input id="cmpIn" list="plist" placeholder="Type a player and press Enter…" style="background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:7px 10px;color:var(--text);min-width:260px" aria-label="Add player to compare" /><button class="btn" id="cmpAdd">Add</button>${ui.sel.length ? '<button class="btn btn-ghost" id="cmpClear">Clear</button>' : ''}<button class="btn btn-ghost" id="cmpMine">Add my QB / FLEX options</button></div>${compareBody(M, ui)}`, { cls: '', sub: 'Up to 4 players, best number in each row highlighted' });
  } else if (ui.tab === 'keep') {
    body = keepersBody(M);
  } else {
    body = card('Start / sit', `<div class="two" style="margin-bottom:12px"><label class="muted">Player A<br /><input id="ssA" list="plist" value="${ui.ss[0] ? esc(M.P(ui.ss[0]).n) : ''}" placeholder="Type a name…" style="margin-top:4px;width:100%;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:7px 10px;color:var(--text)" /></label><label class="muted">Player B<br /><input id="ssB" list="plist" value="${ui.ss[1] ? esc(M.P(ui.ss[1]).n) : ''}" placeholder="Type a name…" style="margin-top:4px;width:100%;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:7px 10px;color:var(--text)" /></label></div>${startSitBody(M, ui)}`, { sub: 'Works for any two players — yours, a free agent, or someone you are trading for' });
  }
  const prompt = `Use the ff-command-center skill. Run ff-lineup-call for Week ${M.W}: compare ${ui.ss[0] ? M.P(ui.ss[0]).n : 'my flex options'}${ui.ss[1] ? ' and ' + M.P(ui.ss[1]).n : ''} using Down Field, StatsDeck and Scout-Squad.`;
  return `<div class="page-h"><div><h1>Player values & start/sit</h1><p>Rank and compare players on what they're worth in <b>this</b> league — your scoring, your lineup slots, your replacement level — then settle any start/sit.</p></div><div class="btn-row">${secondOpinionBtn(prompt)}</div></div>${head}${body}`;
}

export function mount(root, M, ctx) {
  const ui = ctx.ui.values;
  root.querySelectorAll('[data-vtab]').forEach((b) => b.addEventListener('click', () => ((ui.tab = b.dataset.vtab), ctx.rerender())));
  root.querySelectorAll('[data-vpos]').forEach((b) => b.addEventListener('click', () => ((ui.pos = b.dataset.vpos), ctx.rerender())));
  root.querySelectorAll('[data-vown]').forEach((b) => b.addEventListener('click', () => ((ui.owner = b.dataset.vown), ctx.rerender())));
  const q = root.querySelector('#vq');
  q?.addEventListener('input', () => {
    ui.q = q.value;
    root.querySelector('#rk').innerHTML = rankingsBody(M, ui);
  });
  const add = () => {
    const el = root.querySelector('#cmpIn');
    const id = findByName(M, el.value);
    if (id && !ui.sel.includes(id) && ui.sel.length < 4) ui.sel.push(id);
    ctx.rerender();
  };
  root.querySelector('#cmpAdd')?.addEventListener('click', add);
  root.querySelector('#cmpIn')?.addEventListener('keydown', (e) => e.key === 'Enter' && add());
  root.querySelector('#cmpClear')?.addEventListener('click', () => ((ui.sel = []), ctx.rerender()));
  root.querySelector('#cmpMine')?.addEventListener('click', () => {
    const l = M.lineup(M.me);
    ui.sel = [...l.active].filter((id) => ['QB', 'RB', 'WR', 'TE'].includes(M.P(id).pos)).sort((a, b) => M.V.vorp(b) - M.V.vorp(a)).slice(3, 7);
    ctx.rerender();
  });
  root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => ((ui.sel = ui.sel.filter((x) => x !== b.dataset.rm)), ctx.rerender())));
  const ss = () => {
    ui.ss = [findByName(M, root.querySelector('#ssA').value), findByName(M, root.querySelector('#ssB').value)];
    ctx.rerender();
  };
  root.querySelector('#ssA')?.addEventListener('change', ss);
  root.querySelector('#ssB')?.addEventListener('change', ss);
  root.querySelector('[data-ss-load]')?.addEventListener('click', (e) => {
    ui.ss = e.currentTarget.dataset.ssLoad.split('|');
    ctx.rerender();
  });
}
