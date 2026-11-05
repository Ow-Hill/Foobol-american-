import { esc, n1, signed, fmtDay, fmtDayTime, ago } from '../util.js';
import { card, table, playerName, secondOpinionBtn, statusChip } from '../ui.js';

const tierName = { 1: 'Smash', 2: 'Conditional', 3: 'Pass', 4: 'Free agency' };
const tierHelp = {
  1: 'Clear starter takeover or a dropped top-24 player — spend priority.',
  2: 'Only with real lineup distress, and only if Tier 1 is empty.',
  3: 'Lateral depth or streamers — wait for free agency.',
  4: 'Handcuffs, bye fillers and K/DEF streams — claim Wednesday after waivers clear.',
};

function candRow(M, c, w) {
  const p = c.p;
  const nextTxt = p.avail === 'bye' ? 'bye' : M.isBye(p.team, M.W + 1) ? 'bye' : p.projNext != null ? n1(p.projNext) : '–';
  const g = p.game;
  const opp = p.avail === 'bye' ? 'BYE' : g ? `${g.home ? 'vs' : '@'} ${g.opp}` : '–';
  const clear = c.rec && M.now - c.rec.at < (M.L.settings.waiver_clear_days || 2) * 86400000 ? `<span class="chip chip-amber" title="Dropped ${esc(ago(c.rec.at, M.now))} by ${esc(M.ownerName(c.rec.by))}">in 2-day clear window</span>` : '';
  const why = [];
  if (c.of) why.push(`Handcuff for <b>${esc(M.P(c.of).n)}</b> — next man up on the depth chart`);
  if (c.why?.length) why.push(c.why.join(' · '));
  const usage = [];
  if (p.snpNow != null) usage.push(`${p.snpNow}% snaps${p.snpTrend != null && Math.abs(p.snpTrend) >= 5 ? ` (${p.snpTrend > 0 ? '▲' : '▼'}${Math.abs(Math.round(p.snpTrend))})` : ''}`);
  if (p.ppg3 != null) usage.push(`${n1(p.ppg3)} ppg last 3`);
  if (p.trend?.add) usage.push(`#${p.trend.add.rank} add on Sleeper today`);
  const revisit = c.group === 'cuff' ? 'Revisit if the starter\u2019s injury news changes.' : c.group === 'lottery' ? 'Revisit after the next practice report.' : 'Revisit after two more games of usage data.';
  return `<div class="tier-row">
    <div><span class="chip chip-tier${c.tier}">T${c.tier} · ${tierName[c.tier]}</span></div>
    <div>
      <div>${playerName(M, c.id)} ${clear}</div>
      ${why.length ? `<div class="why">${why.join(' — ')}</div>` : ''}
      <div class="why">${usage.join(' · ')}</div>
      <div class="why">Fills: ${c.impact >= 0.5 ? `your lineup this week (${signed(c.impact)} pts)` : c.impactNext >= 0.5 ? `Week ${M.W + 1} (${signed(c.impactNext)} pts)` : 'depth — no lineup spot right now'}. <span class="dim">${revisit}</span></div>
      <div class="drop">${c.drop.none ? '✓ ' : '↳ '}${esc(c.drop.text)}</div>
    </div>
    <div class="stats"><b>${n1(p.proj)}</b> proj<br />${esc(opp)}<br />next: ${nextTxt}</div>
  </div>`;
}

function group(M, title, sub, list, w, empty) {
  return card(title, list.length ? list.map((c) => candRow(M, c, w)).join('') : `<p class="empty">${empty}</p>`, { cls: 'flush', sub });
}

function streamTable(M, list, pos) {
  return table(
    ['Team', 'This week', 'Opponent (their team total)', 'Next week', 'Lineup gain'],
    list.map((c) => {
      const p = c.p;
      const g = p.game;
      const imp = g?.oppImp != null ? `${g.home ? 'vs' : '@'} ${esc(g.opp)} (${g.oppImp.toFixed(1)})` : g ? `${g.home ? 'vs' : '@'} ${esc(g.opp)}` : '–';
      const good = pos === 'DEF' && g?.oppImp != null && g.oppImp < 20.5;
      const nx = M.isBye(p.team, M.W + 1) ? 'bye' : p.projNext != null ? n1(p.projNext) : '–';
      return [`<b>${esc(p.n)}</b> <span class="tm">${esc(p.team)}</span>`, `<span class="num">${n1(p.proj)}</span>`, `<span ${good ? 'style="color:var(--green)"' : ''}>${imp}${good ? ' ✓ soft' : ''}</span>`, `<span class="num">${nx}</span>`, `<span class="num ${c.impactNext > 1 ? 'pos-num' : ''}">${c.impact >= 0.5 ? 'wk ' + M.W + ' ' + signed(c.impact) : ''}${c.impactNext >= 0.5 ? (c.impact >= 0.5 ? ' · ' : '') + 'wk ' + (M.W + 1) + ' ' + signed(c.impactNext) : ''}${c.impact < 0.5 && c.impactNext < 0.5 ? '–' : ''}</span>`];
    }),
  );
}

export function render(M, ctx) {
  const w = M.waiverPlan();
  const l = M.lineup(M.me);
  const claimNeeds = w.needs.filter((n) => n.claim);
  const spend = w.tier1[0];
  const advice = spend
    ? `<div class="callout good"><b>Spend priority on ${esc(spend.p.n)}</b>He is the only Tier 1 here. A successful claim moves you from #${w.wp} to last, so don't spend it on anything lower.</div>`
    : `<div class="callout"><b>Hold your waiver priority (#${w.wp ?? '–'})</b>Nothing in the pool clears the Tier 1 bar — no starter takeover and no big lineup upgrade. A successful claim sends you to the back of the line, so keep it for a real need.${claimNeeds.length ? ` The one real need is below — and it can wait for free agency.` : ''}</div>`;

  const needRows = w.needs.map((n) => [`<span class="chip">${n.pri}</span>`, `<b>${esc(n.label)}</b>`, `<span class="muted">${esc(n.detail)}</span>`, n.claim ? '<span class="chip chip-amber">Needs a claim</span>' : '<span class="chip chip-fa">Covered</span>']);
  const look = `<div class="grid g3">${w.look
    .map((r) => {
      const base = w.look[0].total;
      return `<div class="kpi"><small>Week ${r.wk}${r.wk === M.W ? ' (now)' : ''}</small><b>${n1(r.total)}</b><span>${r.hit.length ? 'Byes: ' + r.hit.map((id) => esc(M.P(id).n)).join(', ') : 'No starter on bye'}${r.empty.length ? `<br /><b style="color:var(--red)">Empty: ${r.empty.join(', ')}</b>` : r.hit.length ? '<br />Bench covers every slot' : ''}</span></div>`;
    })
    .join('')}</div><p class="source">Best legal lineup projection each week, using Sleeper/RotoWire numbers where posted.</p>`;

  const drops = w.rivalDrops.length
    ? table(['Player', 'Dropped by', 'When', 'Status'], w.rivalDrops.map((c) => [playerName(M, c.id), esc(M.ownerName(c.rec.by)), esc(ago(c.rec.at, M.now)), c.inClear ? `<span class="chip chip-amber">in clear window until ${esc(fmtDayTime(c.clearsAt))}</span>` : '<span class="chip chip-fa">Free to claim</span>']))
    : `<p class="empty">No notable drops by rivals this week.</p>`;

  const prompt = `Use the ff-command-center skill. Run ff-waiver-plan for roster ${M.me.id}, Week ${M.W}. My site flags: ${claimNeeds.map((n) => n.label).join('; ') || 'no urgent claim need'}. Shortlist candidates (${[...w.groups.risers, ...w.groups.lottery, ...w.groups.cuffs].slice(0, 5).map((c) => c.p.n).join(', ')}) and check them against Down Field, Scout-Squad and StatsDeck boards. Output as proven risers / handcuff stashes / lottery tickets.`;

  return `
    <div class="page-h"><div><h1>Waivers</h1><p>Rolling priority, no bidding — a won claim sends you to last, so priority is the currency. Needs first, then tiered candidates with a named drop for each.</p></div><div class="btn-row">${secondOpinionBtn(prompt)}</div></div>
    ${w.locked ? `<div class="callout bad" style="margin-bottom:14px"><b>Claims are locked</b>An IR player no longer has an IR-eligible tag. Move him off IR before claiming anyone — see Injuries.</div>` : ''}
    <div class="grid g2" style="margin-bottom:14px">
      ${advice}
      <div class="callout"><b>Roster ${me_count(M)}/${w.open.max} · ${w.open.ir} IR slot${w.open.ir === 1 ? '' : 's'} open</b>${w.open.spots > 0 ? `You have ${w.open.spots} open roster spot${w.open.spots > 1 ? 's' : ''}, so your next add needs no drop.` : 'Roster is full — every add needs a drop (named below).'} Waivers process next <b>${esc(fmtDay(M.nextWaiverRun()))}</b>; dropped players clear after ${M.L.settings.waiver_clear_days} days.</div>
    </div>
    <div class="stack">
      ${card('Needs, in priority order', w.needs.length ? table(['#', 'Need', 'Detail', ''], needRows) : `<div class="allclear"><span class="dot dot-green"></span> No need — holding is a real option.</div>`, { cls: 'flush', sub: 'Empty slot → starter out → bye → thin spot → insurance' })}
      ${card('Bye look-ahead', look)}
      ${group(M, 'Proven risers', 'Rising scoring or snap share, trending adds, or a lineup upgrade', w.groups.risers, w, 'No unrostered player clears the bar this week.')}
      ${group(M, 'Handcuff stashes', 'The next man up behind your starting backs', w.groups.cuffs, w, 'No unrostered handcuffs for your backs.')}
      ${group(M, 'Lottery tickets', 'Trending, young and ascending, or a talented player stashable on IR', w.groups.lottery, w, 'Nothing interesting beyond the lists above.')}
      <div class="grid g2">
        ${card('Defense streams', streamTable(M, w.streams.DEF, 'DEF'), { cls: 'flush', sub: 'Opponent team total under ~20.5 is a soft spot (this league pays +10 for a shutout, −4 at 35+)' })}
        ${card('Kicker streams', streamTable(M, w.streams.K, 'K'), { cls: 'flush', sub: 'Long-range kickers in domes or calm weather earn more (4/5/6 for 40+/50+/60+)' })}
      </div>
      ${card('Recent drops by rivals', drops, { cls: 'flush', sub: 'Last 7 days — worth a no-cost claim if still unclaimed' })}
      ${card('How the tiers work', Object.keys(tierName).map((k) => `<p style="margin-bottom:6px"><span class="chip chip-tier${k}">T${k} · ${tierName[k]}</span> <span class="muted">${tierHelp[k]}</span></p>`).join('') + `<p class="note">Tier is set from how much the player would raise your best legal lineup (this week and next), plus role changes. These are the site's heuristics, not a model's verdict — a candidate list was triaged by projection and usage, not background-checked player by player. Always check the news before a claim is final.</p>`)}
    </div>`;
}
const me_count = (M) => M.me.players.length;
