// Live game-day: your score, theirs, who's left to play, a win chance that moves with the games,
// starters to swap out before their game locks, and every other matchup in the league.
import { esc, n1, pct, fmtKick } from '../util.js';
import { card, table, bar, statusChip } from '../ui.js';
import { live, rooting } from '../playoffs.js';
import { WIN } from '../fitted.js';

function stateCell(M, r) {
  if (!r.pid) return '<span class="dim">empty</span>';
  const g = M.P(r.pid).game;
  if (r.state === 'bye') return '<span class="chip chip-bye">BYE</span>';
  if (r.state === 'done') return '<span class="chip">FINAL</span>';
  if (r.state === 'live') return `<span class="chip chip-red">LIVE</span> <span class="dim" style="font-size:12px">${esc(g?.detail || '')}</span>`;
  return g?.tbd ? '<span class="dim">Time TBD</span>' : `<span class="dim">${fmtKick(g.date)}</span>`;
}

function sideTable(M, s) {
  const rows = s.rows.map((r) => [
    `<span class="muted">${esc(r.slot)}</span>`,
    r.pid ? `<b>${esc(M.P(r.pid).n)}</b> <span class="tm">${esc(M.P(r.pid).pos)} ${esc(M.P(r.pid).team || '')}</span> ${statusChip(M.P(r.pid))}` : '<span class="dim">—</span>',
    stateCell(M, r),
    `<span class="num"><b>${n1(r.pts)}</b></span>`,
    r.left > 0 ? `<span class="num muted">+${n1(r.rem)}</span>` : '<span class="dim">–</span>',
  ]);
  return table(['', 'Starter', 'Game', 'Pts', 'Still to come'], rows);
}

export function render(M) {
  const L = live(M);
  const me = L.me;
  const opp = L.opp;
  if (!opp) {
    return `<div class="page-h"><div><h1>Live</h1><p>No matchup for you in Week ${M.W}.</p></div></div>`;
  }
  const finalMe = me.pts + me.rem;
  const finalOpp = opp.pts + opp.rem;
  const swapHtml = L.swaps.length
    ? `<div class="callout bad" style="margin-bottom:14px"><b>Swap before kickoff</b>${L.swaps.map((s) => `${esc(M.P(s.out).n)} (${esc(s.slot)}) is ruled out. ${s.inn ? `Start <b>${esc(M.P(s.inn).n)}</b> instead (${n1(M.val(s.inn))} projected, ${fmtKick(M.P(s.inn).game.date)}).` : 'No healthy bench player can fill that spot; check waivers.'}`).join('<br>')}</div>`
    : '';
  const needTxt = finalMe < finalOpp
    ? `You need <b>${n1(L.need)}</b> more to pass their projected finish; your ${me.toPlay + me.playing} player${me.toPlay + me.playing === 1 ? '' : 's'} still going project <b>${n1(me.rem)}</b>.`
    : `You're projected to finish <b>${n1(finalMe - finalOpp)}</b> ahead.`;
  const header = `<div class="kpis" style="margin-bottom:14px">
    <div class="kpi"><small>You</small><b>${n1(me.pts)}</b><span>projected finish ${n1(finalMe)} · ${me.toPlay} to play, ${me.playing} playing</span></div>
    <div class="kpi"><small>${esc(opp.t.owner)}</small><b>${n1(opp.pts)}</b><span>projected finish ${n1(finalOpp)} · ${opp.toPlay} to play, ${opp.playing} playing</span></div>
    <div class="kpi"><small>Win chance</small><b>${pct(L.chance)}</b><span>${bar(L.chance, L.chance < 0.4 ? 'red' : L.chance < 0.6 ? 'amber' : '')}</span></div>
  </div>`;

  // other matchups, flagged when the result moves your playoff odds (regular season only)
  let matters = new Map();
  if (M.W < M.L.settings.playoff_week_start) {
    try {
      const base = M.runSim({ n: 4000, track: M.me.id });
      for (const g of rooting(M, base).games.filter((x) => x.wk === M.W)) matters.set([g.want, g.other].sort().join(':'), g);
    } catch {
      matters = new Map();
    }
  }
  const lg = L.league
    .filter((x) => x.a.t.id !== M.me.id && x.b.t.id !== M.me.id)
    .map((x) => {
      const g = matters.get([x.a.t.id, x.b.t.id].sort().join(':'));
      const root = g ? `<span class="pos-num">root for ${esc(M.teamBy[g.want].owner)}</span> <span class="dim">(${n1(g.swing * 100)} pts of playoff odds)</span>` : '<span class="dim">—</span>';
      return [
        `<b>${esc(x.a.t.owner)}</b> <span class="num">${n1(x.a.pts)}</span>`,
        `<b>${esc(x.b.t.owner)}</b> <span class="num">${n1(x.b.pts)}</span>`,
        `<span class="num">${pct(x.chance)}</span> <span class="dim">/ ${pct(1 - x.chance)}</span>`,
        root,
      ];
    });

  return `<div class="page-h"><div><h1>Live · Week ${M.W}</h1><p>${L.inProgress ? 'Games in progress. This page refreshes every minute while it is open.' : L.started ? 'Between games. Scores update when the next games start.' : 'Nothing has kicked off yet: these are projections.'}</p></div></div>
  ${swapHtml}${header}
  <p style="margin:0 0 14px">${needTxt}</p>
  <div class="stack"><div class="grid g2">${card('Your starters', sideTable(M, me), { cls: 'flush' })}${card(esc(opp.t.owner), sideTable(M, opp), { cls: 'flush' })}</div>
  ${lg.length ? card('Around the league', table(['Team', 'Team', 'Win chance', 'For you'], lg), { cls: 'flush' }) : ''}</div>
  <details class="how"><summary>How this is calculated</summary><ul><li>Points are Sleeper's live scores. "Still to come" is each player's projection times the share of his game left (quarter and clock); before kickoff an Out player counts as zero.</li><li>Win chance compares projected finishes, with the measured spread of projected-vs-actual score gaps (about ${WIN.lineupSd} points for a full week) shrunk by how much scoring is left.</li><li>"For you" uses the playoff simulation for other teams' games this week; it is based on projections, not on the live score.</li></ul></details>`;
}
