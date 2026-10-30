---
name: content-matrix
description: >
  Build a 24-40 row LinkedIn content matrix for the month from live LinkedIn
  data (ConnectSafely API/CLI) plus the latest niche-research brief, in Zain's
  voice. Runs AFTER niche-research and BEFORE post-writer or hook-generator.
  Use when the user says "build my content matrix", "what should I post",
  "map out my month", or when starting a new planning cycle.
---

# Content Matrix - LinkedIn

Produce a monthly matrix of post ideas grounded in real evidence: the niche
research brief and live LinkedIn signals from Zain's own account. Nothing is
invented. The matrix is planning output only - it never posts anything.

## Sequence in the pipeline

1. niche-research (research/niche-brief-*.md + research/synthesis-*.md) - done
2. THIS SKILL - builds the matrix
3. hook-generator / post-writer / post-scorer - draft the chosen rows later
4. buffer.py - review/schedule

## Prerequisites - ConnectSafely LinkedIn data

Read real LinkedIn signals from Zain's own account. Prefer the CLI if
installed (`connectsafely`), otherwise call the API directly with curl.

```bash
npm install -g @connectsafely/cli        # once
export CONNECTSAFELY_API_KEY=...          # from https://connectsafely.ai/api-key
export CONNECTSAFELY_ACCOUNT_ID=...       # your account id (dashboard)
```

Reports (choose what is needed for the matrix):

```bash
connectsafely account status              # account + connection state
connectsafely posts latest --limit 20     # own recent posts
connectsafely search people "<theme>"     # who is talking about a theme
```

Direct API (same as the CLI under the hood; Bearer auth):

```bash
curl -X POST https://api.connectsafely.ai/linkedin/posts/latest \
  -H "Authorization: Bearer $CONNECTSAFELY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 20}'
```

If the key/account is missing or a call fails, say so in the coverage note and
proceed with the research brief only - never fake LinkedIn data.

## Step 1. Read the brand files (in order, always)

- ../../brands/you/voice.md - style rules; non-negotiable (no em dashes, no
  banned words)
- ../../brands/you/about-me.md - who Zain is
- ../../brands/you/audience.md - who he writes for
- ../../brands/you/topics.md - the pillars (the rows of the matrix)
- ../../brands/you/story-bank.md - the six real stories; the only proven
  sources. Never invent a story or a number.

## Step 2. Read the niche research

Read the newest brief and synthesis:

- ../../research/niche-brief-*.md (pick the latest date)
- ../../research/synthesis-*.md (if present)

Extract: the hot themes, the dated stories, the angles Zain maps to, and the
gaps the synthesis identified.

## Step 3. Pull live LinkedIn signals (ConnectSafely)

1. Own posts: fetch the recent 15-20 posts (above). Note which of Zain's own
   posts earned attention - the matrix should repeat winning formats/angles.
2. Account status: note connection/dm budget in case the month plan includes
   lightweight engagement; the matrix itself never messages anyone.
3. Optional: search people for the leading theme to see the conversation
   (readable signal from the brief already covers this; use sparingly).

## Step 4. Build the matrix

Format: a markdown table with these columns, one row per idea (24 to 40 rows):

```
| # | Pillar | Format | Post idea (hook line) | Anchor (story/brief fact) | News or Evergreen | Est. fit |
```

- Pillars come from topics.md (the 5 pillars).
- Formats (8): Story, Number, Opinion, How-to, Framework, List, Case study,
  Meta. Each pillar x format pairing can yield a row (5 x 8 = 40 possible).
- The idea is ONE hook sentence that could go straight to hook-generator.
- Every row must carry a real anchor: a story from story-bank.md, a dated fact
  from the brief, or an AEO/GEO/Web3 factor from topics.md. No invented facts,
  percentages, names or quotes.
- Bias rows toward the hot themes from the synthesis and repeat the formats
  Zain's own posts already win with (from Step 3).
- Mark each row News (timely, hours to days) or Evergreen (pillar content).

## Step 5. Output

- Save the matrix to ../../research/content-matrix-YYYY-MM-DD.md
- Under the table add: coverage note (which LinkedIn data was read, which
  brief was used), the 3 rows to publish first (timeliest + strongest anchor),
  and any pillar with few ideas flagged for the next niche-research pass.
- Reply with: matrix location, the 3 priority rows, and a one-line rationale
  per priority row.

## Rules

- No em dashes. No banned words from voice.md.
- LinkedIn data is read-only: profiles, posts, search. Never send messages,
  comments, connection requests or follows from this skill.
- Verify before planning: dates from the brief must be within the brief's
  window; a row without a real anchor is dropped, not padded.
- The matrix is planning. Publishing happens only later through the human gate
  (buffer.py review).