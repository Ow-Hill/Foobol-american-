// Waiver scanner: blends classified player news (practice, camp, injury, trade, role) with usage
// stats (snaps, targets, touches, scoring trend) and the lineup gain from model.waiverPlan() into one
// ranked, explained board. Deterministic and local: no model, no fetch, nothing invented — every
// reason line points at a stat from the snapshot or a dated headline/note from playernews.js.
//
// Method follows skills/ff-waiver-plan (rolling priority, no FAAB): a won claim sends you to last,
// so only a Tier 1 move spends priority; everything else waits for free agency.
import { playerNewsFor } from './playernews.js';
import { advancedOf, benchUsage, fmtMetric, XP_GAP } from './advstats.js';

const DAY = 86400000;
const SKILL_POS = new Set(['QB', 'RB', 'WR', 'TE']);
const SRC_W = { 1: 1, 2: 0.85, 3: 0.7 };
const HALF_LIFE = 3 * DAY; // a 3-day-old headline counts half

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const n1 = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1));
const agoTxt = (ms) => (ms < 3600000 ? 'just now' : ms < DAY ? `${Math.round(ms / 3600000)}h ago` : `${Math.round(ms / DAY)}d ago`);

// ---------------------------------------------------------------- stats

// Usage over the last 3 games against the (up to) 5 before them. Snapshot hist rows carry
// pts, snp (offensive snap %), att (rush attempts), tgt (targets) and rec.
export function usageOf(p) {
  const h = p.hist || [];
  const hasVol = h.some((x) => x.att != null || x.tgt != null);
  const last3 = h.slice(-3);
  const prior = h.slice(0, -3).slice(-5);
  const touches = (x) => (x.att || 0) + (x.tgt || 0);
  const mean = (list, f) => (list.length ? avg(list.map(f)) : null);
  return {
    gp: h.length,
    snap: p.snpNow ?? null,
    snapTrend: p.snpTrend ?? null,
    tgt3: hasVol ? mean(last3, (x) => x.tgt || 0) : null,
    tgtPrior: hasVol ? mean(prior, (x) => x.tgt || 0) : null,
    opp3: hasVol ? mean(last3, touches) : null,
    oppPrior: hasVol ? mean(prior, touches) : null,
    ppg3: p.ppg3 ?? null,
    ppgPrior: mean(prior, (x) => x.pts || 0),
  };
}

// 0..1: how big the role is right now. RBs by touches, WR/TE by targets, blended with snap share.
function usageScore(pos, u) {
  let vol = null;
  if (pos === 'RB' && u.opp3 != null) vol = clamp(u.opp3 / 18);
  else if ((pos === 'WR' || pos === 'TE') && u.tgt3 != null) vol = clamp(u.tgt3 / (pos === 'TE' ? 6 : 8));
  if (vol == null && u.ppg3 != null) vol = clamp(u.ppg3 / (pos === 'QB' ? 22 : 15));
  if (u.snap != null) return vol == null ? u.snap / 100 : 0.5 * (u.snap / 100) + 0.5 * vol;
  return vol ?? 0;
}

// -1..1: is the role growing? Average of whichever trend inputs exist.
function trendScore(pos, u) {
  const parts = [];
  if (u.snapTrend != null) parts.push(clamp(u.snapTrend / 15, -1, 1));
  if (pos === 'RB' && u.opp3 != null && u.oppPrior != null) parts.push(clamp((u.opp3 - u.oppPrior) / 5, -1, 1));
  if ((pos === 'WR' || pos === 'TE') && u.tgt3 != null && u.tgtPrior != null) parts.push(clamp((u.tgt3 - u.tgtPrior) / 3, -1, 1));
  if (u.ppg3 != null && u.ppgPrior != null) parts.push(clamp((u.ppg3 - u.ppgPrior) / 6, -1, 1));
  return parts.length ? avg(parts) : 0;
}

function usageLine(pos, u) {
  const bits = [];
  if (u.snap != null) bits.push(`${u.snap}% snaps${u.snapTrend != null && Math.abs(u.snapTrend) >= 5 ? ` (${u.snapTrend > 0 ? '▲' : '▼'}${Math.abs(Math.round(u.snapTrend))})` : ''}`);
  if (pos === 'RB' && u.opp3 != null) bits.push(`${n1(u.opp3)} touches/g last 3${u.oppPrior != null ? ` (was ${n1(u.oppPrior)})` : ''}`);
  if ((pos === 'WR' || pos === 'TE' || pos === 'RB') && u.tgt3 != null && u.tgt3 >= 1) bits.push(`${n1(u.tgt3)} targets/g last 3${u.tgtPrior != null ? ` (was ${n1(u.tgtPrior)})` : ''}`);
  if (u.ppg3 != null) bits.push(`${n1(u.ppg3)} pts/g last 3${u.ppgPrior != null ? ` (was ${n1(u.ppgPrior)})` : ''}`);
  return bits.join(' · ');
}

// ---------------------------------------------------------------- news

// What the player's own dated news says, typed. Each item can produce one signal; the strongest
// signal per kind is kept so ten copies of one headline cannot outvote a single RotoWire note.
export function newsSignals(items, now) {
  const best = {};
  const keep = (s) => {
    if (!best[s.kind] || Math.abs(s.v) > Math.abs(best[s.kind].v)) best[s.kind] = s;
  };
  for (const it of items || []) {
    if (it.dupe) continue;
    const w = (SRC_W[it.tier] ?? 0.7) * Math.pow(0.5, Math.max(0, now - it.time) / HALF_LIFE) * (it.posture === 'speculative' ? 0.5 : 1);
    const base = { at: it.time, src: it.src, title: it.title || it.text || '', posture: it.posture, kindOf: it.kind };
    if (it.better) keep({ ...base, kind: 'injury', v: 0.5 * w, label: 'Trending toward playing' });
    else if (it.status === 'IR' || it.status === 'Out') keep({ ...base, kind: 'injury', v: -1 * w, label: `Reported ${it.status}` });
    else if (it.status === 'Doubtful') keep({ ...base, kind: 'injury', v: -0.7 * w, label: 'Reported Doubtful' });
    else if (it.status === 'Questionable') keep({ ...base, kind: 'injury', v: -0.3 * w, label: 'Reported Questionable' });
    if (it.practice) {
      const pv = { DNP: -0.6, EST: -0.4, LP: -0.25, FP: 0.25 }[it.practice] ?? 0;
      const lbl = { DNP: 'Did not practice', EST: 'Estimated practice', LP: 'Limited practice', FP: 'Full practice' }[it.practice];
      keep({ ...base, kind: 'practice', v: pv * w, label: lbl });
    }
    if (it.roleDir === 'up') keep({ ...base, kind: 'role', v: 0.8 * w, label: 'Role growing' });
    else if (it.roleDir === 'down') keep({ ...base, kind: 'role', v: -0.8 * w, label: 'Role shrinking' });
    if (it.cats?.includes('trade')) keep({ ...base, kind: 'trade', v: (it.roleDir === 'up' ? 0.3 : it.roleDir === 'down' ? -0.3 : 0) * w || 0.0001, label: it.posture === 'speculative' ? 'Trade rumour' : 'Trade news' });
    if (it.cats?.includes('camp')) keep({ ...base, kind: 'camp', v: (it.roleDir === 'up' ? 0.3 : it.roleDir === 'down' ? -0.3 : 0) * w || 0.0001, label: 'Camp report' });
    if (it.cats?.includes('suspension')) keep({ ...base, kind: 'suspension', v: -0.8 * w, label: 'Suspension' });
  }
  const list = Object.values(best).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const net = clamp(list.reduce((s, x) => s + x.v, 0), -1, 1);
  return { list, net, onlySpeculative: list.length > 0 && list.every((x) => x.posture === 'speculative') };
}

// Teammates at his position who sit ahead of him and are out, hurt or gone. This is where
// rostered players' news (which is scanned every refresh) turns into a free-agent signal.
const VACANCY_W = { IR: 1, PUP: 1, Sus: 0.9, Out: 0.75, NA: 0.75, DNR: 0.75, COV: 0.6, Doubtful: 0.6, Questionable: 0.2 };
export function vacancies(M, pid, byPid) {
  const p = M.P(pid);
  if (!p.team || !SKILL_POS.has(p.pos)) return [];
  const out = [];
  const mates = Object.values(M.snap.players).filter((q) => q.id !== pid && q.team === p.team && q.pos === p.pos);
  for (const raw of mates) {
    const q = M.P(raw.id);
    const ahead = p.depth != null && q.depth != null ? q.depth < p.depth : (q.ppg || 0) > (p.ppg || 0) + 3;
    if (!ahead || (q.ppg || 0) < 6) continue;
    let w = VACANCY_W[q.eff] || 0;
    let how = q.eff ? `listed ${q.eff}` : null;
    let src = 'injury tag';
    // dated news can open a role before the tag catches up
    for (const it of byPid.get(q.id) || []) {
      if (it.dupe || it.better) continue;
      const spec = it.posture === 'speculative' ? 0.5 : 1;
      const cand = it.status ? (VACANCY_W[it.status] || 0) * spec : it.practice === 'DNP' ? 0.35 * spec : it.cats?.includes('trade') && /\btraded\b|\bdealt\b/i.test(it.title || '') ? 0.5 * spec : 0;
      if (cand > w) {
        w = cand;
        how = it.status ? `reported ${it.status}` : it.practice === 'DNP' ? 'missed practice' : 'reported traded';
        src = `${it.src}, ${agoTxt(M.now - it.time)}`;
      }
    }
    if (w <= 0) continue;
    out.push({ pid: q.id, n: q.n, pos: q.pos, ppg: q.ppg || 0, eff: q.eff, w, how, src });
  }
  if (!out.length) return out;
  // Is he the next man up, or does a healthy teammate sit between him and the opening?
  const top = out.sort((a, b) => b.w * b.ppg - a.w * a.ppg)[0];
  const between = mates.some((raw) => {
    const q = M.P(raw.id);
    return q.id !== top.pid && q.effSev < 2 && p.depth != null && q.depth != null && q.depth < p.depth && q.depth > (M.P(top.pid).depth ?? 0);
  });
  for (const v of out) v.nextUp = !between;
  return out;
}

// ---------------------------------------------------------------- one candidate

export function scanCandidate(M, c, byPid, { claimPos = new Set(), openIr = 0 } = {}) {
  const p = c.p;
  const u = usageOf(p);
  // position-specific volume (dropbacks, shares, red zone, WOPR, routes) against benchmark players,
  // blended with the basic snaps/touches score; basic only when the feed sent no advanced fields
  const adv = advancedOf(p.pos, p.hist);
  const bench = benchUsage(p.pos, adv);
  const usage = bench ? 0.6 * bench.score + 0.4 * usageScore(p.pos, u) : usageScore(p.pos, u);
  const xpGap = adv?.m.xpGap?.v ?? null;
  // efficiency: scoring far above what the volume normally produces tends to cool off, and below it, to catch up
  const trend = clamp(trendScore(p.pos, u) + (xpGap == null ? 0 : xpGap >= XP_GAP ? -0.3 : xpGap <= -XP_GAP ? 0.3 : 0), -1, 1);
  const news = newsSignals(byPid.get(c.id), M.now);
  const vac = vacancies(M, c.id, byPid);
  const topVac = vac[0] || null;
  const opp = topVac ? clamp(topVac.w * clamp(topVac.ppg / 14) * (topVac.nextUp ? 1 : 0.5)) : 0;
  const gain = clamp(Math.max(c.impact || 0, 0.6 * (c.impactNext || 0)) / 5);
  const addRank = p.trend?.add?.rank ?? null;
  const market = addRank ? (41 - addRank) / 40 : p.trend?.drop ? -0.2 : 0;
  const health = p.effSev >= 3 ? 0.35 : p.effSev === 2 ? 0.85 : 1;

  const newsPart = clamp(0.35 + 0.65 * opp + 0.35 * news.net);
  // A multi-week opening (IR/PUP/suspension, not a one-week Out) ahead of him is the skill's
  // Tier 1 "starter takeover" at RB; a one-week Out is a stream, not worth priority.
  const takeover = !!topVac && topVac.nextUp && topVac.w >= 0.9 && topVac.ppg >= 10 && p.effSev < 3;

  // inheriting a starter's workload is a usage signal even before the stats show it
  const usageEff = takeover ? Math.max(usage, 0.7) : usage;
  const score = Math.round(100 * health * (0.3 * gain + 0.2 * usageEff + 0.15 * (trend + 1) / 2 + 0.25 * newsPart + 0.1 * clamp(market)));


  // ---- reasons and risks, each tied to a number or a dated report ----
  const reasons = [];
  const risks = [];
  if (topVac) reasons.push({ kind: 'opportunity', text: `${topVac.n} (${n1(topVac.ppg)} pts/g) is ${topVac.how}${topVac.nextUp ? ` — ${p.n} is next up` : ' — but another back-up sits ahead'} (${topVac.src})`, sign: 1 });
  for (const s of news.list) {
    if (Math.abs(s.v) < 0.05 && s.kind !== 'trade' && s.kind !== 'camp') continue;
    const head = s.title ? `“${s.title.length > 90 ? s.title.slice(0, 87) + '…' : s.title}”` : '';
    const line = { kind: s.kind, text: `${s.label}${head ? ': ' + head : ''} (${s.src}, ${agoTxt(M.now - s.at)}${s.posture === 'speculative' ? ', unconfirmed' : ''})`, sign: Math.sign(s.v) };
    (s.v < -0.05 ? risks : reasons).push(line);
  }
  const ul = usageLine(p.pos, u);
  if (ul) (trend <= -0.3 ? risks : reasons).push({ kind: 'usage', text: ul, sign: trend > 0.2 ? 1 : trend < -0.2 ? -1 : 0 });
  if (bench) {
    const top = [...bench.vs].sort((a, b) => b.ratio - a.ratio).slice(0, 3);
    const txt = top.map((x) => `${x.label} ${fmtMetric(x)}${x.refName ? ` (${x.refName.split(' ').slice(-1)[0]} ${fmtMetric({ v: x.ref, pct: x.pct })})` : ''}`).join(' · ');
    (bench.score >= 0.45 ? reasons : risks).push({ kind: 'volume', text: `${txt} — ${Math.round(bench.score * 100)}% of a benchmark role`, sign: bench.score >= 0.45 ? 1 : 0 });
  }
  if (xpGap != null && xpGap >= XP_GAP) risks.push({ kind: 'efficiency', text: `Scoring ${n1(xpGap)} pts/g above what his volume usually produces (≈${n1(adv.m.xp.v)}) — likely to cool`, sign: -1 });
  else if (xpGap != null && xpGap <= -XP_GAP) reasons.push({ kind: 'efficiency', text: `Volume is worth ≈${n1(adv.m.xp.v)} pts/g, ${n1(-xpGap)} more than he has scored — due to catch up`, sign: 1 });
  if (c.impact >= 0.5) reasons.push({ kind: 'lineup', text: `+${n1(c.impact)} pts to your best lineup this week`, sign: 1 });
  else if (c.impactNext >= 0.5) reasons.push({ kind: 'lineup', text: `+${n1(c.impactNext)} pts to your lineup in Week ${M.W + 1}`, sign: 1 });
  if (addRank && addRank <= 25) reasons.push({ kind: 'market', text: `#${addRank} add on Sleeper in the last 24h`, sign: 1 });
  if (p.effSev >= 2) risks.push({ kind: 'injury', text: `Carries a ${p.eff} tag`, sign: -1 });
  if (u.gp < 3 && !topVac) risks.push({ kind: 'sample', text: `Only ${u.gp} game${u.gp === 1 ? '' : 's'} of stats`, sign: 0 });
  if (news.onlySpeculative) risks.push({ kind: 'speculative', text: 'Every headline is unconfirmed — rumour, not a depth-chart change', sign: 0 });
  if (topVac && !takeover && topVac.w >= 0.6 && topVac.w < 0.9) risks.push({ kind: 'opportunity', text: `Short-term opening — ${topVac.n} is ${topVac.how}, not on IR`, sign: 0 });
  if (topVac && !takeover && topVac.w < 0.6) risks.push({ kind: 'opportunity', text: `${topVac.n} may still play — the opening is not confirmed`, sign: 0 });

  // ---- confidence: independent lenses that agree ----
  const lenses = {
    stats: usage >= 0.5 || trend >= 0.3,
    news: opp >= 0.4 || (news.net >= 0.3 && !news.onlySpeculative),
    opening: takeover,
    market: addRank != null && addRank <= 20,
    lineup: (c.impact || 0) >= 1 || (c.impactNext || 0) >= 1.5,
  };
  const agree = Object.values(lenses).filter(Boolean).length;
  const conflict = news.net <= -0.3 || trend <= -0.3 || p.effSev >= 3;
  const confidence = agree >= 3 && !conflict ? 'high' : agree >= 2 && !(conflict && agree < 3) ? 'medium' : 'low';

  // ---- tier, verdict and when to look again ----
  let tier = c.tier ?? M.tierFor(c, openIr);
  if (takeover) tier = p.pos === 'RB' ? 1 : Math.min(tier, 2);
  if (news.net <= -0.5 && !takeover && tier < 3) tier = 3;
  let verdict;
  if (news.net <= -0.5 && !(p.avail === 'out' && (p.ppg || 0) >= 10 && openIr > 0)) verdict = 'avoid';
  else if (tier === 1 && (confidence !== 'low' || takeover)) verdict = 'claim';
  else if (tier <= 2 && claimPos.has(p.pos) && score >= 45) verdict = 'claim-if-need';
  else if (topVac && !takeover && topVac.w >= 0.3) verdict = 'watch';
  else if (news.onlySpeculative && score >= 35) verdict = 'watch';
  else if (score >= 35 || tier === 4) verdict = 'free-agency';
  else verdict = 'pass';

  const injuryLed = topVac || news.list.some((s) => s.kind === 'injury' || s.kind === 'practice');
  const trigger = news.list.some((s) => s.kind === 'trade' && s.posture === 'speculative')
    ? 'Revisit once the trade is official.'
    : injuryLed
      ? `Revisit after the ${topVac ? `${topVac.n} ` : ''}Wed–Fri practice report.`
      : news.list.some((s) => s.kind === 'role')
        ? 'Confirm the role with next game’s snap share.'
        : 'Revisit after two more games of usage data.';

  return {
    id: c.id, p, c, score, tier, verdict, confidence, takeover,
    parts: { gain, usage, trend, newsPart, opp, market, health, newsNet: news.net },
    usage: u, adv, bench, news: news.list, vacancy: topVac, reasons, risks, trigger, lenses,
  };
}

// ---------------------------------------------------------------- board

const VERDICT_RANK = { claim: 0, 'claim-if-need': 1, watch: 2, 'free-agency': 3, pass: 4, avoid: 5 };
const memo = new WeakMap();

export function waiverIntel(M, plan = M.waiverPlan(), news = playerNewsFor(M)) {
  if (memo.has(M)) return memo.get(M);
  const byPid = news.byPid;
  const claimPos = new Set();
  for (const n of plan.needs) if (n.claim) for (const pos of needPositions(n)) claimPos.add(pos);
  const opts = { claimPos, openIr: plan.openIr ?? 0 };

  // carry the group (riser / cuff / lottery) and base tier from waiverPlan where it exists
  const grouped = new Map([...plan.groups.risers, ...plan.groups.cuffs, ...plan.groups.lottery].map((c) => [c.id, c]));
  const rows = [];
  for (const c of plan.pool || []) {
    if (!SKILL_POS.has(c.p.pos)) continue;
    const g = grouped.get(c.id);
    rows.push(scanCandidate(M, g || c, byPid, opts));
  }
  // a starter takeover outranks a stats-only riser inside the same verdict (skill: Tier 1 order)
  rows.sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || b.takeover - a.takeover || b.score - a.score);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const board = rows.filter((r) => r.verdict !== 'pass').slice(0, 10);
  for (const r of board) r.drop = r.c.drop || M.dropFor(r.c);
  const claims = board.filter((r) => r.verdict === 'claim');
  const scanned = rows.length;
  const withNews = rows.filter((r) => r.news.length || r.vacancy).length;
  const res = { board, byId, claims, scanned, withNews, flags: news.flags };
  memo.set(M, res);
  return res;
}

function needPositions(n) {
  if (n.pos === 'FLEX') return ['RB', 'WR', 'TE'];
  if (n.pos === 'SUPER_FLEX') return ['QB', 'RB', 'WR', 'TE'];
  if (n.pos) return [n.pos];
  // bye-week needs name the empty slots
  return (n.empty || []).flatMap((s) => needPositions({ pos: s }));
}

export const VERDICT_LABEL = {
  claim: 'Claim — spend priority',
  'claim-if-need': 'Claim only for the need',
  watch: 'Watch',
  'free-agency': 'Free agency',
  pass: 'Pass',
  avoid: 'Avoid for now',
};
