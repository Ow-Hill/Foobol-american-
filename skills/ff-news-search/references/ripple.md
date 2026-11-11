# Ripple engine — teammate impact

Source of truth: `public/js/ripple.js`. Tests: `test/ripple.test.mjs`.

When one NFL player's situation changes, the volume he leaves (or takes back) goes to his
teammates. The engine turns that into labelled **estimates** on the other players. It can raise a
flag, reorder a list or add a `watch` / `this-week` decision. It never reaches `act` and never flips
a start/sit on its own.

## Events

| Event | Trigger | Skipped when |
| --- | --- | --- |
| `out` | Effective status Doubtful or worse (Sleeper/ESPN, most severe wins) and a real role: QB1, RB with 8+ carries+targets/g, WR/TE with 4+ targets/g | team on bye; he already missed the team's last two games (teammates' recent usage has absorbed it) |
| `return` | Missed the team's last game, now untagged (or a dated "activated / cleared" report), had a role before | no game without him to measure from |
| `line-move` | The team's Vegas implied total moved ≥ 2.5 points from its first sighting this week (`snapshot.lines`) | team on bye; players without a role |
| `trade-in` / `trade-out` | Sleeper `team_changed_at` within 21 days; previous team from `data/team-seen.json` | — |

Recent usage = average targets and carries over his last 3 games played, from league history.

## Rules

| Situation | Effect |
| --- | --- |
| WR/TE out | 75% of his targets/g spread over the remaining pass catchers by current target share; 25% to the next man up in his slot (`dpos`) |
| RB out | Carries spread over the remaining RBs by carry share, with the next RB on the depth chart weighted +1 (he takes most); targets spread by RB target share |
| QB out | Backup QB `up` (in line to start). Every pass catcher with 2+ targets/g `down`: top target −10%, the rest −20% |
| Return | Each teammate who gained volume in games without him gives it back (`down`) |
| Traded in | Same-position players on the new team `down` by half his volume × their share |
| Traded away | His old team is treated as `out` |
| Line move | Every player with a role on that offense ±10%, always `toss` |

**Observed beats heuristic.** When this season has games where the team played without the source
player, the teammate's real with/without split replaces the share formula (`observed: true`).

## Confidence

- `clear` only for an Out/IR source with 2+ games of history *and* an observed split.
- Heuristic splits drop one band (`clear` → `lean` → `toss`).
- Doubtful sources start at `toss`. Trades are always `toss`.

## Why these rules

These encode the fantasy roster-management consensus:

- Vacated targets go to teammates but are not inherited evenly; targets are a skill (PlayerProfiler,
  The Fantasy Footballers, FantasyPros, 4for4).
- The handcuff takes the early-down work when the lead back is out.
- A backup QB lowers the whole passing game; the most reliable target holds up best (PFF, FTN,
  Rotoballer, Fox Sports).
- Trade-deadline "winners and losers" are driven by depth-chart competition at the new team and
  opportunity at the old one (RotoWire, CBS, PFF).

## Limits

- No offensive-line or defensive injuries yet: the snapshot carries skill positions only (roadmap R4).
- The "opening" total is the first one the server saw this week (kept across restarts in
  `data/status-log.json`). If the server was not running when lines opened, moves before that are
  missed.
- No scheme or QB-quality adjustment beyond the QB-out rule.
- Usage comes from league-scored history (targets, carries, snap share), not routes or air yards.
