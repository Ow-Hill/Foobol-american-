// League Historian: answers questions ONLY from the league's recorded games, lineups, drafts and transactions.
// Rule-based (no language model), so every answer carries its evidence and nothing is invented.
import { n1 } from './util.js';

const STOP = new Set(['week', 'best', 'game', 'points', 'score', 'most', 'last', 'first', 'what', 'who', 'the', 'record', 'trade', 'draft', 'team', 'season', 'ever', 'this', 'that', 'high', 'lowest', 'highest', 'worst', 'bench', 'win', 'lose', 'beat', 'streak']);

export function suggestions(HM, M) {
  const me = M.me.owner;
  const opp = M.opp?.owner;
  return [
    'Who won the 2025 championship?',
    'What is the highest score ever?',
    'What was the closest game ever?',
    'Who has made the most trades?',
    `What is ${me}'s record against ${opp || 'ColinHill'}?`,
    'Who left the most points on the bench in a week?',
    'Who was the first pick of the 2026 draft?',
    'What is the longest winning streak?',
    `What is ${me}'s best week?`,
    'What happened in week 8?',
  ];
}

function parse(HM, M, q) {
  const low = q.toLowerCase();
  const year = (low.match(/\b(20\d\d)\b/) || [])[1] || null;
  const week = (low.match(/week\s*(\d+)/) || [])[1];
  const wantsMe = /\b(my|i|me|mine|i'm|ive)\b/.test(low);
  const people = Object.values(HM.people);
  const mentioned = [];
  for (const p of people) {
    const hit = [...p.aliases].some((a) => a.length >= 5 && low.includes(a)) || [...p.aliases].some((a) => low.split(/[^a-z0-9_]+/).some((t) => t.length >= 4 && !STOP.has(t) && a.includes(t)));
    if (hit) mentioned.push(p);
  }
  if (wantsMe && !mentioned.length) {
    const me = people.find((p) => p.name === M.me.owner);
    if (me) mentioned.push(me);
  }
  let player = null;
  let best = 0;
  for (const pid in HM.names) {
    const n = HM.names[pid][0].toLowerCase();
    if (n.length >= 6 && low.includes(n) && n.length > best) ((player = pid), (best = n.length));
  }
  if (!player) {
    const toks = low.split(/[^a-z'.]+/).filter((t) => t.length >= 5 && !STOP.has(t));
    for (const t of toks) {
      const hits = Object.keys(HM.names).filter((pid) => HM.names[pid][0].toLowerCase().split(' ').slice(-1)[0] === t && ['QB', 'RB', 'WR', 'TE', 'K'].includes(HM.names[pid][1]));
      if (hits.length === 1) { player = hits[0]; break; }
    }
  }
  return { low, year, week: week ? Number(week) : null, people: mentioned, player };
}

const sidesOf = (games) => games.flatMap((g) => [{ g, me: g.a, op: g.b }, { g, me: g.b, op: g.a }]);
const gameStr = (s) => `${s.g.season} Week ${s.g.wk}: ${s.me.owner} ${n1(s.me.pts)} – ${n1(s.op.pts)} ${s.op.owner}`;

export function answer(HM, M, q) {
  const p = parse(HM, M, q);
  const { low } = p;
  const seasonsAll = HM.seasonList.map((s) => s.season);
  const scopeSeasons = p.year ? [p.year] : seasonsAll;
  const scoped = (games) => games.filter((g) => scopeSeasons.includes(g.season));
  const reg = () => scoped(HM.games).filter((g) => g.period === 'regular');
  const all = () => scoped(HM.games);
  const scopeTxt = p.year ? `in ${p.year}` : `across ${seasonsAll.join(' and ')}`;
  const person = p.people[0];
  const filterP = (rows) => (person ? rows.filter((s) => s.me.ownerId === person.id) : rows);
  const R = (headline, heads, rows, src) => ({ headline, heads, rows, src });

  // ---- champions
  if (/champion|won the (title|league)|winner|who won it|title/.test(low) && !/odds|chance/.test(low)) {
    const rows = HM.seasonList.filter((s) => (p.year ? s.season === p.year : true)).map((s) => {
      const c = HM.champion(s.season);
      const r = HM.runnerUp(s.season);
      return [s.season, c ? c.owner : s.current ? 'in progress' : 'unknown', r ? r.owner : '–'];
    });
    if (person) {
      const titles = HM.seasonList.filter((s) => HM.champion(s.season)?.ownerId === person.id).map((s) => s.season);
      return R(titles.length ? `${person.name} has won ${titles.length} title${titles.length > 1 ? 's' : ''} (${titles.join(', ')}).` : `${person.name} has not won a title yet.`, ['Season', 'Champion', 'Runner-up'], rows, 'Winners bracket of each season');
    }
    const done = rows.filter((r) => r[1] !== 'in progress');
    return R(done.length ? done.map((r) => `${r[0]}: ${r[1]}`).join(' · ') + '.' : 'No champion has been crowned yet.', ['Season', 'Champion', 'Runner-up'], rows, 'Winners bracket of each season');
  }

  // ---- head to head
  if (p.people.length >= 2 || (/head to head|h2h|against|vs\.?|versus/.test(low) && p.people.length >= 1)) {
    const a = p.people[0];
    const b = p.people[1] || HM.people[Object.keys(HM.people).find((id) => id !== a.id && HM.people[id].name === M.opp?.owner)];
    if (a && b) {
      const r = HM.h2h(a.id, b.id);
      const rows = r.games.map((g) => {
        const s = g.a.ownerId === a.id ? { me: g.a, op: g.b, g } : { me: g.b, op: g.a, g };
        return [`${g.season} wk ${g.wk}${g.period === 'playoff' ? ' (playoffs)' : ''}`, `${n1(s.me.pts)} – ${n1(s.op.pts)}`, s.me.pts > s.op.pts ? a.name : s.me.pts < s.op.pts ? b.name : 'tie'];
      });
      if (!r.games.length) return R(`${a.name} and ${b.name} have never played each other.`, [], [], 'All matchups');
      const lead = r.aw === r.bw ? 'The series is tied' : `${r.aw > r.bw ? a.name : b.name} leads`;
      return R(`${lead} ${Math.max(r.aw, r.bw)}–${Math.min(r.aw, r.bw)}${r.ties ? `–${r.ties}` : ''} (${a.name} scored ${n1(r.aPts)}, ${b.name} ${n1(r.bPts)} over ${r.games.length} meeting${r.games.length > 1 ? 's' : ''}).`, ['When', 'Score', 'Winner'], rows, 'Every head-to-head matchup, all seasons');
    }
  }

  // ---- record / standings of a person
  if (person && /record|how did|how has|win.?loss|wins|losses|standing/.test(low)) {
    const rows = HM.seasonList.filter((s) => person.seasons[s.season]).map((s) => {
      const t = person.seasons[s.season];
      return [s.season, `${t.w}-${t.l}${t.t ? '-' + t.t : ''}`, n1(t.pf), n1(t.pa), s.current ? 'in progress' : HM.champion(s.season)?.ownerId === person.id ? 'Champion' : HM.runnerUp(s.season)?.ownerId === person.id ? 'Runner-up' : ''];
    });
    return R(`${person.name}: ${rows.map((r) => `${r[0]} ${r[1]}`).join(', ')}.`, ['Season', 'Record', 'Points for', 'Points against', 'Result'], rows, 'Season standings');
  }
  if (/standings|rank/.test(low) && !person) {
    const s = p.year || HM.seasonList[HM.seasonList.length - 1].season;
    const rows = HM.seasons[s].teams.slice().sort((a, b) => b.w - a.w || b.pf - a.pf).map((t, i) => [i + 1, t.owner, `${t.w}-${t.l}`, n1(t.pf)]);
    return R(`${rows[0][1]} leads the ${s} standings at ${rows[0][2]}.`, ['#', 'Manager', 'Record', 'Points for'], rows, `${s} season standings`);
  }

  // ---- extremes
  if (/(highest|most|best|biggest).*(score|points|week|game)|top score/.test(low) && !/bench|margin|blowout|season total|streak/.test(low)) {
    const rows = filterP(sidesOf(all())).sort((a, b) => b.me.pts - a.me.pts).slice(0, 6);
    if (rows.length) return R(`${rows[0].me.owner} scored ${n1(rows[0].me.pts)} in ${rows[0].g.season} Week ${rows[0].g.wk} — the highest ${person ? 'for them ' : ''}${scopeTxt}.`, ['Game'], rows.map((s) => [gameStr(s)]), 'All weekly team scores');
  }
  if (/(lowest|worst|fewest).*(score|points|week|game)/.test(low)) {
    const rows = filterP(sidesOf(all())).sort((a, b) => a.me.pts - b.me.pts).slice(0, 6);
    return R(`${rows[0].me.owner} scored just ${n1(rows[0].me.pts)} in ${rows[0].g.season} Week ${rows[0].g.wk}.`, ['Game'], rows.map((s) => [gameStr(s)]), 'All weekly team scores');
  }
  if (/blowout|biggest (win|margin)|most lopsided|largest margin/.test(low)) {
    const rows = all().filter((g) => g.winner).filter((g) => !person || g.winner.ownerId === person.id).sort((a, b) => b.margin - a.margin).slice(0, 6);
    return R(`${rows[0].winner.owner} beat ${rows[0].loser.owner} by ${n1(rows[0].margin)} (${n1(rows[0].winner.pts)}–${n1(rows[0].loser.pts)}) in ${rows[0].season} Week ${rows[0].wk}.`, ['Winner', 'Loser', 'Score', 'Margin'], rows.map((g) => [g.winner.owner, g.loser.owner, `${n1(g.winner.pts)}–${n1(g.loser.pts)}`, n1(g.margin)]), 'All matchups');
  }
  if (/closest|nail.?biter|narrowest|smallest margin|squeaker/.test(low)) {
    const rows = all().filter((g) => g.winner).filter((g) => !person || g.a.ownerId === person.id || g.b.ownerId === person.id).sort((a, b) => a.margin - b.margin).slice(0, 6);
    return R(`${rows[0].winner.owner} edged ${rows[0].loser.owner} ${n1(rows[0].winner.pts)}–${n1(rows[0].loser.pts)} (margin ${rows[0].margin.toFixed(2)}) in ${rows[0].season} Week ${rows[0].wk}.`, ['Winner', 'Loser', 'Score', 'Margin'], rows.map((g) => [g.winner.owner, g.loser.owner, `${n1(g.winner.pts)}–${n1(g.loser.pts)}`, g.margin.toFixed(2)]), 'All matchups');
  }
  if (/bench|left on|optimal|lineup mistake|blunder/.test(low)) {
    const lines = [];
    for (const s of HM.seasonList) if (scopeSeasons.includes(s.season)) for (const wk of Object.keys(s.matchups)) for (const t of s.teams) { const l = HM.lineup(s.season, Number(wk), t.rid); if (l && (!person || l.ownerId === person.id)) lines.push(l); }
    lines.sort((a, b) => b.left - a.left);
    const top = lines.slice(0, 6);
    const tot = {};
    lines.forEach((l) => (tot[l.owner] = (tot[l.owner] || 0) + l.left));
    const worst = Object.entries(tot).sort((a, b) => b[1] - a[1])[0];
    return R(`${top[0].owner} left ${n1(top[0].left)} points on the bench in ${top[0].season} Week ${top[0].wk} (scored ${n1(top[0].pts)}, best possible ${n1(top[0].opt)}). Across all weeks, ${worst[0]} has left the most: ${n1(worst[1])}.`, ['When', 'Manager', 'Scored', 'Best possible', 'Left'], top.map((l) => [`${l.season} wk ${l.wk}`, l.owner, n1(l.pts), n1(l.opt), n1(l.left)]), 'Every lineup vs the best legal lineup from that week\u2019s actual points');
  }
  if (/streak/.test(low)) {
    const res = [];
    for (const pr of Object.values(HM.people)) {
      if (person && pr.id !== person.id) continue;
      const gs = HM.games.filter((g) => g.period !== 'consolation' && (g.a.ownerId === pr.id || g.b.ownerId === pr.id)).sort((a, b) => a.season.localeCompare(b.season) || a.wk - b.wk);
      let w = 0; let l = 0; let bw = 0; let bl = 0;
      for (const g of gs) {
        const won = g.winner && g.winner.ownerId === pr.id;
        const lost = g.loser && g.loser.ownerId === pr.id;
        w = won ? w + 1 : 0; l = lost ? l + 1 : 0;
        bw = Math.max(bw, w); bl = Math.max(bl, l);
      }
      res.push({ name: pr.name, bw, bl });
    }
    const wantLose = /los(e|ing)|cold/.test(low);
    res.sort((a, b) => (wantLose ? b.bl - a.bl : b.bw - a.bw));
    return R(wantLose ? `${res[0].name} had the longest losing streak: ${res[0].bl} games.` : `${res[0].name} had the longest winning streak: ${res[0].bw} games.`, ['Manager', 'Longest win streak', 'Longest losing streak'], res.map((r) => [r.name, r.bw, r.bl]), 'All non-consolation games in order');
  }
  if (/most (points|scoring)|points for|scoring (title|leader)|high(est)? scoring team/.test(low) && !person) {
    const rows = HM.seasonList.filter((s) => scopeSeasons.includes(s.season)).flatMap((s) => s.teams.map((t) => [s.season, t.owner, n1(t.pf), `${t.w}-${t.l}`])).sort((a, b) => b[2] - a[2]).slice(0, 6);
    return R(`${rows[0][1]} scored the most in a season: ${rows[0][2]} points in ${rows[0][0]}.`, ['Season', 'Manager', 'Points for', 'Record'], rows, 'Season standings');
  }

  // ---- transactions
  if (/trade/.test(low)) {
    const trades = HM.txs.filter((t) => t.type === 'trade' && scopeSeasons.includes(t.season));
    if (p.people.length >= 2) {
      const [a, b] = p.people;
      const hit = trades.filter((t) => t.who.some((x) => x.ownerId === a.id) && t.who.some((x) => x.ownerId === b.id));
      return R(`${a.name} and ${b.name} have made ${hit.length} trade${hit.length === 1 ? '' : 's'} together ${scopeTxt}.`, ['When', 'Deal'], hit.map((t) => [`${t.season} wk ${t.leg}`, t.who.map((w) => `${w.owner} gets ${t.addList.filter((x) => x.rid === w.rid).map((x) => x.n).concat(t.picks.filter((pk) => pk.to === w.rid).map((pk) => `${pk.s} R${pk.r}`)).join(', ') || '—'}`).join('; ')]), 'League transactions');
    }
    const count = {};
    trades.forEach((t) => t.who.forEach((w) => (count[w.owner] = (count[w.owner] || 0) + 1)));
    const rows = Object.entries(count).sort((a, b) => b[1] - a[1]);
    if (person) return R(`${person.name} has made ${count[person.name] || 0} trades ${scopeTxt}.`, ['Manager', 'Trades'], rows.map((r) => [r[0], r[1]]), 'League transactions');
    if (/biggest|largest|most players/.test(low)) {
      const big = trades.slice().sort((a, b) => b.addList.length + b.picks.length - (a.addList.length + a.picks.length))[0];
      return R(`The biggest trade moved ${big.addList.length} players and ${big.picks.length} picks (${big.season} week ${big.leg}): ${big.who.map((w) => `${w.owner} gets ${big.addList.filter((x) => x.rid === w.rid).map((x) => x.n).join(', ') || '—'}`).join('; ')}.`, [], [], 'League transactions');
    }
    return R(`${rows[0][0]} has made the most trades ${scopeTxt}: ${rows[0][1]}.`, ['Manager', 'Trades'], rows.map((r) => [r[0], r[1]]), `${trades.length} trades in the record`);
  }
  if (/waiver|pickup|pick-up|adds|added|free agent|moves|transactions/.test(low)) {
    const tx = HM.txs.filter((t) => t.type !== 'trade' && scopeSeasons.includes(t.season));
    const count = {};
    tx.forEach((t) => t.addList.forEach((a) => (count[a.owner] = (count[a.owner] || 0) + 1)));
    const rows = Object.entries(count).sort((a, b) => b[1] - a[1]);
    if (person) return R(`${person.name} has made ${count[person.name] || 0} waiver / free-agent adds ${scopeTxt}.`, ['Manager', 'Adds'], rows.map((r) => [r[0], r[1]]), 'League transactions');
    return R(`${rows[0][0]} is the busiest on the wire ${scopeTxt}: ${rows[0][1]} adds.`, ['Manager', 'Adds'], rows.map((r) => [r[0], r[1]]), 'League transactions');
  }

  // ---- draft
  if (/draft|first pick|first overall|1\.01|keeper|kept/.test(low)) {
    const season = p.year || HM.seasonList[HM.seasonList.length - 1].season;
    const d = HM.seasons[season].draft;
    if (!d) return R(`No draft record for ${season}.`, [], [], '');
    const nameOf = (pk) => HM.ent(season, pk.rid).owner;
    if (p.player) {
      const hits = HM.seasonList.flatMap((s) => (s.draft ? s.draft.picks.filter((pk) => pk.pid === p.player).map((pk) => ({ s: s.season, pk })) : []));
      if (hits.length) return R(hits.map((h) => `${HM.nm(p.player)} was taken #${h.pk.no} (round ${h.pk.round}) by ${HM.ent(h.s, h.pk.rid).owner} in ${h.s}${h.pk.keeper ? ' as a keeper' : ''}`).join('; ') + '.', ['Season', 'Pick', 'Round', 'Manager', 'Keeper'], hits.map((h) => [h.s, h.pk.no, h.pk.round, HM.ent(h.s, h.pk.rid).owner, h.pk.keeper ? 'yes' : '']), 'Draft board');
      return R(`${HM.nm(p.player)} was not drafted in this league.`, [], [], 'Draft board');
    }
    if (/keeper|kept/.test(low)) {
      const rows = d.picks.filter((pk) => pk.keeper).map((pk) => [pk.round, pk.no, nameOf(pk), pk.n, pk.pos]);
      return R(`${rows.length} keepers were used in the ${season} draft.`, ['Round', 'Pick', 'Manager', 'Player', 'Pos'], rows, `${season} draft board`);
    }
    if (person) {
      const rows = d.picks.filter((pk) => HM.ent(season, pk.rid).ownerId === person.id).map((pk) => [pk.round, pk.no, pk.n, pk.pos, pk.keeper ? 'keeper' : '']);
      return R(`${person.name} made ${rows.length} picks in the ${season} draft; the first was ${rows[0][2]} at #${rows[0][1]}.`, ['Round', 'Pick', 'Player', 'Pos', ''], rows, `${season} draft board`);
    }
    const first = d.picks.find((pk) => pk.no === 1);
    return R(`${first.n} (${first.pos}) went first overall in ${season}, taken by ${nameOf(first)}${first.keeper ? ' as a keeper' : ''}.`, ['Pick', 'Player', 'Pos', 'Manager'], d.picks.slice(0, 10).map((pk) => [pk.no, pk.n, pk.pos, nameOf(pk)]), `${season} draft board (first 10 picks)`);
  }

  // ---- players
  if (p.player) {
    const pid = p.player;
    const rows = HM.perf.filter((x) => x.pid === pid && scopeSeasons.includes(x.season));
    const nm = HM.nm(pid);
    if (!rows.length) return R(`${nm} has no scored games on any roster in this league's record.`, [], [], '');
    const best = rows.slice().sort((a, b) => b.pts - a.pts)[0];
    const total = rows.reduce((s, r) => s + r.pts, 0);
    const by = {};
    rows.forEach((r) => (by[r.owner] = (by[r.owner] || 0) + 1));
    const cur = M.snap.players[pid]?.own;
    return R(`${nm}'s best game was ${n1(best.pts)} for ${best.owner} (${best.season} Week ${best.wk}). He has scored ${n1(total)} points across ${rows.length} rostered games${cur != null ? `, and is currently on ${M.ownerName(cur)}'s roster` : ''}.`, ['Manager', 'Weeks rostered'], Object.entries(by).sort((a, b) => b[1] - a[1]), 'Weekly player scores');
  }

  // ---- a person's best/worst week
  if (person && /best|worst|highest|lowest/.test(low)) {
    const rows = sidesOf(all()).filter((s) => s.me.ownerId === person.id).sort((a, b) => (/worst|lowest/.test(low) ? a.me.pts - b.me.pts : b.me.pts - a.me.pts)).slice(0, 5);
    return R(`${person.name}'s ${/worst|lowest/.test(low) ? 'worst' : 'best'} week: ${gameStr(rows[0])}.`, ['Game'], rows.map((s) => [gameStr(s)]), 'All weekly team scores');
  }

  // ---- a week summary
  if (p.week) {
    const season = p.year || HM.seasonList[HM.seasonList.length - 1].season;
    const f = HM.weekFacts(season, p.week);
    if (f) return R(`${season} Week ${p.week}: ${f.top.owner} had the high score (${n1(f.top.pts)}); closest game ${f.closest ? `${f.closest.winner.owner} over ${f.closest.loser.owner} by ${n1(f.closest.margin)}` : '—'}; ${f.blunder.owner} left ${n1(f.blunder.left)} on the bench.`, ['Home', 'Score', 'Away'], f.games.map((g) => [g.a.owner, `${n1(g.a.pts)} – ${n1(g.b.pts)}`, g.b.owner]), `${season} Week ${p.week} matchups`);
    return R(`No games recorded for ${season} Week ${p.week}.`, [], [], '');
  }
  return null;
}
