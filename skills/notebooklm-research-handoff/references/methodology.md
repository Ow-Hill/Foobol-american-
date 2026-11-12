# Methodology Reference

## Division of labor between web_search and NotebookLM
web_search is fast and good at answering one narrow question at a time —
"is Player X playing this week" has one right answer and a couple of
sources settle it. NotebookLM is built for synthesizing many documents into
one coherent answer — "what's the real recovery outlook across five
different ACL recoveries on my roster, where sources disagree" benefits
from that synthesis in a way that five separate quick searches doesn't
replicate well. This skill exists for the second category only.

## Why this is a document-handoff, not an API integration
No MCP connector for NotebookLM exists in this environment (checked via
the connector registry while building this). Google hasn't published a
public API for it as of this skill's construction. The honest design given
that constraint is a clean, well-scoped document a human pastes in
themselves — not a fake "integration" that pretends to call something that
isn't there.

## Why proactive offering matters here specifically
Unlike the other skills in this family, this one can't complete its own
loop — it hands off to a human action outside the conversation entirely.
That makes it easy to under-use (nobody thinks to ask for it) even when
it's clearly the better tool for the job. The trigger conditions in
`SKILL.md` exist to catch that, but it's still framed as an offer, not an
automatic action — the user has to actually go do something in another
product, and that should be their call each time, not something the skill
decides for them.

## Closing the loop
A brief that doesn't specify `feed_into` is a dead end — the research
happens, and then nothing downstream updates. Every example in
`assets/example_briefs.json` names a specific file or decision the
findings should update. When building a new brief, always fill this field.
