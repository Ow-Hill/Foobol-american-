import { esc, n1, n0, pct, avg, sum, ord, signed } from '../util.js';
import { card, table, playerName, shareBar, bar } from '../ui.js';

const letter = (score) => (score >= 85 ? 'A' : score >= 65 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F');
const gcls = (l) => l.toLowerCase();

function analyze(M) {
  if (M._rate) return M._rate;
  const V = M.V;
  const regEnd = M.L.settings.playoff_week_start - 1;
  const o = M.odds();
  const rows = M.teams.map((t) => {
    const l = M.lineup(t);
    const vfn = (id) => V.ppg(id) * Math.min(1, V.avail(id) + 0.1);
    const typ = M.solve(l.active, { v: vfn, can: (id) => !M.P(id).missing });
    const grp = { QB: 0, RB: 0, WR: 0, TE: 0, KD: 0 };
    typ.slots.forEach((s) => s.pid && (grp[['K', 'DEF'].includes(M.P(s.pid).pos) ? 'KD' : M.P(s.pid).pos] += s.v));
    const starters = new Set(typ.slots.map((s) => s.pid));
    const bench = l.active.filter((id) => !starters.has(id) && ['RB', 'WR', 'TE', 'QB'].includes(M.P(id).pos)).sort((a, b) => V.vorp(b) - V.vorp(a));
    const depth = sum(bench.slice(0, 4).map((id) => vfn(id)));
    const healthLoss = sum(typ.slots.filter((s) => s.pid).map((s) => V.ppg(s.pid) * (1 - V.avail(s.pid)))) + l.ir.filter((id) => V.ppg(id) >= 10).length * 3;
    let byeLoss = 0;
    let byeWorst = null;
    for (let wk = M.W; wk <= regEnd; wk++) {
      const ids = l.active.filter((id) => !M.isBye(M.P(id).team, wk));
      const tot = M.solve(ids, { v: vfn, can: (id) => !M.P(id).missing }).total;
      const loss = typ.total - tot;
      byeLoss += loss;
      if (!byeWorst || loss > byeWorst.loss) byeWorst = { wk, loss };
    }
    const top8 = l.active.slice().sort((a, b) => V.vorp(b) - V.vorp(a)).slice(0, 8).map((id) => M.P(id).age).filter((x) => x);
    const age = avg(top8);
    const s = M.weekScores[t.id].filter((x) => x > 0);
    const trend = s.length >= 4 ? avg(s.slice(-3)) - avg(s) : 0;
    let apW = 0;
    let apG = 0;
    for (let i = 0; i < s.length; i++) for (const u of M.teams) if (u.id !== t.id && M.weekScores[u.id][i] != null) { apG++; if (s[i] > M.weekScores[u.id][i]) apW++; }
    const games = t.w + t.l + t.t;
    const luck = games ? t.w - (apW / Math.max(apG, 1)) * games : 0;
    return { t, typ, grp, depth, healthLoss, byeLoss, byeWorst, age, trend, luck, apPct: apW / Math.max(apG, 1), bench, starters: typ.slots, outlook: o[t.id] };
  });
  const rankOf = (key, higherBetter = true) => {
    const sorted = [...rows].sort((a, b) => (higherBetter ? b[key] - a[key] : a[key] - b[key]));
    sorted.forEach((r, i) => ((r.rk ||= {})[key] = i + 1));
  };
  rows.forEach((r) => (r.total = r.typ.total));
  ['total', 'depth'].forEach((k) => rankOf(k, true));
  ['healthLoss', 'byeLoss', 'age'].forEach((k) => rankOf(k, false));
  for (const g of ['QB', 'RB', 'WR', 'TE', 'KD']) {
    const sorted = [...rows].sort((a, b) => b.grp[g] - a.grp[g]);
    sorted.forEach((r, i) => ((r.rk ||= {})['g' + g] = i + 1));
  }
  rows.forEach((r) => (r.outlookScore = r.outlook.playoff * 60 + r.outlook.title * 100 * 0.4));
  rankOf('outlookScore', true);
  const n = rows.length;
  const sc = (rank) => 100 - ((rank - 1) / (n - 1)) * 100;
  rows.forEach((r) => {
    r.cats = [
      { k: 'Starting lineup', rank: r.rk.total, val: `${n1(r.total)} pts a week typical`, w: 0.4 },
      { k: 'Depth', rank: r.rk.depth, val: `top 4 bench players average ${n1(r.depth / 4)} pts a week`, w: 0.15 },
      { k: 'Health', rank: r.rk.healthLoss, val: r.healthLoss < 0.5 ? 'no starter missing time' : `${n1(r.healthLoss)} pts a week at risk`, w: 0.15 },
      { k: 'Bye weeks', rank: r.rk.byeLoss, val: r.byeWorst && r.byeWorst.loss > 0.5 ? `worst: Week ${r.byeWorst.wk} (−${n1(r.byeWorst.loss)})` : 'little bye damage', w: 0.1 },
      { k: 'Longevity', rank: r.rk.age, val: r.age ? `core averages ${n1(r.age)} years old` : 'n/a', w: 0.1 },
      { k: 'Season outlook', rank: r.rk.outlookScore, val: `${pct(r.outlook.playoff)} playoffs · ${pct(r.outlook.title)} title`, w: 0.1 },
    ].map((c) => ({ ...c, score: sc(c.rank), letter: letter(sc(c.rank)) }));
    r.overall = sum(r.cats.map((c) => c.score * c.w));
    r.letter = letter(r.overall);
  });
  const ov = [...rows].sort((a, b) => b.overall - a.overall);
  ov.forEach((r, i) => (r.overallRank = i + 1));
  return (M._rate = rows);
}

export function render(M, ctx) {
  const rows = analyze(M);
  const r = rows.find((x) => x.t.id === M.me.id);
  const n = rows.length;
  const groups = [['QB', 'Quarterback'], ['RB', 'Running back'], ['WR', 'Wide receiver'], ['TE', 'Tight end'], ['KD', 'Kicker & defense']];
  const grpScore = (rk) => 100 - ((rk - 1) / (n - 1)) * 100;
  const grpRows = groups.map(([k, label]) => {
    const rk = r.rk['g' + k];
    const sc = grpScore(rk);
    const who = r.starters.filter((s) => s.pid && (k === 'KD' ? ['K', 'DEF'].includes(M.P(s.pid).pos) : M.P(s.pid).pos === k)).map((s) => M.P(s.pid).n);
    const best = Math.max(...rows.map((x) => x.grp[k]));
    return { k, label, rk, sc, who, val: r.grp[k], best };
  });
  const strong = [...r.cats, ...grpRows.map((g) => ({ k: g.label, rank: g.rk, score: g.sc, val: `${n1(g.val)} pts a week · ${g.who.join(', ')}` }))].sort((a, b) => b.score - a.score);
  const strengths = strong.slice(0, 3);
  const weak = strong.slice().reverse().slice(0, 3);
  const meT = r.t;
  const spare = r.bench.filter((id) => M.V.value(id) > 5);
  const out = r.outlook;
  const lucky = r.luck;
  const outlookTxt = `${esc(meT.name.trim())} is ${meT.w}-${meT.l} but its scoring says ${n1((r.apPct) * 100)}% of all-play games would be wins — ${Math.abs(lucky) < 0.7 ? 'about what the record deserves' : lucky < 0 ? `the record is running ${n1(-lucky)} wins behind the points` : `the record is ${n1(lucky)} wins ahead of the points`}. The simulation gives ${pct(out.playoff)} to make the playoffs and ${pct(out.title)} to win the title, with ${n1(out.wins)} wins expected overall.${r.trend > 3 ? ` Scoring is trending up (+${n1(r.trend)} over the last 3 weeks).` : r.trend < -3 ? ` Scoring is trending down (${n1(r.trend)} over the last 3 weeks).` : ''}`;
  const actions = [];
  const wk = weak[0];
  actions.push(`<b>Biggest weakness — ${esc(wk.k)}</b> (${ord(wk.rank || n)} of ${n}): ${esc(wk.val)}. ${['Starting lineup', 'Depth'].includes(wk.k) || groups.some((g) => g[1] === wk.k) ? 'Run the Trade finder aimed at this spot.' : wk.k === 'Health' ? 'Check the Injuries page for IR moves and replacements.' : wk.k === 'Bye weeks' ? 'Use Waivers to line up bye cover.' : ''}`);
  if (spare.length) actions.push(`<b>Spare parts to move:</b> ${spare.slice(0, 3).map((id) => esc(M.P(id).n)).join(', ')} are valuable but not in your typical lineup — the best currency for a 2-for-1.`);
  if (r.byeWorst && r.byeWorst.loss > 5) actions.push(`<b>Bye-week hole:</b> Week ${r.byeWorst.wk} costs about ${n1(r.byeWorst.loss)} points of lineup strength — plan cover before then.`);
  const text = `${meT.name.trim()} — team rating: ${r.letter} (${ord(r.overallRank)} of ${n})\n${r.cats.map((c) => `${c.k}: ${c.letter} (${ord(c.rank)}) — ${c.val}`).join('\n')}\nStrengths: ${strengths.map((s) => s.k).join(', ')}\nWeaknesses: ${weak.map((s) => s.k).join(', ')}\n${outlookTxt.replace(/<[^>]+>/g, '')}`;

  const gcard = (c) => `<div style="display:grid;grid-template-columns:44px 1fr;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #172230"><span class="grade ${gcls(c.letter)}">${c.letter}</span><div><b>${esc(c.k)}</b> <span class="dim">· ${ord(c.rank)} of ${n}</span><div class="muted" style="font-size:13px">${esc(c.val)}</div></div></div>`;
  return `<div class="page-h"><div><h1>Rate my team</h1><p>Strengths, weaknesses and season outlook for <b>${esc(meT.name.trim())}</b> — every grade is a rank against the other ${n - 1} rosters in your league. Use the team picker at the top to rate anyone.</p></div>${shareBar(text, { title: 'Team rating' })}</div>
  <div class="grid g-main">
    <div class="stack">
      ${card('Overall', `<div style="display:flex;gap:18px;align-items:center"><span class="grade ${gcls(r.letter)}" style="width:84px;height:84px;font-size:44px;border-radius:16px">${r.letter}</span><div><div style="font-size:20px;font-weight:700">${ord(r.overallRank)} of ${n} teams</div><div class="muted">Typical healthy lineup scores ${n1(r.total)} a week · ${pct(out.playoff)} to make the playoffs</div></div></div><div class="prose" style="margin-top:12px"><p>${outlookTxt}</p></div>`, { cls: 'hero' })}
      ${card('Grades by area', r.cats.map(gcard).join(''))}
      ${card('Position groups', table(['Group', 'Grade', 'Rank', 'Starters', 'Pts / wk', 'League best'], grpRows.map((g) => [`<b>${g.label}</b>`, `<span class="grade ${gcls(letter(g.sc))}" style="width:30px;height:30px;font-size:14px;border-radius:8px">${letter(g.sc)}</span>`, `<span class="num">${ord(g.rk)}</span>`, `<span class="muted" style="font-size:13px">${esc(g.who.join(', '))}</span>`, `<span class="num">${n1(g.val)}</span>`, `<span class="num dim">${n1(g.best)}</span>`])), { cls: 'flush', sub: 'Points per game from the typical healthy lineup, ranked against the league' })}
    </div>
    <div class="stack">
      ${card('Strengths', `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px">${strengths.map((s) => `<li><b>${esc(s.k)}</b> — ${ord(s.rank)} of ${n}<div class="muted" style="font-size:13px">${esc(s.val)}</div></li>`).join('')}</ul>`)}
      ${card('Weaknesses', `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px">${weak.map((s) => `<li><b>${esc(s.k)}</b> — ${ord(s.rank)} of ${n}<div class="muted" style="font-size:13px">${esc(s.val)}</div></li>`).join('')}</ul>`)}
      ${card('What to do about it', `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px">${actions.map((a) => `<li>${a}</li>`).join('')}</ul><div class="btn-row" style="margin-top:12px"><button class="btn" data-go="finder">Trade finder</button><button class="btn" data-go="waivers">Waivers</button></div>`)}
      ${card('League ratings', table(['#', 'Team', 'Grade', 'Lineup'], [...rows].sort((a, b) => a.overallRank - b.overallRank).map((x) => [`<span class="num">${x.overallRank}</span>`, `<b ${x.t.id === M.me.id ? 'style="color:var(--green)"' : ''}>${esc(x.t.owner)}</b>`, `<span class="grade ${gcls(x.letter)}" style="width:28px;height:28px;font-size:13px;border-radius:7px">${x.letter}</span>`, `<span class="num">${n1(x.total)}</span>`])), { cls: 'flush' })}
    </div>
  </div>
  <details class="how"><summary>How the grades work</summary><ul><li>Each area is your rank among the ${n} teams; A = top 15%, B = next 20%, C = middle, D and F = bottom.</li><li>Overall weights: starting lineup 40%, depth 15%, health 15%, bye weeks 10%, longevity (age of your top 8 assets) 10%, season outlook 10%.</li><li>Lineup strength uses points per game blended from projection and recent form, discounted for injuries — see Player values for the method.</li></ul></details>`;
}
