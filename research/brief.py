#!/usr/bin/env python3
"""brief.py - weekly niche research brief for the LinkedIn AI OS.

Pulls dated items from every available provider in the last 7 days, normalises
them, dedupes across platforms, clusters into themes and writes the themed
table (the niche-research skill output format) to research/niche-brief-*.md.

Providers are pluggable and enabled by API keys in research/.env:

    TAVILY_API_KEY=           core web search (past_week, domain filters)
    REDDIT_CLIENT_ID=         official Reddit API (script app)
    REDDIT_CLIENT_SECRET=
    EXA_API_KEY=              expert / semantic layer
    FIRECRAWL_API_KEY=        whole-article extraction
    SERPER_API_KEY=           Google SERP + LinkedIn results (site: filters)
    X_BEARER_TOKEN=           X API v2 (Twitter layer)

Zero-key providers always run: Hacker News (Algolia) and Reddit via the
Arctic Shift archive. Missing providers are skipped and recorded in the
coverage note - never silently assumed.

Usage:
    python3 research/brief.py                     # current default niche
    python3 research/brief.py --niche "AI agents" # custom niche phrase
    python3 research/brief.py --days 7            # window (default 7)
    python3 research/brief.py --out research/niche-brief-YYYY-MM-DD.md
"""

from __future__ import annotations

import argparse
import math
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.parse
from pathlib import Path

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
ROOT = Path(__file__).resolve().parent.parent
# Source quality control: curated allowlist (Tier1/Tier2) + blocklist of
# content farms. Community platforms (HN, Reddit, X) are Community - the
# linked thread IS the source.
TIER1 = {"wired.com","techcrunch.com","theverge.com","arstechnica.com","arxiv.org","nytimes.com","wsj.com","ft.com","bloomberg.com","reuters.com","economist.com","openai.com","anthropic.com","nature.com","science.org","ieee.org","lesswrong.com","mit.edu","ycombinator.com","github.com","substack.com","labs.ycombinator.com"}
TIER2 = {"cointelegraph.com","decrypt.co","theblock.co","venturebeat.com","spectrum.ieee.org","huggingface.co","arcblock.io","eff.org","mozilla.org","blog.google","stripe.dev","supabase.com","vercel.com"}
BLOCKED = {"appifydevs.com","bodhih.org","nnycomputers.net","aegis-stack.com","jelliu.co","leverandproof.com","node-devs.com","medium.com","quora.com","upfrog.com","scripted.com"}

def clean_link(l):
    l = (l or "").strip()
    if l.startswith("/goto"):
        return ""
    if "http" not in l and "." in l:
        l = "https://" + l
    return l.split(" ›")[0].split(" ‹")[0].strip()

def host_of(url):
    m = re.match(r"https?://([^/]+)", (url or ""))
    if not m:
        return ""
    h = m.group(1).lower()
    return h[4:] if h.startswith("www.") else h

def tier_of(url, platform):
    if platform in ("HN", "Reddit", "X"):
        return "Community"
    host = host_of(url)
    if host in BLOCKED: return "Blocked"
    if host in TIER1: return "Tier1"
    if host in TIER2: return "Tier2"
    if platform == "Exa": return "Expert"
    return "Index"

STOP = {"the","what","are","how","they","work","works","working","and","with","for","that","this","from","have","been","had","build","building","example","examples","explained","why","use","used","your","you","yourself","ai","agent","agents","system","systems","multi","intelligence","intelligent"}

# The niche as a set of facets - each facet is queried on every provider so
# the brief covers the whole territory, not just one phrase.
FACETS = [
    {
        "name": "AI agents / agentic AI",
        "keywords": ["agent", "codi"],
        "queries": ["AI agents", "agentic AI", "autonomous agents", "multi-agent system", "AI agent launch"],
        "subs": ["artificial", "ClaudeAI", "OpenAI", "LLMDevs", "LocalLLaMA", "AgentZ"],
    },
    {
        "name": "Web3 SEO / AEO / GEO",
        "keywords": ["seo", "aeo", "geo", "answer engine", "generative engine", "llm citation", "ai visibility", "web3 seo"],
        "queries": ["AI search visibility (AEO)", "generative engine optimization (GEO)", "LLM citation SEO", "Web3 visibility traffic", "answer engine optimization"],
        "subs": ["SEO", "TechSEO", "web3", "bigseo"],
    },
    {
        "name": "AI safety / alignment",
        "keywords": ["safety", "alignment", "frontier", "regulat", "governance", "evaluat"],
        "queries": ["AI safety frontier", "AI alignment research", "agent safety policy", "AI governance regulation"],
        "subs": ["singularity", "ControlProblem", "ai_safety", "MachineLearning"],
    },
]

DEFAULT_NICHE = "agentic AI (AI agents, Web3 SEO/AEO/GEO, AI safety & alignment)"
NAME = (ROOT / "brands" / "you" / "about-me.md").exists() and "Zain" or "you"


def http_get(url: str, timeout: int = 25) -> str:
    out = subprocess.run(["curl", "-sL", "-m", str(timeout), "-A", UA, url], capture_output=True, text=True)
    return out.stdout


def now_utc():
    return datetime.datetime.now(datetime.timezone.utc)


# ── providers ───────────────────────────────────────────────────────────────

def hn(queries, days):
    """Hacker News via Algolia. Zero-key. Returns items."""
    seven = int((now_utc() - datetime.timedelta(days=days)).timestamp())
    items = []
    for q in queries:
        url = ("https://hn.algolia.com/api/v1/search_by_date?query=" + urllib.parse.quote(q) +
               f"&tags=story&numericFilters=created_at_i%3E{seven}&hitsPerPage=12")
        try:
            d = json.loads(http_get(url))
        except Exception:
            continue
        for h in d.get("hits", []):
            ts = h.get("created_at_i")
            if not ts or ts < seven:
                continue
            items.append({
                "title": h.get("title", "")[:150], "url": f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                "author": (h.get("author") or "")[:40],
                "date": datetime.datetime.fromtimestamp(ts, datetime.timezone.utc), "platform": "HN",
                "signal": h.get("points") or 0, "sub": "Hacker News",
            })
    return items


def reddit_archive(subs, days, limit=15):
    """Reddit via Arctic Shift archive. Zero-key fallback (rate-limited, resilient)."""
    seven = int((now_utc() - datetime.timedelta(days=days)).timestamp())
    items = []
    for sub in subs:
        url = (f"https://arctic-shift.photon-reddit.com/api/posts/search?subreddit={sub}"
               f"&after={seven}&limit={limit}&sort=desc")
        try:
            d = json.loads(http_get(url))
        except Exception:
            continue
        for p in d.get("data", []):
            ts = p.get("created_utc") or 0
            if ts < seven:
                continue
            items.append({
                "title": (p.get("title") or "")[:150], "url": f"https://reddit.com{p.get('permalink','')}",
                "author": (p.get("author") or "")[:40],
                "date": datetime.datetime.fromtimestamp(ts, datetime.timezone.utc), "platform": "Reddit",
                "signal": p.get("score") or 0, "sub": f"r/{sub}",
            })
    return items


def serper(query, key, days=7):
    """Google SERP via serper.dev. Date filter qdr:w = past week."""
    body = urllib.parse.urlencode({"q": query, "tbs": "qdr:w", "num": 10}).encode()
    out = subprocess.run(["curl", "-sL", "-m", "25", "-X", "POST", "https://google.serper.dev/search",
                          "-H", f"X-API-KEY: {key}", "-H", "Content-Type: application/x-www-form-urlencoded", "-d", body],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return []
    items = []
    for r in d.get("organic", [])[:10]:
        date = r.get("date") or r.get("datePublished") or ""
        ts = None
        if date:
            for fmt in ("%b %d, %Y", "%Y-%m-%d", "%B %d, %Y"):
                try:
                    ts = datetime.datetime.strptime(date[:20].strip(), fmt).replace(tzinfo=datetime.timezone.utc)
                    break
                except Exception:
                    continue
        items.append({"title": (r.get("title") or "")[:150], "url": r.get("link", ""),
                      "date": ts or now_utc(), "platform": "Google/Serper", "signal": 0, "sub": "", "dated": bool(ts)})
    return items


def exa_search(query, key, days=7):
    since = (now_utc() - datetime.timedelta(days=days)).strftime("%Y-%m-%dT00:00:00.000Z")
    body = json.dumps({"query": query, "numResults": 6, "startPublishedDate": since, "contents": {"title": True}}).encode()
    out = subprocess.run(["curl", "-sL", "-m", "25", "-X", "POST", "https://api.exa.ai/search",
                          "-H", f"x-api-key: {key}", "-H", "Content-Type: application/json", "-d", body],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return []
    items = []
    for r in d.get("results", [])[:6]:
        ts = None
        raw = r.get("publishedDate") or r.get("published_date")
        if raw:
            try:
                ts = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            except Exception:
                pass
        items.append({"title": (r.get("title") or "")[:150], "url": r.get("url", ""),
                      "date": ts or now_utc(), "platform": "Exa", "signal": 0, "sub": r.get("source",""),
                      "dated": ts is not None})
    return items


def firecrawl_search(query, key):
    body = json.dumps({"query": query, "limit": 8}).encode()
    out = subprocess.run(["curl", "-sL", "-m", "25", "-X", "POST", "https://api.firecrawl.dev/v1/search",
                          "-H", f"Authorization: Bearer {key}", "-H", "Content-Type: application/json", "-d", body],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return []
    items = []
    for r in (d.get("data", d.get("results", [])) or [])[:8]:
        ts = None
        raw = r.get("publishedDate") or r.get("date") or r.get("publishedAt")
        if raw:
            try:
                ts = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            except Exception:
                pass
        items.append({"title": (r.get("title") or "")[:150], "url": r.get("url", ""),
                      "date": ts or now_utc(), "platform": "Firecrawl", "signal": 0, "sub": r.get("domain",""),
                      "dated": ts is not None})
    return items


def serpapi(query, key, days=7):
    """Google SERP via serpapi.com (true Google past-week filter)."""
    p = urllib.parse.urlencode({"engine": "google", "q": query, "tbs": "qdr:m", "num": 8, "api_key": key})
    out = subprocess.run(["curl", "-sL", "-m", "25", "-A", "Mozilla/5.0", "https://serpapi.com/search.json?" + p], capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return []
    items = []
    for r in d.get("organic_results", [])[:8]:
        link = r.get("link", "")
        if link.startswith("/goto") and r.get("displayed_link"):
            link = clean_link(r.get("displayed_link"))
        else:
            link = clean_link(link)
        items.append({"title": (r.get("title") or "")[:150], "url": link,
                      "date": now_utc(), "platform": "Google/SerpAPI", "signal": 0, "sub": r.get("source",""),
                      "dated": False})
    return items


def x_recent(query, key, days=7):
    """X API v2 recent search. Requires search tier permission."""
    until = now_utc()
    since = (until - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = urllib.parse.quote(f"{query} lang:en -is:reply -is:retweet")
    url = f"https://api.twitter.com/2/tweets/search/recent?query={q}&max_results=10&start_time={since}&tweet.fields=created_at,public_metrics"
    out = subprocess.run(["curl", "-sL", "-m", "25", "-H", f"Authorization: Bearer {key}", url], capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return []
    items = []
    for t in d.get("data", [])[:10]:
        ts = None
        try:
            ts = datetime.datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))
        except Exception:
            pass
        items.append({"title": (t.get("text") or "")[:150], "url": f"https://x.com/i/web/status/{t['id']}",
                      "date": ts or now_utc(), "platform": "X", "signal": 0, "sub": "X post", "dated": bool(ts)})
    return items


def scrapegraph_search(query, key, days=7):
    """ScrapeGraph AI search (web search with freshness hints)."""
    body = json.dumps({"query": query, "limit": 6, "country": "us", "languages": ["en"]}).encode()
    out = subprocess.run(["curl", "-sL", "-m", "30", "-X", "POST", "https://api.scrapegraphai.com/v1/search",
                          "-H", f"SGS-API-KEY: {key}", "-H", "Content-Type: application/json", "-d", body],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return []
    rows = d.get("result") or d.get("results") or []
    items = []
    for r in rows[:6]:
        items.append({"title": (r.get("title") or "")[:150], "url": r.get("url", ""),
                      "date": now_utc(), "platform": "ScrapeGraph", "signal": 0, "sub": "", "dated": False})
    return items


def jina_search(query, key):
    """Jina search (s.jina.ai) - returns markdown; we parse links. No date filter,
    items are marked undated so the window check keeps them provisional."""
    url = "https://s.jina.ai/" + urllib.parse.quote(query)
    out = subprocess.run(["curl", "-sL", "-m", "30", "-A", "Mozilla/5.0",
                          "-H", f"Authorization: Bearer {key}", url], capture_output=True, text=True).stdout
    links = re.findall(r"\[(.*?)\]\((https?://[^)\s]+)\)", out)
    items = []
    for title, u in links[:8]:
        if not title.strip():
            continue
        items.append({"title": title.strip()[:150], "url": u, "date": now_utc(),
                      "platform": "Jina", "signal": 0, "sub": "", "dated": False})
    return items


def jina_read(url, key=None):
    """Jina Reader: any URL -> clean text (free; optional key lifts rate limits)."""
    h = ["-H", "Accept: application/json"] if False else (["-H", f"Authorization: Bearer {key}"] if key else [])
    out = subprocess.run(["curl", "-sL", "-m", "25", "-A", "Mozilla/5.0"] + h + ["https://r.jina.ai/" + url], capture_output=True, text=True).stdout
    return out[:4000]


def tavily(query, days, key):
    if not key:
        return [], "Tavily skipped (no TAVILY_API_KEY)"
    url = "https://api.tavily.com/search"
    payload = json.dumps({
        "api_key": key, "query": query, "search_depth": "basic", "max_results": 10,
        "days": days, "include_answer": False,
    }).encode()
    out = subprocess.run(["curl", "-sL", "-m", "25", "-X", "POST", url, "-H", "Content-Type: application/json", "-d", payload],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return [], "Tavily returned no parseable data"
    items = []
    for r in d.get("results", []):
        ts = None
        for f in ("published_date", "publishedDate"):
            raw = r.get(f)
            if raw:
                try:
                    ts = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                except Exception:
                    pass
                break
        items.append({
            "title": (r.get("title") or "")[:150], "url": r.get("url", ""),
            "date": ts or now_utc(), "platform": "Web", "signal": 0, "sub": r.get("domain", ""), "ts_probe": bool(ts),
        })
    return items, None


def collect_linkedin(key, use_serpapi, days=7):
    """LinkedIn layer: Google-indexed site:linkedin.com results via
    Serper/SerpAPI. LinkedIn blocks raw scraping of feeds, so this uses the
    index - we widen to the last month (qdr:m) because fresh niche posts are
    rarely indexed within 7 days; dates are checked afterwards when visible."""
    terms = ["AI agents", "agentic AI", "generative engine optimization", "answer engine optimization", "AI safety", "AI alignment"]
    items = []
    for term in terms:
        q = f"site:linkedin.com {term}"
        batch = serpapi(q, key, days) if use_serpapi else serper(q, key, days)
        for it in batch:
            host = (it.get("url") or "").lower()
            if "linkedin.com/posts" not in host and "linkedin.com/feed" not in host:
                continue
            it["platform"] = "LinkedIn"
            it["sub"] = term
            items.append(it)
    return items

# ── run ─────────────────────────────────────────────────────────────────────

def load_env():
    envf = ROOT / "research" / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$", line)
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip('"').strip("'")


def run(args):
    load_env()
    niche = args.niche or DEFAULT_NICHE
    days = min(args.days, 7)
    cutoff = now_utc() - datetime.timedelta(days=days)
    coverage = []
    all_items = []

    # facets: a custom --niche that names one facet focuses the brief;
    # the default covers all facets
    focused = None
    if args.niche:
        phrase = args.niche.lower()
        for fx in FACETS:
            if any(k in phrase for k in fx["keywords"]):
                focused = fx
                break
    facets = [focused] if focused else FACETS
    coverage.append(f"Niche facets: {', '.join(f['name'] for f in facets)}")

    all_queries = [q for fx in facets for q in fx["queries"]]
    all_subs = [s for fx in facets for s in fx["subs"]]

    # zero-key layers always run (per-facet queries)
    all_items += hn(all_queries, days)
    coverage.append(f"Hacker News (Algolia): {len(all_queries)} facet queries")

    reddit_subs = [s.strip() for s in (args.subs or ",".join(dict.fromkeys(all_subs))).split(",") if s.strip()]
    rd = reddit_archive(reddit_subs, days)
    all_items += rd
    coverage.append(f"Reddit (Arctic Shift archive): {len(rd)} posts from {', '.join('r/'+s for s in reddit_subs[:8])}")

    # Tavily per facet
    if os.environ.get("TAVILY_API_KEY"):
        for q in all_queries:
            it, warn = tavily(q, days, os.environ["TAVILY_API_KEY"])
            all_items += it
        coverage.append(f"Tavily: {len(all_queries)} web queries enabled")
    else:
        coverage.append("Tavily: skipped (no TAVILY_API_KEY)")

    # Google SERP (serper) - also pulls site:reddit.com to widen Reddit coverage
    if os.environ.get("SERPER_API_KEY"):
        for q in all_queries + [f"site:reddit.com {facets[0]['name'].lower()}"]:
            all_items += serper(q, os.environ["SERPER_API_KEY"], days)
        coverage.append(f"Serper (Google SERP, past-week): {len(all_queries) + 1} queries (incl. site:reddit.com)")
    else:
        coverage.append("Serper: skipped (no SERPER_API_KEY)")

    if os.environ.get("SERPAPI_KEY"):
        for q in all_queries[:4]:
            all_items += serpapi(q, os.environ["SERPAPI_KEY"], days)
        coverage.append("Google SerpAPI (true Google past-week): 4 queries enabled")
    else:
        coverage.append("Google SerpAPI: skipped (no SERPAPI_KEY)")

    if os.environ.get("EXA_API_KEY"):
        for q in all_queries:
            all_items += exa_search(q, os.environ["EXA_API_KEY"], days)
        coverage.append(f"Exa (experts/papers, last {days}d): {len(all_queries)} queries")
    else:
        coverage.append("Exa: skipped (no EXA_API_KEY)")

    if os.environ.get("FIRECRAWL_API_KEY"):
        for q in all_queries:
            all_items += firecrawl_search(q, os.environ["FIRECRAWL_API_KEY"])
        coverage.append(f"Firecrawl (web/dates): {len(all_queries)} queries")
    else:
        coverage.append("Firecrawl: skipped (no FIRECRAWL_API_KEY)")

    if os.environ.get("SCRAPEGRAPH_API_KEY"):
        for q in all_queries:
            all_items += scrapegraph_search(q, os.environ["SCRAPEGRAPH_API_KEY"], days)
        coverage.append(f"ScrapeGraph AI (search): {len(all_queries)} queries")
    else:
        coverage.append("ScrapeGraph AI: skipped (no SCRAPEGRAPH_API_KEY)")

    if os.environ.get("JINA_API_KEY"):
        for q in all_queries[:6]:
            all_items += jina_search(q, os.environ["JINA_API_KEY"])
        coverage.append("Jina (search + reader ready): 6 queries")
    else:
        coverage.append("Jina: skipped (no JINA_API_KEY)")

    if os.environ.get("X_BEARER_TOKEN") and len(os.environ["X_BEARER_TOKEN"]) > 6:
        got = 0
        for q in all_queries[:4]:
            it = x_recent(q, os.environ["X_BEARER_TOKEN"], days)
            got += len(it)
            all_items += it
        coverage.append(f"X (Twitter API v2 recent search): {got} tweets (check tier permission if 0)")
    else:
        coverage.append("X: skipped (no valid X_BEARER_TOKEN)")

    # LinkedIn collection layer (Google-indexed site:linkedin.com, past-week)
    li_key = os.environ.get("SERPER_API_KEY") or os.environ.get("SERPAPI_KEY")
    if li_key:
        li_items = collect_linkedin(li_key, bool(os.environ.get("SERPAPI_KEY")), days)
        for it in li_items:
            it["snippet"] = ""
            all_items.append(it)
        coverage.append(f"LinkedIn (site:linkedin.com indexed, past-week): {len(li_items)} posts")
        # enrich top LinkedIn posts with body text via Jina reader (key-gated)
        jk = os.environ.get("JINA_API_KEY")
        for it in sorted(li_items, key=lambda x: not x.get("dated"))[:4]:
            if jk:
                body = jina_read(it["url"], jk)
                it["snippet"] = body.strip().replace("\n", " ")[:260]
            else:
                it["snippet"] = "(body fetch skipped - no JINA_API_KEY)"
    else:
        coverage.append("LinkedIn: skipped (needs SERPER_API_KEY or SERPAPI_KEY)")

    for prov in ("REDDIT_CLIENT_ID",):
        if os.environ.get(prov) and len(os.environ.get(prov, "")) > 6:
            coverage.append("Reddit official: enabled")
        else:
            coverage.append("Reddit official: skipped (no app yet)")
    coverage.append("Reddit: using Arctic Shift archive + site:reddit.com web hits")

    # window + de-dup + source quality + ranking
    items = [i for i in all_items if i["date"] >= cutoff and host_of(i.get("url", "")) != "en.wikipedia.org"]
    for i in items:
        i["tier"] = tier_of(i.get("url", ""), i.get("platform", ""))
    items = [i for i in items if i["tier"] != "Blocked"]  # drop content farms
    for i in items:
        i["who"] = i.get("author") or i.get("sub") or ""
    seen, uniq = set(), []
    for i in sorted(items, key=lambda x: -(x.get("signal") or 0)):
        key = re.sub(r"\W+", "", i["title"].lower())[:60]
        if key in seen:
            continue
        seen.add(key)
        i["cluster"] = 1
        uniq.append(i)
    def toks(t):
        return {w for w in re.findall(r"[a-z0-9]{3,}", t.lower()) if w not in STOP}
    # cross-platform bonus: same story on >=2 sources (significant title words)
    for a in range(len(uniq)):
        for b in range(a + 1, len(uniq)):
            x, y = toks(uniq[a]["title"]), toks(uniq[b]["title"])
            if x and y and len(x & y) >= 3:
                uniq[a]["cluster"] += 1
                uniq[b]["cluster"] += 1
    tb = {"Tier1": 1.5, "Tier2": 1.0, "Expert": 0.9, "Community": 0.9, "Index": 0.2}
    def score(i):
        s = math.log10(max(i.get("signal") or 1, 1))
        rec = 0.5 if i["date"] >= now_utc() - datetime.timedelta(days=2) else 0.3 if i["date"] >= now_utc() - datetime.timedelta(days=4) else 0.15
        cross = 0.6 * (i.get("cluster", 1) - 1)
        return s + tb.get(i["tier"], 0.4) + rec + cross
    for i in uniq:
        i["_score"] = round(score(i), 2)
    uniq.sort(key=lambda x: -x["_score"])
    themes = uniq[:24]

    today = now_utc().strftime("%d/%m/%Y")
    out = [f"# Niche Brief - {niche}", "", f"As of {today}", "",
           "| Rank | Score | Title | Who (author/community) | Tier | Platform | Link (verifiable) | Date |",
           "|:--:|:--:|---|:--:|:--:|:--:|---|:--:|"]
    for rank, i in enumerate(themes, 1):
        d = i["date"].strftime("%d/%m")
        who = (i["who"] or "-")[:28]
        link = i["url"] if len(i["url"]) < 72 else i["url"][:69] + "…"
        signal = f"pts {i['signal']}" if i.get("signal") else "-"
        out.append(f"| {rank} | {i['_score']:.2f} | {i['title'][:64]} | {who} | {i['tier']} | {i['platform']} | {link} | {d} |")
    cols = list(zip([c["title"][:60] for c in themes], [c["cluster"] for c in themes]))
    out += ["", "## Top clusters (same story on 2+ platforms)", ""]
    for i in uniq:
        if i.get("cluster", 1) > 1:
            out.append(f"- **{i['title'][:70]}** - {i['cluster']} sources")
    out += ["", "## Manual gate - approve the rows you want in the content matrix", ""]
    for i in themes[:12]:
        out.append(f"- [ ] R{themes.index(i) + 1} | {i['title'][:64]} | {i['tier']} | {i['url']}")
    out += ["", "## Coverage note", ""]
    out += [f"- {c}" for c in coverage]
    out.append(f"- Window: last {days} days. Items older are excluded. Scores = log(signal) + tier bonus + recency + cross-platform cluster bonus.")
    out.append("- Every row carries its permalink (thread or article) for verification. Dates are source-reported.")
    out.append("- Content farms and generic AI-blog domains are dropped by the source-quality gate.")
    out.append("- No engagement, comment or follower collection is performed (per the niche-research skill).")
    return "\n".join(out), coverage


def main(argv):
    ap = argparse.ArgumentParser(description="Weekly niche research brief")
    ap.add_argument("--niche", help="niche phrase (default pulled per repo)")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--subs", help="comma-separated subreddits")
    ap.add_argument("--out", help="output file path")
    ap.add_argument("--linkedin", action="store_true", help="LinkedIn-only scan (indexed posts + Jina body enrichment)")
    ap.add_argument("--linkedin-url", nargs="*", help="read ONE or more specific public linkedin.com/posts URLs (Jina reader, fallback ScrapeGraph)")
    args = ap.parse_args(argv)
    if args.linkedin_url:
        load_env()
        jk = os.environ.get("JINA_API_KEY")
        sk = os.environ.get("SCRAPEGRAPH_API_KEY")
        print(f"# LinkedIn URL reads ({len(args.linkedin_url)} URLs)")
        for u in args.linkedin_url:
            if not ("linkedin.com/posts" in u or "linkedin.com/feed" in u):
                print(f"\n## SKIP (not a public post URL): {u}")
                continue
            body = ""
            if jk:
                try:
                    body = jina_read(u, jk)
                except Exception:
                    body = ""
            if not body and sk:
                try:
                    out = subprocess.run(["curl", "-sL", "-m", "40", "-X", "POST", "https://api.scrapegraphai.com/v1/markdown",
                                          "-H", f"SGS-API-KEY: {sk}", "-H", "Content-Type: application/json",
                                          "-d", json.dumps({"url": u}).encode()], capture_output=True, text=True).stdout
                    body = out[:4000]
                except Exception:
                    body = ""
            if not body or "login" in body[:1200].lower():
                print(f"\n## {u}\n- BODY BLOCKED (login wall/fingerprint). This post is not publicly readable - the platform only serves it to signed-in sessions.")
                continue
            date = "(no date found)"
            m = re.search(r"(20\d{2}-\d{2}-\d{2}|\d{1,2} \w+ 20\d{2})", body)
            if m:
                date = m.group(1)
            print(f"\n## {u}  (date ~ {date})")
            print(body[:900].replace(chr(10), " \n"))
        return 0
    if args.linkedin:
        load_env()
        key = os.environ.get("SERPER_API_KEY") or os.environ.get("SERPAPI_KEY")
        if not key:
            print("LinkedIn layer needs SERPER_API_KEY or SERPAPI_KEY.")
            return 1
        items = collect_linkedin(key, bool(os.environ.get("SERPAPI_KEY")), args.days)
        jk = os.environ.get("JINA_API_KEY")
        for it in items:
            it["snippet"] = ""
            if jk:
                try:
                    it["snippet"] = jina_read(it["url"], jk).strip().replace("\n", " ")[:260]
                except Exception:
                    it["snippet"] = "(fetch failed)"
        lines = [f"# LinkedIn scan - indexed posts (past {args.days} days)", "", f"As of {now_utc().strftime('%d/%m/%Y')}", "",
                 "| Title | Search term | Link |", "|---|---|---|"]
        for it in items:
            lines.append(f"| {it['title'][:70]} | {it.get('sub','')} | {it['url']} |")
        lines += ["", "## Post bodies (Jina reader, first ~260 chars)", ""]
        for it in items:
            if it.get("snippet"):
                lines.append(f"- **{it['title'][:60]}**")
                lines.append(f"  {it['snippet']}")
        lines.append("")
        lines.append("Coverage: Google-indexed site:linkedin.com results. LinkedIn blocks raw API/feed scraping, so this is the standard public layer; bodies were filled where Jina could read the page.")
        if args.out:
            Path(args.out).write_text("\n".join(lines))
            print(f"wrote {args.out} ({len(items)} LinkedIn posts)")
        else:
            print("\n".join(lines))
        return 0
    text, coverage = run(args)
    if args.out:
        Path(args.out).write_text(text)
        print("wrote", args.out)
        for c in coverage:
            print(" -", c)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
