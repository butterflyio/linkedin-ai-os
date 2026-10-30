# Vendoring & overlap map

This repo (`linkedin-ai-os`) is the single source of truth for Zain's LinkedIn
system. Charlie Hills' public skill collection lives in a separate repo:

- https://github.com/charlie947/social-media-skills (upstream, reference)
- https://github.com/butterflyio/linkedin-ai-os (this repo, ours)

Nothing from the upstream repo is copied in here. We reference its approach
and, where we build our own equivalent, ours is the one used.

## Upstream skills vs ours

| Charlie's skill | Status here | Notes |
|---|---|---|
| voice-builder | **ours** | `skills/voice-builder` + `brands/you/*` |
| post-writer | **ours** | `skills/post-writer` |
| hook-generator | **ours** | `skills/hook-generator` |
| post-scorer | **ours** | `skills/post-scorer` + `tools/caption_gate.py` |
| post-formatter | reference | not vendored; framework-style posts can be handled by post-writer |
| pinned-comment | reference | not built yet |
| quote-post | reference | not built yet |
| content-matrix | reference | not built yet |
| profile-optimizer | reference | planned (later milestone) |
| newsletter-voice | reference | out of scope for now |
| niche-research | **in progress** | `research/brief.py` (pluggable providers) |
| graphic-designer | reference | we render infographics ourselves (`scratch/render-*.mjs`, `tools/editor.html`) |
| gemini-infographic | reference | AI-image route, not our render route |
| gemini-carousel | reference | not built yet |
| reels-scripting | reference | not built yet |
| youtube-thumbnail | reference | not built yet |
| analytics-dashboard | reference | not built yet |

Rule: a skill is **ours** if it lives in this repo and reads `brands/you/*`.
Everything marked *reference* stays upstream until we implement it here, so
there is never a second copy.

## Pipeline (our single path)

post → (hook-generator) → post-writer → caption_gate/post-scorer → infographic
(editor → render) → buffer.py (review) → publish