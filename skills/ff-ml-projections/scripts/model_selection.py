"""
model_selection.py

Model selection framework for fantasy football projections:

    Primary Goal?
    +- Interpretability -> Linear / Ridge / Lasso
    +- Performance
       +- Small (<1000 rows)   -> Ridge / Lasso / Elastic Net
       +- Medium (1K-10K rows) -> Random Forest or XGBoost
       +- Large (>10K rows)    -> XGBoost/LightGBM or Ensemble

Our dataset is intentionally small (illustrative sample, ~75 player-seasons),
so per the framework we default to regularized linear models per position,
with an optional Ridge+RF+XGBoost ensemble (1:2:2 weighting) available once
more history is loaded.
"""

from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from xgboost import XGBRegressor


@dataclass
class ModelChoice:
    name: str
    estimator: object


def recommend_model(n_rows: int, prioritize_interpretability: bool = False) -> str:
    if prioritize_interpretability:
        return "ridge"
    if n_rows < 1000:
        return "ridge"
    elif n_rows < 10000:
        return "random_forest"
    else:
        return "xgboost"


def build_estimator(choice: str, n_rows: int):
    if choice == "ridge":
        # Small samples -> higher alpha (more regularization). Our sample
        # dataset is tiny (illustrative, not real historical data), so we
        # regularize hard to avoid a single outlier season swinging the fit.
        if n_rows < 30:
            alpha = 25.0
        elif n_rows < 100:
            alpha = 8.0
        else:
            alpha = 1.0
        return Ridge(alpha=alpha)
    elif choice == "random_forest":
        return RandomForestRegressor(
            n_estimators=300, max_depth=4, min_samples_leaf=3, random_state=42
        )
    elif choice == "xgboost":
        return XGBRegressor(
            n_estimators=200, max_depth=3, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, random_state=42
        )
    else:
        raise ValueError(f"Unknown model choice: {choice}")


class EnsembleRegressor:
    """Ridge + RandomForest + XGBoost, weighted 1:2:2 as recommended
    when there's enough data to support tree-based models without
    overfitting on top of the interpretable baseline."""

    def __init__(self, n_rows: int):
        self.ridge = build_estimator("ridge", n_rows)
        self.rf = build_estimator("random_forest", n_rows)
        self.xgb = build_estimator("xgboost", n_rows)
        self.weights = np.array([1, 2, 2]) / 5

    def fit(self, X, y):
        self.ridge.fit(X, y)
        self.rf.fit(X, y)
        self.xgb.fit(X, y)
        return self

    def predict(self, X):
        preds = np.column_stack([
            self.ridge.predict(X),
            self.rf.predict(X),
            self.xgb.predict(X),
        ])
        return preds @ self.weights
