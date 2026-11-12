// Player news engine: classifies every evidence item (RotoWire notes, ESPN articles, Google News
// headlines) with deterministic regex + source tiers — no model, nothing invented — then scores
// relevance per tab using weight profiles, and computes the "so what" for my roster.
// Output contract mirrored by skills/ff-decision-engine/.
import { canon } from './model.js';
import { buildRipple, rippleNet } from './ripple.js';

// ---------- classification ----------
const RX = {
  dnp: /did not practice|didn.t practice|won.t practice|no practice|not practicing|miss(ed)? (his )?(wed|thurs|fri|mon|tues|satur)day|sat out|non.participant|absent from (practice|the facility)|dnp\b|doesn.t practice|skipped practice|(isn.t|wasn.t|is not|was not) (present|at practice)|not present at (practice|the facility)|isn.t practicing|sidelined during practice|(out of|sits? out( \w+.s)?) practice|miss(es|ing)? (another |his )?practice|unable to practice|not seen at practice/i,
  limited: /limited (in|at|during)? ?practice|limited participant|was limited|practice on a limited|on the side|with a trainer|side drills|individual drills|officially limited|\blimited (to begin|again|by|in return)|(as|list\w*) limited/i,
  full: /full (practice|participant|go)|practic(e|ed|ing) in full|practiced without (limitation|restriction)|ran full (practice|drills)|practic(es|ed) fully|full participant|practices in full/i,
  estimated: /walkthrough|estimated practice/i,
  ir: /injured reserve|\bon IR\b|\bto IR\b|\bfrom IR\b|designated to return for/i,
  out: /\bruled out\b|\blisted as out\b|\bout (for|this|the) (week|game|season|sunday|monday|thursday|saturday)\b|\bwon.t (return|play)\b|\bwill not (return|play)\b|\bexpected to miss (time|multiple)|\b(will|to|set to|expected to|likely to) miss (time|multiple|several|a few|the rest|at least|\d+|another|\"?another couple|\w+ weeks)|\bout for (the )?(rest of the |remainder of the )?(season|year)\b|\bmiss(es)? the rest of the (season|year)|\bdoes(n.t| not) play\b|(?<!\bnot )\binactive\b|\bout for an? .?extended/i,
  doubtful: /\bdoubtful\b|\bunlikely.{0,3} to play/i,
  questionable: /\bquestionable\b/i,
  // "broke out" / "broke a tackle" are performance, not injuries: require a body part.
  surgery: /surgery|fracture|sprain|\b(torn|tears?)\b.{0,20}\b(acl|mcl|pcl|achilles|labrum|meniscus|hamstring|pec\w*|rotator|ligament|tendon|muscle|quad|calf|biceps|triceps)\b|\bbr(oke|oken|eaks?) (his |a |the |her )?(\w+ )?(ankle|leg|arm|hand|foot|wrist|collarbone|ribs?|finger|thumb|jaw|nose|fibula|tibia|bone|fema?ur)\b/i,
  activated: /activated|designated to return|cleared to (practice|play)|returning to (practice|action)|off the injury report|ready to return|expected to play|in line to play|\boff (the )?IR\b|\bclear(ed)? for (sunday|monday|thursday|saturday|week)|no injury designation|\breturns? to practice|full.?go\b|good to go|(?<!in)\bactive\b|\bwill play\b|\bback at practice|ready to play|\breturned to practice|(?<!not )\bpracticing (mon|tues|wednes|thurs|fri|satur)day/i,
  trade: /trade|traded|blockbuster|on the block|trade deadline|landing spots|acquire|deal (for|in)|trading/i,
  rumour: /rumou?r|report(edly)|per (sources|a source)|according to|expected to|linked to|interest(ed)? in|mooting|weighing|exploring|preferred target|\b(could|might|may) (miss|practice|return|play|be (out|back|ready))\b|\bunlikely\b|trending (toward|towards)|not guaranteed|\biffy\b|\breport:|\bcould\b|\bhints?\b|\bmay not\b/i,
  depth: /workload|carries|touches|targets|snaps|backfield|committee|featured|depth chart|goal.?line/i,
  roleUp: /expanded|bigger role|increased (role|work|snaps)|featured|lead (back|role)|starting role|promoted|elevated|takes? over|more (snaps|touches|targets|work)|workhorse|bell.?cow|named (the )?starter|will start\b/i,
  roleDown: /reduced|decreased|demoted|benched|loses? (snaps|work|role|touches)|smaller role|fewer (snaps|touches|targets)|backup role|phased out|healthy scratch/i,
  suspension: /suspend|suspended|suspension/i,
  performance: /touchdown|throws|yards|recap|scores|leads|beats|rushes/i,
  body: /\b(ankle|knee|hamstring|concussion|shoulder|quad|calf|wrist|foot|hip|neck|chest|ligament|oblique|ribs?|toe|groin|elbow|illness|head)\b|back injury|hip pointer/i,
};
// Phrases that are health news even when worded as an expectation ("expected to play"),
// plus official attributions. Stripped before the rumour test.
const NOT_RUMOUR = new RegExp(RX.activated.source + '|expected to (start|play|return|be (active|available|full.?go|ready|cleared))|according to (the )?(team|coach\\w*|head coach|injury report|official\\w*|league)', 'gi');
const STATUS_RANK = { IR: 5, PUP: 5, Sus: 5, NA: 4, DNR: 4, COV: 4, Out: 4, Doubtful: 3, Questionable: 2, Probable: 1 };
const PRACTICE_RANK = { DNP: 3, EST: 2.4, LP: 2, FP: 0.6 };
const TIER1 = /espn|nfl\.com|yahoo|cbs |nbc sports|fox|the athletic|rotowire|sports illustrated|profootballtalk|\bpff\b|boston globe|the ringer|reuters|associated press|ny times|new york times|washington post|the score/i;
const TIER2 = /fantasypros|fantasy footballers|rotoballer|clutchpoints|usa today|bleacher|walterfootball|draftsharks|peacock|sporting news|numberfire/i;
const STOP = new Set('week weeks game games team teams players their about after before could would should might said says report reports news nfl fantasy football start started stadium official officially season seasons being have has had been more most than when where which while during draft look ahead opens vs take takes win wins playing player this that with from and the for are was were'.split(' '));

// Headlines often carry two players' news ("Malik Willis on IR, Kyle McCord in line to start").
// Status and practice words count for a player only from the clauses about him: clauses naming
// him, clauses naming nobody else (and no team), and, when his clause is just his name in a list
// ("Mike Evans, Deebo Samuel, Christian Kirk ruled out"), the list's predicate.
const NICKS = /\b(cardinals|falcons|ravens|bills|panthers|bears|bengals|browns|cowboys|broncos|lions|packers|texans|colts|jaguars|chiefs|raiders|chargers|rams|dolphins|vikings|patriots|saints|giants|jets|eagles|steelers|49ers|niners|seahawks|buccaneers|bucs|titans|commanders)\b/i;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
const nameKey = (n) => norm(n).split(' ').filter((w) => !SUFFIXES.has(w)).join(' ');
export function focusText(title, who, others) {
  if (!who || !title) return title;
  const me = nameKey(who);
  const last = me.split(' ').slice(-1)[0];
  if (!last || !norm(title).includes(last)) return title;
  const clauses = title.split(/\s*(?:[;:,?|]|\s[-–—]\s|\s(?:as|after|amid|while|but|with)\s(?=[A-Z]))\s*/).filter(Boolean);
  if (clauses.length < 2) return title;
  const otherIn = (c) => {
    const n = ` ${norm(c)} `;
    for (const o of others || []) if (o !== me && o.length > 4 && n.includes(` ${o} `)) return true;
    return false;
  };
  const statusy = (c) => RX.ir.test(c) || RX.out.test(c) || RX.doubtful.test(c) || RX.questionable.test(c) || RX.dnp.test(c) || RX.limited.test(c) || RX.full.test(c) || RX.activated.test(c);
  const keep = [];
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    const n = norm(c);
    if (n.includes(last)) {
      keep.push(c);
      // just his name in a list: the list's predicate applies to him too
      const rest = n.replace(me, '').replace(last, '').trim();
      if (rest.split(' ').filter(Boolean).length <= 1 && !statusy(c)) {
        for (let j = i + 1; j < clauses.length; j++) {
          if (statusy(clauses[j])) {
            keep.push(clauses[j]);
            break;
          }
        }
      }
    } else if (!otherIn(c) && !NICKS.test(c)) keep.push(c);
  }
  return keep.length ? keep.join(', ') : title;
}

export function classify(title, text, kind, statusHint, who = null, others = null) {
  const blob = `${title} ${text || ''}`;
  // status, practice and good-news words are read only from the parts about this player
  const own = who ? `${focusText(title, who, others)} ${text || ''}` : blob;
  let practice = null;
  if (RX.full.test(own)) practice = 'FP';
  else if (RX.dnp.test(own)) practice = 'DNP';
  else if (RX.estimated.test(own)) practice = 'EST';
  else if (RX.limited.test(own)) practice = 'LP';

  // RotoWire notes carry an authoritative status — trust it over prose matching
  let status = null;
  if (kind === 'note') {
    status = statusHint ? canon(statusHint) : null;
  } else if (RX.ir.test(own) && !RX.activated.test(own) && !/return(s|ing)? from (ir|injured reserve)|(may not|won.t|will not|not) (go|be placed|land) on (ir|injured reserve)/i.test(own)) status = 'IR';
  else if (RX.out.test(own) && !RX.activated.test(own)) status = 'Out';
  else if (RX.doubtful.test(own)) status = 'Doubtful';
  else if (RX.questionable.test(own)) status = 'Questionable';

  const cats = [];
  if (status || practice || RX.body.test(blob) || RX.surgery.test(blob) || /injur/i.test(blob)) cats.push('injury');
  if (practice) cats.push('practice');
  if (RX.trade.test(blob)) cats.push('trade');
  if (RX.depth.test(blob)) cats.push('depth');
  if (RX.suspension.test(blob)) cats.push('suspension');
  if (!cats.length && RX.performance.test(blob)) cats.push('performance');

  const speculative = kind !== 'note' && RX.rumour.test(blob.replace(NOT_RUMOUR, ' ')) && !/official|announc|confirm|activated|cleared to/i.test(blob);
  const posture = speculative ? 'speculative' : kind === 'note' && !RX.rumour.test(blob) ? 'confirmed' : 'reported';
  const better = !speculative && (RX.activated.test(own) || (practice === 'FP' && (!status || status === 'Questionable')));

  const roleDir = RX.roleDown.test(blob) ? 'down' : RX.roleUp.test(blob) ? 'up' : null;
  if (roleDir && !cats.includes('depth')) cats.push('depth');

  return { cats: [...new Set(cats)], practice, status, posture, better, roleDir };
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
  // A rival's news matters most when he starts against me this week.
  league: { opponent: 0.3, impact: 0.2, urgency: 0.1, severity: 0.25, league: 0.1, tier: 0.05 },
  // A free agent matters when his role grows (a starter ahead of him is out, he was promoted)
  // and he would improve my lineup — not when he is the one who got hurt.
  wire: { impact: 0.3, opportunity: 0.35, availability: 0.1, urgency: 0.1, league: 0.1, tier: 0.05 },
};

// Ripple estimates can raise a flag or reorder a list, never reach "act" on their own.
const RIPPLE_CAP = 74;

export function bucketOf(score) {
  if (score >= 75) return 'act';
  if (score >= 55) return 'week';
  if (score >= 35) return 'watch';
  return 'background';
}

// One build per model: Briefing, News and the decision engine all share it.
const memo = new WeakMap();
export function playerNewsFor(M) {
  let res = memo.get(M);
  if (!res) {
    res = buildPlayerNews(M);
    memo.set(M, res);
  }
  return res;
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
    const meta = PN.perPlayer?.[g.pid] || null;
    raw.push({
      id: g.id,
      kind: 'search',
      pid: g.pid,
      time: t,
      src: g.src || 'Google News',
      domain: g.domain || null,
      storyId: g.storyId || null,
      alsoPids: g.alsoPids || [],
      stale: !!meta?.stale,
      title: g.title,
      text: '',
      url: g.url,
      detail: null,
    });
  }

  // Status changes from the snapshot's diff log: dated, confirmed events.
  for (const [pid, list] of Object.entries(snap.changes || {})) {
    for (const ch of list) {
      if (!ch.at || now - ch.at > winMs) continue;
      const item = changeItem(pid, ch);
      if (item) raw.push(item);
    }
  }

  // ---- classify ----
  const others = otherNames(M);
  for (const r of raw) {
    const c = r.pre || classify(r.title, r.text, r.kind, r.detail && r.detail.status, r.kind === 'note' ? null : M.P(r.pid).n, others);
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
      roleDir: c.roleDir,
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

  // ---- ripple: teammate injuries, returns and trades move other players' volume ----
  const betterPids = new Set(out.items.filter((x) => x.better && x.posture !== 'speculative').map((x) => x.pId));
  const ripple = buildRipple(snap.players, { P: M.P, W: M.W, now, isBye: M.isBye, better: betterPids, lines: snap.lines });
  out.ripple = ripple;
  for (const e of ripple.effects) {
    if (!snap.players[e.pid]) continue;
    const srcItems = (out.byPid.get(e.src) || []).filter((x) => !x.dupe);
    const nu = Number(M.P(e.src).nu) || 0;
    const t = srcItems.length ? Math.max(...srcItems.map((x) => x.time)) : nu && now - nu < winMs ? nu : now;
    const item = rippleItem(M, e, Math.min(t, now));
    out.items.push(item);
    if (!out.byPid.has(e.pid)) out.byPid.set(e.pid, []);
    out.byPid.get(e.pid).push(item);
  }

  // ---- "so what" for my roster, after clustering so health checks see every item ----
  for (const it of out.items) {
    if (!it.isMine || !it.spot) continue;
    if (it.kind === 'ripple') {
      it.soWhat = rippleSoWhat(it.ripple, it.spot);
      it.action = it.soWhat.link;
      continue;
    }
    const c = { cats: it.cats, practice: it.practice, status: it.status, better: it.better, roleDir: it.roleDir };
    it.soWhat = mySoWhat(M, M.P(it.pId), it.spot, c, out.byPid);
    it.action = myActionLinkId(it.spot, c);
  }

  // ---- score under all three profiles ----
  scoreItems(M, out.items, out.byPid, ripple);
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
      flagged: latestAdverse(out.byPid, pid),
      sinceMs: visible.length ? now - Math.max(...visible.map((x) => x.time)) : null,
      stale: !!PN.perPlayer?.[pid]?.stale,
      impact,
      ripple: ripple.byPid.get(pid) || [],
      action: impact && spot?.where === 'starter' ? 'lineup' : bucket === 'act' || bucket === 'week' ? 'injuries' : 'news',
    });
  }
  out.players.sort((a, b) => order[a.bucket] - order[b.bucket] || b.p.effSev - a.p.effSev);
  return out;
}

// ---------- helpers ----------
const STATUS_WORD = (v) => v || 'no tag';
const SEV_OF = (v) => STATUS_RANK[canon(v)] || 0;

// A logged status change as a news item. Its classification is exact, not regex-read.
function changeItem(pid, ch) {
  const base = { id: `c${pid}-${ch.field}-${ch.at}`, kind: 'change', pid, time: ch.at, text: '', url: null, detail: null, change: ch };
  if (ch.field === 'inj' || ch.field === 'es') {
    const to = canon(ch.to);
    const better = SEV_OF(ch.to) < SEV_OF(ch.from);
    return {
      ...base,
      src: ch.field === 'inj' ? 'Sleeper' : 'ESPN',
      title: `${ch.field === 'inj' ? 'Sleeper' : 'ESPN'} status: ${STATUS_WORD(ch.from)} → ${STATUS_WORD(ch.to)}`,
      pre: { cats: ['injury'], practice: null, status: to, posture: 'confirmed', better, roleDir: null },
    };
  }
  if (ch.field === 'off') {
    const to = canon(ch.to);
    return {
      ...base,
      src: 'NFL injury report',
      title: `Official status: ${STATUS_WORD(ch.from)} → ${STATUS_WORD(ch.to)}`,
      pre: { cats: ['injury'], practice: null, status: to, posture: 'confirmed', better: SEV_OF(ch.to) < SEV_OF(ch.from), roleDir: null },
    };
  }
  if (ch.field === 'prac') {
    const rank = { FP: 0, LP: 1, DNP: 2 };
    const word = { FP: 'full', LP: 'limited', DNP: 'did not practice' };
    return {
      ...base,
      src: 'NFL injury report',
      title: `Practice: ${word[ch.from] || 'not listed'} → ${word[ch.to] || 'not listed'}`,
      pre: { cats: ['practice'], practice: ch.to === 'FP' ? 'FP' : ch.to === 'LP' ? 'LP' : ch.to === 'DNP' ? 'DNP' : null, status: null, posture: 'confirmed', better: (rank[ch.to] ?? 0) < (rank[ch.from] ?? 0), roleDir: null },
    };
  }
  if (ch.field === 'depth') {
    const up = ch.to != null && (ch.from == null || ch.to < ch.from);
    return {
      ...base,
      src: 'Sleeper depth chart',
      title: `Depth chart: ${ch.from != null ? '#' + ch.from : 'unlisted'} → ${ch.to != null ? '#' + ch.to : 'unlisted'}`,
      pre: { cats: ['depth'], practice: null, status: null, posture: 'confirmed', better: false, roleDir: up ? 'up' : 'down' },
    };
  }
  if (ch.field === 'team') {
    return {
      ...base,
      src: 'Sleeper',
      title: `Team: ${ch.from || 'free agent'} → ${ch.to || 'free agent'}`,
      pre: { cats: ['trade'], practice: null, status: null, posture: 'confirmed', better: false, roleDir: null },
    };
  }
  return null;
}

function rippleItem(M, e, time) {
  const p = M.P(e.pid);
  const isMine = p.own === M.me.id;
  return {
    id: 'r' + e.kind + e.src + '-' + e.pid,
    kind: 'ripple',
    pid: e.pid,
    pId: e.pid,
    time,
    src: 'Ripple estimate',
    domain: null,
    storyId: 'r' + e.src + '-' + e.pid,
    alsoPids: [e.src],
    title: e.why,
    text: '',
    url: null,
    detail: null,
    ripple: e,
    isMine,
    spot: isMine ? myRosterSpot(M, e.pid) : null,
    urgency: URGENCY(kickoffHours(M, e.pid)),
    cats: ['ripple'],
    practice: null,
    status: null,
    posture: 'estimate',
    better: false,
    tier: 2,
    headlineOnly: false,
    reps: 1,
    dupe: false,
    soWhat: null,
    action: null,
    direction: e.dir === 'up' ? 'better' : 'worse',
  };
}

function rippleSoWhat(e, spot) {
  if (spot?.where === 'starter' && e.dir === 'down') return { text: 'Teammate news lowers his outlook. An estimate alone does not bench him — compare projections in Lineup.', link: 'lineup' };
  if (spot?.where === 'bench' && e.dir === 'up') return { text: 'Teammate news grows his role. Compare him with your starter in Lineup before kickoff.', link: 'lineup' };
  if (e.dir === 'up') return { text: 'Teammate news grows his role this week (estimate).', link: 'news' };
  return { text: 'Teammate news cuts into his role (estimate) — watch his snap share.', link: 'news' };
}

// Health beats models: skip fallbacks whose own news says he can't go.
// The latest dated report that carries a status or practice line decides, so a player who was
// Out on Wednesday and cleared on Friday is not still treated as out. Speculation and ripple
// estimates never count.
export function latestAdverse(byPid, pid) {
  const list = (byPid.get(pid) || [])
    .filter((x) => !x.dupe && x.posture !== 'speculative' && x.posture !== 'estimate')
    .filter((x) => x.practice || x.status || x.kind === 'change' || x.better)
    .sort((a, b) => b.time - a.time);
  const last = list[0];
  return !!last && !last.better && (last.practice === 'DNP' || last.status === 'Out' || last.status === 'IR');
}

function newsAdverse(M, byPid, pid) {
  const p = M.P(pid);
  if (p.avail === 'out' || p.avail === 'bye') return true;
  return latestAdverse(byPid, pid);
}

export function healthiestFallback(M, slot, exclude, byPid) {
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
    const fb = healthiestFallback(M, spot.slot, [pid], byPid);
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
    const fb = healthiestFallback(M, spot.slot, [p.id], byPid);
    const loss = fb != null ? Math.max(0, (M.val(p.id) || 0) - M.val(fb)) : null;
    return {
      text: fb != null
        ? loss > 0
          ? `If he sits, ${M.P(fb).n} takes ${spot.slot} (−${loss.toFixed(1)} pts). ${recheck}.`
          : `If he sits, ${M.P(fb).n} takes ${spot.slot} with no projected drop-off. ${recheck}.`
        : `If he sits, no healthy fallback for ${spot.slot} — claim one. ${recheck}.`,
      link: 'lineup',
    };
  }
  if (c.practice === 'DNP') return { text: `DNP. One report alone can't flip the start/sit — ${recheck.toLowerCase()}.`, link: 'injuries' };
  if (c.cats.includes('trade')) {
    const d = M.acceptBy ? Math.round((M.acceptBy - M.now) / 86400000) : null;
    return { text: d != null && d >= 0 ? `League deadline in ${d}d — check the sell window.` : 'Check the trade ledger.', link: 'finder' };
  }
  if (c.cats.includes('depth')) {
    if (c.roleDir === 'up') return { text: 'Role growing — compare him with your starter in Lineup.', link: 'lineup' };
    if (c.roleDir === 'down') return { text: 'Role shrinking — check his snap share before starting him.', link: 'lineup' };
    return { text: 'Role news without a clear direction — watch the snap counts.', link: 'news' };
  }
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
  if (it.ripple) return it.ripple.dir === 'down' ? it.ripple.mag * 0.6 : 0;
  let s = 0;
  if (it.status) s = (STATUS_RANK[it.status] ?? 1) / 4;
  if (it.practice) s = Math.max(s, (PRACTICE_RANK[it.practice] ?? 0) / 3);
  if (it.better) s = Math.min(s, 0.35);
  // speculation can raise a flag but never carries the weight of a dated report
  if (it.posture === 'speculative') s *= 0.6;
  return Math.min(s, 1);
}

// How much a free agent's own report opens or closes a path to playing time.
function opportunityOf(it, up) {
  if (it.ripple) return it.ripple.dir === 'up' ? Math.max(0.5, it.ripple.mag) : 0.05;
  const adverse = it.status === 'Out' || it.status === 'IR' || it.status === 'Doubtful' || it.practice === 'DNP';
  let o = 0.3;
  if (adverse) o = 0.05;
  else if (it.status === 'Questionable' || it.practice === 'LP') o = 0.15;
  else if (it.better) o = 0.8;
  else if (it.cats.includes('depth')) o = 0.6;
  else if (it.cats.includes('trade')) o = 0.4;
  if (!adverse && up > 0) o = Math.max(o, up * 0.8);
  if (it.posture === 'speculative') o *= 0.6;
  return o;
}

function scoreItems(M, items, byPid, ripple) {
  const hours = {};
  const winpct = {};
  for (const t of M.snap.teams) winpct[t.id] = (t.w || 0) > 0 || (t.l || 0) > 0 ? t.w / ((t.w || 0) + (t.l || 0) || 1) : 0.35;
  const daysToDeadline = M.acceptBy ? (M.acceptBy - M.now) / 86400000 : 99;
  const oppId = M.opp ? M.opp.id : null;
  const starters = {};
  const startsFor = (own) => (starters[own] ||= new Set(M.teamBy[own] ? M.lineup(M.teamBy[own]).starters.filter(Boolean) : []));
  const addImp = {};
  const addFor = (pid) => (pid in addImp ? addImp[pid] : (addImp[pid] = M.addImpact ? Math.max(0, M.addImpact(pid, M.W) || 0) : 0));
  const upFor = (pid) => Math.max(0, rippleNet(ripple?.byPid.get(pid)));

  for (const it of items) {
    if (!(it.pId in hours)) hours[it.pId] = kickoffHours(M, it.pId);
    const p = M.P(it.pId);
    const h = hours[it.pId];
    const severe = severityOf(it);
    const league = Math.min(1, (winpct[p.own] || 0.35) * 0.4
      + (it.cats.includes('trade') && daysToDeadline < 10 ? 0.4 : 0)
      + (it.cats.includes('practice') ? 0.15 : 0));
    const tierPart = 1 - (it.tier - 1) / 2;
    const urgency = URGENCY(h);
    const mag = it.ripple ? it.ripple.mag : 0;

    const mineParts = it.isMine && it.spot
      ? {
          roster: it.spot.where === 'starter' ? 1 : it.spot.where === 'ir' ? 0.2 : 0.4,
          impact: 0.15,
          urgency,
          severity: severe,
          league,
          tier: tierPart,
        }
      : { roster: p.own != null ? 0.2 : 0.1, impact: 0, urgency, severity: severe, league, tier: tierPart };

    if (it.ripple && it.isMine && it.spot) {
      const starter = it.spot.where === 'starter';
      mineParts.impact = it.ripple.dir === 'down' ? mag * (starter ? 0.9 : 0.3) : mag * (starter ? 0.6 : 0.7);
      if (it.ripple.dir === 'up') mineParts.severity = mag * 0.4;
    } else if (it.isMine && it.spot?.where === 'starter') {
      // impact for my starters: how much of his value the fallback absorbs
      const imp = myImpact(M, it.pId, it.spot, byPid);
      mineParts.impact = imp.fallback != null ? Math.min(1, (imp.slack || 0) / 4) : 0.9;
    }
    // trade chatter about a bench body is still actionable while the window is open
    if (it.isMine && it.cats.includes('trade') && daysToDeadline < 10) mineParts.impact = Math.max(mineParts.impact, 0.6);

    const rivalStarter = p.own != null && p.own !== M.me.id && startsFor(p.own).has(it.pId);
    const leagueParts = {
      opponent: oppId != null && p.own === oppId ? (rivalStarter ? 1 : 0.5) : 0,
      impact: it.ripple ? mag * (rivalStarter ? 1 : 0.5) : rivalStarter ? 1 : it.cats.includes('trade') ? 0.7 : 0.3,
      urgency,
      severity: it.ripple ? mag * 0.6 : severe,
      league,
      tier: tierPart,
    };

    const up = p.own == null ? upFor(it.pId) : 0;
    const wireParts = {
      impact: p.own == null ? Math.min(1, addFor(it.pId) / 5) : 0,
      opportunity: opportunityOf(it, up),
      availability: up > 0 ? 1 : 0,
      urgency,
      league: p.trend?.add ? Math.max(0, 1 - (p.trend.add.rank - 1) / 40) : 0,
      tier: tierPart,
    };

    const cap = (v) => (it.kind === 'ripple' ? Math.min(v, RIPPLE_CAP) : v);
    it.scores = {
      mine: cap(score100(PROFILES.mine, mineParts)),
      league: cap(score100(PROFILES.league, leagueParts)),
      wire: cap(score100(PROFILES.wire, wireParts)),
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

// Every player name in the snapshot, for telling whose news a headline carries.
const namesMemo = new WeakMap();
function otherNames(M) {
  if (!namesMemo.has(M.snap)) namesMemo.set(M.snap, [...new Set(Object.values(M.snap.players || {}).filter((p) => p.pos !== 'DEF').map((p) => nameKey(p.n)))]);
  return namesMemo.get(M.snap);
}

// On-demand lookup: classify a single player's freshly fetched headlines without
// rebuilding the whole snapshot. Same fields the News rows expect.
export function lookupItems(M, pid, raw) {
  const p = M.P(pid);
  const isMine = p.own === M.me.id;
  const spot = isMine ? myRosterSpot(M, pid) : null;
  const items = (raw || [])
    .map((g) => {
      const c = classify(g.title || '', '', 'search', null, p.n, otherNames(M));
      return {
        id: g.id || 'l' + (g.time || 0) + (g.title || ''),
        kind: 'search',
        pId: pid,
        pid,
        time: g.time || 0,
        src: g.src || 'Google News',
        domain: g.domain || null,
        storyId: g.storyId || null,
        alsoPids: g.alsoPids || [],
        title: g.title || '',
        text: '',
        url: g.url || null,
        detail: null,
        isMine,
        spot,
        urgency: URGENCY(kickoffHours(M, pid)),
        cats: c.cats,
        practice: c.practice,
        status: c.status,
        posture: c.posture,
        better: c.better,
        roleDir: c.roleDir,
        tier: tierOf(g.src),
        headlineOnly: true,
        reps: 1,
        dupe: false,
        soWhat: null,
        action: null,
        direction: 'flat',
      };
    })
    .filter((x) => x.time)
    .sort((a, b) => b.time - a.time);
  // Same scoring and "so what" as the cached rows, so a fetched report is ranked, not flat.
  const res = playerNewsFor(M);
  scoreItems(M, items, res.byPid, res.ripple);
  for (const it of items) {
    if (!it.isMine || !it.spot) continue;
    const c = { cats: it.cats, practice: it.practice, status: it.status, better: it.better, roleDir: it.roleDir };
    it.soWhat = mySoWhat(M, p, it.spot, c, res.byPid);
  }
  return items;
}
