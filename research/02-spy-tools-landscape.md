# 02 — Meta ad-spy & ad-intelligence landscape (November 2026)

> **creative-lab research note 02** · written 2026-11-01 · scope: Meta (Facebook + Instagram) ads only.
> **Lens:** SIRINE, an Algerian brand selling women's bags, shoes and "packs" cash-on-delivery, with copy in ar-DZ, ar and fr. Also covered: MA, TN, MENA, France, and global DTC fashion-accessory brands.
> **Goal:** find the strongest ads now running in the niche, download their media, extract their creative DNA, store them in our own library, and replicate winning *styles* (not assets) with AI.
>
> **Legend:** **[verified]** = read on the vendor's or Meta's live page on 2026-11-01. **[tested]** = our own live call on 2026-11-01. **[unverified]** = a third-party, secondary or vendor-blog claim, or a page that could not be loaded. **[estimate]** = my arithmetic on verified inputs. **[inference]** = my reasoning, not stated by any source.
> `[Sx]` keys resolve in **Sources** at the end. **Every source was accessed 2026-11-01.**
> This is not legal advice.

---

## 0. TL;DR

1. **Algerian ads exist in only one place: the live web Ad Library.** Meta shows *all active* ads there for every country [S2, verified]. Non-EU commercial ads are not archived. Only political/issue ads (kept 7 years) and EU-delivered ads (kept 1 year after their last impression) survive being stopped [S2, verified]. **A DZ ad disappears from every public surface the moment it is paused.** The official API never returns it in the first place (point 2). → DZ intelligence must come from tools that read the **live web library on a schedule** and **download media at first sight**.
2. **Exact official-API limitation:** `/ads_archive` (docs now at v26.0): *"Ads that did not reach any location in the EU will only return if they are about social issues, elections or politics."* [S1, verified]
   - An Algeria-only commercial ad, which describes SIRINE's ads and every DZ COD competitor's, is **never** returned, whatever `ad_reached_countries` or `search_terms` you send.
   - Ads that also delivered in the EU (for example French/diaspora campaigns) *are* returned, with EU extras: reach, targeting and age×country×gender reach.
   - Even then you get **no** `spend`/`impressions` (political-only), **no** `collation_count`, and **no** media files, only `ad_snapshot_url` [S1b, verified].
3. **Meta's own hosted connector *does* see DZ ads.** `ads_library_search` with `countries=["DZ"]` and term "sac" returned **1,867** active ads. The Arabic query «الدفع عند الاستلام حقيبة» returned **149** [S3, tested].
   - It returns only ids, page, link title, dates, snapshot URL and currency, at most 50 per call.
   - Its own description says "Do NOT use for bulk data extraction/scraping".
   - → Use it for manual spot checks only, as CLAUDE.md RULE 2 already says.
4. **Recommended stack (details in §6):**
   - **(1) Build** a vendor-agnostic collector on **ScrapeCreators**: $47 one-off for 25K credits that never expire, which is about a year at our volume [estimate].
   - Keep **SerpApi Free** (250 searches/mo) and **Apify `curious_coder`** ($0.75 per 1K ads on Apify Free's $5/mo credit) as zero-cost fallbacks.
   - **(2)** A free manual layer: web library, hosted connector, AdLibNote extension.
   - **(3)** At most **one** paid tool, and only if a 7-day trial finds our DZ/Arabic test set. **Foreplay Basic** ($49/mo annual) is the best data pipe, with 10K API credits/mo. **Gethookd Pro** ($32/mo annual) is the cheapest UI.
   - **Recurring cost: $0–53/mo.**
5. **Surprises found on 2026-11-01:**
   - **MagicBrief shut down on 2026-07-31.** Its team moved to Canva Grow [S56].
   - **PiPiAds is no longer TikTok-only.** It now runs a Facebook Adspy and a Meta Ad Library [S68].
   - **Motion now starts at $999/mo.** It is creative analytics on your own accounts, not a spy tool [S57].
   - **SerpApi now has a `meta_ad_library` engine** [S30].
   - **Adheart sells "uniquified media" downloads** [S64]. A review describes the uniquifier as modifying creatives "to avoid duplicate detection" [S65, unverified]. That is circumvention-adjacent, so avoid it.
6. **WinnerScore v1** (§4.3) uses only signals that exist for DZ ads: longevity, impression-sorted rank, `collation_count`, relaunches, within-page survival, and EU reach or engagement when present. It applies penalties for catalog/DPA ads, DCO ads and set-and-forget pages. **Back-test it on SIRINE's own ads**, where we know the truth, before trusting it on competitors.

---

## 1. Where Algerian ads actually live (the constraint behind every choice)

| Surface | DZ commercial ads? | Stopped DZ ads? | Winner-relevant data | Source |
|---|---|---|---|---|
| **Web Ad Library** (facebook.com/ads/library) | **Yes.** "all active ads running across products from Meta" | **No.** Only political/issue (7 yrs) and EU-delivered (1 yr after last impression) are kept | Start date; "N ads use this creative and text" (= `collation_count`); platforms; format | [S2] verified |
| **Official Ad Library API** `/ads_archive` | **No.** Only if the ad also reached the EU, or is political/issue | EU-delivered only | Creative text, dates, `ad_snapshot_url`; EU-only reach/targeting | [S1][S1b] verified |
| **Meta hosted connector** `ads_library_search` (claude.ai META) | **Yes.** "sac"/DZ/ACTIVE → `estimated_total_count` 1,867; «الدفع عند الاستلام حقيبة»/DZ → 149 | Not tested | id, page_id/name, link title, creation/start time, snapshot URL, currency. Max 50/call. No sort, no collation, no media | [S3] tested; memory note [S88] |
| **Scraping APIs** that replay the web library (ScrapeCreators, SerpApi, SearchAPI, Apify) | Yes by design, because they expose the library's `country` filter. **Confirm on the first run** | Only what *we* archive | + `collation_count`, `display_format`, HD/SD media URLs, EU transparency when it exists | Fields: [S20–S31] verified. DZ: [inference] |
| **Commercial spy tools** | No vendor documents DZ coverage | Only if they archived it | Varies (§2) | §2 |

**Consequences for our design:**

1. **Archive as you go.**
   - Snapshot the watchlist at least every 3 days. A "winner" by definition lives ≥ 21 days, so a 3-day cadence cannot miss one [inference].
   - Download media when an ad is first seen. SerpApi warns that the CDN media links "expire after a few days" [S30, verified].
2. **No reach, demographics or spend exist for DZ-only ads.** Spy-tool "estimated spend" is built as reach × CPM × frequency from EU/UK/BR transparency data [S82, unverified]. For a DZ-only ad that number is invented. Ignore it.
3. **DZ winner signals must therefore be structural:** run length, duplication, relaunches, within-page survival, impression-sorted rank. EU reach is usable only for France/diaspora campaigns.

---

## 2. Commercial spy tools

### 2.1 Comparison table

"n/s" = not stated on the vendor page. Prices are per month and in USD unless a currency is shown. "(annual)" means the per-month price on annual billing.

| Tool | What it is | Meta data / source | DZ-MENA · Arabic/French | Winner signals exposed | Media download | API / export (docs) | Price, Nov 2026 | Verdict for SIRINE |
|---|---|---|---|---|---|---|---|---|
| **Foreplay** | Swipe file + Discovery DB + **Spyder** (brand tracking) + Lens (own accounts) + Briefs | Discovery: "over 200M ads" across FB/IG/TikTok/YouTube/LinkedIn, but the same page's footer shows "Ad Count 54,683,980" [S45, verified]. Spyder tracks "every ad they launch on all Meta advertising platforms 24/7" from a pasted Ad Library URL; history "from as early as August 2023" for 20K+ brands [S43, verified] | Discovery API has **no country filter**; `languages` examples are en/fr/ro, Arabic not listed [S44, unverified mirror]. Spyder should capture DZ pages because it reads the brand's Ad Library URL [inference] | Live status, `running_duration_min_days` filter, `longest_running` sort, creative velocity, transcription [S41][S44] | Help center lists bulk download [unverified] | **Yes.** Discovery / Spyder / Swipe File APIs; 1 ad = 1 credit; **10K credits/mo on every current plan** (20K/mo annual); packs $99/100K, $189/250K, $349/500K; MCP; docs `public.api.foreplay.co/docs` [S41][S42, verified] | Basic $59 ($49 annual) · Workflow $175 ($149) · Agency $459 ($389). **Spyder not on Basic** (Workflow = 15 brands). 7-day trial, card required [S40, verified] | **Best data pipe among spy tools.** Optional #1 for global DTC inspiration. Spyder is too expensive for us |
| **Atria** | AI creative research (Radar, clone ads) | Source not disclosed; "$10B+ in real ad spend" claim [S47, verified] | n/s | Radar AI scoring [unverified] | n/s | REST API (Core: 1,200 calls/mo; Plus+: unlimited) + MCP [S46, verified] | Core $219 ($129 annual) · Plus $549 ($343) · Business $1,549 ($959) [S46, verified] | Too expensive for our size. Skip |
| **Minea** | French dropshipping spy | "80M+ active ads"; FB ads, Pinterest, Snapchat; TikTok "coming soon" [S48, verified] | "from all over the world", no country list [S48, verified] | "filter by spend, activity" [S48] | n/s | Not listed | Starter $49 · Premium $99 · Business $199 (quarterly $39/$79/$158) [S48, verified] | Product-hunting focus, no API. Skip |
| **Dropispy** | French FB-only spy for dropshippers | FB ads only [S49, unverified] | n/s | n/s | n/s | n/s | Premium €29.90 · Business €249.90 [S49, unverified]. dropispy.com refused connections on 2026-11-01 | Skip |
| **BigSpy** | Multi-network crawler | FB on Free; FB+IG on Starter; 8+ networks on Growth [S50, verified] | FB page names only "US, UK, or Brazil" [S51, verified]; "71 countries, 23 languages" [S83, unverified] | Engagement (likes/shares), "Duration", "Last Seen" [S51, verified] | Starter 50/day, Growth 300/day [S50, verified] | Not mentioned | Free (10 searches/day) · Starter $69 ($49 annual) · Growth $159 ($119) · Scale $399 ($299) · Ultimate $499 ($399) [S50, verified] | No API, download caps. Skip |
| **AdSpy** | Legacy FB/IG ad DB (feed-crawled, engagement data) | "213.7 million+ ads, 88 different languages, across 225 countries" [S52, verified] | Plausible given "225 countries", but not stated [unverified] | Search by ad text, URL, page, affiliate network, likes, comments [S52, verified] | Not mentioned | Not mentioned | $149 ("introductory offer") [S52, verified] | Only engagement-based DB that might help MENA, but no API. Manual trial only |
| **PowerAdSpy** | Multi-network spy | Basic = FB+IG; up to 11 networks on Palladium [S53, verified] | Country filter in core filters [S53, verified] | Popularity/impressions; targeting filters (Standard+); "estimated ad budget" (Platinum+) [S53, verified] | Not mentioned | Not mentioned | Basic $69 · Standard $99 · Platinum $279 · Palladium $399; annual from $27 [S53, verified] | Skip |
| **Gethookd (Hookd)** | Meta ad DB + Brand Spy + swipe file + AI clone | "22M+" active ads, updated daily; "TikTok is not in there today" [S54, verified] | n/s | Days active, number of live ads per brand, top hook/format/angle. **"We do not estimate a brand's revenue or invent a spend figure"** [S54, verified] | n/s | REST `app.gethookd.ai/api/v1` (explore, ads/{id}, brands, brandspy, top-ads). Credits scale with results returned; lookups free; per-token sliding-window rate limit (HTTP 429). **API + MCP on every annual plan** and on Team/Agency monthly [S55, verified]. **Plan credits are small: Starter 50/mo, Pro 150, Team 400, Agency 800** [S54]. Assuming API searches draw on the same pool [inference], this is a UI/MCP tool, not a bulk pipe | Starter $29 ($19 annual) · Pro $49 ($32) · Team $79 ($52) · Agency $129 ($83). 7-day $0 trial [S54, verified] | Cheapest honest UI. Optional alternative to Foreplay |
| **MagicBrief** | (was) creative analytics + inspiration | "MagicBrief will shut down on July 31, 2026"; team built Canva Grow [S56, verified] | — | — | — | — | — | **Dead.** Do not buy |
| **Motion** | **Creative analytics on *your own* ad accounts. Not a spy tool** | Your accounts; "Inspo, benchmarks" [S57, verified] | — | Your real performance data | — | "full data & MCP access" [S57] | Starter **$999** (up to $50k/mo spend); Pro/Growth "Let's chat" [S57, verified] | Wrong category, wrong budget. Skip |
| **Panoramata** | Competitor intelligence: ads + emails + SMS + flows + landing pages + SEO | Meta, TikTok, Pinterest, Google Display, YouTube, LinkedIn ads [S58, verified] | "We cover all industries & countries" [S58, verified] | Report dashboards; "Breakdown By Country/Region" [S58] | Bulk creative export **Advanced only** [S58] | MCP on all plans; "Enterprise API"; platform "in beta" [S58, verified] | Startup $99 (€99) · Professional $179 (€149) · Advanced $399 (€379) [S58, verified] | Email/SMS-centric. Overkill. Skip |
| **Swipekit** | Swipe file + Brand Tracker + Multiplayer | Saves from the Meta Ad Library and TikTok [S59] | n/s | Whatever you save | n/s | **API (your saved ads only) + MCP on all plans** [S59][S5, verified] | Basic $26 · Plus $46 · Agency $66 (page also shows annual savings); Brand Tracker 5/10/15; **14-day trial, no card** [S59, verified] | Cheapest team swipe file. Optional |
| **AdLibrary.com** | Multi-network ad search ("over 1 billion ads") | Meta, Google, YouTube, TikTok, X and more [S61, verified] | Country + language filters [S61, verified] | Pro adds "full ad insights (spend, reach, audience)", EU-derived [S61] | n/s | API (100 req/min) + MCP **Business only** [S61, verified] | Starter €29 (€19 annual) · Pro €179 (€159) · Business €329 (€299) · Enterprise from €2,000 [S61, verified] | API too expensive. Skip |
| **Winning Hunter** | Dropshipping spy | Meta, TikTok, Pinterest ads from Standard [S62, verified] | n/s | Ad score = "the reach of the ad, the ad spend & the days running" [S63]; spend and scaling filters [S62, verified] | TikTok watermark removal + download [S63] | MCP & API: 100 calls (Basic) / 10K+ (Standard+) [S62, verified] | Basic $30 · Standard $49 · Enterprise $150 (yearly billing shown) [S62, verified] | Signals are EU-reach-derived, so weak for DZ. Skip |
| **Adheart** | Affiliate-oriented FB/IG/Threads spy | Claims capture of new Meta ads "almost instantly" [S64, verified] | GEO and ad-language filters exist [S64]; "239 countries" per vendor onboarding [unverified] | Days-running filter/sort, last seen active [S64, verified] | "Download original media" **and "Download uniquified media"** [S64, verified] | Not mentioned | Start ~$53–69, Pro ~$89 [S65, unverified]; Team from $130 [S64] | **Avoid.** The uniquifier "modifies creatives to avoid duplicate detection" [S65, unverified], which is a ban risk. Affiliate/nutra focus |
| **Vidtao** | **YouTube ads only** | YouTube [S67, unverified] | — | — | — | — | Premium ≈ $87 [S67, unverified] | Irrelevant to Meta |
| **PiPiAds** | TikTok-first, **now also "Facebook Adspy" + Meta Ad Library + Ad Tracker** | "Explore global Meta ads" [S68, verified] | n/s | n/s | n/s | MCP page; API link [S68] | Basic $49 (30K credits) · Advanced $99 (100K) · Enterprise $900 (1M) [S68, verified] | No longer TikTok-only, but its Meta side is unproven. Only if we go to TikTok |
| **Kalodata** | **TikTok Shop analytics only**, no Meta [S69, unverified] | — | — | — | — | — | ~$59–99 [S69, unverified]. kalodata.com returned 403 | Irrelevant to Meta |
| **TrendTrack** *(2025–26 newcomer, FR)* | Meta + TikTok + Google ads + **Shopify store intelligence** | EU/UK spend & reach enrichment on Pro/Business [S70, verified] | Countries n/s | Page spend (24h), ad growth %, days running [S81] | n/s | API/MCP; rate limits Pro 120 req/min, Business 250 req/min [S70, verified] | Starter $34 · Pro $62 · Business $111 (annual) [S70, verified] | Best for **France/EU DTC + Shopify** competitors. Not needed for DZ |
| **Brandsearch / Spectre AI** *(newcomer)* | Store + ad intelligence, free Chrome extension | n/s | n/s | Spend modelling [S82] | n/s | n/s | ~$47 (annual) [unverified] | Skip |

### 2.2 Notes that change decisions

- **No spy tool documents Algeria coverage.** Their databases come from Ad Library crawling plus user saves. For a long-tail market like DZ, the crawl depth is unknown, and a tool can only show stopped DZ ads it captured while they were live [inference from S2]. **Test before paying** (§6.3).
- **Two kinds of "tracking":**
  - *Database* tools (Foreplay Discovery, Gethookd explore, AdSpy) show whatever they crawled.
  - *Brand trackers* (Foreplay Spyder, Gethookd Brand Spy, Swipekit Brand Tracker) re-read **pages you name**, which works for any country, DZ included [inference from S43].
  - Our own collector is a brand tracker at about 1/30th of Spyder's price (§6).
- **API credit reality:**
  - Foreplay's 10K credits/mo equals 10K ads into our library.
  - Gethookd's Pro equals 150 result-credits/mo [S54][S55], useful for MCP lookups, not for syncing a library.
- **Spend estimates:** Winning Hunter, AdLibrary.com Pro, TrendTrack and PowerAdSpy all model spend from EU transparency data [S61][S62][S63][S70][S82]. For DZ-only ads that data does not exist.

---

## 3. Programmatic data sources

### 3.1 Official Meta Ad Library API (`/ads_archive`): what it really returns

**Coverage, quoted [S1, verified, docs page shows v26.0]:**
- *"Ads that did not reach any location in the EU will only return if they are about social issues, elections or politics."*
- `ad_active_status`: *"Defaults to ACTIVE for all ads that are eligible for delivery."* → "active" means **eligible**, not "spending".
- Error 613: *"Calls to this api have exceeded the rate limit."*
- Meta Transparency Center: the API "allows for a deeper analysis of ads about social issues, elections or politics", and it also covers ads delivered in the EU and associated territories [S2, verified].

**Parameters [S1, verified]:**

| Parameter | Behaviour |
|---|---|
| `search_terms` | ≤ 100 chars; spaces act as AND |
| `search_type` | `KEYWORD_UNORDERED` / `KEYWORD_EXACT_PHRASE` |
| `search_page_ids` | ≤ 10 Page IDs |
| `ad_reached_countries` | ISO codes or `ALL`; required [S5] |
| `ad_type` | Default `ALL`; `CREDIT_ADS` is replaced by `FINANCIAL_PRODUCTS_AND_SERVICES_ADS` |
| `ad_active_status` | `ACTIVE` / `INACTIVE` / `ALL` |
| `ad_delivery_date_min` / `ad_delivery_date_max` | Delivery date range |
| `languages` | ISO 639-1 codes, so `ar` and `fr` |
| `media_type` | `ALL` / `IMAGE` / `MEME` / `VIDEO` / `NONE` |
| `publisher_platforms` | Includes `THREADS`, `WHATSAPP` |
| `unmask_removed_content` | Reveals content removed for policy violations |
| `bylines`, `delivery_by_region`, `estimated_audience_size_*` | Political-only |

**Field availability (ArchivedAd, v26.0) [S1b, verified]:**

| Field(s) | All ads | EU / UK ads | Political/issue only |
|---|---|---|---|
| `id`, `page_id`, `page_name`, `ad_creation_time`, `ad_delivery_start_time`, `ad_delivery_stop_time`, `ad_creative_bodies`, `ad_creative_link_titles` / `_descriptions` / `_captions`, `ad_snapshot_url`, `languages`, `publisher_platforms` | ✓ | ✓ | ✓ |
| `eu_total_reach`, `beneficiary_payers` | | ✓ (EU) | |
| `target_ages`, `target_gender`, `target_locations`, `age_country_gender_reach_breakdown` | | ✓ (UK & EU) | ✓ (Brazil) |
| `spend`, `impressions`, `currency`, `demographic_distribution`, `delivery_by_region`, `estimated_audience_size`, `bylines` | | | ✓ |
| `collation_count`, display format, image/video file URLs | **not exposed at all** (only `ad_snapshot_url`; downloads from it are limited by Meta's Terms) [S1b] | | |

**Access:**
1. Confirm your identity and location. Meta says this "follows the process required to run ads about social issues, elections or politics" and "may take a few days".
2. Create a Meta for Developers account and accept the platform terms.
3. Create an app and use the "Access the API" flow.
4. Use a user access token [S5, verified secondary].

`facebook.com/ads/library/api` returned HTTP 403 to our fetcher, so the steps above come from S5. One developer reports ID documents being rejected outside the US [unverified, search snippet]. Expect friction for DZ-based staff.

**Rate limits:** no number is published. Error 613 is a "custom" limit [S1][S4, verified]. Calls made with a user token count against that user's own hourly budget [S4].

**What it is still good for:** the **France / EU slice**, meaning diaspora campaigns by Maghreb brands and EU campaigns by global DTC brands. There it gives the best free winner signals that exist: `eu_total_reach`, targeting, and age×country×gender reach.
- It is redundant if our scraping API already pulls EU transparency data: ScrapeCreators' ad endpoint `aaa_info` [S27] or SerpApi's `eu_transparency` [S30].
- **Maintenance note:** Meta's docs now show **v26.0**, while `config/meta.json` pins v25.0. That is fine for this read-only endpoint, but flag it for the `version-upgrade-maintenance` workflow.

### 3.2 Paid scraping APIs (they replay the public web library, so DZ is reachable)

| Source | Inputs | `collation_count` | Start / end / active | Media URLs | EU transparency | Extras | Price → per 1K ads | Caveats |
|---|---|---|---|---|---|---|---|---|
| **ScrapeCreators** [S24–S27, verified] | `search/ads` (query, country, status, media_type, language, `sort_by` = `total_impressions` by default, dates); `company/ads` (pageId/companyName); `ad` (id/url) | ✓ + `collation_id` | ✓ `start_date`, `end_date`, `is_active` | ✓ `video_hd_url`, `video_sd_url`, `video_preview_image_url`; images; cards | ✓ on `ad` endpoint (`aaa_info`: `eu_total_reach`, age/gender/location targeting, age×country×gender breakdown, payer/beneficiary) | AI transcript ≤ 2 min included on `ad`; `cache_max_age` returns cached data for 0 credits | 1 credit/request. Free 100 (+ up to 7,000 claimable). **$47 = 25K credits** ($1.88/1K req). $497 = 500K ($0.99/1K). **Credits never expire.** ≈ **$0.03–0.06 per 1K ads** [estimate, assuming ~30 ads/request] | Page size undocumented. Small vendor with no independent reliability reviews [S24 search] |
| **SerpApi `meta_ad_library`** [S30][S31, verified] | `q`, `page_id`, `country`, `content_languages`, `media_type`, `publisher_platforms`, dates, `sort_by` (`impressions_high_to_low` by default / `most_recent`) | ✓ + `collation_id` | ✓ `start_date`; `end_date` for inactive ads | ✓ `videos` (`video_hd`, `video_sd`, `video_preview_image`); card images | ✓ `eu_transparency` | `display_format` (image/video/carousel/**dco**/**dpa**), `page_likes`, `page_categories`, `branded_content` | **Free: 250 searches/mo.** Starter $25/1K searches · Developer $75/5K · Production $150/15K. ≈ **$0.50–0.85 per 1K ads** [estimate at the documented "up to 30" ads/page] | CDN links "expire after a few days". U.S. Legal Shield only from Production [S32, unverified]. Google sued SerpApi in Dec 2025 over Google scraping [S32, unverified] |
| **SearchAPI.io `meta_ad_library`** (+ `meta_ad_library_ad_details`) [S28][S29, verified] | `q`, `page_id`, `country`, location, `content_languages`, `ad_type`, `active_status`, `media_type`, platforms, dates, `sort_by` | ✓ | ✓ + `total_active_time` | Snapshot images/cards (`videos` arrays empty in the examples) | ✓ via the ad-details engine (EU & UK) | `impressions_index` (shows −1) | Developer $40/10K searches · Production $100/35K. ≈ **$0.11–0.16 per 1K ads** [estimate at ~25/page, page size per S35 = competitor claim] | Video URL fields not shown in the docs |
| **Apify `curious_coder/facebook-ads-library-scraper`** [S21, verified] | Ad Library search URLs or Page URLs; `countryCode`, `activeStatus`, `sortBy` (impressions by default / date), period, `scrapeAdDetails` | ✓ + Collation ID | ✓ | "Snapshot of Ads creatives" | ✓ with `scrapeAdDetails` | Spend/reach fields (political only) | **$0.75 per 1K ads** pay-per-event, "not charged for the Apify platform usage". Apify Free gives **$5/mo** credit ≈ 6.6K ads free [S36, verified; estimate] | 4.80★, 49,365 users; README updated 2026-01-30; `limitPerSource` can overshoot by up to 30 |
| **Apify official `apify/facebook-ads-scraper`** [S20, verified] | URLs; `resultsLimit`, `activeStatus`, `sorting`, period, `isDetailsPerAd`, `includeAboutPage`, `enrichWithEcommerceData` | ✓ `collationCount` | ✓ (+ `totalActiveTime`) | ✓ `videoHdUrl`, `videoSdUrl`, `originalImageUrl` | ✓ with `isDetailsPerAd` | E-commerce enrichment add-on | **$5.80** (Free) / $5.00 (Starter) / $4.20 (Scale) / $3.40 (Business) per 1K ads | 3.99★, 49,029 users. 5–8× the community actor's price |
| Apify `harshmaur/…` [S22, verified] | Search/page URLs | ✓ | ✓ + `ad_duration_days`, `is_long_running` | `image_urls[]`, `video_urls[]` | ✓ with details | — | $0.40–0.50 per 1K | 77 users. Bus-factor risk |
| Apify `bovi/meta-ads-library-scraper` [S23, verified] | `searchTerms`, `pageIds`, `countries` | ✓ | `days_active`, **`is_scaled` (3+ variants)**, `longevity_score` | `snapshot_images` / `snapshot_videos` | `regional_regulation_data` | Self-healing `docId` | $3.88–4.00 per 1K | 148 users |
| **Bright Data — "Meta Ad Library" dataset** [S33, verified] | Pre-collected (221.5K+ records; 32 fields incl. library ID, status, start/end, total active time, platforms, copy, CTA, link, image/video URLs, "ad versions", EU total reach) | "ad versions" | ✓ | ✓ | ✓ | — | ≤ **$2.50 per 1K records, $250 minimum** | Generic sample, not targeted to our niche. Bright Data's generic Facebook Scraper API runs $1.5/1K records PAYG [S34] |
| **Metapi.io** *(newcomer)* [S35][S10, vendor pages] | Managed Ad Library API | n/s | n/s | Claims creative URLs | n/s | Claims "2+ years of archived deactivated ads", webhooks | Free 3K records · Lite $29/25K · Pro $79/100K · Business $149/500K | Vendor claims only [unverified] |

**Not useful for us:** the Meta *Content Library* is researcher-gated [S87, unverified]. The *Ad Library Report* covers political ads only [S2].

### 3.3 Chrome extensions (manual layer)

| Extension | What it does | Facts | Notes |
|---|---|---|---|
| **AdLibNote** (Ad Library Downloader) | Download FB/IG ads from the Ad Library, "all ad types including DCO / Carousel" | Free; 20,000 users; 4.2★ (461 ratings); updated **2026-09-29**; v1.0.4.10 [S72, verified] | Best free manual downloader found |
| "Facebook Ad Library Downloader" (`fomdmfbdhdfifcljbmeaikhbeahdldbi`) | Downloader | Listing could not be read [S73, unverified] | — |
| Video Downloader PLUS (FDOWN) | One-click Ad Library video download | "can only save the lower quality version" [S75, unverified] | Low quality, so not for DNA work |
| **Turbo Ad Finder** | **A Facebook *feed* filter** that hides organic posts so only sponsored posts show. Not an Ad Library sorter | Listing status uncertain, reported removed and then back [S74, unverified] | Works inside a **logged-in** feed. Never use it on a profile tied to SIRINE's Business Manager |
| Spend-estimate extensions ("Reveal Ad Library Reach & estimate Adspend", "Show Me Ad Spend") | Spend = reach × CPM × frequency | EU/UK/BR data only [S82, unverified] | Useless for DZ |
| Vendor extensions (Foreplay, Swipekit, AdLibrary.com Starter, Brandsearch) | Save-to-board | [S40][S59][S61] | Only with a subscription |

**Hygiene:** the web Ad Library does not require login. Run extensions in a **separate Chrome profile that is not logged into any SIRINE-admin Facebook account**. Extensions request broad page permissions [inference].

---

## 4. Winner-identification methodology

### 4.1 Signals practitioners use, and whether they exist for DZ ads

| Signal | How to compute | Practitioner threshold | Evidence | DZ? |
|---|---|---|---|---|
| **Longevity (still active)** | now − `start_date`. Better: *observed* active days from our own snapshots, or `total_active_time` when exposed (it excludes paused periods [S84, unverified]) | "30 days or more while still active"; "Treat a brand-new ad as a test, not a winner" [S80, verified, 2026-10-26]. Other vendor guides use "more than six weeks" or 60/90/180 d [search results, unverified] | [S80][S81] | **Yes.** Calibrate lower (below) |
| **Duplication** | `collation_count` = "N ads use this creative and text" | `is_scaled` = 3+ variants [S23, verified]; "many versions suggest the brand is scaling" [S80] | [S23][S80][S86] | **Yes** |
| **Relaunch / refresh** | Same media fingerprint or same body-text hash under **new** ad IDs with later start dates | "fresh variants with new start dates but the same concept" = fighting fatigue on a winner [S80] | [S80] | **Yes**, needs our own archive |
| **Page volume & velocity** | Active ads per page; new ads per week | Use it to pick the watchlist, not to score ads. Gethookd shows "how many ads they have live" [S54] | [S54][S81] | **Yes** |
| **Impression-sorted rank** | Position inside a page-scoped pull sorted `impressions_high_to_low` (the default sort in SerpApi, ScrapeCreators and Apify) | — | [S25][S30][S21] | **Unverified for non-EU ads.** Validate on SIRINE (§4.4) |
| **Cross-placement** | Count of `publisher_platforms` | "Several placement icons… often a scaled ad" [S80] | [S80] | Weak, because Advantage+ placements are the default [inference] |
| **EU reach velocity** | `eu_total_reach` ÷ days active | — | [S1b][S27] | **No.** France/diaspora slice only |
| **Engagement** | Reactions/comments/shares on the underlying post | AdSpy/BigSpy filters [S51][S52] | [S51][S52] | Only for ads built on an existing post or reel |
| **Estimated spend** | Reach × CPM × frequency | — | [S82, unverified] | **No.** There is no reach for DZ |

**DZ calibration [inference]:** DZ COD audiences are smaller and fatigue faster than US/EU DTC audiences. Treat **≥ 21 days still active** in DZ/MA/TN as roughly equal to the 30-day DTC rule. Prefer **cohort percentiles** (same country × niche, same week) over absolute day counts.

### 4.2 Pitfalls and mitigations

1. **"Active" ≠ spending.** The API defines ACTIVE as "eligible for delivery" [S1]. A forgotten $1/day ad looks like a 200-day "winner".
   → Use within-page survival and impression rank, and penalise set-and-forget pages.
2. **Start date ≠ continuous running.** Paused and resumed ads keep their original start date.
   → Use our own `first_seen`/`last_seen` snapshots or `total_active_time`.
3. **Catalog / DPA ads** (`display_format = dpa`, "product catalog ads" [S30]) run for months as templates. They are not creative winners.
   → Multiply by 0.3, or exclude them from creative-DNA work.
4. **DCO / "multiple versions"** (`display_format = dco`, "ads with versions" [S30]). One ad ID hides many assets. "This ad has multiple versions" signals dynamic creative [S85, unverified], and a practitioner thread reports the Library sometimes shows only one static version of an Advantage+/DCO ad [Reddit via search, unverified]. You cannot tell which asset is winning.
   → Multiply by 0.85 and analyse all of its cards.
5. **`collation_count` inflation.** Some advertisers duplicate the same ad across many ad sets as a habit, including mass-duplication "testing".
   → Use a log scale with a cap. Normalise per page.
6. **Low-budget long-runners on tiny pages.** A small COD shop with 1–2 ads leaves them on for months.
   → Score within-page survival only when the page has ≥ 5 observed ads, and require impression rank or duplication as corroboration.
7. **Phantom spend.** Any "spend" figure for a DZ-only ad is modelled from EU reach that does not exist [S82].
   → Ignore it.
8. **Vanishing evidence.** Non-EU ads disappear when stopped [S2], and media URLs expire within days [S30].
   → Snapshot every ≤ 3 days and download on first sight.
9. **Multi-page advertisers.** Resellers, whitelisting and backup pages spread one creative across several pages.
   → Aggregate by media fingerprint across pages.
10. **Policy-removed "winners".** A long-running ad later removed for violations is a compliance trap.
    → Run `validate-compliance.mjs` per field (CLAUDE.md pitfalls) before borrowing any angle. Darija register is not covered by the lint (memory: نقش trap).
11. **Mixing markets in one cohort** gives confusing signals: currencies, delivery claims, promo calendars [S81].
    → Build cohorts per country.

### 4.3 Recommended WinnerScore v1 (implementable today, Node, no Python)

```
WS = 100 × M × Σ(wᵢ·sᵢ) / Σ(wᵢ)        (sum only over the signals available for that ad)

s_age      (w .30) = cohort percentile of active days (same country × niche, this week); 0 if < 7 days
s_imp      (w .20) = within-page impression rank: 1 − (rank−1)/(n−1)   (use ONLY after §4.4 validation)
s_dup      (w .15) = min(1, log2(collation_count) / 4)       → 1→0, 2→.25, 4→.50, 8→.75, ≥16→1
s_relaunch (w .15) = min(1, (launch_weeks − 1) / 3)          → distinct start-weeks of the same media fingerprint on that page
s_survive  (w .10) = within-page percentile of active days    (only if the page has ≥ 5 observed ads)
s_ext      (w .10) = EU reach-per-day percentile (EU-delivered ads) OR organic-engagement percentile (post/reel-based ads)

M = 0.30 if display_format = dpa  ×  0.85 if dco  ×  0.70 if set-and-forget page (≥ 20 active ads AND ≥ 80 % of them older than 60 days)

Tiers: WINNER    = WS ≥ 70 AND still active AND days ≥ 21 (DZ/MA/TN) or ≥ 30 (EU/global)
       CANDIDATE = WS 50–69
       TEST      = everything else
```

```js
// tools/spy/score.mjs (proposed). ctx is built from our normalized snapshot store.
const W = { age: .30, imp: .20, dup: .15, relaunch: .15, survive: .10, ext: .10 };
export function winnerScore(ad, ctx) {
  const s = {};
  const days = ad.observedActiveDays ?? ctx.daysBetween(ad.startDate, ad.lastSeen);
  s.age = days < 7 ? 0 : ctx.cohortPercentile(ad.country, ad.niche, days);
  const n = ctx.pageAdCount(ad.pageId);
  if (ctx.impRankValidated && ad.pageImpRank && n > 1) s.imp = 1 - (ad.pageImpRank - 1) / (n - 1);
  s.dup = Math.min(1, Math.log2(Math.max(1, ad.collationCount ?? 1)) / 4);
  s.relaunch = Math.min(1, (ctx.launchWeeks(ad.pageId, ad.mediaFingerprint) - 1) / 3);
  if (n >= 5) s.survive = ctx.pagePercentile(ad.pageId, days);
  if (ad.euTotalReach) s.ext = ctx.reachPerDayPercentile(ad.euTotalReach / Math.max(days, 1));
  else if (ad.postEngagement != null) s.ext = ctx.engagementPercentile(ad.postEngagement);
  let num = 0, den = 0;
  for (const k of Object.keys(s)) { num += W[k] * s[k]; den += W[k]; }
  let m = 1;
  if (ad.displayFormat === 'dpa') m *= 0.30;
  if (ad.displayFormat === 'dco') m *= 0.85;
  if (ctx.isSetAndForgetPage(ad.pageId)) m *= 0.70;
  const score = Math.round(100 * m * (den ? num / den : 0));
  const minDays = ['DZ', 'MA', 'TN'].includes(ad.country) ? 21 : 30;
  const tier = score >= 70 && ad.isActive && days >= minDays ? 'winner' : score >= 50 ? 'candidate' : 'test';
  return { score, tier, signals: s };
}
```

**Worked examples [estimate]:**

1. **DZ bag ad.**
   - Inputs: 35 days active (cohort percentile .85), top-3 of 12 by impressions (.82), collation 6 (.65), relaunched once (.33), outlives 80 % of its page (.80), no EU data.
   - (.255 + .164 + .0975 + .0495 + .08) / .90 ≈ .72 → **WS 72, WINNER**.
2. **Forgotten long-runner.**
   - Inputs: 200 days (cohort .99), last of 3 ads by impressions (0), collation 1, never relaunched, page too small for `s_survive`.
   - .297 / .80 ≈ .37 → **WS 37, TEST**.
   - Without `s_imp` it would score .297 / .60 ≈ 50 (CANDIDATE). The impression-rank signal carries the most value, so validating it is worth the effort.

### 4.4 Validate before trusting: back-test on SIRINE's own ads

SIRINE's own ads appear in the DZ Ad Library, and we know their truth: Insights spend and impressions, plus `spend ÷ DB delivered orders` via `source_ad_id` (memory: *platform ROAS is inadmissible*).

1. Pull SIRINE's page through the same provider, sorted `impressions_high_to_low`. Check Spearman ρ between Library rank and real lifetime impressions.
   - ρ ≥ 0.6 → set `ctx.impRankValidated = true`.
   - Otherwise drop `s_imp`.
2. Compute WS for all SIRINE ads of the last 6 months. Check ρ between WS and real spend, and the precision of the WINNER tier against our top-quartile CAC ads.
3. Re-fit the weights with a simple logistic model once ≥ 100 labelled ads exist, mixing our own and any client accounts we manage. Until then, keep v1.

---

## 5. Legal / ToS / anti-bot risk

1. **The official API is the only fully sanctioned bulk route**, and it excludes DZ commercial ads (§3.1). Its snapshot URL notes that downloads are limited by Meta's Terms [S1b].
2. **Meta's Automated Data Collection Terms** (effective 2024-10-07): *"You will not engage in Automated Data Collection without first obtaining Meta's express written permission"*. Accepting the Terms alone is not that permission. Enforcement can include revoking access, requiring deletion, and terminating "your ability to use Meta Company Products" [S6, verified].
3. **Case law (US):**
   - In *Meta v. Bright Data* (N.D. Cal., Judge Edward Chen, **2024-01-23**), the court granted summary judgment for Bright Data on breach of contract. It held: "Bright Data did not 'use' Facebook and Instagram when it engaged in public logged-off scraping" [S7, verified].
   - Meta then dismissed its remaining claim and **waived its appeal (2024-02-23)** [S9, unverified secondary: TechCrunch/Goldman/MediaPost].
   - Caveats: the ruling is about **logged-off** scraping of public data. Commentators note that other theories (CFAA, trespass to chattels) were not tested [S8, verified]. It is US law only.
4. **Account safety is the real risk for us, more than litigation.** Never scrape, automate or run extensions while logged into any Facebook account that has a role on SIRINE's Business Manager, ad accounts or pages.
   - A Meta enforcement action against that identity could take down the ad accounts, which CLAUDE.md names as our #1 enemy.
   - Paid APIs scrape logged-off from their own infrastructure. **Never give a vendor our cookies or tokens.**
5. **Meta's hosted connector** forbids bulk use in its own tool description ("Do NOT use for bulk data extraction/scraping of the Ad Library") [S3]. Use it manually only. This matches RULE 2.
6. **Vendors move operational risk, not usage risk.**
   - SerpApi's U.S. Legal Shield, from the Production plan up, covers the *collection* of public data, "not for how that data is ultimately used" [S32, unverified].
   - Vendor continuity is a risk too. Google sued SerpApi in Dec 2025 [S32, unverified]. → Build provider adapters and keep a second provider warm.
7. **Copyright / IP in creatives.** Competitor creatives are their copyrighted works.
   - **Internal storage and analysis** for research is common practice and lower risk [inference; not legal advice]. **Republishing or closely copying** is not: re-uploading their video, reusing their model or product photos, or near-verbatim copy. That invites IP reports, which lead to ad rejections and account strikes.
   - **Replicate structure, not assets:** hook type, pacing, layout, offer framing, price-at-frame-0. Generate new assets only from **our own product photos**, per the memory rule "image→video from REAL photo only".
   - Never reproduce a competitor's brand name, logo or a real person's likeness.
8. **Personal data.** Creatives contain faces of models and UGC creators. Keep the library **internal**. Do not build profiles of individuals. EU-sourced data falls under GDPR [inference].
9. **Anti-bot practicalities.**
   - The web library is a React app on internal GraphQL, with rotating `doc_id`s and `lsd`/`jazoest` tokens.
   - IP-level throttling shows up as error **1675004**. Scrapers rotate residential proxies and back off [S84, unverified, from actor docs].
   - Expect occasional breakage. Hence two providers, retries with exponential backoff, and alerting when a run returns 0 rows for a page that had ads yesterday.
   - Do not scrape directly from our office IP. Let vendors absorb it.

---

## 6. Recommendation: budget-aware stack for SIRINE / ad-engine

### 6.1 Ranked stack and monthly cost

| Rank | Component | Role | Cost |
|---|---|---|---|
| **1** | **Own collector on ScrapeCreators** (primary), with **SerpApi Free** (250 searches/mo) and **Apify `curious_coder`** (Apify Free, $5 credit/mo) as fallback adapters | The only route that covers DZ/MA/TN fully. Watchlist snapshots, keyword sweeps, media download, EU transparency + transcripts on demand | **$47 one-off** (25K credits, never expire ≈ 12+ months at ~2K requests/mo [estimate]). Fallbacks $0 |
| **2** | **Free manual layer:** web Ad Library + hosted connector `ads_library_search` (spot checks, page-id discovery, Arabic queries) + **AdLibNote** | Ad-hoc research, verification | $0 |
| **3** *(optional, max ONE)* | **Foreplay Basic** (annual) | Global DTC fashion/accessories discovery (niche filters, `longest_running` sort), swipe/brief workflow, **10K API credits/mo** into our library | **$49/mo** ($59 monthly) |
| 3-alt | **Gethookd Pro** (annual) | Cheaper UI + Brand Spy + MCP. Plan credits only 150/mo, likely shared with the API [inference] | $32/mo |
| 4 *(France expansion only)* | **TrendTrack Starter/Pro** | FR/EU DTC + Shopify competitors with EU spend/reach | $34–62/mo (annual) |
| — | **Official Ad Library API** | Free EU reach/targeting for FR/EU ads. Redundant with rank 1's EU fields; set it up only if identity confirmation is easy | $0 |

**Monthly totals:**

| Option | Total |
|---|---|
| **Lean** | **$0/mo** + $47 one-off (≈ $4/mo amortised) |
| **Standard** (lean + Foreplay Basic annual) | ≈ **$53/mo** |
| **Standard-alt** (lean + Gethookd Pro annual) | ≈ **$36/mo** |
| Upper bound with redundancy (+ SerpApi Starter $25) | ≈ **$78/mo** |

**Do not buy:**
- Motion ($999, own-account analytics)
- MagicBrief (dead)
- Atria (≥ $129)
- AdLibrary.com API (€299+)
- AdSpy / BigSpy / PowerAdSpy (no API)
- Adheart (uniquifier = circumvention risk)
- Panoramata (email/SMS intelligence)
- Winning Hunter (EU-reach scores)
- PiPiAds / Kalodata / Vidtao (TikTok / YouTube)
- Bright Data dataset ($250 minimum, not niche-targeted)

### 6.2 What we build ourselves (proposal only; nothing built yet)

1. **`tools/spy/collect.mjs`**
   - **Provider adapters** (ScrapeCreators → SerpApi → Apify) normalise into one schema:
     - identity and origin: `ad_archive_id, page_id, page_name, country_query, keyword, language`
     - creative: `display_format, platforms, body, title, link_url, cta`
     - lifecycle: `start_date, end_date, is_active, collation_id, collation_count, first_seen, last_seen, observed_active_days`
     - extras: `eu_*` fields, `media[]` (local path, md5, perceptual hash), `provider, raw`
   - **Cadence:**
     - watchlist pages every **3 days**
     - keyword sweeps **weekly** per country (DZ, MA, TN, FR) in ar / ar-DZ (Arabic and Latin script) / fr — e.g. «الدفع عند الاستلام», «التوصيل لجميع الولايات», «حقيبة», «ساك», «صندالة», "sac à main", "paiement à la livraison", "livraison 58 wilayas" and "69 wilayas"
     - global DTC brands **monthly**
   - **Media:** download HD video/images **on first sight**, because URLs expire [S30].
   - **Watchlist growth:** pages from sweeps with ≥ 10 active ads and ≥ 90 days of history.
   - **Volume:** ≈ 80 pages × 10 runs + ≈ 500 keyword pages ≈ **1.3–2K requests/mo** [estimate].
2. **`tools/spy/score.mjs`.** WinnerScore v1 (§4.3) plus the §4.4 back-test harness against SIRINE's ground truth.
3. **Creative-DNA extraction.**
   - Use the `video-understanding` skill: contact sheet first, then scene cuts and on-screen text.
   - Transcribe with local **whisper.cpp `--lang ar`** for Darija. Use ScrapeCreators' transcript only as a cross-check.
   - Tag rubric:

     | Group | Tags |
     |---|---|
     | Hook | Hook type; first-frame text |
     | Offer | Price at frame 0 (our COD rule); COD/delivery claim on screen; offer/pack structure |
     | Copy | Language register (Darija / MSA / FR); one language per creative? |
     | Format | Ratio; duration; model on/off; music/nasheed; text density |
     | Action | CTA; destination (site vs CTWA) |
4. **Library layout** (suggested): `creative-lab/library/ads.jsonl` (append-only snapshots), `creative-lab/library/media/<page_id>/<ad_archive_id>/…`, `creative-lab/library/scores.jsonl`, `creative-lab/library/dna/<ad_archive_id>.json`.
5. **Gates before replication:** compliance lint per field (never on joined variants), the Darija register check with the owner, and the IP rule (structure only, our own assets).

### 6.3 Paid-tool trial protocol (spend $0 unless it passes)

Before any subscription, build a **DZ test set**:
- 10 known DZ COD fashion pages found through the connector ("sac.femme.dz", "Novira", "Luxury store", plus SIRINE's direct competitors);
- 5 Arabic queries;
- 3 Moroccan/Tunisian pages.

During the trial:
1. **Pass** = the tool finds ≥ 7/10 pages with ads newer than 14 days, returns Arabic-text search hits, and its API exports media URLs.
2. Foreplay's trial needs a card. **Cancel before day 7 if it fails** [S40].
3. Gethookd's trial is $0 for 7 days [S54]. Swipekit's is 14 days, no card [S59].

### 6.4 Decision rules going forward

- When the collector is live and the §4.4 validation passes, run `/ads research` competitor pulls from **our library first**, and from paid tools second.
- Revisit paid tools only if:
  - (a) a client needs EU/US DTC research at scale (Foreplay / TrendTrack), or
  - (b) ScrapeCreators breaks for more than 7 days (switch the primary to SerpApi Starter at $25).

---

## 7. Open items / unverified

- **DZ coverage of each commercial spy tool:** nobody documents it. The trial protocol (§6.3) decides.
- **Impression-sorted order for non-EU ads:** whether it reflects real impressions is unproven. Validate on SIRINE (§4.4).
- **ScrapeCreators:** page size and long-run reliability are undocumented. The first live run settles it.
- **Not loaded on 2026-11-01:** Dropispy (refused connections), Kalodata (403), PiPiAds plan details beyond the homepage, the Gethookd API field schema (JS-rendered Scalar docs), the official facebook.com/ads/library/api page (403). These claims are marked [unverified].
- **Legal points** (TDM/copyright scope, Algerian data-protection law) were not researched in depth. Get counsel if the library is ever shared outside the agency.

---

## Sources (all accessed 2026-11-01)

| Key | Source | Status |
|---|---|---|
| S1 | https://developers.facebook.com/docs/graph-api/reference/ads_archive/ (v26.0) | verified |
| S1b | https://developers.facebook.com/docs/marketing-api/reference/archived-ad/ (v26.0) | verified |
| S2 | https://transparency.meta.com/researchtools/ad-library-tools | verified |
| S3 | Our live calls: claude.ai META connector `ads_library_search` — (a) `countries=["DZ"]`, `search_terms="sac"`, ACTIVE, limit 5 → `estimated_total_count` 1,867 (pages incl. "sac.femme.dz", "Luxury store"); (b) `countries=["DZ"]`, «الدفع عند الاستلام حقيبة», ACTIVE, limit 3 → 149 (page "Novira", title «حقيبة لإطلالتك الجامعية»). Tool description: max 50 per call, "Do NOT use for bulk data extraction/scraping of the Ad Library" | tested |
| S4 | https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ | verified |
| S5 | https://swipekit.app/articles/meta-ad-library-api (updated 2026-09-17) | verified (secondary on Meta access steps) |
| S6 | https://www.facebook.com/legal/automated_data_collection_terms (effective 2024-10-07) | verified |
| S7 | https://www.fbm.com/technology/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/ (2024-01-29) | verified |
| S8 | https://blog.ericgoldman.org/?p=26009 | verified |
| S9 | https://techcrunch.com/2024/02/26/meta-drops-lawsuit-against-web-scraping-firm-bright-data-that-sold-millions-of-instagram-records · https://blog.ericgoldman.org/archives/2024/02/facebook-drops-anti-scraping-lawsuit-against-bright-data-guest-blog-post.htm | unverified (search results, consistent) |
| S10 | https://metapi.io/compare/facebook-ad-library-api | vendor page; claims unverified |
| S20 | https://apify.com/apify/facebook-ads-scraper | verified |
| S21 | https://apify.com/curious_coder/facebook-ads-library-scraper (+ /pricing) | verified |
| S22 | https://apify.com/harshmaur/facebook-ads-library-scraper | verified |
| S23 | https://apify.com/bovi/meta-ads-library-scraper | verified |
| S24 | https://scrapecreators.com/ (pricing) · G2 listing https://www.g2.com/products/scrape-creators/reviews (search) | verified / unverified |
| S25 | https://docs.scrapecreators.com/v1/facebook/adLibrary/search/ads | verified |
| S26 | https://docs.scrapecreators.com/v1/facebook/adLibrary/company/ads | verified |
| S27 | https://docs.scrapecreators.com/v1/facebook/adLibrary/ad | verified |
| S28 | https://www.searchapi.io/docs/meta-ad-library-api · https://searchapi.io/docs/meta-ad-library-ad-details-api | verified |
| S29 | https://www.searchapi.io/pricing | verified |
| S30 | https://serpapi.com/meta-ad-library-api | verified |
| S31 | https://serpapi.com/pricing | verified |
| S32 | https://serpapi.com/us-legal-shield · https://www.seroundtable.com/google-sues-serpapi-40631.html (search results) | unverified |
| S33 | https://brightdata.com/products/datasets/facebook/ads · https://brightdata.com/products/datasets/facebook | verified |
| S34 | https://brightdata.com/products/web-scraper/facebook/ads | verified |
| S35 | https://metapi.io/compare/searchapi (competitor's comparison page) | vendor page; claims unverified |
| S36 | https://apify.com/pricing | verified |
| S40 | https://www.foreplay.co/pricing | verified |
| S41 | https://foreplay.co/api | verified |
| S42 | https://help.foreplay.co/en/articles/9082255-credits-and-pricing | verified |
| S43 | https://help.foreplay.co/en/articles/1041267-track-competitor-with-spyder | verified |
| S44 | https://aisa.one/docs/api-reference/foreplay/get_foreplay-discovery-ads.md · https://aisa.one/docs/openapi/foreplay.json (third-party mirror of Foreplay's API) | unverified mirror |
| S45 | https://www.foreplay.co/faqs/what-ad-data-does-claude-chat-have-access-to | verified |
| S46 | https://www.tryatria.com/pricing | verified |
| S47 | https://www.tryatria.com/ | verified |
| S48 | https://www.minea.com/pricing · https://www.minea.com/ | verified |
| S49 | https://www.formalive.fr/avis-dropispy/ (search snippet; site refused connection) | unverified |
| S50 | https://bigspy.com/pricing | verified |
| S51 | https://bigspy.com/tools/facebook-ad-library | verified |
| S52 | https://adspy.com/ | verified |
| S53 | https://poweradspy.com/pricing/ | verified |
| S54 | https://www.gethookd.ai/ | verified |
| S55 | https://www.gethookd.ai/api · docs https://registry.scalar.com/@gethookd/apis/gethookdai-api-documentation/latest | verified (docs JS-rendered, fields unread) |
| S56 | https://magicbrief.com/ (shutdown notice) | verified |
| S57 | https://motionapp.com/pricing | verified |
| S58 | https://www.panoramata.co/pricing | verified |
| S59 | https://swipekit.app/pricing | verified |
| S61 | https://adlibrary.com/pricing | verified |
| S62 | https://winninghunter.com/pricing | verified |
| S63 | https://winninghunter.com/facebook-ads-spy-tool | verified |
| S64 | https://adheart.me/en/blog/adheart-review (2025-10-06) | verified |
| S65 | https://www.trendtrack.io/fr/blog-post/avis-adheart-2026-prix-fonctionnalites-comparatif | unverified (competitor review) |
| S67 | https://pricingsaas.com/companies/vidtao | unverified |
| S68 | https://www.pipiads.com/ | verified |
| S69 | https://creatify.ai/blog/kalodata-pricing-plans-and-what-you-ll-actually-pay-in-2026 (search) | unverified |
| S70 | https://www.trendtrack.io/pricing | verified |
| S72 | https://chromewebstore.google.com/detail/ad-downloader-for-fb-ad-l/efaadoiclcgkpnjfgbaiplhebcmbipnn | verified |
| S73 | https://chromewebstore.google.com/detail/fomdmfbdhdfifcljbmeaikhbeahdldbi | listing unreadable |
| S74 | https://ecom-saas.zingfront.com/blog/turbo-ad-finder-alternative · https://chromeboard.com/extension/turbo-ad-finder-cflpbcbakackacecklpgfmmhdlpekeap (search) | unverified |
| S75 | https://www.foreplay.co/post/how-to-download-facebook-ad-library-videos (search) | unverified |
| S80 | https://use-addy.site/blog/meta-ad-library-research (updated 2026-10-26) | verified |
| S81 | https://www.trendtrack.io/blog-post/facebook-ad-library-search | verified |
| S82 | https://adligator.com/blog/estimate-competitor-facebook-ad-spend · https://brandsearch.co/blog/meta-ad-budget-floor-competitor-spend-data · Chrome listing "Reveal Ad Library Reach & estimate Adspend" (search results) | unverified |
| S83 | https://www.gethookd.ai/learn/top-5-facebook-ad-spy-tools-in-2026-free-paid/ (2026-10-08) · https://www.gethookd.ai/learn/4-best-facebook-ads-research-tools-in-2026/ (2026-09-18) | vendor blog |
| S84 | https://dev.to/odeeb/building-a-facebook-ad-library-scraper-api-limits-and-the-real-approach-3bad · Apify actor READMEs on error 1675004 / `totalActiveTime` (search results) | unverified |
| S85 | https://blog.adnabu.com/facebook/meta-ads-library/ (search) | unverified |
| S86 | https://apify.com/curious_coder/facebook-ads-library-scraper/issues/number-of-ads-using-fxRtEEG4jERRo8q0Q (search) | unverified |
| S87 | https://www.admapix.com/blog/ad-intelligence/meta-ads-library-api-developers (search) | unverified |
| S88 | ad-engine memory `reference-graph-direct-from-sandbox.md` (2026-09-05: "`ads_library_search` works for DZ") | internal |
