"""
validate_context.py

Validates data/injury_context.csv, which the ASSISTANT populates via its own
web_search tool calls (this script cannot fetch anything itself -- no
network access in the sandbox). This script's job is purely to catch
malformed rows before any downstream skill (e.g. ff-ml-projections) trusts
this file.

Exit behavior: prints a validation report. Does not raise on soft issues
(e.g. a missing note) but does flag them. Hard failures (missing file,
missing required column, unparseable est_games_missed) raise so the
assistant notices and fixes the source data rather than silently
proceeding on bad input.
"""

import sys
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DATA_DIR = SKILL_ROOT / "data"
CONTEXT_PATH = DATA_DIR / "injury_context.csv"

REQUIRED_COLUMNS = ["player", "status", "est_games_missed", "note", "source_search_date"]
ALLOWED_STATUS = {"HEALTHY", "QUESTIONABLE", "DOUBTFUL", "OUT", "PUP/IR"}


def main():
    if not CONTEXT_PATH.exists():
        raise FileNotFoundError(
            f"{CONTEXT_PATH} not found. Gather player status via web_search "
            f"first (Step 2-3 of SKILL.md), then write this file before validating."
        )

    df = pd.read_csv(CONTEXT_PATH)

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}. "
                          f"Expected: {REQUIRED_COLUMNS}")

    issues = []

    dupes = df[df.duplicated(subset="player", keep=False)]
    if len(dupes):
        issues.append(f"Duplicate player rows (keeping first occurrence): "
                       f"{sorted(dupes['player'].unique())}")
        df = df.drop_duplicates(subset="player", keep="first")

    bad_status = df[~df["status"].isin(ALLOWED_STATUS)]
    if len(bad_status):
        issues.append(f"Invalid status values (must be one of {sorted(ALLOWED_STATUS)}): "
                       f"{list(zip(bad_status['player'], bad_status['status']))}")

    games_missed = pd.to_numeric(df["est_games_missed"], errors="coerce")
    bad_games = df[games_missed.isna() | (games_missed < 0) | (games_missed > 17)]
    if len(bad_games):
        issues.append(f"est_games_missed must be numeric 0-17: "
                       f"{list(zip(bad_games['player'], df.loc[bad_games.index, 'est_games_missed']))}")

    empty_notes = df[df["note"].isna() | (df["note"].astype(str).str.strip() == "")]
    if len(empty_notes):
        issues.append(f"Missing note (should say what was searched, even if 'no news found'): "
                       f"{list(empty_notes['player'])}")

    # Copyright guard: flag suspiciously long notes, which often means a
    # search result got pasted rather than paraphrased.
    long_notes = df[df["note"].astype(str).str.split().str.len() > 40]
    if len(long_notes):
        issues.append(f"Note(s) over 40 words -- check these are paraphrased summaries, "
                       f"not copied article text: {list(long_notes['player'])}")

    df.to_csv(CONTEXT_PATH, index=False)

    print("=" * 70)
    print(f"Validated {CONTEXT_PATH}")
    print("=" * 70)
    print(f"{len(df)} player(s), {len(issues)} issue(s) found\n")
    for i, issue in enumerate(issues, 1):
        print(f"{i}. {issue}")

    if not issues:
        print("Clean. Ready for downstream use (e.g. ff-ml-projections/apply_context_adjustments.py).")
    else:
        print("\nFix the above by hand in the CSV, then re-run this script.")

    print("\nStatus summary:")
    print(df["status"].value_counts().to_string())


if __name__ == "__main__":
    main()
