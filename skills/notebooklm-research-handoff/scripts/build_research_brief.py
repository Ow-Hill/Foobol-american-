"""
build_research_brief.py

Assembles a clean, copy-paste-ready research brief for NotebookLM from
either CLI args or data/brief_input.json. This script does no research
itself -- it formats a request that a HUMAN will paste into NotebookLM,
then bring the answer back to Claude.

Usage:
    python3 scripts/build_research_brief.py --topic "..." --context "..." \
        --questions questions.txt --sources sources.txt --feed-into "..."

    # or, with data/brief_input.json already written:
    python3 scripts/build_research_brief.py
"""

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DATA_DIR = SKILL_ROOT / "data"
OUT_DIR = DATA_DIR / "outputs"
INPUT_JSON = DATA_DIR / "brief_input.json"
OUT_PATH = OUT_DIR / "notebooklm_brief.md"


def read_lines_file(path_str):
    if not path_str:
        return []
    p = Path(path_str)
    if not p.exists():
        raise FileNotFoundError(f"{p} not found")
    return [line.strip() for line in p.read_text().splitlines() if line.strip()]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic")
    parser.add_argument("--context")
    parser.add_argument("--questions", help="path to a text file, one question per line")
    parser.add_argument("--sources", help="path to a text file, one suggested source type per line")
    parser.add_argument("--feed-into", help="which skill/data file the findings should update")
    return parser.parse_args()


def load_config():
    args = parse_args()
    if args.topic:
        return {
            "topic": args.topic,
            "context": args.context or "",
            "questions": read_lines_file(args.questions),
            "suggested_sources": read_lines_file(args.sources),
            "feed_into": args.feed_into or "",
        }

    if not INPUT_JSON.exists():
        raise FileNotFoundError(
            f"No --topic given and {INPUT_JSON} doesn't exist either. "
            f"Either pass CLI args or write data/brief_input.json "
            f"(see assets/example_briefs.json for the schema)."
        )
    return json.loads(INPUT_JSON.read_text())


def render_markdown(config: dict) -> str:
    topic = config["topic"]
    context = config.get("context", "")
    questions = config.get("questions", [])
    sources = config.get("suggested_sources", [])
    feed_into = config.get("feed_into", "")

    if not questions:
        raise ValueError("At least one research question is required -- an empty "
                          "brief isn't useful to hand to NotebookLM or the user.")

    lines = [f"# NotebookLM Research Brief: {topic}", ""]

    if context:
        lines += [f"**Why this research matters right now:** {context}", ""]

    lines += ["## Instructions", "",
              "Paste the questions below into NotebookLM along with a handful of "
              "relevant sources (or let NotebookLM search the web itself if that's "
              "enabled). Bring the answer back here and it'll be used to update "
              f"{feed_into if feed_into else 'the relevant roster/decision this was for'}.",
              ""]

    lines += ["## Research Questions", ""]
    for i, q in enumerate(questions, 1):
        lines.append(f"{i}. {q}")
    lines.append("")

    if sources:
        lines += ["## Suggested Source Types to Upload", ""]
        for s in sources:
            lines.append(f"- {s}")
        lines.append("")

    if feed_into:
        lines += ["## When you bring the answer back",
                   f"Findings from this brief should update: **{feed_into}**", ""]

    return "\n".join(lines)


def main():
    config = load_config()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    markdown = render_markdown(config)
    OUT_PATH.write_text(markdown)

    print("=" * 70)
    print(f"Research brief built: {config['topic']}")
    print("=" * 70)
    print(markdown)
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
