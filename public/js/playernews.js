// Player news engine: classifies every evidence item (RotoWire notes, ESPN articles, Google News
// headlines) with deterministic regex + source tiers — no model, nothing invented — then scores
// relevance per tab using weight profiles, and computes the "so what" for my roster.
// Output contract mirrored by skills/ff-decision-engine/.
import { canon } from './model.js';

// ---------- classification ----------
const RX = {
  dnp: /did not practice|didn.t practice|won.t practice|no practice|not practicing|miss(ed)? (his )?(wed|thurs|fri|mon|tues|satur)day|sat out|non.participant|absent from (practice|the facility)|dnp\b|doesn.t practice|skipped practice|(isn.t|wasn.t|is not|was not) (present|at practice)|not present at (practice|the facility)|isn.t practicing|sidelined during practice/i,
  limited: /limited (in|at|during)? ?practice|limited participant|was limited|practice on a limited|on the side|with a trainer|side drills|individual drills|officially limited/i,
  full: /full (practice|participant|go)|practic(e|ed|ing) in full|practiced without (limitation|restriction)|ran full (practice|drills)/i,
  estimated: /walkthrough|estimated practice/i,
  ir: /injured reserve|\bon IR\b|\bto IR\b|\bfrom IR\b|designated to return for/i,
  out: /\bruled out\b|\blisted as out\b|\bout (for|this|the) (week|game|season|sunday|monday|thursday|saturday)\b|\bwon.t (return|play)\b|\bwill not (return|play)\b|\bexpected to miss (time|multiple)/i,
  doubtful: /\bdoubtful\b/i,
  questionable: /\bquestionable\b/i,
  surgery: /surgery|torn|tear|fracture|broke|break(s)? his|sprain/i,
  activated: /activated|designated to return|cleared to (practice|play)|returning to (practice|action)|off the injury report|ready to return|expected to play|in line to play/i,
  trade: /trade|traded|blockbuster|on the block|trade deadline|landing spots|acquire|deal (for|in)|trading/i,
  rumour: /rumou?r|report(edly)|per (sources|a source)|according to|expected to|linked to|interest(ed)? in|mooting|weighing|exploring|preferred target|watch(ing)? the/i,
  depth: /workload|carries|touches|targets|snaps|backfield|committee|featured|depth chart|goal.?line/i,
  suspension: /suspend|suspended|suspension/i,
  performance: /touchdown|throws|yards|recap|scores|leads|beats|rushes/i,
  body: /\b(ankle|knee|hamstring|concussion|shoulder|quad|calf|wrist|foot|hip|neck|chest|ligament|oblique|ribs?|toe|groin|elbow|illness|head)\b|back injury|hip pointer/i,
};
const STATUS_RANK = { IR: 5, PUP: 5, Sus: 5, NA: 4, DNR: 4, COV: 4, Out: 4, Doubtful: 3, Questionable: 2, Probable: 1 };
const PRACTICE_RANK = { DNP: 3, EST: 2.4, LP: 2, FP: 0.6 };
const TIER1 = /espn|nfl\.com|yahoo|cbs |nbc sports|fox|the athletic|rotowire|sports illustrated|profootballtalk|\bpff\b|boston globe|the ringer|reuters|associated press|ny times|new york times|washington post|the score/i;
const TIER2 = /fantasypros|fantasy footballers|rotoballer|clutchpoints|usa today|bleacher|walterfootball|draftsharks|peacock|sporting news|numberfire/i;
const STOP = new Set('week weeks game games team teams players their about after before could would should might said says report reports news nfl fantasy football start started stadium official officially season seasons being have has had been more most than when where which while during draft look ahead opens vs take takes win wins playing player this that with from and the for are was were'.split(' '));

export function classify(title, text, kind, statusHint) {
  const blob = `${title} ${text || ''}`;
  let practice = null;
  if (RX.full.test(blob)) practice = 'FP';
  else if (RX.dnp.test(blob)) practice = 'DNP';
  else if (RX.estimated.test(blob)) practice = 'EST';
  else if (RX.limited.test(blob)) practice = 'LP';

  // RotoWire notes carry an authoritative status — trust it over prose matching
  let status = null;
  if (kind === 'note') {
    status = statusHint ? canon(statusHint) : null;
  } else if (RX.ir.test(blob)) status = 'IR';
  else if (RX.out.test(blob) && !RX.activated.test(blob)) status = 'Out';
  else if (RX.doubtful.test(blob)) status = 'Doubtful';
  else if (RX.questionable.test(blob)) status = 'Questionable';

  const cats = [];
  if (status || practice || RX.body.test(blob) || RX.surgery.test(blob) || /injur/i.test(blob)) cats.push('injury');
  if (practice) cats.push('practice');
  if (RX.trade.test(blob)) cats.push('trade');
  if (RX.depth.test(blob)) cats.push('depth');
  if (RX.suspension.test(blob)) cats.push('suspension');
  if (!cats.length && RX.performance.test(blob)) cats.push('performance');

  const speculative = kind !== 'note' && RX.rumour.test(blob) && !/official|announc|confirm|activated|cleared to/i.test(blob);
  const posture = speculative ? 'speculative' : kind === 'note' && !RX.rumour.test(blob) ? 'confirmed' : 'reported';
  const better = !speculative && (RX.activated.test(blob) || (status === 'Questionable' && practice === 'FP'));

  return { cats: [...new Set(cats)], practice, status, posture, better };
}

function tierOf(src) {
  if (!src) return 3;
  if (TIER1.test(src)) return 1;
  if (TIER2.test(src)) return 2;
  return 3;
}

function tokens(t) {
  const out = new Set();
  for (const w of t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length > 4 && !STOP.has(w)) out.add(w);
  }
  return out;
}

function similar(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.max(A.size, B.size);
}

// ---------- urgency / impact ----------
function kickoffHours(M, pid) {
  const p = M.P(pid);
  if (!p.game || !p.game.date) return null;
  const ms = new Date(p.game.date).getTime() - M.now;
  if (ms < 0) return -1;
  return ms / 3600000;
}

const URGENCY = (h) => (h == null ? 0.25 : h < 0 ? 0.15 : h <= 2 ? 1 : h <= 26 ? 0.9 : h <= 74 ? 0.7 : h <= 7 * 24 ? 0.5 : 0.3);

function myRosterSpot(M, pid) {
  const l = M.lineup(M.me);
  const i = l.starters.indexOf(pid);
  if (i >= 0) return { where: 'starter', slot: M.slotNames[i] };
  if (l.ir.includes(pid)) return { where: 'ir', slot: null };
  if (l.bench.includes(pid)) return { where: 'bench', slot: null };
  return null;
}

// ---------- weight profiles per tab ----------
const PROFILES = {
  // Relevance should be led by how bad the news is and what it costs my lineup,
  // not by the fact that a player is merely on my roster this week.
  mine: { roster: 0.12, impact: 0.28, urgency: 0.12, severity: 0.36, league: 0.07, tier: 0.05 },
  league: { roster: 0, impact: 0.2, urgency: 0.1, severity: 0.25, league: 0.4, tier: 0.05 },
  wire: { impact: 0.35, availability: 0.25, urgency: 0.15, severity: 0.15, league: 0.05, tier: 0.05 },
};

export function bucketOf(score) {
  if (score >= 75) return 'act';
  if (score >= 55) return 'week';
  if (score >= 35) return 'watch';
  return 'background';
}

// ---------- main ----------
export function buildPlayerNews(M) {
  const snap = M.snap;
  const now = M.now;
  const PN = snap.playerNews || { items: [], degraded: false, disabled: false };
  const winMs = 7 * 86400000;
  const out = { items: [], byPid: new Map(), players: [], flags: { degraded: PN.degraded, disabled: PN.disabled } };

  // ---- unify: notes / ESPN articles / Google News headlines ----
  const raw = [];
  for (const n of snap.notes) {
    const t = n.date ? new Date(n.date).getTime() : 0;
    if (!t || now - t > winMs) continue;
    raw.push({ id: 'n' + n.pid + t, kind: 'note', pid: n.pid, time: t, src: n.src || 'ESPN', title: '', text: [n.short, n.long].filter(Boolean).join(' '), url: null, detail: n });
  }
  for (const a of snap.articles) {
    const t = new Date(a.time).getTime();
    if (!t || now - t > winMs || !a.pids.length) continue;
    for (const pid of a.pids) raw.push({ id: 'a' + a.id + pid, kind: 'article', pid, time: t, src: 'ESPN', title: a.headline, text: a.desc, url: a.url, detail: a });
  }
  for (const g of PN.items || []) {
    const t = g.time || 0;
    if (!t || now - t > winMs) continue;
    raw.push({ id: g.id, kind: 'search', pid: g.pid, time: t, src: g.src || 'Google News', title: g.title, text: '', url: g.url, detail: null });
  }

  // ---- classify ----
  for (const r of raw) {
    const c = classify(r.title, r.text, r.kind, r.detail && r.detail.status);
    const p = M.P(r.pid);
    const isMine = p.own === M.me.id;
    const spot = isMine ? myRosterSpot(M, r.pid) : null;
    const item = {
      ...r,
      pId: r.pid,
      isMine,
      spot,
      urgency: URGENCY(kickoffHours(M, r.pid)),
      cats: c.cats,
      practice: c.practice,
      status: c.status,
      posture: c.posture,
      better: c.better,
      tier: tierOf(r.src),
      headlineOnly: r.kind === 'search',
      reps: 1,
      dupe: false,
      soWhat: null,
      action: null,
    };
    out.items.push(item);
    if (!out.byPid.has(r.pid)) out.byPid.set(r.pid, []);
    out.byPid.get(r.pid).push(item);
  }

  // ---- cluster headline duplicates per player (keep best, count the rest) ----
  for (const list of out.byPid.values()) {
    const search = list.filter((x) => x.kind === 'search').sort((a, b) => b.time - a.time);
    const clusters = [];
    for (const it of search) {
      const c = clusters.find((cl) => similar(it.title, cl.head.title) >= 0.6);
      if (c) {
        c.items.push(it);
        if (it.tier < c.head.tier || (it.tier === c.head.tier && it.src === 'ESPN')) c.head = it;
      } else clusters.push({ head: it, items: [it] });
    }
    for (const c of clusters) {
      c.head.reps = c.items.length;
      for (const dup of c.items.slice(1)) dup.dupe = true;
    }
  }

  // ---- direction per player: compare severity against the previous report (dated) ----
  const rankIt = (x) => {
    if (x.better) return 0.5;
    let sr = null;
    if (x.detail && x.detail.status) sr = STATUS_RANK[canon(x.detail.status)] ?? null;
    if (sr == null && x.status) sr = STATUS_RANK[x.status] ?? 1;
    const pr = x.practice ? PRACTICE_RANK[x.practice] : null;
    if (sr != null && pr != null) return Math.max(sr, pr);
    if (sr != null) return sr;
    return pr;
  };
  for (const list of out.byPid.values()) {
    const seq = [...list].sort((a, b) => a.time - b.time);
    let prev = null;
    for (const x of seq) {
      const rk = rankIt(x);
      x.rank = rk;
      if (rk == null) {
        x.direction = 'flat';
        continue;
      }
      // A lower rank is only "better" when nothing adverse is attached to the newer report.
      // A DNP/LP/EST practice or an Out/IR/Doubtful tag can never read as improvement.
      const adverse = !!x.practice && x.practice !== 'FP'
        || x.status === 'Out' || x.status === 'IR' || x.status === 'Doubtful';
      if (prev == null) x.direction = 'flat';
      else if (rk > prev + 0.4) x.direction = 'worse';
      else if (rk < prev - 0.4 && !adverse) x.direction = 'better';
      else x.direction = 'flat';
      if (x.status != null) prev = rk; // only status-bearing reports set the bar
    }
  }

  // ---- "so what" for my roster, after clustering so health checks see every item ----
  for (const it of out.items) {
    if (!it.isMine || !it.spot) continue;
    const c = { cats: it.cats, practice: it.practice, status: it.status, better: it.better };
    it.soWhat = mySoWhat(M, M.P(it.pId), it.spot, c, out.byPid);
    it.action = myActionLinkId(it.spot, c);
  }

  // ---- score under all three profiles ----
  scoreAll(M, out);
  out.items.sort((a, b) => b.time - a.time);

  // ---- my players: one row each ----
  const order = { act: 0, week: 1, watch: 2, background: 3 };
  for (const pid of [...new Set([...M.me.players, ...M.me.reserve])]) {
    const list = out.byPid.get(pid) || [];
    const p = M.P(pid);
    const spot = myRosterSpot(M, pid);
    const visible = list.filter((x) => !x.dupe);
    let top = visible.reduce((a, b) => (b.relScore > (a?.relScore || 0) ? b : a), null);
    let bucket = top ? top.bucket : 'background';
    if (!visible.length) bucket = p.effSev >= 2 || spot?.where === 'starter' ? 'week' : 'background';
    const notes = visible.filter((x) => x.kind === 'note' && x.practice).sort((a, b) => a.time - b.time);
    const impact = spot ? myImpact(M, pid, spot, out.byPid) : null;
    out.players.push({
      pid,
      p,
      spot,
      bucket,
      top,
      items: visible,
      trend: notes.map((x) => ({ t: x.time, v: x.practice })),
      flagged: visible.some((x) => x.practice === 'DNP' || x.status === 'Out' || x.status === 'IR'),
      sinceMs: visible.length ? now - Math.max(...visible.map((x) => x.time)) : null,
      impact,
      action: impact && spot?.where === 'starter' ? 'lineup' : bucket === 'act' || bucket === 'week' ? 'injuries' : 'news',
    });
  }
  out.players.sort((a, b) => order[a.bucket] - order[b.bucket] || b.p.effSev - a.p.effSev);
  return out;
}

// ---------- helpers ----------
// Health beats models: skip fallbacks whose own news says he can't go.
function newsAdverse(M, byPid, pid) {
  const p = M.P(pid);
  if (p.avail === 'out' || p.avail === 'bye') return true;
  const list = byPid.get(pid) || [];
  return list.some((x) => !x.dupe && (x.practice === 'DNP' || x.status === 'Out' || x.status === 'IR'));
}

function bestFallback(M, slot, exclude, byPid) {
  const ex = [...exclude];
  for (let i = 0; i < 4; i++) {
    const fb = M.fallbackFor(slot, ex);
    if (!fb) return null;
    if (!newsAdverse(M, byPid, fb)) return fb;
    ex.push(fb);
  }
  return null;
}

function myImpact(M, pid, spot, byPid) {
  if (spot.where === 'starter') {
    const fb = bestFallback(M, spot.slot, [pid], byPid);
    const slack = fb != null ? Math.max(0, (M.val(pid) || 0) - M.val(fb)) : null;
    return { where: 'starter', slot: spot.slot, fallback: fb, slack };
  }
  if (spot.where === 'ir') return { where: 'ir', slot: null, fallback: null, slack: 0 };
  return { where: 'bench', slot: null, fallback: null, slack: 0 };
}

function mySoWhat(M, p, spot, c, byPid) {
  const h = kickoffHours(M, p.id);
  const recheck = h != null && h > 0 ? 'Recheck inactives ~90 min before kick' : 'Recheck the Friday practice report';
  if (spot?.where === 'ir') {
    return { text: `On IR — no lineup impact. ${recheck} for a designation to return.`, link: 'injuries' };
  }
  if (c.better) return { text: `Trending up — ${recheck.toLowerCase()}.`, link: 'lineup' };
  if (c.cats.includes('injury') && spot?.where === 'starter') {
    const fb = bestFallback(M, spot.slot, [p.id], byPid);
    const loss = fb != null ? Math.max(0, (M.val(p.id) || 0) - M.val(fb)) : null;
    return {
      text: fb != null ? `If he sits, ${M.P(fb).n} takes ${spot.slot} (−${loss != null ? loss.toFixed(1) : '?'} pts). ${recheck}.` : `If he sits, no healthy fallback for ${spot.slot} — claim one. ${recheck}.`,
      link: 'lineup',
    };
  }
  if (c.practice === 'DNP') return { text: `DNP. A headline alone can't flip the start/sit — ${recheck.toLowerCase()}.`, link: 'injuries' };
  if (c.cats.includes('trade')) {
    const d = M.acceptBy ? Math.round((M.acceptBy - M.now) / 86400000) : null;
    return { text: d != null && d >= 0 ? `League deadline in ${d}d — check the sell window.` : 'Check the trade ledger.', link: 'finder' };
  }
  if (c.cats.includes('depth')) return { text: 'Role change — watch the snap counts.', link: 'news' };
  return null;
}

function myActionLinkId(spot, c) {
  if (c.cats.includes('trade')) return 'finder';
  if (spot?.where === 'starter' && (c.cats.includes('injury') || c.better)) return 'lineup';
  if (spot?.where === 'ir') return 'injuries';
  if (c.practice || c.status) return 'injuries';
  return 'news';
}

function severityOf(it) {
  let s = 0;
  if (it.status) s = (STATUS_RANK[it.status] ?? 1) / 4;
  if (it.practice) s = Math.max(s, (PRACTICE_RANK[it.practice] ?? 0) / 3);
  if (it.better) s = Math.min(s, 0.35);
  // speculation can raise a flag but never carries the weight of a dated report
  if (it.posture === 'speculative') s *= 0.6;
  return Math.min(s, 1);
}

function scoreAll(M, out) {
  const hours = {};
  const winpct = {};
  for (const t of M.snap.teams) winpct[t.id] = (t.w || 0) > 0 || (t.l || 0) > 0 ? t.w / ((t.w || 0) + (t.l || 0) || 1) : 0.35;
  const daysToDeadline = M.acceptBy ? (M.acceptBy - M.now) / 86400000 : 99;

  for (const it of out.items) {
    if (!(it.pId in hours)) hours[it.pId] = kickoffHours(M, it.pId);
    const p = M.P(it.pId);
    const h = hours[it.pId];
    const severe = severityOf(it);
    const league = (winpct[p.own] || 0.35) * 0.6
      + (it.cats.includes('trade') && daysToDeadline < 10 ? 0.4 : 0)
      + (it.cats.includes('practice') ? 0.15 : 0);
    const tierPart = 1 - (it.tier - 1) / 2;

    const mineParts = it.isMine && it.spot
      ? {
          roster: it.spot.where === 'starter' ? 1 : it.spot.where === 'ir' ? 0.2 : 0.4,
          impact: 0.15,
          urgency: URGENCY(h),
          severity: severe,
          league,
          tier: tierPart,
        }
      : { roster: p.own != null ? 0.2 : 0.1, impact: 0, urgency: URGENCY(h), severity: severe, league, tier: tierPart };

    // impact for my starters: how much of his value the fallback absorbs
    if (it.isMine && it.spot?.where === 'starter') {
      const imp = myImpact(M, it.pId, it.spot, out.byPid);
      mineParts.impact = imp.fallback != null ? Math.min(1, (imp.slack || 0) / 4) : 0.9;
    }
    // trade chatter about a bench body is still actionable while the window is open
    if (it.isMine && it.cats.includes('trade') && daysToDeadline < 10) mineParts.impact = Math.max(mineParts.impact, 0.6);
    it.scores = {
      mine: score100(PROFILES.mine, mineParts),
      league: score100(PROFILES.league, {
        impact: it.spot?.where === 'starter' ? 1 : it.cats.includes('trade') ? 0.7 : 0.3,
        urgency: mineParts.urgency,
        severity: severe,
        league,
        tier: tierPart,
        roster: 0,
      }),
      wire: score100(PROFILES.wire, {
        impact: it.spot?.where === 'starter' ? 1 : 0.2,
        availability: nextManFA(M, it.pId) ? 1 : 0,
        urgency: mineParts.urgency,
        severity: severe,
        league,
        tier: tierPart,
      }),
    };
    it.bucket = bucketOf(it.scores.mine);
    it.relScore = it.scores.mine;
  }
}

function score100(W, parts) {
  let s = 0;
  for (const k of Object.keys(W)) s += (W[k] || 0) * (parts[k] || 0);
  return s * 100;
}

function nextManFA(M, pid) {
  const p = M.P(pid);
  if (p.own == null || p.effSev < 2) return false;
  return M.nextManUp(pid).some((c) => c.own == null);
}
