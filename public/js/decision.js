// Decision engine: turns the roster model + the news engine into ranked, conservative
// decisions with one stable contract. Shared by the UI (Decision brief) and the
// ff-decision-engine skill, so the agent and the page always agree.
// Deterministic: every verdict comes from model numbers or a dated report. No model calls.
import { healthiestFallback } from './playernews.js';
import { fmtDayTime } from './util.js';

export const DECISION_CONTRACT = {
  version: 1,
  fields: {
    id: 'stable string',
    kind: 'lineup | injury | waiver | trade | monitor',
    priority: 'act | this-week | watch',
    title: 'short imperative',
    verdict: 'what to do, one sentence',
    because: 'string[] — the numbers behind it',
    evidence: '{ text, src, time, url, tier, posture }[]',
    risk: 'string — what could make this wrong',
    confidence: '20-95, deterministic',
    deadline: '{ label, at } | null',
    action: '{ label, route }',
    guardrails: 'string[]',
    players: 'player id[]',
    basis: 'projection | health | news | market',
  },
};

export const PRIORITY_RANK = { act: 0, 'this-week': 1, watch: 2 };
export const PRIORITY_LABEL = { act: 'Act now', 'this-week': 'This week', watch: 'Watch' };
const KIND_RANK = { injury: 3, lineup: 3, waiver: 2, trade: 1, monitor: 0 };

const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const days = (ms) => ms / 86400000;

function evidenceFor(byPid, pid, extra = []) {  const list = (byPid.get(pid) || [])
    .filter((x) => !x.dupe)
    .sort((a, b) => b.time - a.time)
    .slice(0, 2)
    .map((x) => ({
      text: (x.title || x.text || '').slice(0, 180),
      src: x.src,
      time: x.time,
      url: x.url,
      tier: x.tier,
      posture: x.posture,
      kind: x.kind,
      practice: x.practice,
      status: x.status,
    }));
  return [...list, ...extra];
}

// Health guard: a player whose latest dated report says DNP/Out/IR cannot be
// recommended as an incoming starter, no matter what the projection says.
function newsAdverse(byPid, pid) {
  return (byPid.get(pid) || []).some((x) => !x.dupe && (x.practice === 'DNP' || x.status === 'Out' || x.status === 'IR'));
}

function confidenceOf(d, newsFlags) {
  let c = d.basis === 'projection' ? 70 : 55;
  const ev = d.evidence || [];
  if (ev.some((e) => e.kind === 'note')) c += 15;
  if (new Set(ev.map((e) => e.src).filter(Boolean)).size >= 2) c += 10;
  const speculativeOnly = ev.length > 0 && ev.every((e) => e.posture === 'speculative');
  if (speculativeOnly) c -= 20;
  if (newsFlags && (newsFlags.degraded || newsFlags.disabled)) c -= 10;
  if (d.priority === 'act') c += 5;
  return Math.max(20, Math.min(95, c));
}

function baseGuardrails(d) {
  const g = ['Advice only — make the move yourself in the Sleeper app.'];
  if (d.kind === 'injury') g.push('Most-severe label wins until a dated report says otherwise.');
  if (d.kind === 'injury' || d.kind === 'lineup') g.push('Re-check inactives ~90 minutes before kickoff.');
  if (d.kind === 'waiver') g.push('Rolling waivers: a won claim sends you to last priority.');
  if (d.kind === 'trade') g.push('A deal is not made until it is accepted and clears review in Sleeper.');
  if ((d.evidence || []).length && (d.evidence || []).every((e) => e.posture === 'speculative')) {
    g.push('Speculative report — this can raise a flag but cannot flip a start or sit on its own.');
  }
  return g;
}

export function buildDecisions(M, news = null) {
  const now = M.now;
  const l = M.lineup(M.me);
  const byPid = news ? news.byPid : new Map();
  const newsFlags = news ? news.flags : { degraded: false, disabled: true };

  const out = [];
  const seen = new Set();
  const handledPids = new Set();
  const add = (d) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    // Speculation can raise a flag but never carries an act-level decision on its own.
    const ev = d.evidence || [];
    if (ev.length && ev.every((e) => e.posture === 'speculative') && d.priority === 'act') {
      d.priority = 'this-week';
    }
    d.confidence = confidenceOf(d, newsFlags);
    d.guardrails = baseGuardrails(d);
    out.push(d);
  };

  // ---------- 1. hard problems (empty slots, out/bye starters, IR lock) ----------
  for (const p of M.problems()) {
    if (p.sev !== 'critical') continue;
    const kind = p.tab === 'injuries' ? 'injury' : p.tab === 'waivers' ? 'waiver' : 'lineup';
    if (p.pid) handledPids.add(p.pid);
    add({
      id: `problem-${kind}-${p.pid || p.title}`,
      kind,
      priority: 'act',
      title: p.title,
      verdict: p.body,
      because: ['A hard legality or availability rule is already broken.'],
      evidence: p.pid ? evidenceFor(byPid, p.pid) : [],
      risk: 'Projections move with practice reports; re-check before locking.',
      deadline: null,
      action: { label: p.tab === 'injuries' ? 'Injuries' : p.tab === 'waivers' ? 'Waivers' : 'Lineup', route: p.tab },
      players: p.pid ? [p.pid] : [],
      basis: 'health',
    });
  }

  // ---------- 2. starters who are game-time decisions ----------
  for (const r of M.injuryRows()) {
    if (r.where !== 'starter' || handledPids.has(r.pid)) continue;
    if (r.p.avail !== 'q') continue;
    const slot = r.slot;
    const fb = healthiestFallback(M, slot, [r.pid], byPid);
    const fbPts = fb != null ? M.val(fb) : null;
    add({
      id: `injury-q-${r.pid}`,
      kind: 'injury',
      priority: 'this-week',
      title: `${r.p.n} is a game-time decision`,
      verdict: fb != null ? `Start ${r.p.n} only if active; ${M.P(fb).n} is the fallback (${n1(fbPts)} proj).` : `No healthy fallback for ${slot} — claim one before Sunday.`,
      because: [`Effective tag: ${r.p.eff}${r.p.body ? ` (${r.p.body.toLowerCase()})` : ''}.`, `He is in your ${slot} slot.`, fb != null ? `${M.P(fb).n} projects ${n1(fbPts)}.` : 'Every bench body for this slot carries a blocking tag.'],
      evidence: evidenceFor(byPid, r.pid),
      risk: 'If he is active and you sit him, you lose his ceiling; if he is inactive and you start him, you take a zero.',
      deadline: r.p.game ? { label: `Inactives before ${fmtDayTime(new Date(r.p.game.date).getTime() - 90 * 60000)}`, at: new Date(r.p.game.date).getTime() - 90 * 60000 } : null,
      action: { label: 'Injuries', route: 'injuries' },
      players: [r.pid],
      basis: 'health',
    });
  }

  // ---------- 3. lineup swaps the model wants ----------
  for (const s of M.swaps()) {
    if (s.empty || !s.bench) continue;
    // Health beats models: never tell someone to start a player who did not practice.
    if (newsAdverse(byPid, s.start)) continue;
    const title = `Start ${M.P(s.start).n} over ${M.P(s.bench).n}`;
    if (out.some((d) => d.title === title)) continue;
    const priority = s.band === 'hard' || s.gap >= 6 ? 'act' : s.gap >= 4 ? 'this-week' : 'watch';
    add({
      id: `swap-${s.start}-${s.bench}`,
      kind: 'lineup',
      priority,
      title,
      verdict: `${M.P(s.start).n} projects ${n1(M.val(s.start))} against ${n1(M.val(s.bench))} for ${M.P(s.bench).n} in ${s.slot}.`,
      because: [`Gap: ${n1(s.gap)} projected points.`, s.note || `Call: ${s.call}.`],
      evidence: [...evidenceFor(byPid, s.start, []), ...evidenceFor(byPid, s.bench, [])].slice(0, 3),
      risk: 'One projection source only — a Friday practice upgrade can close the gap.',
      deadline: M.P(s.start).game ? { label: 'Before kickoff', at: new Date(M.P(s.start).game.date).getTime() } : null,
      action: { label: 'Lineup', route: 'lineup' },
      players: [s.start, s.bench],
      basis: 'projection',
    });
  }

  // ---------- 4. waiver needs and the best claim ----------
  const plan = M.waiverPlan();
  for (const n of plan.needs.filter((x) => x.claim).slice(0, 3)) {
    add({
      id: `waiver-need-${n.label}`,
      kind: 'waiver',
      priority: n.pri <= 1 ? 'act' : 'this-week',
      title: n.label,
      verdict: `${n.detail} ${plan.open.spots <= 0 ? 'You need to drop someone first.' : `You have ${plan.open.spots} open roster spot${plan.open.spots === 1 ? '' : 's'}.`}`,
      because: [`Priority ${n.pri} on this week's needs.`, `Waiver priority: #${plan.wp ?? '—'} (rolling).`],
      evidence: [],
      risk: 'A claim can be beaten by a higher-priority manager in a rolling system.',
      deadline: { label: 'Waivers process Tuesday', at: M.nextWaiverRun() },
      action: { label: 'Waivers', route: 'waivers' },
      players: [],
      basis: 'projection',
    });
  }
  for (const c of plan.tier1.slice(0, 2)) {
    add({
      id: `waiver-add-${c.id}`,
      kind: 'waiver',
      priority: 'watch',
      title: `Claim ${c.p.n} (${c.p.pos})`,
      verdict: `Projects +${n1(c.impact)} points this week; +${n1(c.impactNext)} next week.`,
      because: [`Tier 1 add on the wire.`, c.p.own == null ? 'Unrostered.' : 'Currently rostered.'],
      evidence: evidenceFor(byPid, c.id),
      risk: 'Bench points are free in this league only if he cracks the lineup; a stash can cost priority.',
      deadline: { label: 'Waivers process Tuesday', at: M.nextWaiverRun() },
      action: { label: 'Waivers', route: 'waivers' },
      players: [c.id],
      basis: 'projection',
    });
  }

  // ---------- 5. trade window ----------
  if (!M.deadlinePassed && M.acceptBy) {
    const d = days(M.acceptBy - now);
    if (d >= 0 && d <= 10) {
      const mk = M.marketFor();
      const t = mk.targets[0];
      if (t) {
        add({
          id: `trade-${t.id}`,
          kind: 'trade',
          priority: d <= 4 ? 'act' : 'this-week',
          title: `Shop for ${t.need} help`,
          verdict: `Target ${M.P(t.id).n} from ${t.team.name.trim()} — ${t.bench ? 'he is on their bench' : 'they are a plausible seller'} and projects ${n1(t.v)}.`,
          because: [`Your ${t.need} need is the biggest gap versus the league.`, `Gain over your current ${t.need} starter: ${n1(t.gainMe)} points.`],
          evidence: evidenceFor(byPid, t.id),
          risk: 'Trade value is contextual; the other manager can decline or counter.',
          deadline: { label: `Deals must be accepted by ${fmtDayTime(M.acceptBy)}`, at: M.acceptBy },
          action: { label: 'Trade finder', route: 'finder' },
          players: [t.id],
          basis: 'market',
        });
      }
    }
  }

  // ---------- 6. news that matters but is not already a decision ----------
  if (news) {
    const monitors = news.players
      .filter((r) => r.spot && r.spot.where !== 'ir' && (r.bucket === 'act' || r.bucket === 'week') && !out.some((d) => d.players.includes(r.pid)))
      .slice(0, 3);
    for (const r of monitors) {
      const top = r.top;
      if (!top) continue;
      if (!(top.practice === 'DNP' || top.status || top.cats.includes('injury'))) continue;
      const label = top.practice || top.status || 'injury report';
      add({
        id: `news-${r.pid}`,
        kind: 'monitor',
        priority: r.spot.where === 'starter' ? (r.bucket === 'act' ? 'act' : 'this-week') : 'watch',
        title: `${r.p.n}: ${label} in the latest report`,
        verdict: top.soWhat?.text || `Track ${r.p.n} through the next practice report before acting.`,
        because: [
          top.practice ? `Practice: ${top.practice}.` : '',
          top.status ? `Status: ${top.status}.` : '',
          top.cats.length ? `Tags: ${top.cats.join(', ')}.` : '',
        ].filter(Boolean),
        evidence: evidenceFor(byPid, r.pid),
        risk: 'A single headline is not a status change — wait for a dated report or the official game status.',
        deadline: null,
        action: { label: 'News', route: 'news' },
        players: [r.pid],
        basis: 'news',
      });
    }
  }

  out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || KIND_RANK[b.kind] - KIND_RANK[a.kind] || b.confidence - a.confidence);
  const summary = {
    act: out.filter((d) => d.priority === 'act').length,
    thisWeek: out.filter((d) => d.priority === 'this-week').length,
    watch: out.filter((d) => d.priority === 'watch').length,
    top: out[0]?.title || null,
  };
  return { generatedAt: now, week: M.W, decisions: out, summary };
}
