#!/usr/bin/env bash
# One-by-one API key setup for the niche research engine.
# Prompts for each key; Enter alone skips that provider. Writes research/.env
# (chmod 600). Loaded automatically by brief.py.
set -euo pipefail
cd "$(dirname "$0")"

ask() { # var_name, label, optional hint
  local key="$1" label="$2" hint="${3:-}"
  local cur=""
  if [ -f .env ]; then cur="$(grep -E "^$key=" .env | head -1 | cut -d= -f2- || true)"; fi
  if [ -n "$cur" ]; then echo "   [$key already set, keep? Enter=keep, type to replace]"; fi
  echo ""; echo "---- $label ----"
  [ -n "$hint" ] && echo "   $hint"
  printf "%s: " "$key"; read -r -s val; echo
  if [ -n "$val" ]; then cur="$val"; fi
  upsert "$key" "$cur"
}

upsert() { # key value  (writes placeholder-safe: base64)
  local key="$1" val="$2"
  if [ -f .env.parsed ]; then :; fi
  # strip any existing line
  grep -v "^$key=" .env 2>/dev/null > .env.tmp || true
  printf '%s=%s\n' "$key" "$val" >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
}

: > .env.bak   # empty file to start; keep 600 at end
[ -f .env ] || touch .env
chmod 600 .env

ask TAVILY_API_KEY      "Tavily (web/news search, past-week)"            "https://app.tavily.com  -> API Keys. Free tier ~1000 searches/mo."
ask REDDIT_CLIENT_ID    "Reddit API client id"                           "https://www.reddit.com/prefs/apps  -> create a 'script' app. id = the string under the app name."
ask REDDIT_CLIENT_SECRET "Reddit API client secret"                      "Shown only when creating the script app."
ask EXA_API_KEY         "Exa (expert/semantic content)"                  "https://exa.ai  -> Dashboard -> API key. Optional."
ask FIRECRAWL_API_KEY   "Firecrawl (full-article scraping)"              "https://firecrawl.dev -> API key. Optional."
ask SERPER_API_KEY      "Serper (Google SERP + LinkedIn results)"        "https://serper.dev -> API key. Optional."
ask X_BEARER_TOKEN      "X/Twitter API bearer token"                     "https://developer.x.com -> basic tier, app settings -> bearer token. Optional."
ask SERPAPI_KEY         "Google SerpAPI (true Google SERP)"                "https://serpapi.com -> API key. Optional; some free search credits."
ask JINA_API_KEY        "Jina Reader/search key"                            "https://jina.ai -> API key. Optional; raises the free reader rate limit."
ask SCRAPEGRAPH_API_KEY "ScrapeGraph AI (search/scrape)"                   "https://scrapegraphai.com -> Dashboard -> API key. Optional; adds search + page scraping."

echo ""; echo "Done. research/.env updated (permissions 600)."
echo "Test with:  python3 research/brief.py --out research/niche-brief-test.md"
echo "The engine auto-detects which providers have keys and notes the rest."