# Niche Research - gaps and fixes (30/10/2026)

## Gaps seen in the end-to-end pass

1. **LinkedIn live layer is OFF** - `CONNECTSAFELY_API_KEY` is not in
   `research/.env` yet, so the run has no real-time LinkedIn data. This is the
   single biggest gap for a "real-time" brief. Fix: add the key via
   `research/setup-keys.sh`, then the engine can pull Zain's own recent posts
   (and later, per-topic signals) into the same ranked table.

2. **X is OFF** - `X_BEARER_TOKEN` is a placeholder. Free tier has no search.
   Real token (or the own-feed session reader) is the fix.

3. **Community-heavy top of the ranking this week.** HN/Reddit threads rank
   above Tier-1 articles. Defensible for these topics, but the manual gate is
   where Zain rebalances (approve the Wired/ArcBlock/Labs articles even if
   they sit lower in rank).

4. **Search-index noise**: Jina/SerpAPI return encyclopedia and generic
   explainer pages. Wikipedia is now excluded; the explainer-family domains
   are blocklisted; more can be added from real result samples.

5. **Serper flakiness**: intermittent HTTP 403 on heavy runs. Fix: add retry
   with backoff and fall back to SerpAPI when a Serper call fails.

6. **Not yet ingested**: newsletters/RSS (MarTech AI, Decrypt, etc.),
   competitor/creator watchlist, week-over-week momentum, and Zain's own-post
   analytics (via ConnectSafely once keyed).

## Fixes rolled into this pass (already in the engine)

- Source-quality gate: Tier1/Tier2 allowlist, content-farm blocklist, linker
  cleaning for `/goto` SERP redirects (blocklist previously never fired).
- Ranking: score = log(signal) + tier bonus + recency + cross-platform
  cluster bonus; cluster detection now ignores stop words so "AI agents 101"
  pages don't over-pool.
- Who's-who: author (HN/Reddit) or community shown on every row.
- Verifiability: every row carries its permalink (thread or article) + date.
- Manual gate: top rows are a checkbox list to approve before any matrix.

## Next upgrade (once keys land)

Local"real-time" layers active (LinkedIn posts + X search) -> rerun ->
approved rows feed `skills/content-matrix` -> matrix lands as Buffer ideas
(via the verified GraphQL buffer flow). Then the infographic pipeline.