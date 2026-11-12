"""
score_players.py

Combines data/roster.csv and data/schedule_matrix.csv (already validated by
build_schedule_matrix.py) into a per-player playoff-weeks outlook.

Position-weighted defensive matchup, per references/methodology.md:
  - QB, WR, TE: pass defense rank almost entirely (90/10)
  - RB: blended (55% run defense, 45% pass defense) since receiving work
    matters for RB fantasy scoring too, especially in PPR
  - K, DEF: not scored here -- matchup strength for those positions depends
    on different factors (scoring environment, opposing offense) that this
    skill doesn't model; they pass through unscored

Rank convention: 1 = toughest defense (fewest fantasy points allowed),
32 = easiest (most allowed). A HIGHER average rank faced = a MORE
favorable playoff schedule.
"""

import json
import sys
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DATA_DIR = SKILL_ROOT / "data"
OUT_DIR = DATA_DIR / "outputs"

ROSTER_PATH = DATA_DIR / "roster.csv"
MATRIX_PATH = DATA_DIR / "schedule_matrix.csv"
CONFIG_PATH = DATA_DIR / "league_config.json"
OUT_PATH = OUT_DIR / "playoff_outlook.csv"

RB_RUN_WEIGHT = 0.55
RB_PASS_WEIGHT = 0.45
SKIP_POSITIONS = {"K", "DEF"}


def label(avg_rank, has_bye):
    if has_bye:
        return "BYE WEEK RISK"
    if avg_rank is None:
        return "INSUFFICIENT DATA"
    if avg_rank >= 22:
        return "Favorable"
    elif avg_rank >= 11:
        return "Neutral"
    else:
        return "Tough"


def main():
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"{CONFIG_PATH} not found. Run build_schedule_matrix.py first.")
    config = json.loads(CONFIG_PATH.read_text())
    playoff_weeks = config["playoff_weeks"]

    roster = pd.read_csv(ROSTER_PATH)
    matrix = pd.read_csv(MATRIX_PATH)
    matrix = matrix[matrix["week"].isin(playoff_weeks)]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []

    for _, player in roster.iterrows():
        pos = player["position"]
        team = player["nfl_team"]
        team_weeks = matrix[matrix["nfl_team"] == team]

        if pos in SKIP_POSITIONS:
            rows.append({
                "player": player["player"], "position": pos, "nfl_team": team,
                "avg_defense_rank_faced": None, "has_bye": False,
                "outlook": "NOT SCORED (position not modeled)",
            })
            continue

        has_bye = (team_weeks["opponent"].astype(str).str.upper() == "BYE").any()
        scored_weeks = team_weeks[team_weeks["opponent"].astype(str).str.upper() != "BYE"]

        if len(scored_weeks) == 0:
            avg_rank = None
        elif pos == "RB":
            avg_rank = (
                scored_weeks["opp_run_def_rank"].astype(float) * RB_RUN_WEIGHT
                + scored_weeks["opp_pass_def_rank"].astype(float) * RB_PASS_WEIGHT
            ).mean()
        else:  # QB, WR, TE
            avg_rank = scored_weeks["opp_pass_def_rank"].astype(float).mean()

        rows.append({
            "player": player["player"],
            "position": pos,
            "nfl_team": team,
            "avg_defense_rank_faced": round(avg_rank, 1) if avg_rank is not None else None,
            "has_bye": has_bye,
            "outlook": label(avg_rank, has_bye),
        })

    out_df = pd.DataFrame(rows)
    # Sort: bye-week risk and favorable outlooks surfaced first (the two
    # things most likely to change a trade or lineup decision), everything
    # else by how favorable the matchup is.
    sort_order = {"BYE WEEK RISK": 0, "Favorable": 1, "Neutral": 2, "Tough": 3,
                  "INSUFFICIENT DATA": 4, "NOT SCORED (position not modeled)": 5}
    out_df["_sort"] = out_df["outlook"].map(sort_order)
    out_df = out_df.sort_values(["_sort", "avg_defense_rank_faced"],
                                 ascending=[True, False]).drop(columns="_sort")

    out_df.to_csv(OUT_PATH, index=False)

    print("=" * 70)
    print(f"Playoff outlook — weeks {playoff_weeks}")
    print("=" * 70)
    print(out_df.to_string(index=False))

    bye_risks = out_df[out_df["outlook"] == "BYE WEEK RISK"]
    if len(bye_risks):
        print(f"\n*** {len(bye_risks)} player(s) have a bye during your playoff weeks. "
              f"Plan replacements or trade before the deadline. ***")

    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
