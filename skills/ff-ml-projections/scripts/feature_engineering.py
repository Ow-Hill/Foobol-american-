"""
feature_engineering.py

Domain-specific feature engineering for fantasy football player projection
models, following the patterns in the ff-ml-modeling skill:
  - Age curves (position-specific peaks, Marcel-style decline)
  - Opportunity metrics (weighted opportunities, target/snap share)
  - Efficiency stats (points per opportunity)
  - Rolling / lag features (prior-season trend)

Core principle: feature engineering matters more than model choice for
sports prediction. Opportunity > efficiency > TDs in predictive power.
"""

import numpy as np
import pandas as pd

# Position-specific age peaks (research-backed approximate NFL peaks)
POSITION_PEAK_AGE = {
    "RB": 24.5,   # RBs peak young, 23-26
    "WR": 27.0,   # WRs peak 26-28
    "QB": 30.5,   # QBs peak 28-33
    "TE": 27.5,   # TEs peak 26-29
}

# Decline is steeper for RB (contact position) than WR/TE/QB
POSITION_DECLINE_RATE = {
    "RB": 0.020,
    "WR": 0.008,
    "QB": 0.005,
    "TE": 0.008,
}


def age_factor(age: float, position: str) -> float:
    """
    Marcel-style age adjustment: 1.0 at peak, declining afterward,
    with a gentler build-up before peak (young players still improving).
    """
    peak = POSITION_PEAK_AGE.get(position, 27.0)
    decline = POSITION_DECLINE_RATE.get(position, 0.01)
    if age <= peak:
        # Modest, capped upside adjustment approaching peak
        return 1.0 - min(peak - age, 5) * 0.01
    else:
        return 1.0 - (age - peak) * decline


def add_age_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["age_factor"] = df.apply(lambda r: age_factor(r["age"], r["position"]), axis=1)
    df["years_from_peak"] = df.apply(
        lambda r: r["age"] - POSITION_PEAK_AGE.get(r["position"], 27.0), axis=1
    )
    return df


def add_opportunity_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Weighted opportunity: carries + targets * 1.5 (targets are worth more
    in PPR since a target that turns into a catch scores a reception point
    plus is less likely to be stuffed for a loss than a carry).
    """
    df = df.copy()
    df["weighted_opportunity"] = df["rush_att"] + df["targets"] * 1.5
    df["weighted_opportunity_pg"] = df["weighted_opportunity"] / df["games"].clip(lower=1)
    df["touches_pg"] = df["touches"] / df["games"].clip(lower=1)
    df["targets_pg"] = df["targets"] / df["games"].clip(lower=1)
    return df


def add_efficiency_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Points-per-opportunity is the efficiency signal; flagged as noisy
    with small samples, so we don't let it dominate feature importance
    without a sample-size-aware shrinkage toward the position mean.
    """
    df = df.copy()
    df["pts_per_opportunity"] = df["ppr_pts"] / df["weighted_opportunity"].clip(lower=1)
    df["catch_rate"] = (df["receptions"] / df["targets"].clip(lower=1)).fillna(0)
    df["yds_per_touch"] = (
        (df["rush_yds"] + df["rec_yds"]) / df["touches"].clip(lower=1)
    ).fillna(0)

    # Shrink efficiency toward position-season mean when games played is low
    # (small-sample noise correction)
    pos_season_mean = df.groupby(["position", "season"])["pts_per_opportunity"].transform("mean")
    reliability = (df["games"] / 17).clip(upper=1)
    df["pts_per_opportunity_shrunk"] = (
        reliability * df["pts_per_opportunity"] + (1 - reliability) * pos_season_mean
    )
    return df


def add_injury_risk_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["games_missed_rate"] = df["injury_games_missed"] / 17
    df["availability"] = 1 - df["games_missed_rate"]
    return df


def add_rolling_lag_features(df: pd.DataFrame, group_col="player", sort_col="season") -> pd.DataFrame:
    """
    Prior-season trend features. IMPORTANT: these must only use data from
    *before* the row's own season, otherwise this is data leakage and the
    projection is not usable for forecasting a future season.
    """
    df = df.sort_values([group_col, sort_col]).copy()
    grp = df.groupby(group_col)

    for col in ["ppr_pts", "weighted_opportunity_pg", "pts_per_opportunity_shrunk", "availability"]:
        df[f"prev_{col}"] = grp[col].shift(1)
        df[f"trend_{col}"] = grp[col].diff(1)
        # 2-season trailing average, excluding current season
        df[f"trail2_{col}"] = grp[col].transform(
            lambda s: s.shift(1).rolling(2, min_periods=1).mean()
        )

    # Clip the raw trend feature. An injury-suppressed season followed by a
    # healthy bounce-back (e.g. a 55-pt season into a 417-pt season) produces
    # a swing that is a small-sample artifact, not a repeatable growth rate.
    # Left unclipped, a linear model will extrapolate it and blow up next
    # season's projection -- exactly the kind of leakage-adjacent failure
    # mode the validation strategy is meant to catch. Winsorizing keeps the
    # *direction* of the trend as a signal without letting one outlier
    # season dominate the fit.
    df["trend_ppr_pts"] = df["trend_ppr_pts"].clip(lower=-120, upper=120)

    df["career_year"] = grp.cumcount() + 1
    return df


def build_feature_table(raw: pd.DataFrame) -> pd.DataFrame:
    """Full feature engineering pipeline, in order."""
    df = raw.copy()
    df = add_age_features(df)
    df = add_opportunity_features(df)
    df = add_efficiency_features(df)
    df = add_injury_risk_features(df)
    df = add_rolling_lag_features(df)
    return df


FEATURE_COLUMNS = [
    "age", "age_factor", "years_from_peak",
    "prev_weighted_opportunity_pg", "trail2_weighted_opportunity_pg",
    "prev_pts_per_opportunity_shrunk", "trail2_pts_per_opportunity_shrunk",
    "prev_availability", "trail2_availability",
    "trend_ppr_pts",
    "career_year",
]

TARGET_COLUMN = "ppr_pts"
