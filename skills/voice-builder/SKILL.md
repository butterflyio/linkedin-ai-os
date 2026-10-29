---
name: voice-builder
description: Build voice.md and story-bank.md from a short interview plus writing samples. The foundation every other skill reads. Run this before any post is drafted for a new voice.
---

# Voice Builder - Linkedin

Build Zain's voice from his real material, not from AI text. This is the step
that keeps the whole system sounding human. Never skip it.

## Why this exists

If the system learns a voice from AI-written posts, it hands generic AI back.
So the voice comes from how Zain actually talks and what he actually did, not
from old drafts that may have been AI-assisted.

## The interview (ask all of these, in order)

Ask Zain directly. Capture his exact words where possible, not a paraphrase.

1. STORIES - "Tell me five real stories from your work: a win, a failure, a
   pivot, a client moment, a mistake. One or two lines each."
   These become story-bank.md entries. They are the ONLY proven sources to pull
   from when drafting.

2. CLIENTS - "What words do your clients and prospects actually use? What
   questions do they ask you?" Capture the exact phrases.
   These become the audience.md "what they care about" list.

3. NEVER - "What words do you never say? What do you hate reading?"
   Compile the banned-word list for voice.md and caption_gate.py.

4. CADENCE - "Write one line the way you'd say it. Then a longer one."
   Capture sentence rhythm, line length, punctuation habits.

5. NICHE - "What do you talk about, and what do you refuse to touch?"
   Locks the niche-fit rules in voice.md.

## What to build from the answers

- brands/you/voice.md - style rules, cadence, banned words, tone
- brands/you/about-me.md - identity, journey, beliefs
- brands/you/audience.md - who reads, what they care about
- brands/you/story-bank.md - the five real stories
- sync the banned words into tools/caption_gate.py BANNED_WORDS

The user may instead point you at existing real writing (posts they approve as
genuinely theirs). That is a valid replacement for questions 1-2, but you must
still ask 3 (never-words) and 4 (cadence) - those cannot be inferred safely.

## Output

Return the five stories back to the user for approval. Do not finish building
files until the user confirms the stories and never-words are accurate.