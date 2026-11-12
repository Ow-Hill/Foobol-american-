"""
apply_context_adjustments.py

Merges data/injury_context.csv (which the ASSISTANT populates via its own
web_search tool in Step 2 of SKILL.md -- this script has no way to gather
that data itself, since the sandbox has no network access) onto the ML
baseline projections from build_projections.py.

This is a deliberately simple, transparent adjustment -- not a second model.
The ML model captures long-run opportunity/age/efficiency patterns; it has
no way to know about a hamstring strain reported three days ago. This script
is the layer that lets fresh, qualitative information override or discount
the statistical baseline where the two disagree.

Adjustment logic:
  - est_games_missed reduces points proportionally (17-game season)
  - status of OUT/PUP/IR floors the discount at missing at least 4 games
    even if est_games_missed was left blank, since "out" news without a
    return timeline is itself informative
  - QUESTIONABLE/DOUBTFUL apply a smaller efficiency haircut on top of any
    games-missed discount, reflecting reduced practice reps / snap share
    even in games they do play
"""

import sys
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DATA_DIR = SKILL_ROOT / "data"
OUT_DIR = DATA_DIR / "outputs"

BASELINE_PATH = OUT_DIR / "baseline_projections.csv"
CONTEXT_PATH = DATA_DIR / "injury_context.csv"
FINAL_PATH = OUT_DIR / "final_projections.csv"

STATUS_MIN_GAMES_MISSED = {
    "OUT": 4,
    "PUP/IR": 6,
    "DOUBTFUL": 1,
    "QUESTIONABLE": 0,
    "HEALTHY": 0,
}

STATUS_EFFICIENCY_HAIRCUT = {
    # applied to games actually played, on top of games-missed discount
    "OUT": 0.0,
    "PUP/IR": 0.0,
    "DOUBTFUL": 0.90,
    "QUESTIONABLE": 0.95,
    "HEALTHY": 1.0,
}


def main():
    if not BASELINE_PATH.exists():
        raise FileNotFoundError(
            f"{BASELINE_PATH} not found. Run build_projections.py first."
        )
    baseline = pd.read_csv(BASELINE_PATH)

    if not CONTEXT_PATH.exists():
        print(f"[INFO] No {CONTEXT_PATH} found -- assistant has not yet gathered live "
              f"injury/news context (Step 2 of SKILL.md). Writing baseline projections "
              f"through unchanged, with a note.")
        baseline["status"] = "NOT_CHECKED"
        baseline["note"] = "No live injury/news context gathered for this run."
        baseline["final_ppr_pts"] = baseline["proj_next_season_ppr_pts"]
        baseline.to_csv(FINAL_PATH, index=False)
        print(f"Saved: {FINAL_PATH}")
        return

    context = pd.read_csv(CONTEXT_PATH)
    merged = baseline.merge(context, on="player", how="left")

    merged["status"] = merged["status"].fillna("NOT_CHECKED")
    merged["note"] = merged["note"].fillna("No live injury/news context found for this player.")
    merged["est_games_missed"] = merged["est_games_missed"].fillna(0)

    def adjust(row):
        status = row["status"]
        games_missed = max(row["est_games_missed"], STATUS_MIN_GAMES_MISSED.get(status, 0))
        games_missed = min(games_missed, 17)
        games_played_frac = (17 - games_missed) / 17
        haircut = STATUS_EFFICIENCY_HAIRCUT.get(status, 1.0)
        return round(row["proj_next_season_ppr_pts"] * games_played_frac * haircut, 1)

    merged["final_ppr_pts"] = merged.apply(adjust, axis=1)
    merged["pts_change_from_baseline"] = (
        merged["final_ppr_pts"] - merged["proj_next_season_ppr_pts"]
    ).round(1)

    merged = merged.sort_values("final_ppr_pts", ascending=False)
    merged.to_csv(FINAL_PATH, index=False)

    print("=" * 70)
    print("Final projections (baseline + live injury/news context)")
    print("=" * 70)
    cols = ["player", "position", "status", "proj_next_season_ppr_pts",
            "final_ppr_pts", "pts_change_from_baseline", "note"]
    print(merged[cols].to_string(index=False))

    changed = merged[merged["pts_change_from_baseline"] != 0]
    if len(changed):
        print(f"\n{len(changed)} player(s) adjusted from baseline due to live context.")
    print(f"\nSaved: {FINAL_PATH}")


if __name__ == "__main__":
    main()
