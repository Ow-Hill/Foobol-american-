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
    const bands = ['clear', 'lean', 'toss'].filter((b) => c.byBand[b]).map((b) => `${b} ${c.byBand[b].hit}/${c.byBand[b].n}`).join(' · ');
    const rows = c.rows.slice(0, 12).map((x) => [`Wk ${x.week}`, `Start ${esc(M.P(x.start).n)} over ${esc(M.P(x.bench).n)}`, x.band, `${n1(x.startPts)} vs ${n1(x.benchPts)}`, x.result === 'hit' ? '<span class="pos-num">right</span>' : x.result === 'miss' ? '<span class="neg-num">wrong</span>' : 'even']);
    bits.push(`<p style="margin:0 0 8px"><b>Lineup calls:</b> ${pc(c.hitRate)} right of ${c.total} scored${bands ? ` (${esc(bands)})` : ''}. ${c.open} call${c.open === 1 ? '' : 's'} logged for this week.</p>${table(['Week', 'Call', 'Label', 'Scored', ''], rows)}`);
  } else bits.push(`<p style="margin:0 0 8px"><b>Lineup calls:</b> none scored yet. Every "start X over Y" the site shows for your roster is logged the first time it appears${c ? ` (${c.open} so far this week)` : ''} and marked right or wrong after the games.</p>`);
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
    <li><b>Wind.</b> Outdoors at 15+ mph, quarterbacks scored ${w.QB.diff} and kickers ${w.K.diff} points against projection (${w.QB.nWindy} and ${w.K.nWindy} cases). No free forecast feed carries wind speed, so check it yourself for outdoor games.</li>
    <li><b>Tuesday vs Sunday.</b> The lineup replay used projections as they stood just before kickoff. Early in the week the site knows less; re-check after Friday's report and again at inactives.</li>
    <li><b>Headlines.</b> No archive of past headlines exists, so the news classifier itself has no backtest; the official report it tries to read does (the injury numbers above).</li>
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
