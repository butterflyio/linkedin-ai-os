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
5. (Optional) Animated infographic for the post (see below).
6. buffer.py -> push into Buffer for review.
7. Human approves in Buffer. Nothing posts automatically.

## caption_gate.py

Checks a draft against Zain's voice rules. Prints PASS/FAIL per rule, exits
non-zero on failure so it can block a publish pipeline.

    python3 tools/caption_gate.py draft.md
    python3 tools/caption_gate.py --demo   # self-check

## buffer.py (schedule for review)

Push an approved draft into your Buffer channel as a review item. Nothing
ships until you approve it in the Buffer UI - this is the human gate.
Speaks Buffer's GraphQL API (the legacy REST API rejects current tokens).

Setup (once): generate an access token in Buffer (Account -> Settings -> API)
and run:

    python3 tools/buffer.py setup      # stores token at ~/.config/buffer-token
    python3 tools/buffer.py profiles   # list channels (LinkedIn is the default)

Ship a draft (default: save as draft in Buffer, you approve there):

    python3 tools/buffer.py submit test-drafts/post.md --gate
    python3 tools/buffer.py submit test-drafts/post.md --gate --when "2026-11-02 09:00"
    python3 tools/buffer.py submit test-drafts/post.md --gate --queue
    python3 tools/buffer.py submit test-drafts/post.md --gate --now     # immediate
    python3 tools/buffer.py submit test-drafts/post.md --dry-run         # preview only

Flags: --gate runs caption_gate.py first and blocks on FAIL, --when schedules
(local time, 5+ minutes out), --queue adds to the channel queue, --now posts
immediately, --draft forces draft mode (the default), --link attaches a URL,
--profile picks a channel id.

## Animated infographics

The post can ship with a branded animated infographic, built from a small
DSL file and rendered locally (no design tool, no uploads):

    # verify content fast (no browser):
    node scratch/ssr-render.mjs scratch/open-person-infographic.dsl.txt /tmp/check.svg

    # static PNG (retina) and animated loop GIF:
    node scratch/render-png.mjs scratch/open-person-infographic.dsl.txt "Open Person Company" out.png [chromium]
    node scratch/render-gif.mjs scratch/open-person-infographic.dsl.txt out.gif [chromium]

The GIF pops badges in one by one with a highlight sweep, ends on a hold,
and loops (800x673, ~0.5 MB, fits LinkedIn's media limits). Chromium example:
~/.cache/pptr/chrome-headless-shell/*/chrome-headless-shell-linux64/chrome-headless-shell
(install with: npx @puppeteer/browsers install chrome-headless-shell@stable).
Requires ffmpeg for GIF encoding.

Existing DSLs: scratch/incident-infographic.dsl.txt (stats sequence),
scratch/open-person-infographic.dsl.txt (founder journey).

## Editor (edit an infographic visually)

Open `tools/editor.html` in a browser - no server needed. Load a spec JSON
(`flow` mode is first-class), edit text, colours, steps and chips, scrub the
preview timeline, then export the updated JSON and re-render:

    node scratch/render-story.mjs edited-flow.json out.gif --poster out.png

## Niche research

`research/` holds dated 7-day niche briefs (Reddit archive + HN + official
feeds). X/Twitter and Google search are noted when unavailable.

Charlie Hills' public skills live at github.com/charlie947/social-media-skills
(post-* , niche-research, gemini-*, graphic-designer, analytics-dashboard,
content-matrix, profile-optimizer, voice-builder) - a reference for skill
authorship; this repo ships its own pipeline for the same jobs.

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