import { esc, n1, n0, pct, ord, signed, fmtDay, fmtDayTime, copyText } from '../util.js';
import { card, table, playerName, bar } from '../ui.js';

function verdictFor(M, o) {
  if (o.playoff >= 0.6) return ['good', 'Contending — buy', 'Spend depth and picks to turn bench pieces into starters. Check Weeks 15–17 slates before you pay.'];
  if (o.playoff < 0.3 && M.W >= 10) return ['bad', 'Playoff odds are low — consider selling', 'Move veterans with good Week 15–17 value for picks and keepers.'];
  if (o.playoff < 0.3) return ['warn', 'Long shot — decide by Week 10', 'Odds under ~30% by Week 10 is the signal to sell for picks.'];
  return ['warn', 'On the bubble', 'Win-now moves that cost little (waivers, streamers, small 2-for-1s) beat big swings.'];
}

function reviewBlock(M) {
  const wk = M.W - 1;
  if (wk < 1) return '<p class="empty">No completed week yet.</p>';
  const games = M.reviewWeek(wk);
  const rows = games.map((pair) => {
    const [a, b] = pair;
    const mine = a.rid === M.me.id || b.rid === M.me.id;
    const aw = a.pts > b.pts;
    const bw = b.pts > a.pts;
    const left = (x) => Math.max(0, x.opt - x.pts);
    return `<div class="score-row ${mine ? 'me' : ''}"><div class="t ${aw ? 'win' : ''}">${esc(a.team.owner)}<div class="dim" style="font-weight:400;font-size:12px">left ${n0(left(a))} on bench</div></div><div class="pts"><b class="${aw ? 'win' : ''}">${n1(a.pts)}</b> <span class="dim">–</span> <b class="${bw ? 'win' : ''}">${n1(b.pts)}</b></div><div class="t r ${bw ? 'win' : ''}">${esc(b.team.owner)}<div class="dim" style="font-weight:400;font-size:12px">left ${n0(left(b))} on bench</div></div></div>`;
  });
  return rows.join('');
}

function effChart(M) {
  const rows = M.efficiency(M.me);
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.opt), 1);
  const cols = rows.map((r) => {
    const H = 100;
    const act = (r.pts / max) * H;
    const gap = Math.max(0, ((r.opt - r.pts) / max) * H);
    return `<div class="eff-col" title="Week ${r.wk}: scored ${n1(r.pts)}, best possible ${n1(r.opt)}"><div class="stack-bar" style="height:${act + gap}px"><div class="opt" style="height:${gap}px"></div><div class="act" style="height:${act}px"></div></div><small>${r.wk}</small></div>`;
  });
  const lost = rows.reduce((s, r) => s + Math.max(0, r.opt - r.pts), 0);
  return `<div class="eff-chart">${cols.join('')}</div><p class="note"><b>${n0(lost)}</b> points left on the bench across ${rows.length} weeks (<span style="color:var(--green)">green</span> = scored, <span style="color:#6f8fb0">blue</span> = missed). Biggest miss: Week ${rows.slice().sort((a, b) => b.opt - b.pts - (a.opt - a.pts))[0].wk}.</p>`;
}

// How much better a free-agent kicker or defense must project over Weeks 15-17 combined before
// it is worth a roster spot now. A judgment, not a fitted number.
const STASH_GAIN = 4;

function playoffSlate(M) {
  const weeks = (M.snap.meta.playoffWeeks || []).filter((wk) => wk >= M.W);
  if (!weeks.length) return '<p class="empty">The fantasy playoffs have started — use the Lineup tab week by week.</p>';
  const V = M.V;
  const plans = Object.fromEntries(weeks.map((wk) => [wk, V.weekPlan(M.me, wk)]));
  const startsIn = (id) => weeks.filter((wk) => plans[wk].slots.some((s) => s.pid === id));
  const l = M.lineup(M.me);
  const core = [...new Set([...weeks.flatMap((wk) => plans[wk].slots.map((s) => s.pid)), ...l.opt.slots.map((s) => s.pid)].filter(Boolean))];
  const cell = (id, wk) => {
    const p = M.P(id);
    if (M.isBye(p.team, wk)) return '<span class="chip chip-red">BYE</span>';
    const g = M.gameFor(p.team, wk);
    const opp = g ? `${g.home ? 'vs' : '@'} ${esc(g.opp)}` : '–';
    const starts = plans[wk].slots.some((s) => s.pid === id);
    return `<span class="num ${starts ? '' : 'dim'}">${n1(V.weekPts(id, wk))}</span>${starts ? '' : ' <span class="dim">bench</span>'}<br /><span class="dim" style="white-space:nowrap">${opp}</span>`;
  };
  const rows = core
    .sort((a, b) => startsIn(b).length - startsIn(a).length || V.ppg(b) - V.ppg(a))
    .map((id) => [playerName(M, id, { status: true }), ...weeks.map((wk) => cell(id, wk)), `<span class="num"><b>${n1(weeks.reduce((t, wk) => t + V.weekPts(id, wk), 0))}</b></span>`, `<span class="num">${n1(V.value(id))}</span>`]);
  rows.push(['<b>Best lineup</b>', ...weeks.map((wk) => {
    const empty = plans[wk].slots.filter((s) => !s.pid).map((s) => s.slot);
    return `<b class="num">${n1(plans[wk].total)}</b>${empty.length ? ` <span class="chip chip-red">empty ${esc(empty.join(', '))}</span>` : ''}`;
  }), `<b class="num">${n1(weeks.reduce((t, wk) => t + plans[wk].total, 0))}</b>`, '']);
  const benchHelp = l.bench.filter((id) => startsIn(id).length);
  const anyBye = core.some((id) => weeks.some((wk) => M.isBye(M.P(id).team, wk)));
  const notes = [
    anyBye ? '<b style="color:var(--red)">A key player has a bye in the fantasy playoffs — plan his replacement now.</b>' : `<b>No key player has a bye in Weeks ${weeks[0]}–${weeks[weeks.length - 1]}.</b>`,
    benchHelp.length ? `Bench players who start a playoff week: ${benchHelp.map((id) => `<b>${esc(M.P(id).n)}</b> (Week ${startsIn(id).join(', ')})`).join(', ')}. Don't drop them for a one-week stream.` : '',
    'Skill players use points per game and health (the measured rest-of-season estimate); kickers and defenses use Sleeper\'s projection for that week, since their matchup matters most.',
  ].filter(Boolean);
  notes.push('<b>Playoff pts</b> adds his weeks above; <b>Value</b> is the rest-of-season player value used on every page (Values, Waivers, drops, trades).');
  return `${table(['Player', ...weeks.map((w) => 'Wk ' + w), 'Playoff pts', 'Value'], rows)}<p class="note">${notes.join(' ')}</p>`;
}

function stashPlan(M) {
  const weeks = (M.snap.meta.playoffWeeks || []).filter((wk) => wk >= M.W);
  if (!weeks.length) return '';
  const V = M.V;
  const tot = (id) => weeks.reduce((s, wk) => s + V.weekPts(id, wk), 0);
  const l = M.lineup(M.me);
  const out = [];
  for (const pos of ['DEF', 'K']) {
    const mineIds = l.active.filter((id) => M.P(id).pos === pos);
    // best of mine each week (you can rotate your own)
    const mineWk = weeks.map((wk) => Math.max(0, ...mineIds.map((id) => V.weekPts(id, wk))));
    const mineSum = mineWk.reduce((a, b) => a + b, 0);
    const fa = Object.values(M.snap.players).filter((p) => p.own == null && p.pos === pos && p.team).map((p) => p.id);
    const best = fa.map((id) => ({ id, sum: tot(id) })).sort((a, b) => b.sum - a.sum).slice(0, 3);
    const rows = [[`<b>Yours</b> <span class="dim">${mineIds.map((id) => esc(M.P(id).n)).join(', ') || 'none'}</span>`, ...mineWk.map((v) => `<span class="num">${n1(v)}</span>`), `<b class="num">${n1(mineSum)}</b>`]];
    for (const b of best) {
      const p = M.P(b.id);
      rows.push([`${esc(p.n)} <span class="tm">${esc(p.team || '')}</span>`, ...weeks.map((wk) => {
        const g = M.gameFor(p.team, wk);
        return M.isBye(p.team, wk) ? '<span class="chip chip-red">BYE</span>' : `<span class="num">${n1(V.weekPts(b.id, wk))}</span> <span class="dim">${g ? (g.home ? 'vs ' : '@ ') + esc(g.opp) : ''}</span>`;
      }), `<b class="num">${n1(b.sum)}</b> <span class="${b.sum - mineSum >= 0 ? 'pos-num' : 'neg-num'}">${signed(b.sum - mineSum)}</span>`]);
    }
    const top = best[0];
    const advice = top && top.sum - mineSum >= STASH_GAIN
      ? `<div class="callout good"><b>Stash ${esc(M.P(top.id).n)} for the playoffs</b>Projects ${n1(top.sum - mineSum)} more over Weeks ${weeks[0]}–${weeks[weeks.length - 1]} than your ${pos === 'DEF' ? 'defense' : 'kicker'}. ${(() => { const d = M.dropFor({ id: top.id, p: M.P(top.id) }); return d.none && /open roster spot/.test(d.text) ? 'You have an open spot, so add him now.' : d.pid ? `Add him before rivals do (${esc(d.text)}).` : esc(d.text) + '.'; })()}</div>`
      : `<div class="callout"><b>No ${pos === 'DEF' ? 'defense' : 'kicker'} stash needed</b>No free agent projects ${STASH_GAIN}+ more than yours over Weeks ${weeks[0]}–${weeks[weeks.length - 1]}. Check again after next week's games.</div>`;
    out.push(`<h3 style="margin:10px 0 6px">${pos === 'DEF' ? 'Defense' : 'Kicker'}</h3>${advice}${table(['', ...weeks.map((w) => 'Wk ' + w), `Wk ${weeks[0]}–${weeks[weeks.length - 1]}`], rows)}`);
  }
  return out.join('') + `<p class="note">Sleeper's week-by-week projections. Lines for those weeks aren't posted yet, so they move; the ${STASH_GAIN}-point bar is a judgment, not a fitted number.</p>`;
}

function icsFor(M) {
  const base = new Date(M.now);
  const dayIdx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][M.L.settings.waiver_day_of_week ?? 2];
  const items = [
    ['Roster Monitor: waiver preview', wDay, 19, 0, 'Open the Waivers tab — what to claim before waivers process.'],
    ['Roster Monitor: weekly recap', 'Tue', 9, 0, 'Open the Season tab — weekly review and lineup-efficiency audit.'],
    ['Roster Monitor: trade ideas', 'Wed', 19, 0, 'Open the Trades tab — ideas for your weakest starting spot.', true],
    ['Roster Monitor: Thursday lineup check', 'Thu', 17, 0, 'Open the Lineup tab before Thursday night football — only change what needs changing.'],
    ['Roster Monitor: Sunday lineup check', 'Sun', 11, 0, 'Open the Lineup tab.'],
    ['Roster Monitor: injury watch', 'Sun', 11, 45, 'Open the Injuries tab — inactives come ~90 minutes before kickoff.'],
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const end = new Date(base);
  end.setMonth(0, 4);
  end.setFullYear(base.getFullYear() + 1);
  const until = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T000000`;
  const dlUntil = M.deadlineAt ? (() => { const d = new Date(M.deadlineAt); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T000000Z`; })() : until;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roster Monitor//EN', 'CALSCALE:GREGORIAN'];
  items.forEach(([title, day, h, m, desc, deadlineBound], i) => {
    const d = new Date(base);
    const add = (dayIdx[day] - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + add);
    lines.push('BEGIN:VEVENT', `UID:rm-${i}-${M.snap.meta.leagueId}@roster-monitor`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${fmt(d)}T${pad(h)}${pad(m)}00`, `DTEND:${fmt(d)}T${pad(h)}${pad(m + 15 > 59 ? 59 : m + 15)}00`, `RRULE:FREQ=WEEKLY;UNTIL=${deadlineBound ? dlUntil.replace(/Z$/, '') : until}`, `SUMMARY:${title}`, `DESCRIPTION:${desc} ${location.origin}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function render(M, ctx) {
  const sim = M.sim();
  const me = M.me;
  const o = sim.res[me.id];
  const v = verdictFor(M, o);
  const order = [...M.teams].sort((a, b) => sim.res[b.id].playoff - sim.res[a.id].playoff || sim.res[b.id].title - sim.res[a.id].title);
  const oddsRows = order.map((t) => {
    const r = sim.res[t.id];
    return [`<b ${t.id === me.id ? 'style="color:var(--green)"' : ''}>${esc(t.owner)}</b> <span class="dim">${esc(t.name.trim())}</span>`, `<span class="num">${t.w}-${t.l}</span>`, `<span class="num">${n0(t.pf)}</span>`, `<span class="num">${pct(r.playoff)}</span> ${bar(r.playoff)}`, `<span class="num">${pct(r.bye)}</span>`, `<span class="num">${pct(r.title)}</span>`, `<span class="num">${n1(r.wins)}</span>`];
  });

  const stand = [...M.teams].sort((a, b) => b.w - a.w || b.pf - a.pf).map((t, i) => [`<span class="num">${i + 1}</span>`, `<b ${t.id === me.id ? 'style="color:var(--green)"' : ''}>${esc(t.owner)}</b>`, `<span class="num">${t.w}-${t.l}</span>`, `<span class="num">${n1(t.pf)}</span>`, `<span class="num">${n1(t.pa)}</span>`, `<span class="num">${n1(t.pp)}</span>`, `<span class="num">${n1((t.pf / t.pp) * 100)}%</span>`, `<span class="num">${n0(t.pp - t.pf)}</span>`]);

  const lastReg = M.L.settings.playoff_week_start - 1;
  const weeksLeft = lastReg - M.W + 1;
  const deadlineList = [
    `<b>Odds check:</b> ${esc(v[1].toLowerCase())}. ${esc(v[2])}`,
    `<b>Schedule check:</b> see the playoff slate below — sell bad Weeks 15–17 slates, buy good ones.`,
    `<b>Consolidate:</b> run the Trade lab on each 2-for-1 that turns bench depth into a starter, and move the spare QB.`,
    M.deadlineAt && !M.deadlinePassed ? `<b>Timing:</b> offers need to be accepted by about ${esc(fmtDayTime(M.acceptBy))}, the end of the deadline week's last game (confirm in Sleeper).` : '<b>Timing:</b> the deadline has passed.',
  ];

  const l = M.lineup(me);
  const gibbsCuff = l.active.filter((id) => M.P(id).pos === 'RB' && (M.P(id).ppg || 0) >= 12).map((id) => ({ id, cuffs: M.nextManUp(id) }));
  const prepList = [
    `<b>Weeks 12–14:</b> trim depth that can't help in the playoffs; keep handcuffs for your starting backs${gibbsCuff.length ? ` (${gibbsCuff.map((g) => `${esc(M.P(g.id).n)}: ${g.cuffs[0] ? esc(g.cuffs[0].n) + ' — ' + esc(g.cuffs[0].ownerLabel) : 'no clear backup'}`).join('; ')})` : ''}.`,
    `<b>Defense:</b> pre-add DSTs with soft Week 15–17 slates before rivals do. This league pays +10 for a shutout and −4 at 35+ points allowed, so opponent scoring matters more than sacks.`,
    `<b>Kicker:</b> distance bonuses (4/5/6 for 40+/50+/60+) favor long-range kickers in domes or calm weather.`,
    `<b>Weeks 15–17:</b> run the Lineup tab every week; start the best projections (picking by floor or ceiling did no better in the backtest).`,
  ];

  const checkins = table(
    ['Check-in', 'When (your time zone)', 'What to do'],
    [
      ['Waiver preview', `${M.waiverDayName()} evening`, 'Open Waivers — decide what to claim before waivers process'],
      ['Lineup check', 'Thursday before TNF · Sunday ~11:00', 'Open Lineup — only change what needs changing'],
      ['Injury watch', 'Sunday ~11:45', 'Open Injuries — check starters before the 1 PM games'],
      ['Weekly recap', 'Tuesday morning', 'Open Season — weekly review + lineup-efficiency audit'],
      ['Trade ideas', 'Wednesday evening, until the deadline', 'Open Trades — run it for your weakest starting spot'],
    ],
  );

  return `
    <div class="page-h"><div><h1>Season</h1><p>Zoom out: where you stand, how last week went, and what to do before the Week ${M.deadlineWeek} deadline and the Week ${M.L.settings.playoff_week_start} playoffs.</p></div></div>
    <div class="grid g2" style="margin-bottom:14px">
      <div class="callout ${v[0]}"><b>${esc(v[1])}</b>${esc(v[2])}<div class="dim" style="margin-top:6px">${pct(o.playoff)} to make the playoffs · ${pct(o.bye)} for a bye · ${pct(o.title)} to win it all · ${weeksLeft} regular-season games left</div></div>
      <div class="callout"><b>${me.w}-${me.l}, ${ord([...M.teams].sort((a, b) => b.w - a.w || b.pf - a.pf).findIndex((t) => t.id === me.id) + 1)} of ${M.teams.length} — ${ord([...M.teams].sort((a, b) => b.pf - a.pf).findIndex((t) => t.id === me.id) + 1)} in points scored</b>${n0(me.pp - me.pf)} points were left on the bench (${n1((me.pf / me.pp) * 100)}% lineup efficiency). ${me.pf > me.pa ? 'You have scored more than your opponents have — the record is running behind the points.' : ''}</div>
    </div>
    <div class="stack">
      ${card('Playoff odds', table(['Team', 'Record', 'Points', 'Make playoffs', 'Bye', 'Title', 'Avg wins'], oddsRows, { cls: '' }) + `<details class="how"><summary>How these odds work — and where they're wrong</summary><ul><li>This site's own simulation: ${sim.n.toLocaleString()} seasons of the real remaining schedule. This week uses each team's projected best lineup. Later weeks blend each team's season scoring (recent weeks weighted a bit more, pulled toward the league average) half and half with its current roster's best lineup for that week, so injuries, byes, pickups and trades count.</li><li>Every division winner makes the playoffs, even behind a wild card on record (Sleeper's rule); seeds then follow wins, then points. Your commissioner can override seeding in Sleeper.</li><li>Title odds assume a 6-team bracket with the top 2 seeds on a bye. They are not Down Field's numbers and won't match them.</li><li>Treat anything within a few points of percentage as noise.</li></ul></details>`, { cls: 'flush', sub: `Top ${M.L.settings.playoff_teams} make the playoffs; top 2 get byes` })}
      <div class="grid g2">
        ${card(`Week ${M.W - 1} review`, reviewBlock(M), { cls: 'flush', sub: 'Final scores and points left on each bench' })}
        ${card('Your lineup efficiency, week by week', effChart(M), { sub: 'Best possible lineup vs what you started — uses actual points, so it grades decisions only by results; a worse outcome alone isn\u2019t a bad decision' })}
      </div>
      <div class="grid g2">
        ${card(`Trade-deadline push (through Week ${M.deadlineWeek})`, `<ol style="margin:0 0 0 18px;padding:0;display:flex;flex-direction:column;gap:8px">${deadlineList.map((x) => `<li>${x}</li>`).join('')}</ol>`)}
        ${card('Playoff prep (Weeks 12–17)', `<ol style="margin:0 0 0 18px;padding:0;display:flex;flex-direction:column;gap:8px">${prepList.map((x) => `<li>${x}</li>`).join('')}</ol>`)}
      </div>
      ${card('Your playoff lineup', playoffSlate(M), { cls: 'flush', sub: `Weeks ${M.snap.meta.playoffWeeks.join(', ')}: best lineup each week, projected points, opponents and byes` })}
      ${card('Kicker and defense for the playoffs', stashPlan(M), { sub: 'Your best each week vs the top free agents, by Sleeper projection for that week' })}
      ${card('Standings & lineup efficiency', table(['#', 'Team', 'Record', 'Points for', 'Points against', 'Potential', 'Efficiency', 'Left on bench'], stand), { cls: 'flush', sub: 'Records come from Sleeper matchups. Potential = the best legal lineup every week.' })}
      ${card('Regular check-ins', checkins + `<div class="btn-row" style="margin-top:12px"><button class="btn" id="dlIcs">Download calendar reminders (.ics)</button></div><p class="note">This site can't send notifications. The download adds recurring reminders to your calendar app at the times above — nothing is created unless you open the file. Reminder times are fixed in your device's time zone (${esc(M.snap.meta.tz)} for you).</p>`)}
    </div>`;
}

export function mount(root, M) {
  root.querySelector('#dlIcs')?.addEventListener('click', () => {
    const blob = new Blob([icsFor(M)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'roster-monitor-checkins.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
