import { esc, n1, n0, pct, ord, ago, fmtKick, fmtDay, fmtDayTime, signed } from '../util.js';
import { card, problemList, playerName } from '../ui.js';
import { buildFeed } from '../newsfeed.js';
import { feedItem } from './news.js';
import { buildDecisions, PRIORITY_LABEL } from '../decision.js';
import { playerNewsFor } from '../playernews.js';

const KIND_LABEL = { lineup: 'Lineup', injury: 'Injury', waiver: 'Waiver', trade: 'Trade', monitor: 'Monitor' };

function decisionEvidence(M, d) {
  return d.evidence
    .slice(0, 2)
    .map((e) => {
      const txt = e.text.length > 120 ? e.text.slice(0, 117) + '…' : e.text;
      const label = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(txt)}</a>` : esc(txt);
      return `<div class="dec-ev"><span class="chip">${esc(e.src || 'Report')}</span>${label}${e.time ? `<span class="dim">${esc(ago(e.time, M.now))}</span>` : ''}</div>`;
    })
    .join('');
}

function decisionCard(M, brief) {
  const pn = M.snap.playerNews || {};
  const banner = pn.disabled
    ? '<div class="callout" style="margin-bottom:10px">Headline search is off — this brief uses RotoWire notes and ESPN articles only.</div>'
    : pn.degraded
      ? '<div class="callout warn" style="margin-bottom:10px">Some headlines could not be refreshed; cached evidence is shown and confidence is lower.</div>'
      : '';
  if (!brief.decisions.length) return card('Decision brief', `${banner}<p class="empty">No decisions this week — the roster is legal and healthy.</p>`);
  const item = (d) => `<li class="dec dec-${d.priority}">
    <div class="dec-meta"><span class="chip chip-${d.priority === 'act' ? 'red' : d.priority === 'this-week' ? 'amber' : 'blue'}">${PRIORITY_LABEL[d.priority]}</span><span class="chip">${KIND_LABEL[d.kind] || d.kind}</span><span class="dec-conf" title="${esc(d.guardrails.join(' '))}">${d.confidence}% confident</span></div>
    <div class="dec-title">${esc(d.title)}</div>
    <p class="dec-verdict">${esc(d.verdict)}</p>
    ${d.because.length ? `<ul class="dec-because">${d.because.slice(0, 2).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${decisionEvidence(M, d)}
    <div class="dec-foot"><span class="dim">${esc(d.risk)}</span><button class="btn btn-ghost btn-xs" data-go="${esc(d.action.route)}">${esc(d.action.label)}</button></div>
  </li>`;
  const head = brief.decisions.slice(0, 3);
  const rest = brief.decisions.slice(3);
  return card(
    'Decision brief',
    `${banner}<ul class="dec-list">${head.map(item).join('')}</ul>${rest.length ? `<details class="dec-more"><summary>${rest.length} more decision${rest.length > 1 ? 's' : ''}</summary><ul class="dec-list">${rest.map(item).join('')}</ul></details>` : ''}`,
    { sub: `${brief.summary.act} act · ${brief.summary.thisWeek} this week · ${brief.summary.watch} watch · evidence, not commands`, right: `<button class="btn btn-ghost" data-go="news">All evidence</button>` }
  );
}

export function standing(M, t) {
  const order = [...M.teams].sort((a, b) => b.w - a.w || b.pf - a.pf);
  return order.findIndex((x) => x.id === t.id) + 1;
}

export function render(M, ctx) {
  const { me, opp, snap } = M;
  const l = M.lineup(me);
  const probs = M.problems();
  const brief = buildDecisions(M, playerNewsFor(M));
  const o = M.odds()[me.id];
  const pfRank = [...M.teams].sort((a, b) => b.pf - a.pf).findIndex((t) => t.id === me.id) + 1;
  const left = me.pp - me.pf;
  const feed = buildFeed(M);
  const mineNews = feed.filter((i) => i.rel === 'mine' && i.kind !== 'wire').slice(0, 5);
  const wire = M.wireItems().slice(0, 6);
  const crit = probs.filter((p) => p.sev === 'critical').length;
  const wp = me.wp;
  const fixed = l.opt.total - l.curTotal;

  const postureText = {
    floor: `You're the projected favorite by ${n1(M.margin)} — lean on safer, higher-floor players this week.`,
    ceiling: `You're the projected underdog by ${n1(-M.margin)} — lean toward higher-ceiling players.`,
    expected: `Close matchup (${signed(M.margin)} for you) — start the best expected points and let the tiebreakers decide.`,
  }[M.posture];

  const hero = opp
    ? `<div class="vs">
        <div class="side"><span class="name">${esc(me.name.trim())}</span><span class="muted">${me.w}-${me.l} · ${esc(me.owner)}</span><span class="big">${n1(M.myOpt)}</span><span class="dim">best legal lineup</span></div>
        <div class="mid">VS</div>
        <div class="side r"><span class="name">${esc(opp.name.trim())}</span><span class="muted">${opp.w}-${opp.l} · ${esc(opp.owner)}</span><span class="big">${n1(M.oppOpt)}</span><span class="dim">their best legal lineup</span></div>
      </div>
      <div class="posture"><b>Risk posture:</b> ${postureText}</div>
      ${fixed > 0.5 ? `<p class="note"><b>Your lineup as set right now projects ${n1(l.curTotal)}</b> — ${n1(fixed)} points below your best legal lineup.</p>` : `<p class="note">Your lineup as set matches the best legal lineup.</p>`}`
    : `<p class="empty">No matchup found for this week.</p>`;

  const kpis = `<div class="kpis">
    <div class="kpi"><small>Record</small><b>${me.w}-${me.l}${me.t ? '-' + me.t : ''}</b><span>${ord(standing(M, me))} of ${M.teams.length}</span></div>
    <div class="kpi"><small>Points for</small><b>${n0(me.pf)}</b><span>${ord(pfRank)} in the league</span></div>
    <div class="kpi"><small>Left on bench</small><b>${n0(left)}</b><span>${n1((me.pf / me.pp) * 100)}% efficient</span></div>
    <div class="kpi"><small>Playoff odds</small><b>${pct(o.playoff)}</b><span>bye ${pct(o.bye)} · title ${pct(o.title)}</span></div>
    <div class="kpi"><small>Waiver priority</small><b>#${wp ?? '–'}</b><span>rolling · a won claim sends you last</span></div>
    <div class="kpi"><small>Roster</small><b>${me.players.length}/${M.maxRoster}</b><span>${M.irSlots - l.ir.length} IR slot${M.irSlots - l.ir.length === 1 ? '' : 's'} open</span></div>
  </div>
  <p class="source">Playoff odds come from this site's own simulation of the remaining schedule — see Season for how it works and its limits.</p>`;

  const dates = [];
  const next = l.active.map((id) => M.P(id)).filter((p) => p.game && p.game.state === 'pre').sort((a, b) => new Date(a.game.date) - new Date(b.game.date))[0];
  if (next) dates.push([`Next kickoff for your players`, `${fmtKick(next.game.date)} · ${esc(next.team)} ${next.game.home ? 'vs' : '@'} ${esc(next.game.opp)}`]);
  dates.push(['Waivers process', `Tuesday, ${fmtDay(M.nextWaiverRun())} (2-day clear, rolling priority)`]);
  if (M.deadlineAt) dates.push([`Trade deadline (Week ${M.deadlineWeek})`, M.deadlinePassed ? 'Passed — offseason / keeper planning only' : `Locks around ${fmtDayTime(M.deadlineAt)} — get deals accepted by ${fmtDayTime(M.acceptBy)} (1-day review)`]);
  dates.push([`Regular season ends`, `Week ${snap.league.settings.playoff_week_start - 1}; playoffs start Week ${snap.league.settings.playoff_week_start} (top ${snap.league.settings.playoff_teams}, top 2 get byes)`]);

  return `
    <div class="page-h"><div><h1>Briefing</h1><p>${esc(me.name.trim())} · Week ${M.W} · ${crit ? `<b style="color:var(--red)">${crit} thing${crit > 1 ? 's need' : ' needs'} fixing before kickoff</b>` : 'nothing urgent'}</p></div></div>
    <div class="advice-banner">ⓘ <span>This site gives advice only — it can't set lineups, place claims or send trades. Make every move in the Sleeper app.</span></div>
    <div class="grid g-main">
      <div class="stack">
        ${decisionCard(M, brief)}
        ${card('Needs attention', problemList(M, probs), { cls: crit ? 'hero' : '', right: `<button class="btn btn-ghost" data-go="lineup">Open lineup</button>` })}
        ${card('This week\u2019s matchup', hero, { cls: 'hero', sub: `Week ${M.W} projections: Sleeper/RotoWire stat lines scored with your league's exact rules` })}
        ${card('Season at a glance', kpis)}
      </div>
      <div class="stack">
        ${card('News on your roster', mineNews.length ? `<ul class="feed">${mineNews.map((i) => feedItem(M, i)).join('')}</ul>` : '<p class="empty">No fresh news on your players.</p>', { cls: 'flush', right: `<button class="btn btn-ghost" data-go="news">All news</button>` })}
        ${card('League wire', wire.length ? `<ul class="feed">${wire.map((w) => `<li class="${w.mine ? 'mine' : ''}"><div class="meta"><span class="chip">${w.kind === 'trade' ? 'Trade' : w.kind === 'add' ? 'Add' : 'Drop'}</span><span>${esc(ago(w.time, M.now))}</span></div><div class="title" style="font-weight:550">${esc(w.text)}</div></li>`).join('')}</ul>` : '<p class="empty">No recent transactions.</p>', { cls: 'flush' })}
        ${card('Key dates', `<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px">${dates.map((d) => `<li><small class="dim" style="text-transform:uppercase;letter-spacing:.08em;font-size:10.5px">${d[0]}</small><div>${d[1]}</div></li>`).join('')}</ul>`)}
      </div>
    </div>`;
}
