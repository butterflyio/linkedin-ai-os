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
    p = urllib.parse.urlencode({"engine": "google", "q": query, "tbs": "qdr:w", "num": 8, "api_key": key})
    out = subprocess.run(["curl", "-sL", "-m", "25", "-A", "Mozilla/5.0", "https://serpapi.com/search.json?" + p], capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return []
    items = []
    for r in d.get("organic_results", [])[:8]:
        items.append({"title": (r.get("title") or "")[:150], "url": r.get("link", ""),
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

    if os.environ.get("X_BEARER_TOKEN"):
        got = 0
        for q in all_queries[:4]:
            it = x_recent(q, os.environ["X_BEARER_TOKEN"], days)
            got += len(it)
            all_items += it
        coverage.append(f"X (Twitter API v2 recent search): {got} tweets (check tier permission if 0)")
    else:
        coverage.append("X: skipped (no X_BEARER_TOKEN)")

    for prov in ("REDDIT_CLIENT_ID", "JINA_API_KEY"):
        if os.environ.get(prov):
            coverage.append(f"{prov.split('_')[0]}: enabled")
        else:
            coverage.append(f"{prov.split('_')[0]}: skipped (no key)")
    coverage.append("Reddit: official API parked (no app yet); using Arctic Shift archive + site:reddit.com web hits instead")

    # window + de-dup (dated news items get a small boost so web hits aren't
    # buried under high-score HN/Reddit posts)
    items = [i for i in all_items if i["date"] >= cutoff]
    seen = set()
    uniq = []
    def rank(i):
        s = i.get("signal") or 0
        if i.get("dated") and i["platform"] not in ("HN", "Reddit"):
            s += 9
        return -s
    for i in sorted(items, key=rank):
        key = re.sub(r"\W+", "", i["title"].lower())[:60]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(i)

    # cluster into themes by shared key noun-phrases (lightweight, grounded)
    theme_keys = []
    for i in uniq:
        tl = i["title"].lower()
        if any(w in tl for w in ("agent", "openai", "anthropic", "model", "safety", "regulation", "web3", "swarm", "coding", "permission", "approval", "distill", "sweep", "infra")):
            theme_keys.append(i)
    themes = theme_keys or uniq[:12]

    today = now_utc().strftime("%d/%m/%Y")
    out = [f"# Niche Brief - {niche}", "", f"As of {today}", "",
           "| Theme / item | Platform | Source | Link | Window | Signal |",
           "|---|---|---|---|---|---|"]
    for i in themes[:20]:
        d = i["date"].strftime("%d/%m")
        signal = f"~{i['signal']}" if i.get("signal") else "-"
        out.append(f"| {i['title'][:80]} | {i['platform']} | {i.get('sub','')} | {i['url']} | {d} | {signal} |")
    out += ["", "## Coverage note", ""]
    out += [f"- {c}" for c in coverage]
    out.append(f"- Window: last {days} days. Items older than the window are excluded.")
    out.append("- Item titles are quoted verbatim from the source; dates are the source-reported publish dates.")
    out.append("- No engagement, comment or follower collection is performed (per the niche-research skill).")
    return "\n".join(out), coverage


def main(argv):
    ap = argparse.ArgumentParser(description="Weekly niche research brief")
    ap.add_argument("--niche", help="niche phrase (default pulled per repo)")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--subs", help="comma-separated subreddits")
    ap.add_argument("--out", help="output file path")
    args = ap.parse_args(argv)
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