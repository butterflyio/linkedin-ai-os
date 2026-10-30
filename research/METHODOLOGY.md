# Gated Niche-Research Methodology

The workflow is staged so that no unvalidated material flows forward. Each
stage has an output, and between stages there is a **gate** - a human
decision that must happen before the next stage runs. Nothing is
auto-published at any point.

```
 Stage 0   Setup (keys, facets, source-lists)     [once, by team]
 Stage 1   Collect - all enabled sources           brief.py
 Stage 2   Normalise + verify each item            brief.py
 Stage 3   Rank + cluster                          brief.py
 GATE A  Approve / reject rows (triage)           gate UI  -> gate-approvals.json
 Stage 4   Re-verify + enrich (Perplexity verdict,
           Wikipedia, arXiv)                       brief.py --polish
 GATE B  Hold WEAK/UNVERIFIABLE - keep the rest   review by Zain
 Stage 5   Content matrix (pillars x formats,
           real anchors only)                      skills/content-matrix
 GATE C  Choose the month's rows                  matrix selection
 Stage 6   Hook -> post-writer -> scorer          skills (post-writer etc.)
 GATE D  caption_gate PASS + Buffer review        human approve -> schedule
```

## Stage 0 - Setup (once)
- API keys in `research/.env` (setup-keys.sh): Tavily, Serper, SerpAPI, Exa,
  Firecrawl, ScrapeGraph, Jina, Perplexity. Optional: X token, ConnectSafely
  (LinkedIn own-posts), Serper (Google), etc.
- Niche facets in `research/brief.py` (FACETS). Currently AI agents /
  agentic AI, Web3 SEO / AEO / GEO, AI safety / alignment.
- Source-quality lists: Tier1/Tier2 allowlist, content-farm blocklist.

## Stage 1 - Collect
`python3 research/brief.py --out research/niche-brief-DATE.md`
All enabled sources run: Hacker News (Algolia), Reddit (Arctic Shift +
site:reddit), Tavily, Serper, SerpAPI, Exa, Firecrawl, ScrapeGraph, Jina,
Perplexity Search (fast). Missing providers are named in the coverage note,
never silently skipped.

## Stage 2 - Normalise + verify items
- 7-day window enforced (older than window is dropped).
- Every item carries: title, date, verifiable permalink, author/community,
  source tier (Tier1/Tier2/Expert/Community/Index), and a snippet of the
  scraped text.
- Content farms and Wikipedia fall out automatically.

## Stage 3 - Rank + cluster
`brief.py` scores each item:
`score = log(engagement signal) + tier bonus + recency + cross-platform
cluster bonus`. Same story surfacing on 2+ sources ranks higher.
Output: `research/niche-review-DATE.md` (ranked table + clusters).

## GATE A - Triage (approve)
Open `research/gate.html` (served at tools/web.py). Rows show theme tags
(color-coded), snippets, tier badges, and the platforms that surfaced them.
Check the rows you want -> Save approvals (writes `gate-approvals.json`).
Decision rule: approve what fits your pillars and is worth writing about;
ignore the rest. You can filter by tag to review one subject at a time.

## Stage 4 - Re-verify + enrich (second layer)
`python3 research/brief.py --polish`
For each approved row: Perplexity verdict (VERIFIED / LIKELY / WEAK /
UNVERIFIABLE) judged against the captured page text, plus Wikipedia context
and recent arXiv papers. Output: `research/polished-approved-DATE.md`.

## GATE B - Hold weak sources
Anything WEAK or UNVERIFIABLE is held before it can feed the matrix.
Keep the VERIFIED/LIKELY set. This is the second human check.

## Stage 5 - Content matrix
`skills/content-matrix` fuses the approved+verified research with the brand
files (voice, about-me, topics, story-bank) and produces a 24-40 row matrix
(pillar x format), every idea anchored to a verified fact.

## GATE C - Choose the month's rows
Pick which ideas to produce. Matrix rows feed the writing pipeline.

## Stage 6 - Write
hook-generator -> post-writer -> post-scorer. Each draft must pass speech
rules and the caption gate before it ships anywhere.

## GATE D - Publish gate
`tools/caption_gate.py` must PASS, and the human approves in Buffer
(`tools/buffer.py`, default draft-for-review). Nothing auto-publishes.

## Cadence (suggested)
- Weekly research ran on a fixed day (e.g., Monday): Stages 1-3 + Gate A.
- Tuesday: Stage 4-5 (polish + matrix) + Gate B/C.
- Wed-Fri: Stage 6 + Gate D, scheduling into Buffer for the week.

## How to adapt ("shuffle in the right means")
- Add/remove providers without touching the stages (Stage 1 is pluggable).
- Tune ranking weights (Stage 3) inside brief.py if the top of the list
  drifts from what you would pick.
- Skip the polish layer for fast, cheap cycles (Gate B weakens, keep an
  eye on credibility); enable it for high-stakes months.
- Every gate is reversible: reject a row and it stays out until you
  re-add it; approve later with one click.