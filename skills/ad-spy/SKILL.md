---
name: ad-spy
description: Find and download winning Meta ads in a niche from the public Ad Library (free headless-Chrome collector, impressions-sorted), score them, and pick the ones worth analysing. Part of the SIRINE creative-lab.
trigger: ["/ad-spy", "spy on competitors", "winning ads", "what ads are competitors running", "ad library search", "find winners"]
when_to_use: When the owner wants competitor/inspiration ads for a keyword, a competitor page, or the whole SIRINE niche. For turning them into DNA/styles continue with skill `lab` (stages analyze/style).
---

# ad-spy

Project `C:/Users/DELL/ad-engine/creative-lab/`. Internals and fixes: `research/05-ad-library-collector-internals.md`; tool landscape: `research/02-spy-tools-landscape.md`.

## Run (network → Bash sandbox disabled)
```
node cli.mjs spy niche [--market local|regional|inspiration] [--max 120] [--no-media]
node cli.mjs spy search --q "<keyword>" --country DZ [--exact] [--media-type video] [--all]
node cli.mjs spy page --page-id <id> [--country DZ]
node cli.mjs spy top --limit 30 [--country DZ] [--format video|image|carousel] [--min-days 30] [--tier proven|rising] [--q text]
node cli.mjs spy media --top 30          # or --ids a,b
node cli.mjs spy show --id <ad_archive_id> ; spy star --id X [--off|--hide]
```
Queries live in `config/niche-sirine.json` (local DZ Arabic/French/Darija terms, regional MENA, inspiration markets).

## How it works
- Logged-out system Chrome via `playwright-core`; reads the embedded first page, then `AdLibrarySearchPaginationQuery` pages.
- Sorted by impressions (`sort_data` honoured). Consent dialog clicked; first page polled; catalog cards parsed; `*_handle` URLs; `oe=` expiry read.
- Block signals: GraphQL error 1675004 / 13570xx → stop and back off. Pacing 20–45 s between queries.
- Winner score (`lib/scoring.mjs`): days active, impressions rank, relaunch count, page survival; renormalised when a signal is missing. In-niche relevance threshold `min_relevance` (0.35).

## Rules
- **Download media at first sight**: signed URLs expire in ~4–5 days and DZ ads vanish when paused.
- Long-running ≠ profitable, but 30+ days active with relaunches is the best public proxy.
- Results include Moroccan/Tunisian sellers (DH, "maroc"): keep the creative structure, never the market facts.
- Never copy competitor footage, marks, music or claims into SIRINE ads — they are references for DNA only (`ip_flags`).
- Paid backup only if the free collector is blocked: ScrapeCreators ($47 one-off, 25K credits, no expiry); SerpApi free tier as fallback; Foreplay optional.

Next: `node cli.mjs analyze evidence --top 12` → skill `lab` stage `analyze`.
