"""
build_projections.py

End-to-end player projection pipeline. Run from anywhere — paths are
resolved relative to this script's location, not the current working
directory, so it works no matter where the skill folder is mounted.

  1. Load historical player-season data (data/player_seasons.csv)
  2. Feature engineering (age curves, opportunity, efficiency, lag features)
  3. Position-specific walk-forward (time-series) backtest
  4. Train final position models on all available history
  5. Project next season using each player's most recent season as lag input
  6. SHAP feature importance for interpretability

Output: data/outputs/2026_player_projections.csv (baseline, no injury context
— see apply_context_adjustments.py for the injury/news-adjusted version)
"""

import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import shap

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from feature_engineering import build_feature_table, FEATURE_COLUMNS, TARGET_COLUMN, age_factor, POSITION_PEAK_AGE
from model_selection import recommend_model, build_estimator
from validation import rolling_season_backtest

SKILL_ROOT = SCRIPT_DIR.parent
DATA_DIR = SKILL_ROOT / "data"
OUT_DIR = DATA_DIR / "outputs"
RAW_PATH = DATA_DIR / "player_seasons.csv"
ASSET_SAMPLE_PATH = SKILL_ROOT / "assets" / "sample_player_seasons.csv"


def ensure_input_data():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not RAW_PATH.exists():
        if not ASSET_SAMPLE_PATH.exists():
            raise FileNotFoundError(
                f"No data at {RAW_PATH} and no sample to fall back on at {ASSET_SAMPLE_PATH}."
            )
        print(f"[WARN] {RAW_PATH} not found — copying illustrative sample data from "
              f"{ASSET_SAMPLE_PATH}. This is FABRICATED demo data, not real box scores. "
              f"See references/methodology.md before trusting any output.")
        RAW_PATH.write_text(ASSET_SAMPLE_PATH.read_text())


def main():
    ensure_input_data()
    raw = pd.read_csv(RAW_PATH)
    feat = build_feature_table(raw)

    print("=" * 70)
    print("STEP 1-2: Feature engineering complete")
    print("=" * 70)
    print(f"Player-seasons: {len(feat)} | Players: {feat['player'].nunique()} "
          f"| Positions: {sorted(feat['position'].unique())}\n")

    all_backtests = []
    final_models = {}
    shap_summaries = {}

    for pos in sorted(feat["position"].unique()):
        pos_df = feat[feat["position"] == pos].copy()
        n_rows = len(pos_df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN]))
        choice = recommend_model(n_rows)

        print("=" * 70)
        print(f"STEP 3: Position-specific model — {pos}  "
              f"(n={n_rows} rows -> recommended model: {choice})")
        print("=" * 70)

        def model_builder(train_n, choice=choice):
            return build_estimator(choice, train_n)

        bt = rolling_season_backtest(pos_df, FEATURE_COLUMNS, TARGET_COLUMN, model_builder)
        if not bt.empty:
            bt.insert(0, "position", pos)
            all_backtests.append(bt)
            print(bt.to_string(index=False))
        else:
            print("  (not enough seasons of history for a walk-forward backtest at this position)")
        print()

        train_full = pos_df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])
        if len(train_full) < 5:
            continue
        final_model = build_estimator(choice, len(train_full))
        final_model.fit(train_full[FEATURE_COLUMNS], train_full[TARGET_COLUMN])
        final_models[pos] = (final_model, choice)

        try:
            if choice in ("random_forest", "xgboost"):
                explainer = shap.TreeExplainer(final_model)
                shap_values = explainer.shap_values(train_full[FEATURE_COLUMNS])
                mean_abs_shap = np.abs(shap_values).mean(axis=0)
                shap_summaries[pos] = pd.Series(mean_abs_shap, index=FEATURE_COLUMNS).sort_values(ascending=False)
            else:
                coefs = pd.Series(final_model.coef_, index=FEATURE_COLUMNS).abs().sort_values(ascending=False)
                shap_summaries[pos] = coefs
        except Exception as e:
            print(f"  (SHAP/importance skipped for {pos}: {e})")

    print("=" * 70)
    print("STEP 5: Feature importance by position (top 5)")
    print("=" * 70)
    for pos, s in shap_summaries.items():
        print(f"\n{pos}:")
        print(s.head(5).round(3).to_string())

    print("\n" + "=" * 70)
    print("STEP 6: Baseline projections (no injury/news context yet)")
    print("=" * 70)

    latest = feat.sort_values("season").groupby("player").tail(1).copy()
    pos_ranges = feat.groupby("position")[TARGET_COLUMN].agg(["min", "max"]).apply(tuple, axis=1).to_dict()
    proj_rows = []
    for _, row in latest.iterrows():
        pos = row["position"]
        if pos not in final_models:
            continue
        model, choice = final_models[pos]

        next_row = {
            "age": row["age"] + 1,
            "age_factor": None,
            "years_from_peak": None,
            "prev_weighted_opportunity_pg": row["weighted_opportunity_pg"],
            "trail2_weighted_opportunity_pg": row["trail2_weighted_opportunity_pg"] if pd.notna(row["trail2_weighted_opportunity_pg"]) else row["weighted_opportunity_pg"],
            "prev_pts_per_opportunity_shrunk": row["pts_per_opportunity_shrunk"],
            "trail2_pts_per_opportunity_shrunk": row["trail2_pts_per_opportunity_shrunk"] if pd.notna(row["trail2_pts_per_opportunity_shrunk"]) else row["pts_per_opportunity_shrunk"],
            "prev_availability": row["availability"],
            "trail2_availability": row["trail2_availability"] if pd.notna(row["trail2_availability"]) else row["availability"],
            "trend_ppr_pts": row["trend_ppr_pts"] if pd.notna(row["trend_ppr_pts"]) else 0,
            "career_year": row["career_year"] + 1,
        }
        next_row["age_factor"] = age_factor(next_row["age"], pos)
        next_row["years_from_peak"] = next_row["age"] - POSITION_PEAK_AGE.get(pos, 27.0)

        X_next = pd.DataFrame([next_row])[FEATURE_COLUMNS]
        pred = model.predict(X_next)[0]

        # Sanity bound: never extrapolate past the observed historical range
        # for the position (+10% headroom for a new career-high).
        pos_min, pos_max = pos_ranges[pos]
        pred = float(np.clip(pred, pos_min * 0.3, pos_max * 1.10))

        proj_rows.append({
            "player": row["player"],
            "position": pos,
            "team": row["team"],
            "proj_next_age": next_row["age"],
            "last_season": int(row["season"]),
            "last_season_ppr": round(row["ppr_pts"], 1),
            "model_used": choice,
            "proj_next_season_ppr_pts": round(pred, 1),
        })

    proj_df = pd.DataFrame(proj_rows).sort_values("proj_next_season_ppr_pts", ascending=False)
    print(proj_df.to_string(index=False))

    proj_df.to_csv(OUT_DIR / "baseline_projections.csv", index=False)

    if all_backtests:
        bt_all = pd.concat(all_backtests, ignore_index=True)
        bt_all.to_csv(OUT_DIR / "backtest_results_by_position.csv", index=False)

    print(f"\nSaved: {OUT_DIR / 'baseline_projections.csv'}")
    print(f"Saved: {OUT_DIR / 'backtest_results_by_position.csv'}")
    print("\nNext: run apply_context_adjustments.py to merge in injury/news context "
          "(data/injury_context.csv), which you should have gathered via web_search "
          "in Step 2 before this point.")


if __name__ == "__main__":
    main()
