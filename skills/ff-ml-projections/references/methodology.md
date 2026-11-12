# Methodology Reference

## Feature engineering (matters more than model choice)
- **Age curves**: position-calibrated peaks (RB ~24.5, WR ~27, QB ~30.5,
  TE ~27.5), with steeper post-peak decline for RB (contact position) than
  WR/QB/TE.
- **Opportunity metrics**: weighted opportunity = rush attempts + targets *
  1.5 (a target is worth more in PPR — it's less likely to be stuffed for a
  loss than a carry, and a catch scores a reception point on top of yardage).
- **Efficiency, shrunk toward the mean**: points-per-opportunity is noisy in
  small samples (a few big plays swing it heavily), so it's shrunk toward
  the position-season average in proportion to games played. A player with
  17 games gets ~all their own efficiency signal; a player with 4 games gets
  mostly the position average.
- **Lag features only** — every predictive feature is `prev_*` or `trail2_*`,
  built with `.shift(1)` before any rolling window. Using same-season stats
  to predict same-season output is leakage and will look artificially
  accurate in-sample while being useless for actual forecasting.

## Model selection framework
```
Primary goal?
├─ Interpretability          → Ridge/Lasso
└─ Performance
   ├─ Small (<1,000 rows)    → Ridge/Lasso/ElasticNet
   ├─ Medium (1K-10K rows)   → Random Forest or XGBoost
   └─ Large (>10K rows)      → XGBoost/LightGBM, or an ensemble
```
`model_selection.py` picks automatically by row count per position. An
`EnsembleRegressor` (Ridge:RF:XGBoost weighted 1:2:2) is available once
there's enough real history to support tree models without overfitting.

## Validation: walk-forward only, never shuffled k-fold
Standard `KFold(shuffle=True)` cross-validation leaks future seasons into
training folds for time series data, inflating reported accuracy by roughly
15-20%. `validation.py` instead trains only on seasons strictly before the
test season and reports MAE/RMSE/R² per season — this is the only honest way
to estimate how the model will do on a season it hasn't seen yet.

## A real failure mode this pipeline hit and fixed
Christian McCaffrey's 2024 injury-shortened season (55 pts) into his 2025
bounce-back (417 pts) created a huge raw `trend_ppr_pts` feature. A lightly
regularized linear model extrapolated that trend forward and projected 640
points for the following season — a number no NFL player has ever come
close to. Two fixes were needed together:
1. **Clip the trend feature** (±120) — an injury-suppressed-to-healthy swing
   is a small-sample artifact, not a repeatable growth rate.
2. **Scale regularization with sample size** — Ridge alpha jumps to 25 under
   30 rows, 8 under 100, so a handful of outlier seasons can't dominate the
   fit.
3. **Hard sanity bound at prediction time** — clip any single projection to
   [30% of the position's historical min, 110% of the position's historical
   max]. A model should never be trusted to extrapolate past the range of
   outcomes it was actually trained on; this is a guard rail, not a
   substitute for good features.

## The sample dataset is illustrative, not real
`assets/sample_player_seasons.csv` is built around real facts (McCaffrey's
413-touch 2025, Achane's target volume, Taylor's Jones-dependent split
season) but the surrounding season-by-season numbers are fabricated to give
the model a time series to learn from. Treat any run against this file as a
demo of the *methodology*, not a betting-grade projection. Replace it with
real weekly/season logs (nflverse, nfl_data_py, a league stats export, PFF)
to make it real — every downstream script works unchanged on real data with
the same column schema.

## Why live injury/news data can't come from inside the scripts
The code-execution sandbox that runs these scripts has no network access —
this is an infrastructure-level restriction (Anthropic's code execution
tool docs: "The container has no internet access... only pre-installed
libraries are available"), not something a script can work around with a
different HTTP library. The only way live context enters this pipeline is
via the assistant's own web_search/web_fetch tool calls, written to
`data/injury_context.csv`, which `apply_context_adjustments.py` then merges
onto the statistical baseline. See SKILL.md Step 2.

This also means the injury/news layer is deliberately simple and rule-based
(games-missed discount + a small efficiency haircut for
QUESTIONABLE/DOUBTFUL) rather than a second learned model — there's no
practical way to build a validated model for "how many points does a
hamstring strain cost," so a transparent, adjustable rule is more honest
than a model dressed up to look more rigorous than the underlying data
supports.
