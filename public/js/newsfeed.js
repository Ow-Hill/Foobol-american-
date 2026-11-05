// Builds one league-aware news feed: every item is tagged with who owns the players in it.
import { canon } from './model.js';

const WEEK = 7 * 86400000;

export function buildFeed(M) {
  const { snap, me } = M;
  const now = M.now;
  const myTeams = new Set(M.lineup(me).active.map((id) => M.P(id).team).filter(Boolean));
  const items = [];

  const rel = (pids) => {
    if (pids.some((id) => M.P(id).own === me.id)) return 'mine';
    if (pids.some((id) => M.P(id).own != null)) return 'league';
    return 'fa';
  };

  for (const a of snap.articles) {
    const t = new Date(a.time).getTime();
    if (now - t > WEEK) continue;
    let r = a.pids.length ? rel(a.pids) : 'nfl';
    let teamHit = null;
    if (r === 'nfl' && a.teams.length <= 3 && a.teams.some((x) => myTeams.has(x))) {
      r = 'team';
      teamHit = a.teams.filter((x) => myTeams.has(x));
    }
    items.push({ id: 'a' + a.id, kind: 'article', time: t, title: a.headline, text: a.desc, url: a.url, src: 'ESPN', pids: a.pids, rel: r, teams: a.teams, teamHit });
  }

  for (const n of snap.notes) {
    const t = n.date ? new Date(n.date).getTime() : 0;
    if (!t || now - t > WEEK) continue;
    const p = M.P(n.pid);
    if (p.own == null && !(p.trend || (p.ppg || 0) >= 8 || (p.proj || 0) >= 8)) continue;
    const label = canon(n.status);
    items.push({ id: 'n' + n.pid + t, kind: 'note', time: t, title: p.n + (label ? ` — ${label}` : ' — update'), text: n.short, long: n.long, src: n.src === 'RotoWire' ? 'RotoWire via ESPN' : n.src, pids: [n.pid], rel: rel([n.pid]), teams: p.team ? [p.team] : [], detail: n });
  }

  for (const w of M.wireItems()) {
    if (now - w.time > WEEK) continue;
    const pids = w.pids || [];
    items.push({ id: 'w' + w.time + w.text.length, kind: 'wire', time: w.time, title: w.text, text: '', src: 'Sleeper', pids, rel: w.mine ? 'mine' : 'league', wireKind: w.kind });
  }

  const dedupe = new Map();
  for (const it of items) dedupe.set(it.id, it);
  return [...dedupe.values()].sort((a, b) => b.time - a.time);
}

export const REL_LABEL = { mine: 'Your roster', league: 'League', team: 'Your NFL teams', fa: 'Free agent', nfl: 'NFL' };
