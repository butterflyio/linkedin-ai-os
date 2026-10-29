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

### Part A - structured profile (4 quick multiple-choice, the onboarding scaffold)

Use these fixed questions first; they seed the profile fast and map cleanly to
the output files. Capture the chosen label + note any nuance he adds.

A1. ABOUT YOU - "What is your name / what do you do?"
    - Founder (runs own company/consultancy)  <- Zain: Founder
    - Marketing lead / Creator / Sales leader

A2. AUDIENCE - "Who are you writing for?"
    - Founders and CEOs (decision makers)      <- Zain: primarily founders/CEOs
    - Marketers / Job seekers / Other

A3. TOPICS - "3 to 5 topics you want to be known for" (multi-select)
    - AI and automation  <- Zain: yes
    - Marketing          <- Zain: yes
    - Personal brand     <- Zain: yes
    - Leadership
    Map any extra he voices (AI safety, alignment, effective altruism, Web3)
    into the topic list too.

A4. HOT TAKE - "Your point of view on the industry others don't have"
    - Most advice is wrong
    - People overcomplicate it
    - A big shift is coming  <- Zain: fits (AI visibility / agentic OS shift)
    Capture his actual one-liner if he gives one.

### Part B - open voice questions (the depth layer)

Then ask these. Capture exact wording, not a paraphrase.

1. STORIES - "Tell me five real stories from your work: a win, a failure, a
   pivot, a client moment, a mistake. One or two lines each."
   These become story-bank.md entries. They are the ONLY proven sources to pull
   from when drafting. (Zain supplied 6 - preserve all six.)
2. CLIENTS - "What words do your clients and prospects actually use? What
   questions do they ask you?" Capture the exact phrases.
3. NEVER-WORDS - "What words do you never say? What do you hate reading?"
   Compile the banned-word list for voice.md and caption_gate.py.
4. CADENCE - "Write one line the way you'd say it. Then a longer one."
   Capture sentence rhythm, line length, punctuation habits. (Zain declined
   the short/long pair - use single long posts.)
5. NICHE - "What do you talk about, and what do you refuse to touch?"
   Locks the niche-fit rules in voice.md.

## What to build from the answers

- brands/you/voice.md - style rules, cadence, banned words, tone (from B3, B4, B5)
- brands/you/about-me.md - identity, journey, beliefs (from A1 + B1 stories)
- brands/you/audience.md - who reads, what they care about (from A2 + B2)
- brands/you/story-bank.md - the six real stories (from B1)
- brands/you/topics.md - the 3-5 topics to be known for + point of view (from A3, A4)
- sync the banned words into tools/caption_gate.py BANNED_WORDS

The user may instead point you at existing real writing (posts they approve as
genuinely theirs). That is a valid replacement for questions 1-2, but you must
still ask 3 (never-words) and 4 (cadence) - those cannot be inferred safely.

## Output

Return the five stories back to the user for approval. Do not finish building
files until the user confirms the stories and never-words are accurate.