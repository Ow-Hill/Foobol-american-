"""
build_schedule_matrix.py

Validates data/schedule_matrix.csv, which the ASSISTANT populates via its
own web_search calls (this script has no network access and cannot fetch
schedules or defensive rankings itself).

Checks:
  - Every NFL team that appears in data/roster.csv has an entry for every
    confirmed playoff week in data/league_config.json
  - opp_pass_def_rank / opp_run_def_rank are numeric 1-32, or blank ONLY
    when opponent == BYE
  - No duplicate (nfl_team, week) rows
  - Prominently surfaces every bye week found, since that's the single
    worst outcome for a playoff-week roster decision and must never be
    silently missed
"""

import json
import sys
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DATA_DIR = SKILL_ROOT / "data"

ROSTER_PATH = DATA_DIR / "roster.csv"
MATRIX_PATH = DATA_DIR / "schedule_matrix.csv"
CONFIG_PATH = DATA_DIR / "league_config.json"

REQUIRED_COLUMNS = ["nfl_team", "week", "opponent", "opp_pass_def_rank",
                     "opp_run_def_rank", "note", "source_search_date"]


def load_config():
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"{CONFIG_PATH} not found. Confirm playoff_weeks and "
            f"num_teams_qualifying first (Step 0 of SKILL.md) and write "
            f"that file before validating the schedule matrix."
        )
    return json.loads(CONFIG_PATH.read_text())


def main():
    config = load_config()
    playoff_weeks = config["playoff_weeks"]

    if not ROSTER_PATH.exists():
        raise FileNotFoundError(f"{ROSTER_PATH} not found. Pull the roster first (Step 1).")
    if not MATRIX_PATH.exists():
        raise FileNotFoundError(f"{MATRIX_PATH} not found. Populate it via web_search first (Step 2).")

    roster = pd.read_csv(ROSTER_PATH)
    matrix = pd.read_csv(MATRIX_PATH)

    # K/DEF aren't scored by score_players.py (see its SKIP_POSITIONS), so
    # don't require schedule coverage for them either -- that would just
    # force pointless web_search calls for data that's never used.
    SKIP_POSITIONS = {"K", "DEF"}
    scored_roster = roster[~roster["position"].isin(SKIP_POSITIONS)]

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in matrix.columns]
    if missing_cols:
        raise ValueError(f"schedule_matrix.csv missing columns: {missing_cols}")

    issues = []
    byes = []

    dupes = matrix[matrix.duplicated(subset=["nfl_team", "week"], keep=False)]
    if len(dupes):
        issues.append(f"Duplicate (nfl_team, week) rows: "
                       f"{list(zip(dupes['nfl_team'], dupes['week']))}")

    # Coverage check: every rostered SCORED-position team x every playoff
    # week should exist.
    needed_teams = sorted(scored_roster["nfl_team"].dropna().unique())
    have = set(zip(matrix["nfl_team"], matrix["week"]))
    for team in needed_teams:
        for wk in playoff_weeks:
            if (team, wk) not in have:
                issues.append(f"Missing schedule entry for {team} in week {wk}")

    for _, row in matrix.iterrows():
        is_bye = str(row["opponent"]).strip().upper() == "BYE"
        if is_bye:
            byes.append((row["nfl_team"], row["week"]))
            continue
        for col in ["opp_pass_def_rank", "opp_run_def_rank"]:
            val = row[col]
            if pd.isna(val):
                issues.append(f"{row['nfl_team']} week {row['week']}: missing {col} "
                               f"(only allowed blank on a BYE row)")
                continue
            try:
                v = float(val)
                if not (1 <= v <= 32):
                    issues.append(f"{row['nfl_team']} week {row['week']}: {col}={val} out of range 1-32")
            except (TypeError, ValueError):
                issues.append(f"{row['nfl_team']} week {row['week']}: {col}={val} not numeric")

    print("=" * 70)
    print(f"Validated {MATRIX_PATH} against {len(needed_teams)} rostered NFL team(s), "
          f"playoff weeks {playoff_weeks}")
    print("=" * 70)

    if byes:
        print(f"\n*** BYE WEEK ALERT: {len(byes)} team(s) have a bye during a confirmed "
              f"playoff week ***")
        for team, wk in byes:
            affected_players = roster[roster["nfl_team"] == team]["player"].tolist()
            print(f"  {team} — Week {wk} BYE — affects: {', '.join(affected_players)}")

    print(f"\n{len(issues)} issue(s) found")
    for i, issue in enumerate(issues, 1):
        print(f"{i}. {issue}")

    if not issues:
        print("\nClean. Ready for scripts/score_players.py.")
    else:
        print("\nFix the above (usually means more web_search is needed), then re-run.")


if __name__ == "__main__":
    main()
