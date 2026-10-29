# LinkedIn AI OS for Zain Khan

A portable content system that drafts LinkedIn posts in Zain's voice and gates
them against AI-slop before they ship. Built to be copied, tuned, and owned.

## Why this exists

Generic AI prompts make LinkedIn posts sound like everyone else's AI. This
system stores the parts generic prompts miss - voice, stories, audience,
banned words - in files an agent reads before it drafts anything. So the output
is Zain's, not the mean of every bot on LinkedIn.

## Structure

    CLAUDE.md                     top-level instructions, read every time
    brands/you/
      voice.md                    style rules: cadence, banned words, dashes
      about-me.md                 who I am, what I believe, what I avoid
      audience.md                 who reads, what they care about
      story-bank.md               real stories, the only proven sources
    skills/
      post-writer/SKILL.md        drafts a post in voice
      hook-generator/SKILL.md     6 stop-the-scroll hooks
      post-scorer/SKILL.md        scores a draft pre-publish
    tools/
      caption_gate.py             programmatic slop/voice gate (runnable)

## Workflow

1. Read the brand files (they are the context).
2. hook-generator -> pick the hook.
3. post-writer -> full draft.
4. post-scorer + caption_gate.py -> PASS.
5. Human approves. Nothing posts automatically.

## caption_gate.py

Checks a draft against Zain's voice rules. Prints PASS/FAIL per rule, exits
non-zero on failure so it can block a publish pipeline.

    python3 tools/caption_gate.py draft.md
    python3 tools/caption_gate.py --demo   # self-check

## Install (portable)

These are plain markdown skills and one python script. They work in Claude
Code, Codex, or any agent that loads skills (e.g. Hermes). Point your agent at
this repo root and it picks up CLAUDE.md + the skill folders.

## Test

```
python3 tools/caption_gate.py --demo
python3 tools/caption_gate.py test-drafts/good.md   # exit 0
python3 tools/caption_gate.py test-drafts/slop.md   # exit 1
```

## License

MIT (c) Zain Khan. Do what you like. A link back is appreciated, not required.