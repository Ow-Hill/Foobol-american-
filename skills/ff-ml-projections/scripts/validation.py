"""
validation.py

Sports-specific validation. The single most important rule from the
ff-ml-modeling methodology:

    NEVER use standard KFold(shuffle=True) cross-validation on sports
    time series. It leaks future information into training folds and
    inflates reported performance by roughly 15-20%.

Always validate by holding out the most recent season(s) as a genuine
future-prediction test.
"""

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error


def season_holdout_split(df: pd.DataFrame, holdout_season: int, season_col="season"):
    train = df[df[season_col] < holdout_season]
    test = df[df[season_col] == holdout_season]
    return train, test


def evaluate(y_true, y_pred) -> dict:
    return {
        "MAE": mean_absolute_error(y_true, y_pred),
        "RMSE": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "R2": float(np.corrcoef(y_true, y_pred)[0, 1] ** 2) if len(y_true) > 1 else float("nan"),
    }


def rolling_season_backtest(df, feature_cols, target_col, model_builder, min_train_seasons=1):
    """
    Walk-forward validation: for each season after the minimum training
    window, train on all prior seasons and test on that season only.
    This mirrors how the model will actually be used (predict a future
    season from past data) and avoids any leakage across the split.
    """
    seasons = sorted(df["season"].unique())
    results = []

    for i, test_season in enumerate(seasons):
        if i < min_train_seasons:
            continue
        train, test = season_holdout_split(df, test_season)
        train = train.dropna(subset=feature_cols + [target_col])
        test = test.dropna(subset=feature_cols + [target_col])
        if len(train) < 5 or len(test) == 0:
            continue

        model = model_builder(len(train))
        model.fit(train[feature_cols], train[target_col])
        preds = model.predict(test[feature_cols])

        metrics = evaluate(test[target_col].values, preds)
        metrics["test_season"] = test_season
        metrics["n_train"] = len(train)
        metrics["n_test"] = len(test)
        results.append(metrics)

    return pd.DataFrame(results)
