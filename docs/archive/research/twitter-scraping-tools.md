# Twitter/X Data Scraping Tools — Landscape Overview

## The Reference: tweet-harvest

- **Repo:** [helmisatria/tweet-harvest](https://github.com/helmisatria/tweet-harvest)
- **Language:** TypeScript/Node.js
- **Approach:** Uses browser cookies to access Twitter's internal API
- **Key feature:** CLI-based, outputs to CSV/JSON

---

## Actively Maintained Alternatives

| # | Tool | Language | Stars | API Key? | Approach | Key Features |
|---|------|----------|-------|----------|----------|-------------|
| 1 | [**twikit**](https://github.com/d60/twikit) | Python | ~4.2k | No | Twitter Internal API | Search, post tweets, DMs, trending topics, async support. Most popular option. |
| 2 | [**twscrape**](https://github.com/vladkens/twscrape) | Python | ~2.3k | No | GraphQL + Search API | Multi-account pooling, async/await, auto account rotation, email verification flow. |
| 3 | [**Scweet**](https://github.com/Altimis/Scweet) | Python | — | No | Cookies + GraphQL | Multi-account pooling, proxy support, async. Profiles, followers, tweets. |
| 4 | [**twitter-scraper**](https://github.com/the-convocation/twitter-scraper) | TypeScript | — | No | Internal API | Node.js port, search tweets, get profiles, fetch followers/following. |
| 5 | [**x-twitter-scraper**](https://github.com/Xquik-dev/x-twitter-scraper) | — | — | No | API skill | Advanced search, media download, webhooks, MCP integration, posting automation. |
| 6 | [**twitter-scraper-v2**](https://github.com/TreasureProject/twitter-scraper-v2) | TypeScript | — | No | Internal API | Works in browser and server, agent-friendly client. |

## Selenium/Browser Automation

| # | Tool | Language | Approach |
|---|------|----------|----------|
| 7 | [**selenium-twitter-scraper**](https://github.com/godkingjay/selenium-twitter-scraper) | Python | Selenium-based. Scrapes home, profiles, hashtags, advanced search. |
| 8 | [**Twitter-Scraper (usamafarooq1)**](https://github.com/usamafarooq1/Twitter-Scraper) | Python | Selenium bot. Extracts text, dates, links, images from profiles. |

## Legacy / Archived (Historical Reference)

| # | Tool | Stars | Status | Notes |
|---|------|-------|--------|-------|
| 9 | [**twint**](https://github.com/twintproject/twint) | ~16k+ | Broken/Unmaintained | Was the gold standard. No API key needed. Broken since ~2023. |
| 10 | [**twitter-scraper (bisguzar)**](https://github.com/bisguzar/twitter-scraper) | — | Archived | Reversed Twitter frontend API without auth. |
| 11 | [**snscrape**](https://github.com/JustAnotherArchiworker/snscrape) | — | Archived | Multi-platform social scraper including Twitter. Widely used in academic research. |

---

## Key Takeaways for Management

1. **No official free API** — Twitter/X severely restricted API access in 2023. All tools above bypass the official API.
2. **Top picks today:** **twikit** (most popular, most features) and **twscrape** (best for scale with multi-account rotation).
3. **Risk:** X actively patches scraping vectors every 2-4 weeks. Any tool can break at any time.
4. **Account risk:** Most tools require logging in with real Twitter accounts — aggressive use can lead to suspensions.
5. **Legal consideration:** Scraping may violate Twitter/X Terms of Service. Review with legal before production use.
