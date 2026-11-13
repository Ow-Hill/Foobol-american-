// Track record: how the site's advice has actually done. Top: this season's own calls, scored
// each week. Below: the 2022-2026 backtest every rule was sized from (docs/backtest-report.md).
import { esc, n1 } from '../util.js';
import { card, table } from '../ui.js';
import { TRACK as T } from '../track-data.js';
import { BANDS, RIPPLE } from '../fitted.js';

const pc = (v) => (v == null || Number.isNaN(v) ? '–' : Math.round(v * 100) + '%');
const delta = (now, was, lowerIsBetter = true) => {
  if (was == null || now == null) return '';
  const better = lowerIsBetter ? now < was : now > was;
  return now === was ? '<span class="dim">same</span>' : `<span class="${better ? 'pos-num' : 'neg-num'}">${better ? 'better' : 'worse'}</span> <span class="dim">(was ${was})</span>`;
};

function live(M) {
  const c = M.snap.callsRecord;
  const r = M.snap.calibration;
  const bits = [];
  if (c && c.total) {
    const bands = ['clear', 'lean', 'toss', 'waiver'].filter((b) => c.byBand[b]).map((b) => `${b} ${c.byBand[b].hit}/${c.byBand[b].n}`).join(' · ');
    const what = (x) => (x.kind === 'waiver' ? `Add ${esc(M.P(x.start).n)}, drop ${esc(M.P(x.bench).n)}` : `Start ${esc(M.P(x.start).n)} over ${esc(M.P(x.bench).n)}`);
    const rows = c.rows.slice(0, 12).map((x) => [`Wk ${x.week}`, what(x), x.kind === 'waiver' ? 'waiver (2 weeks)' : x.band, `${n1(x.startPts)} vs ${n1(x.benchPts)}`, x.result === 'hit' ? '<span class="pos-num">right</span>' : x.result === 'miss' ? '<span class="neg-num">wrong</span>' : 'even']);
    for (const f of c.flags || []) bits.push(`<div class="callout warn" style="margin:0 0 8px"><b>"${esc(f.band)}" calls are slipping</b>Right ${Math.round(f.seen * 100)}% of the time over ${f.n} calls this season; the backtest said to expect about ${Math.round(f.expect * 100)}%. That is below the range chance alone would explain, so treat these calls with more caution until it recovers.</div>`);
    bits.push(`<p style="margin:0 0 8px"><b>Lineup calls:</b> ${pc(c.hitRate)} right of ${c.total} scored${bands ? ` (${esc(bands)})` : ''}. ${c.open} call${c.open === 1 ? '' : 's'} logged for this week.</p>${table(['Week', 'Call', 'Label', 'Scored', ''], rows)}`);
  } else bits.push(`<p style="margin:0 0 8px"><b>Lineup and waiver calls:</b> none scored yet. Every "start X over Y" the site shows for your roster, and its top waiver claim, is logged the first time it appears${c ? ` (${c.open} so far this week)` : ''} and marked right or wrong after the games. A label that falls below its backtest rate gets flagged here.</p>`);
  const lag = M.snap.headlineLag;
  if (lag && lag.n) {
    const h = (ms) => (ms < 3600000 ? `${Math.round(ms / 60000)} minutes` : `${(ms / 3600000).toFixed(1)} hours`);
    bits.push(`<p style="margin:8px 0 0"><b>News scanner vs the official status:</b> of ${lag.n} status changes in the last week, a headline was found for ${lag.found}${lag.found ? `, a median ${h(lag.medianMs)} after the change (${lag.within6h} within 6 hours)` : ''}; ${lag.missed} had no headline at all${lag.pending ? ` and ${lag.pending} are under a day old` : ''}. Status changes come straight from Sleeper, ESPN and the NFL report, so a missing headline does not mean a missed change.</p>`);
  }
  if (r && r.total) bits.push(`<p style="margin:8px 0 0"><b>Teammate estimates:</b> ${pc(r.hitRate)} of ${r.total} moved the right way this season (details on the News page).</p>`);
  else bits.push('<p style="margin:8px 0 0"><b>Teammate estimates:</b> none scored yet this season.</p>');
  return card('This season, on your roster', `<div style="padding:12px 16px">${bits.join('')}</div>`, { cls: 'flush', sub: 'Scored automatically once each week is final. If a rule falls well below its backtest rate here, treat it with suspicion.' });
}

function scorecard() {
  const n = T.now;
  const b = T.before || {};
  const rb = n.ripple.byKind['out RB → carries'];
  const rows = [
    ['Lineup', `The site's lineup beat the one managers actually set by ${n.lineup.diff} points a week (range ${esc(n.lineup.range)}), ${n.lineup.sitePctOfPerfect}% of a perfect lineup vs ${n.lineup.mgrPctOfPerfect}%`, `${n.lineup.n} team-weeks in this league, 2025-26`, 'Best case: the stored projections already knew Sunday inactives'],
    ['Start / sit labels', `Clear (4+ points): higher projection won 68% or more. Lean (2-4): 59-63%. Toss-up (under 2): 51-56%`, '2025-26, 55,000+ player pairs', `K and DEF now use smaller cut-offs (lean at ${BANDS.K.lean} / ${BANDS.DEF.lean})`],
    ['Tiebreaks', `Softer position matchup: ${pc(T.tiebreak.matchup.test)} (removed). Higher implied total: ${pc(T.tiebreak.implied.test)}, ${pc(T.tiebreak.impliedBig.test)} when 4+ apart (kept at 4+)`, `${T.tiebreak.matchup.nTest.toLocaleString()} toss-up pairs`, 'Keeping the higher projection wins 54%'],
    ['Questionable tag', `Played ${pc(T.tags.status.Questionable.play)}; full practice ${pc(T.tags.byPractice.FP.play)}, limited ${pc(T.tags.byPractice.LP.play)}, none ${pc(T.tags.byPractice.DNP.play)}; QBs ${pc(T.tags.byPosition.QB.play)}. Scored ${pc(T.tags.vsProjection)} of projection when active`, `${T.tags.status.Questionable.n} cases, 2022-26`, 'Was treated as a full projection'],
    ['Teammate estimates', `RB out → carries: right ${pc(rb?.hit)} (chance ${pc(rb?.chance)}). Receiver out → targets: ${pc(n.ripple.byKind['out WR → targets']?.hit)} (chance ${pc(n.ripple.byKind['out WR → targets']?.chance)})`, 'Every case 2022-26', `Labels now ordered: lean ${pc(n.ripple.byConf.lean?.hit)}, toss ${pc(n.ripple.byConf.toss?.hit)}${b.ripple?.byConf?.clear ? ` (old "clear" was ${pc(b.ripple.byConf.clear.hit)})` : ''}`],
    ['Win probability', `Score ${n.winBrier['Site today: season scoring averages']} (coin flip 0.25, lower is better)`, 'Every pair of teams, 2025-26', delta(n.winBrier['Site today: season scoring averages'], b.winBrier?.['Site today: season scoring averages'])],
    ['Trade values', `Rest-of-season points per game missed by QB ${n.values.QB.mae}, RB ${n.values.RB.mae}, WR ${n.values.WR.mae}, TE ${n.values.TE.mae}`, 'Weeks 4-11 of 2025', b.values ? `was ${b.values.QB.mae} / ${b.values.RB.mae} / ${b.values.WR.mae} / ${b.values.TE.mae}` : ''],
    ['Projection source', `Sleeper averaged 50/50 with the expert consensus at QB, WR and K: replayed lineups scored ${T.ecr?.diff ?? '–'} more points a week (range ${esc(T.ecr?.range || '–')}); Wednesday's consensus was almost as accurate as Sunday's`, '2025-26, this league and all NFL players', 'RB, TE, DEF: Sleeper alone did as well'],
    ['Waiver claims', `Top claim gained ${T.waiver?.site?.mean ?? '–'} lineup points over three weeks and helped ${pc(T.waiver?.site?.hit)} of the time; the best-projected free agent gained ${T.waiver?.naive?.mean ?? '–'}`, `${T.waiver?.site?.n ?? '–'} team-weeks, this league 2025-26`, 'Ranked by projection now; injured stashes and young lottery tickets no longer outrank real adds (they gained 2.1 before)'],
    ['Floor / ceiling', `Projection-based range held the actual score ${pc(T.ranges.ALL.modelInside)} of the time (target 50%); the old last-6-games range ${pc(T.ranges.ALL.recentInside)}`, '2025-26', 'Posture tiebreak removed: no better than the projection'],
    ['News classifier', `${pc(T.news.freshFirst)} of checks right on fresh live headlines before the fixes they prompted`, `${T.news.freshN} labelled checks`, 'Add a labelled batch every few weeks to keep this honest'],
    ['Trade verdicts', `Picked the side that came out ahead in ${pc(n.trades.agree)} of ${n.trades.decided} decided trades`, "This league's own trades", 'Too few trades to tell good from lucky'],
  ];
  return card('Scorecard', table(['Advice', 'Measured result', 'On', 'Note'], rows), { cls: 'flush', sub: `Backtest run ${esc(T.generated)}. Rules were sized on 2022-24 and judged on 2025-26, seasons they never saw.` });
}

function startSit() {
  const name = { 'RB / WR / TE (same position)': 'RB / WR / TE', 'FLEX (RB vs WR vs TE)': 'Across FLEX', QB: 'QB', K: 'K', DEF: 'DEF' };
  const gaps = ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6', '6-8', '8-10', '10+'];
  const cell = (g, i) => {
    const b = T.startSit[g]?.find((x) => `${x.gap[0]}-${x.gap[1] === 99 ? '+' : x.gap[1]}`.replace('-+', '+') === gaps[i]);
    return b ? pc(b.win) : '<span class="dim">–</span>';
  };
  const rows = Object.keys(name).map((g) => [name[g], ...gaps.map((_, i) => cell(g, i))]);
  return card('How often the higher projection wins', table(['Projection gap (points)', ...gaps], rows), { cls: 'flush', sub: 'Hold-out seasons 2025-26. Blank = too few pairs. This is where the Clear / Lean / Toss-up cut-offs come from.' });
}

function tags() {
  const h = T.health;
  const rows = Object.entries(h).map(([k, v]) => [esc(k), v.n, pc(v.share), pc(v.prod), pc(v.site)]);
  return card('Injuries: what a status has meant for the rest of the season', table(['Status when the value was taken', 'Cases', 'Share of remaining games played', 'Scoring when back vs before', 'What the site used to assume'], rows), { cls: 'flush', sub: 'Players averaging 7+ points, Weeks 4-11 of 2022-2025. Trade values now use these.' });
}

function ripple() {
  const rows = Object.entries(T.now.ripple.byKind).map(([k, v]) => [esc(k), v.n, pc(v.hit), pc(v.miss), pc(v.chance), v.avgEst ?? '–', v.avgAct ?? '–']);
  const was = T.before ? Object.entries(T.before.ripple.byKind).filter(([k]) => /out (RB|WR) →/.test(k)).map(([k, v]) => `${esc(k)}: estimated ${v.avgEst}, actual ${v.avgAct}`).join('; ') : '';
  return card('Teammate estimates by rule', `${table(['Rule', 'Cases', 'Right direction', 'Wrong', 'By chance', 'Average estimate', 'Average actual'], rows)}<p class="note" style="padding:0 16px 12px">"By chance" is how often a similar player on a team with no news moved that way anyway. ${was ? `Before the rules were resized: ${was}.` : ''} A returning back gives back about ${Math.round(RIPPLE.returnRb * 100)}% of what his fill-in gained; returning receivers showed no effect and no longer produce an estimate.</p>`, { cls: 'flush' });
}

function winOdds() {
  const rows = T.winTables.site.map((r, i) => [r[0], r[1], r[2] + '%', r[3] + '%', T.winTables.lineups[i]?.[1] ?? '', (T.winTables.lineups[i]?.[3] ?? '–') + '%']);
  return card('Win probability: stated vs what happened', table(['Stated chance', 'Games (season averages)', 'Average stated', 'Actually won', `Games (projected lineups, ${T.winTables.sd}-pt spread)`, 'Actually won'], rows), { cls: 'flush', sub: 'Every pair of teams in each regular-season week of 2025-26. The old numbers said 75% when the side won 59%.' });
}

function limits() {
  const w = T.wind;
  return card('What the site cannot see', `<ul class="plain" style="margin:0;padding:12px 16px 12px 32px;line-height:1.7">
    <li><b>Wind.</b> Outdoors at 15+ mph, quarterbacks scored ${w.QB.diff} and kickers ${w.K.diff} points against projection (${w.QB.nWindy} and ${w.K.nWindy} cases). The Lineup page flags it from a free forecast (Open-Meteo); projections do not include it.</li>
    <li><b>Tuesday vs Sunday.</b> The lineup replay used projections as they stood just before kickoff. Early in the week the site knows less; re-check after Friday's report and again at inactives.</li>
    <li><b>Headlines.</b> No archive of past headlines exists. Against hand-labelled headlines the classifier read ${pc(T.news.fresh2First)} of the latest fresh batch correctly before the fixes it prompted (${pc(T.news.freshFirst)} on the batch before, ${pc(T.news.before)} on the first set). Status changes come from Sleeper, ESPN and the official report directly, not from headlines.</li>
    <li><b>Trades.</b> A second model (Down Field) agreed with this site on this week's points but disagreed on the season effect for 3 of the top 5 deals on 12 Nov. Check any deal with the second-opinion button before sending it.</li>
    <li><b>Receiver injuries.</b> Who absorbs a missing receiver's targets is close to unpredictable: estimates are right ${pc(T.now.ripple.byKind['out WR → targets']?.hit)} of the time against ${pc(T.now.ripple.byKind['out WR → targets']?.chance)} by chance. Treat them as a nudge.</li>
    <li><b>Position matchups.</b> Points allowed to a position predicted nothing for RB, WR or TE once the projection was known. It is shown for quarterbacks only, as information.</li>
    <li><b>Trade verdicts.</b> ${T.now.trades.decided} decided trades is too small a sample to prove the trade values; the rest-of-season test above is the evidence.</li>
    <li><b>Draft picks and keepers.</b> Valued from two drafts (${Object.values(T.picks)[0]?.n} picks a round). Round 1 returned ${T.picks[1]?.aboveReplacement}, round 2 ${T.picks[2]?.aboveReplacement}, round 3 ${T.picks[3]?.aboveReplacement} season points above a replacement player; expect those to move as more drafts are added.</li>
  </ul>`, { cls: 'flush' });
}

export function render(M) {
  return `${live(M)}${scorecard()}${startSit()}${winOdds()}${ripple()}${tags()}${limits()}
    <p class="source">Method and every table: docs/backtest-report.md and docs/backtest/. Re-run with <code>npm run backtest</code>.</p>`;
}
