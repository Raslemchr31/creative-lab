# 05 — Meta Ad Library collector internals (web UI → JSON), and what to borrow

> **As of:** 2026-11-01. **For:** the `creative-lab` spy collector (Node 22 ESM + `playwright-core` driving the system Chrome, Windows 11, no Python).
> **Scope:** the public web Ad Library `https://www.facebook.com/ads/library/` (logged out) — the only Meta surface that shows Algerian *commercial* ads — plus the official `/ads_archive` Graph API for completeness.
>
> **Method.** I cloned or fetched about 24 public repos at pinned commits and read their source. I also read Meta's developer reference pages, two Apify changelogs and one dev.to write-up. I sent **no request to facebook.com** and logged in nowhere. Live measurements quoted below are other people's, labelled with who measured them and when. Our own live spike is in [`creative-lab/PROGRESS.md`][LOCAL-PROGRESS] and the trimmed fixtures in `creative-lab/tests/fixtures/` (2026-11-01: DZ "sac" → 1,876 results, 30 embedded, then 10 per scroll).
>
> **Evidence labels:**
> - **[primary]**: Meta first-party docs.
> - **[code]**: read in a repo's source at the pinned commit.
> - **[measured]**: a repo or vendor's dated live measurement, not reproduced by me.
> - **[spike]**: our own 2026-11-01 run or fixture.
> - **[unverified]**: a single secondary source, conflicting sources, or my inference.
> - **Rec.**: our recommendation.

---

## TL;DR

1. **There are two delivery channels, carrying one object shape.**
   - The first ≤30 results are embedded in the HTML inside `<script type="application/json" data-sjs>`, with no GraphQL call.
   - Each scroll fires `POST /api/graphql/` with `fb_api_req_friendly_name=AdLibrarySearchPaginationQuery` and gets **10** ads back.
   - Both carry the same `search_results_connection`: ads are at `edges[].node.collated_results[]`, paging is `page_info.{end_cursor,has_next_page}`, and `count` (SSR batch only, capped at 50,001) is Meta's own total. [code][measured][spike]
2. **The creative lives in `collated_results[].snapshot`.** That means `body.text`, `title`, `link_url`, `cta_type`, `display_format`, `images[]`, `videos[]`, `cards[]`, `extra_*` and the exact `page_like_count`. Media sits in **three disjoint places** depending on format (images / videos / cards), plus `extra_images` / `extra_videos`. [code][spike]
3. **GraphQL bodies use framing.** Bodies may start with `for (;;);` and may hold **several JSON documents, one per line**. Our DZ fixture has a second line `{"label":"extra-chunk","path":[]}`. Parse line by line and search recursively for `search_results_connection`. [code][spike]
4. **Logged out is enough. The main document answering HTTP 403 is normal**: it comes with the full page. The real block signals are:
   - `xfb_ad_library_is_captcha_required:true`
   - GraphQL HTTP 200 with `errors[].code` **1675004** (rate limit) or **1357054 / 1357004 / 1357001** (refusal or session)
   - a redirect to `/login` or `/checkpoint`

   [code][measured]
5. **Non-browser clients keep getting gated.** Facebook was rejecting non-Chrome TLS fingerprints by Feb 2026. Since Jul 2026 a JS challenge returns 403 on `/ads/library/`, and since Aug 2026 the challenge itself is served as 403. `doc_id`s rotate (three different ones in use within 16 months). A **real Chrome reading what the page already loads** sidesteps all of that: we never need a `doc_id`, `lsd` or TLS impersonation. **Rec.: keep the current architecture.** [code]
6. **Pacing.** Measured from one residential IP, logged out, Playwright (2026-10-05):
   - 500 ads of one search in 2.5 min (58 scrolls)
   - 46 page loads in an hour with no login wall and no captcha

   Raw-HTTP scrapers measured "~47 requests from one IP → a block that outlasts 25 minutes". One page at a time; 2.5–5 s per scroll; ≥20–45 s between searches. [measured]
7. **Media URLs are signed and expire within days.** The hex `oe=` value is the expiry epoch: a 2026-10-01 sample decodes to 2026-10-05, about 4.5 days. Download in the same run. A 403 means expired. If a regional edge fails, retry on `scontent.xx.fbcdn.net` / `video.xx.fbcdn.net`. [code][measured]
8. **Best code to borrow:**
   - **thenavidm/facebook-ad-library-mcp-cli** (MIT, TypeScript, Node ≥22, Playwright reading SSR + GraphQL)
   - **2scraper/facebook-ads-scraper** (MIT, Python; the best live-measured behaviour notes plus real 2026-10 fixtures)
   - **promisingcoder/MetaAdsCollector** (MIT, Python, 106★; protocol reference, raw samples, dated breakage log)
9. **Gotchas that change the data:**
   - `keyword_unordered` matches **any** word.
   - The country defaults to the visitor's own.
   - A logged-out `?id=` link is **not** a lookup.
   - An active ad's `end_date` = **today**.
   - DPA/DCO top-level text is a `{{product.name}}` template; the rendered copy is in `cards`.
   - `cta_text` is localized (use `cta_type`).
   - Outside the EU, commercial ads **vanish from the library when they stop**, so crawl daily to keep history.
10. **The official `/ads_archive` API (v26.0 current) can't do this job.** Outside the EU it returns only social-issue, election and political ads, so it is useless for DZ, MA or TN commercial ads. It is complete only for ads delivered to the EU (FR) and the UK. Fields are in §5. [primary]

---

## 1. Web Ad Library URL parameters (2026)

Base: `https://www.facebook.com/ads/library/?…`. Brackets must be URL-encoded when built with `URLSearchParams`; Facebook accepts both forms. None of these are documented by Meta. The evidence is scrapers that build URLs the UI accepts, plus the URLs the UI itself canonicalizes to.

| Param | Values seen | Notes | Source |
|---|---|---|---|
| `active_status` | `active` · `inactive` · `all` | GraphQL `activeStatus`: `ACTIVE` / `INACTIVE` / `ALL` | [2S-parser-doc] L111, [SUKH-const] L76, [MAC-const] |
| `ad_type` | `all` · `political_and_issue_ads` | Housing, employment and credit variants exist in the UI. Their URL spellings differ between repos (`housing`, `category=3`, `ad_category=…`) → **[unverified]**. Use `all`. | [2S-parser-doc] L112, [EREN-input], [ATHM-scraper] L57-66 |
| `country` | ISO-3166 alpha-2 (`DZ`, `MA`, `TN`, `FR` …) or `ALL` | **Without it, the library runs in the visitor's (exit IP's) country.** Always set it explicitly. One country per URL. | [2S-parser-doc] L62-65 |
| `q` | free text, URL-encoded (Arabic is fine) | Keyword search. | all repos |
| `search_type` | `keyword_unordered` · `keyword_exact_phrase` · `page` | `keyword_unordered` = **any word matches** ("zzqxw no such ad 88123" returned 6,980 results on 2026-10-06), so use `keyword_exact_phrase` for "sac femme" / "pack sac". `page` goes with `view_all_page_id`. | [2S-testing-anyword], [KYAM-cli] L47-50, [DEVTO] |
| `view_all_page_id` | numeric Page ID | All ads of one advertiser. Meta canonicalizes it with `search_type=page`. Page searches need `searchType: PAGE` (`KEYWORD_UNORDERED` + empty `q` returns 0). | [EREN-input] L85-90, [DEVTO], [ATHM-url] |
| `media_type` | `all` · `image` · `video` · `meme` · `image_and_meme` · `none` | GraphQL `mediaType` `ALL/IMAGE/VIDEO/MEME/NONE` (`IMAGE_AND_MEME` **[unverified]**). | [KYAM-cli] L42, [MAC-const] L135-140 |
| `is_targeted_country` | `false` · `true` | Present in most UI-built URLs. GraphQL `isTargetedCountry`. Exact semantics **[unverified]**: keep `false`. | [KYAM-core] L25, [NAGA] L75 |
| `sort_data[mode]` | `total_impressions` · `relevancy_monthly_grouped` | Omit it for the default relevance sort. GraphQL `sortData: {mode:"SORT_BY_TOTAL_IMPRESSIONS", direction:"DESCENDING"/"ASCENDING"}` or `null`; other mode strings raise `noncoercible_variable_value`. | [KYAM-core] L29-30 & L74-75, [ATHM-scraper] L42-43, [MAC-client-search] L1042-1050, [ADLIB-client] L226 |
| `sort_data[direction]` | `desc` · `asc` | | same |
| `start_date[min]`, `start_date[max]` | `YYYY-MM-DD` | "Started running" date filter. GraphQL `startDate: {min, max}`. | [KYAM-core] L31 & L86-89, [MEMO23], [TOOLZ] L138, [GIST-comments] |
| `content_languages[0]`, `[1]` … | ISO 639-1 (`ar`, `fr`, `en`) | Language filter. GraphQL `contentLanguages`. Accuracy on Darija **[unverified]**. | [KYAM-core] L78-80 |
| `publisher_platforms[0]` … | `facebook` · `instagram` · `messenger` · `audience_network` (`threads` **[unverified]**) | GraphQL `publisherPlatforms`. | [EREN-input] L101-103 |
| `page_ids[0]` … | Page IDs | Multi-page filter. **[unverified]** (one repo only). | [KYAM-core] L82-84 |
| `locale` | e.g. `en_US` | Forces the UI language. The page language otherwise follows browser/IP, and localized strings (`cta_text`, spend, impressions text) change with it. | [2S-parser-doc] L196-202, [SUKH-const] L44-46 |
| `id` | `ad_archive_id` | Single-ad link. **Logged out, it is not a lookup**: it ran a search in the exit country and showed a *different* ad of the same advertiser. Don't rely on it. | [2S-parser-doc] L66-70 |

**Rec.** Build every URL with explicit `country`, `active_status=active`, `ad_type=all`, `media_type=all` and `is_targeted_country=false`:
- `search_type=keyword_exact_phrase` for multi-word phrases;
- `keyword_unordered` for single tokens such as `حقيبة` or `sac`;
- `search_type=page&view_all_page_id=…` for advertisers.

Optionally add `sort_data[mode]=total_impressions&sort_data[direction]=desc`. Record which sort produced the ranking, because position is a "winner" signal only under the impressions sort. Whether this sort is a true impression order for **non-EU** commercial ads is **[unverified]**: test by crawling one query both ways.

---

## 2. The data path

### 2.1 Sequence (what the page does, logged out)

```
GET /ads/library/?…            → HTTP 403 (normal) + full HTML shell (module "AdLibraryFoundationRoot")
                                  └─ <script type="application/json" data-sjs>{"require":[["ScheduledServerJS","handle",null,[{"__bbox":…
                                       … "result":{"data":{"xfb_ad_library_is_captcha_required":false,
                                                           "ad_library_main":{"search_results_connection":{ count, edges(≤30), page_info }}}}
(scroll)  POST /api/graphql/  fb_api_req_friendly_name=AdLibrarySearchPaginationQuery
                                → 200, "for (;;);" + NDJSON: {"data":{"ad_library_main":{"search_results_connection":{edges(10), page_info}}},"extensions":{…,"is_final":true}}
                                                             {"label":"extra-chunk","path":[]}
(scroll)  … next cursor …     → 10 more   (one scroll can trigger two batches)
```

Sources:
- 403 with full page, 30 embedded, 10 per scroll, `count` capped at 50,001, "loading" state: [2S-parser-doc] L13-41, [2S-testing].
- SSR wrapper and DZ fields: [spike] `tests/fixtures/adlib-first-page.html`, `adlib-graphql-page.txt`.
- First page carries no GraphQL call: [NAVID-harvest] L17-21, [NAVID-browser] L1-21.
- Two batches per scroll: [2S-changelog] L65.

### 2.2 First page — server-embedded (SSR)

- The batch is in one of about 50 `<script type="application/json" data-sjs>` blocks. Some carry `data-content-len="N"`. Only one block contains `search_results_connection`. [2S-parser-code] L212-224, [GIST-comments] (regex `<script type="application/json"(?:\s+data-content-len="\d+")?\s+data-sjs>\{"require":\[\["ScheduledServerJS","handle"…`).
- The wrapper is the Comet `ScheduledServerJS` → `__bbox.require` → `__bbox.result.data` chain. Exact array indices vary, and the inner module name (`RelayPrefetchedStreamCache` / `adp_AdLibraryFoundationRootQuery…`) is **[unverified]** because every 2026 fixture I saw is trimmed. **Do not hard-code indices.** Find the key recursively, as 2scraper, athm793 and thenavidm all do. [2S-parser-code] L245-300, [ATHM-scraper] L91-113, [NAVID-harvest] L22, L53-60, L80-88.
- `data` also carries `xfb_ad_library_is_captcha_required` (bool), which is the captcha flag. [spike], [NAVID-harvest] L152.
- **Timing traps:**
  - A broad search can deliver the shell first and stream the batch in later. On 3 of 13 popular searches it was missing 6 s after load and present a few seconds later. Poll for up to ~25 s before concluding "empty".
  - The data can be present **before** the list is drawn. On 4 of 8 political-search loads the page was still one blank viewport 7.5 s after its data arrived, so scrolling immediately "stalled at 30". Wait until `document.scrollHeight > 1500` or it grows (≤30 s).

  [2S-flow] L66-84.
- `page.content()` returns the live DOM, and it still contains the `data-sjs` blocks (2scraper, thenavidm and our spike read them that way). Alternatively capture the document response body. Note that athm793 only keeps it when the status is 200, which loses it under the normal 403. [2S-pw], [NAVID-browser] L162, [ATHM-scraper] L295-317.

### 2.3 Next pages — `POST https://www.facebook.com/api/graphql/`

**Form fields (application/x-www-form-urlencoded)**, as the page sends them:

```
av=0 · __aaid=0 · __user=0 · __a=1 · __req=<base36 counter> · __hs · dpr · __ccg · __rev · __s · __hsi · __dyn · __csr · __hsdp · __hblp
__comet_req=94 · lsd · jazoest · __spin_r · __spin_b · __spin_t · __jssesw=1
fb_api_caller_class=RelayModern · fb_api_req_friendly_name=AdLibrarySearchPaginationQuery
variables=<JSON> · server_timestamps=true · doc_id=<persisted query id>
headers: x-fb-friendly-name, x-fb-lsd, x-asbd-id (e.g. 359341), origin/referer = facebook.com
```

Sources: the full real form of the sibling details query, 2026-10-06 [2S-fixture-details]; [MAC-client-payload] L885-940; [ADLIB-client] L200-262. `jazoest` is the string `"2" + Σ charCodes(lsd)` ([ADLIB-client] L366-371; MetaAdsCollector adds numerically instead, [MAC-client-payload] L877-883). **None of this matters for us**: the browser builds it. It matters only if we ever replay requests.

**`variables` JSON.** These are the names the operation declares, read out of Meta's bundle; omitting one makes the request fail ([SUKH-web] L123-153):

```json
{"activeStatus":"ACTIVE","adType":"ALL","bylines":[],"collationToken":null,"contentLanguages":[],
 "countries":["DZ"],"cursor":"<page_info.end_cursor>","excludedIDs":[],"first":10,"isTargetedCountry":false,
 "location":null,"mediaType":"ALL","multiCountryFilterMode":null,"pageIDs":[],"potentialReachInput":[],
 "publisherPlatforms":[],"queryString":"sac femme","regions":[],"searchType":"KEYWORD_EXACT_PHRASE",
 "sessionID":"<uuid per page load>","sortData":null,"source":null,"startDate":null,"v":"<hex>","viewAllPageID":"0"}
```

- **`first` is ignored: the server always returns 10 edges.** [SUKH-const] L24-26, [ADLIB-readme] L41, [TOOLZ] L23, [spike].
- For a page search: `searchType:"PAGE"`, `viewAllPageID:"<id>"`, `queryString:""` (some send `pageIDs:[id]` too). [SUKH-web] L141-152, [TOOLZ] L126-150, [DEVTO].
- `sessionID` is minted per page load. One constant `sessionID` reused across many runs and IPs got refused (fixed 2026-09-03). [SUKH-apify] 1.0.6.

**`doc_id`s observed for `AdLibrarySearchPaginationQuery`** (they rotate on frontend redeploys, and several stay valid at once):

| doc_id | Seen in | Date |
|---|---|---|
| `24394279933540792` | thuykaka gist comment | 2025-06 [GIST-comments] |
| `24922295957467452` | sukhhdipsingh `FALLBACK_DOC_ID`; toolzerhub `DOC_SEARCH` | measured 2026-08-27 [SUKH-const] L12; still used 2026-10-18 [TOOLZ] L20 |
| `25464068859919530` | MetaAdsCollector `DOC_ID_SEARCH`; simonbalfe/adlib | "last verified 2026-07-22" [MAC-const] L50-55; still in adlib 2026-10-31 [ADLIB-client] L26 |

Bundle self-repair, if we ever go browserless: the id lives in a module shaped `__d("AdLibrarySearchPaginationQuery_facebookRelayOperation",[],(function(t,n,r,o,a,i){a.exports="123"}),null);`. In August 2026 it was in the 5th candidate bundle, about 7.4 MB in. [SUKH-docid] L19-44, [SUKH-changelog] L13-19.

### 2.4 Response framing — how scrapers parse it

- An optional anti-hijack prefix `for (;;);`, sometimes written `for(;;);`. [MAC-client-search] L1098, [CONCAP] L56-66, [spike].
- **Several JSON documents per body, one per line** (Relay incremental delivery: a main payload, then parts with `label` / `path`). The 2025 first-page refetch put the results inside a labelled part; the gist re-wrapped it from `"label": "AdLibraryMobileFocusedStateProvider…"`. [GIST-comments], [NAVID-harvest] L118-133, [2S-parser-code] L227-241, [ATHM-scraper] L185-194, [spike: line 2 = `{"label":"extra-chunk","path":[]}`].
- Line 1 ends with `"extensions":{"server_metadata":{…},"is_final":true}`. [spike]
- Parser that survives all of the above: strip the guard → `split('\n')` → `JSON.parse` each line that starts with `{` (skip failures) → walk each document for **every** `search_results_connection` (or any object with both `edges` and `page_info`) → iterate `edges[].node.collated_results[]`. [NAVID-harvest] L53-60, [2S-parser-code] L280-300.

### 2.5 Other GraphQL operations on the Ad Library

| `fb_api_req_friendly_name` | Purpose | Variables (seen) | Result path | doc_id seen |
|---|---|---|---|---|
| `AdLibrarySearchPaginationQuery` | keyword/page search, every page after the SSR batch | §2.3 | `data.ad_library_main.search_results_connection` | §2.3 table |
| `AdLibraryV3AdDetailsQuery` | the "See ad details" panel | `{"adArchiveID","pageID","country","sessionID","source":null,"isAdNonPolitical":true,"isAdNotAAAEligible":false}` | `data.ad_library_main.ad_details.{aaa_info.payer_beneficiary_data[], transparency_by_location.{eu_transparency,uk_transparency,br_transparency}, advertiser.ad_library_page_info.{page_info{ig_username,ig_followers,likes,page_alias,page_category,entity_type},page_verification}}` | `25068828942793558` (2026-10-06 [2S-fixture-details]; "verified 2026-10-22" [MAC-const] L57-60; [TOOLZ] L21) |
| `useAdLibraryTypeaheadSuggestionDataSourceQuery` | advertiser-name autocomplete (name → Page ID) | `{"queryString","country","adType":"ALL","isMobile":false}` | `data.ad_library_main.typeahead_suggestions.page_results[]` (some versions return a list or `typeahead_suggestions_connection.edges`) | `9755915494515334` [MAC-const] L56, [MAC-client-typeahead] L1203-1330 |
| `AdLibraryV3AdCollationDetailsQuery` | expands an "N ads use this creative and text" group (10 per request) | unknown | unknown | **[unverified]**: one source, an Apify listing since retired [PRODIGER] |
| `AdLibraryMobileFocusedStateProviderRefetchQuery` | 2025-era raw first-page fetch (the name you asked about appears only as this `…RefetchQuery`) | adds `audienceTimeframe:"LAST_7_DAYS"`, `country`, `fetchPageInfo`, `fetchSharedDisclaimers` | labelled streamed part → `data.ad_library_main.search_results_connection` | gist, 2025-06 [GIST-comments] |
| *(historic)* `GET/POST /ads/library/async/search_ads/?q=…&countries[0]=US&count=30&session_id=…` | pre-GraphQL endpoint (`for (;;);{"payload":…}`) | — | — | superseded by 2025 [GIST] |

**Ad details matter for competitor research.** They add the advertiser's **Instagram handle and follower count**, exact likes, verification and category. Ads delivered to the EU or UK also get reach, age×gender×country breakdowns and payer/beneficiary. DZ-only ads will have `eu_transparency: null` **[inference]**. 2scraper replayed the captured details request **from inside the page**: 30 of 30 at 1.5 s apart (2026-10-06). athm793 notes that replaying it from a Node request context "gets rejected by Meta". [2S-flow] L85-91, [2S-pw] L60-72, [ATHM-scraper] L196-200.

### 2.6 Field reference (raw shapes, 2026-10)

The key sets below are identical in 2scraper's US fixture (2026-10-05) and **our DZ fixture (2026-11-01)**. [2S-fixture-scroll], [spike].

**`collated_results[]` (one ad):**

| Field | Type / example | Meaning, notes |
|---|---|---|
| `ad_archive_id` | `"925321173274919"` | Library ID. **Dedupe key**: the same ad recurs between the SSR batch and a scroll, and across searches. [2S-parser-doc] L59-61 |
| `ad_id` | `null` | Almost always null. |
| `collation_id`, `collation_count` | `"1022906600523558"`, `2` (or `null`) | The "N ads use this creative and text" group. Count = how many ads share the creative. `null` when not grouped. |
| `is_active` | `true` | |
| `start_date`, `end_date` | epoch **seconds** at **midnight Pacific** (07:00 or 08:00 UTC) | **An active ad's `end_date` is today**, so it is not an end date. Convert with tz `America/Los_Angeles`. [2S-parser-doc] L44-47, L120; [MAC-sample] (start 2026-08-03 07:00Z, end 2026-10-01 07:00Z, captured 2026-10-01) |
| `total_active_time` | seconds or `null` | Prefer it when present. [NAVID-normalize] L149-158 |
| `publisher_platform` | `["FACEBOOK","INSTAGRAM","MESSENGER","AUDIENCE_NETWORK","THREADS"]` | **Singular key**; values also include `WHATSAPP`. |
| `targeted_or_reached_countries` | `[]` | Mostly empty outside EU/political. |
| `categories` | `["UNKNOWN"]`, `["POLITICAL"]` | Meta's ad categories. |
| `contains_digital_created_media` | bool | **AI/digital-media disclosure flag**: useful for AI-creative research. |
| `contains_sensitive_content`, `has_user_reported`, `report_count`, `hide_data_status` (`"NONE"`), `gated_type` (`"ELIGIBLE"`), `is_aaa_eligible`, `menu_items`, `state_media_run_label`, `fev_info` (political contact block), `regional_regulation_data` (`{finserv:{is_deemed_finserv,is_limited_delivery},tw_anti_scam:{is_limited_delivery}}`) | | Transparency and moderation metadata. Keep it raw. [MAC-sample] |
| `impressions_with_index` | `{impressions_text:null, impressions_index:-1}` | Ranges (">1M") only for political/EU. |
| `spend`, `currency`, `reach_estimate` | `null`, `""`, `null` for commercial | Political: `"$200K - $250K"` or `{lower_bound,upper_bound}`, **localized by exit IP**. [2S-parser-doc] L47-50, [TOOLZ] L49-56, [SUKH-const] L44 |
| `page_id`, `page_name`, `page_is_deleted` | | Also duplicated inside `snapshot`. |
| `snapshot` | object | The creative, below. MetaAdsCollector's claim that live rows have "no snapshot wrapper" ([MAC-client-parse] L1181-1190) contradicts both raw fixtures, where creative fields exist **only** inside `snapshot`. Treat `snapshot` as canonical and overlay top-level copies only as a fallback. |

**`snapshot`:**

| Field | Notes |
|---|---|
| `body` | `{text}` (older shape `{markup:{__html}}`). **DPA/DCO: a template** such as `{{product.name}}`, with the rendered copy in `cards[].body`. 352 of 549 ads 2scraper captured (US/DE/worldwide searches) were DPA/DCO. [2S-parser-doc] L52-58, [ATHM-parser] L188-198 |
| `title`, `caption` (display domain, e.g. `nordstromrack.com`), `link_url`, `link_description` | `link_url` may contain Meta URL macros (`utm_campaign={{campaign.name}}`). Keep it as published. In the DOM it is wrapped as `l.facebook.com/l.php?u=` (unwrap). [2S-parser-doc] L55-58, [NAVID-normalize] L60-70 |
| `cta_text` (**localized**, e.g. "Shop now") · `cta_type` (enum) | Seen enums: `SHOP_NOW`, `LEARN_MORE`, `SIGN_UP`, `MESSAGE_PAGE`, `VIEW_INSTAGRAM_PROFILE`, `INSTALL_MOBILE_APP`, `DOWNLOAD`, `DONATE_NOW`, `BOOK_TRAVEL`, `SEE_DETAILS`, `NO_BUTTON` [fixtures]. Expect `WHATSAPP_MESSAGE` for CTWA **[unverified]**. |
| `display_format` | Seen: `IMAGE`, `VIDEO`, `CAROUSEL`, `DPA`, `DCO`, and **`MULTI_IMAGES` (DZ)**. Treat the list as open. [fixtures], [NAVID-normalize] L1-8 |
| `images[]` | `{original_image_url, resized_image_url, watermarked_resized_image_url, image_crops[]}` |
| `videos[]` | `{video_hd_url, video_sd_url, video_preview_image_url, watermarked_video_hd_url, watermarked_video_sd_url}` |
| `cards[]` | `{title, body (plain string!), caption, link_url, link_description, cta_text, cta_type, original_image_url, resized_image_url, watermarked_resized_image_url, image_crops[], video_hd_url, video_sd_url, video_preview_image_url, watermarked_video_hd_url, watermarked_video_sd_url}`. Used by CAROUSEL, DPA, DCO and MULTI_* formats. |
| `extra_images[]`, `extra_videos[]`, `extra_texts[]`, `extra_links[]` | Additional asset variants. **`extra_videos[]` items were seen with `video_hd_handle` / `video_sd_handle` (URL values), not `video_hd_url`.** [MAC-sample] L30. sukhhdipsingh counted **9.7× more media** when reading top level + cards + extras than `snapshot.images` alone. [SUKH-changelog] L50-51 |
| `page_like_count` (**exact**), `page_categories[]`, `page_profile_uri`, `page_profile_picture_url`, `page_name`, `page_id`, `page_is_deleted` | Advertiser facts available without the details call. |
| `byline`, `disclaimer_label` (`"PAID_FOR_BY"` on political), `branded_content`, `is_reshared`, `root_reshared_post`, `event`, `country_iso_code`, `brazil_tax_id`, `additional_info`, `ec_certificates` | Mostly null for DZ commercial. Keep them raw. |

Older field names seen in Apify output and still worth tolerating: `archive_types`, `entity_type`, `is_profile_page`, `political_countries`, `current_page_name`, `page_entity_type`, `page_is_profile_page`, `finserv_ad_data`. [MEMO23]

### 2.7 Semantics that change your numbers

- **Retention:** EU-delivered ads stay one year after their last impression, and political/issue ads seven years [primary, META-TRANSP]. Other (non-EU commercial) ads are visible **only while active** ([PPCLAND], secondary). **Rec.:** crawl the DZ/MA/TN queries daily. "First seen / last seen" history is ours to keep.
- `count` is Meta's estimate, capped at 50,001; DZ "sac" = 1,876 [spike]. Repeated identical searches varied slightly (~2,067–2,070). [2S-testing] L12.
- A search that matches nothing says "No ads match your search criteria" and `count: 0`. That is a valid empty result, not a block. [2S-parser-doc] L40-41, L99.

---

## 3. Open-source scrapers and MCP servers (read 2026-11-01)

Stars are from the GitHub API on 2026-11-01. "Last commit" is the HEAD commit I read.

| Repo | ★ | Last commit | License | Lang | Approach | Verdict |
|---|---|---|---|---|---|---|
| [thenavidm/facebook-ad-library-mcp-cli][NAVID-browser] | 2 | 2026-10-29 | **MIT** | TS, Node ≥22 | MCP + CLI. **Playwright browser backend reads the SSR JSON + GraphQL responses**; shape-based harvesting; backend switch to ScrapeCreators / Apify / official archive | **Closest to our stack; borrow `harvest.ts` + `normalize.ts`** |
| [2scraper/facebook-ads-scraper][2S-parser-doc] | 7 | 2026-10-21 | **MIT** | Python | Playwright / Puppeteer / Selenium; SSR batch + `AdLibrarySearchPaginationQuery` off the wire; page-state triage; details replay in-page; real 2026-10 fixtures; weekly live canary | **Best behavioural truth (timings, 403, loading vs empty vs login)** |
| [promisingcoder/MetaAdsCollector][MAC-const] | 106 | 2026-10-30 | **MIT** | Python | **Browserless** `curl_cffi` (Chrome TLS) → tokens mined from the logged-out **homepage** → raw GraphQL (search, typeahead, details); also ships an MCP server (`mcp/`) | **Protocol reference + raw samples + dated breakage log** |
| [athm793/meta-ads-scraper][ATHM-scraper] | 62 | 2026-08-01 | Apache-2.0 | TS (Next.js) | `playwright-extra` + stealth, headless Chromium; `data-sjs` SSR + GraphQL capture; replays the details signature **in-page**; reactive backoff | Good TS reference. It treats 403 as a block, which conflicts with 2scraper (see §4.3). |
| [simonbalfe/adlib][ADLIB-client] | 3 | 2026-10-31 | **none** | Go | Browserless, `tls-client` browser profiles, homepage bootstrap, 16 parallel slices (status × media × sort direction), rotate on 1675004 | Read-only reference (no license) |
| [sukhhdipsingh/meta-ad-library-scraper][SUKH-const] | 1 | 2026-08-29 | **none** | JS (Node) | Browserless (undici). Solves the `/__rd_verify_…` challenge, `doc_id` self-heal from the JS bundle, refusal taxonomy, resumable cursors (the Apify "sukhdipp" actor) | Read-only. The **measured limits and error taxonomy** are gold. |
| [toolzerhub/facebook-ad-library-scraper][TOOLZ] | 0 | 2026-10-18 | MIT | Python | Browserless `curl_cffi`, minimal form (no `lsd`), 0.5 s between pages | Shows how lax the endpoint can be from a clean residential IP |
| [kyamasam/facebook-ad-library-scraper][KYAM-core] | 1 | 2026-05-12 | MIT | Python | undetected-chromedriver + DOM; **full URL builder** (sort / date / lang) | URL parameter evidence |
| [erenmyeager15/facebook-ad-library-scraper][EREN-repair] | 2 | 2026-10-30 | Apache-2.0 | TS (Apify / Crawlee) | Playwright DOM + embedded JSON; consent handling; detailed repair notes | Media-loss lessons |
| [RamsesAguirre777/facebook-ads-library-mcp][RAMSES] | 282 | 2026-08-29 | MIT | Python | **MCP**; crawl4ai headless → **markdown regex** (lossy: one creative per ad, `l.facebook.com` links) | Popular but lossy. Don't copy the method. |
| [proxy-intell/facebook-ads-library-mcp][PROXY-SC] | 320 | 2026-10-24 | MIT | Python | **MCP** wrapping the paid **ScrapeCreators** API (`api.scrapecreators.com/v1/facebook/adLibrary/...`) | Third-party paid dependency |
| [NiksHacks/meta-ads-library-scraper][NIKS] | 26 | 2025-12-24 | none | JS (Apify) | `page.route('**/graphql')` interception + DOM | Older |
| [NagaYu/AdRadar][NAGA] | 3 | 2026-10-30 | MIT | TS | Playwright DOM text anchors ("Library ID:") | DOM-only |
| [concaptions/meta-ad-library-scraper][CONCAP] | 0 | 2026-06-19 | none | JS | `playwright-extra` stealth; GraphQL response harvester (single-JSON parse, no SSR) | Misses the first 30 |
| [lombazz/meta-ads-scraper][LOMBAZZ] | 1 | 2026-05-12 | MIT | Python | Playwright DOM | — |
| [oliverames/meta-mcp-server][OLIVER] | 66 | 2026-10-29 | MIT | TS | MCP over the official Graph API (1 Ad Library tool) | Official-API only |
| [netty-linux/meta-ad-library-mcp][NETTY] | 0 | 2026-06-28 | none | Python | MCP over official `/ads_archive` (`eu_total_reach` etc.) | Official-API only |
| [at-dan/ad-library-mcp][ATDAN], [thedavidquan01/ad-library-mcp][QUAN] | 1 / 1 | 2026-04 / 05 | MIT / none | TS | MCP over ScrapeCreators (`sort_by: total_impressions \| relevancy_monthly_grouped`) | Paid backend |
| [leyovco/facebook-ads-library-mcp][LEYOVCO] | 0 | 2026-09-07 | MIT | Python | Same description as RamsesAguirre777 (a copy) | — |
| thuykaka gist [GIST] | — | 2025-06-06 (+ 2025-06-27 comment) | none stated | JS/TS | Old `/ads/library/async/search_ads/` + raw GraphQL with two doc_ids | Historical |

Not read: ChrisFeldmeier/fb_ad_scraper (20★, last commit 2025-01-01; the clone failed on network) and domini-67/facebook-ads-library-scraper (29★; a template that needs an external `api_url`).

### 3.1 Key snippets (short excerpts)

**thenavidm — shape-based harvesting, so no hard-coded paths** ([NAVID-harvest] L53-60, L118-133; MIT):

```ts
/** Any object holding both `edges` and `page_info`, at any depth. */
export function findConnections(payload: unknown): Json[] { … if ("edges" in node && "page_info" in node) found.push(node); … }
/** Meta streams some GraphQL responses as newline-delimited JSON objects … */
function* decodeLines(body: string) { for (const line of body.split("\n")) { … yield JSON.parse(trimmed) … } }
… if (node["xfb_ad_library_is_captcha_required"] === true) out.captcha = true;
```

**thenavidm — the browser loop** ([NAVID-browser] L129-186; MIT):

```ts
// Meta answers a headless browser with HTTP 403 on the document but still
// serves the app and every payload. Judge success by ads parsed, never by status.
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
… page.waitForFunction('document.documentElement.innerHTML.includes("ad_archive_id")', null, { timeout: this.hydrateMs })  // 9 s
bodies.push(...inlinePayloads(await page.content()));
… const nextPayload = page.waitForResponse(r => String(r.url()).includes("/api/graphql") && r.status() === 200, { timeout: this.scrollWaitMs }); // 4 s
await page.mouse.wheel(0, 8000); await nextPayload;   // stop after 3 stalls; calls are serialised: "Meta rate-limits hard on parallel pages"
```

**2scraper — page-state triage, strongest signal first** ([2S-parser-code] L334-355; MIT):

```python
def page_state(html, *, final_url=None):
    batches = page_batches(html)
    if any(b.ads for b in batches): return "content"
    if NO_RESULTS_TEXT in (html or "") or any(b.total == 0 for b in batches): return "empty"
    if any(b.total for b in batches): return "parse_error"      # count>0 but no readable ad = schema change
    if path.startswith(("/login","/checkpoint")) or is_login_page(html): return "login"
    if SHELL_MARKER in (html or ""): return "loading"            # "AdLibraryFoundationRoot"
    return "unknown"
```

**2scraper — measured constants** ([2S-flow] L60-91; MIT): `STOP_AFTER_CONSECUTIVE_BLOCKS = 3`, `PAINT_WAIT_S = 25`, `SCROLL_WAIT_S = 2.5`, `STALL_ROUNDS = 3`, `BATCH_SIZE = 10`, `RENDER_WAIT_S = 30`, `RENDERED_MIN_HEIGHT_PX = 1500`, `DETAILS_DELAY_S = 1.5`.

**2scraper — in-page POST for replays** ([2S-pw] L66-71; MIT):

```js
async (data) => { const r = await fetch('/api/graphql/', {method: 'POST', credentials: 'include',
  headers: {'content-type': 'application/x-www-form-urlencoded'}, body: data}); return [r.status, await r.text()]; }
```

**MetaAdsCollector — response parsing and error codes** ([MAC-client-search] L1096-1125, [MAC-client-parse] L1143-1175; MIT):

```python
if text.startswith("for (;;);"): text = text[9:]
… if error_code == 1675004 or "rate limit" in error_msg.lower(): … time.sleep(5 + random.uniform(0, 3))
  if error_code in (1357004, 1357001) or "session" in error_msg.lower(): … refresh session
results = data.get("data",{}).get("ad_library_main",{}).get("search_results_connection",{})
if page_info.get("has_next_page"): next_cursor = page_info.get("end_cursor")
for edge in edges: for ad_data in edge["node"].get("collated_results", []): …
```

**sukhhdipsingh — refusal shapes seen on HTTP 200** ([SUKH-errors] L105-124; no license, quoted for commentary):

```
{"error":1357054,"errorSummary":"Your Request Couldn't be Processed"}
{"errors":[{"code":1675004,"summary":"...","description":"..."}]}
{"error":{"code":1357001,"message":"..."}}
```

It also uses `/persisted query|query with (?:id|hash)|doc_?id|unknown query|not exist/` to mean "stale doc_id" (re-read the bundle) and `/log in|login|checkpoint|not authori[sz]ed|…/` to mean blocked. [SUKH-errors] L156-170.

**simonbalfe/adlib — the complete minimal parser** ([ADLIB-client] L274-306; no license):

```go
body = []byte(strings.TrimPrefix(string(body), "for (;;);"))
// Data.Main.Results = data.ad_library_main.search_results_connection
//   .edges[].node.collated_results (json.RawMessage) · .page_info.{has_next_page,end_cursor}
for _, e := range resp.Errors { if e.Code == 1675004 || strings.Contains(strings.ToLower(e.Message), "rate limit") { return errRateLimited } }
```

### 3.2 What broke, 2025 → 2026

| When | What | Fix used | Source |
|---|---|---|---|
| ≤ 2025-06 | Old `/ads/library/async/search_ads/` flow replaced by GraphQL (`…RefetchQuery` for page 1, `AdLibrarySearchPaginationQuery` with cursor afterwards) | Two doc_ids | [GIST], [GIST-comments] |
| 2026-02-21 | Facebook 403s any HTTP client without a Chrome-like **TLS fingerprint** (`requests` / `httpx` dead) | `curl_cffi impersonate="chrome"` | [MAC-changelog] L110-113 |
| 2026-07-22 | `GET /ads/library/` returns **403 + JS challenge** to non-browser clients. Fabricated `lsd` / `__dyn` / `__csr` produced a **misleading `1675004` "Rate limit exceeded"**. | Bootstrap tokens from the logged-out **homepage**; never fabricate tokens | [MAC-changelog] L94-100, [MAC-const] L45-50 |
| 2026-08-27 | The challenge page itself started answering **HTTP 403** instead of 200 | Solve the `/__rd_verify_*?challenge=N` POST → `rd_challenge` cookie | [SUKH-changelog] L31-37, [MAC-client-challenge] L586-672, [SUKH-docid] L105-117 |
| 2026-08-29 | `doc_id` rotation. The self-heal failed because the shell re-read lacked navigation headers (HTTP 400) and the id sat in the 5th bundle | Byte-budgeted bundle scan; persist the found id | [SUKH-changelog] L13-26 |
| 2026-09-03 | One constant `sessionID` across runs and IPs → refusals. Rate limit = **HTTP 200** `{"errors":[{"code":1675004,"summary":"Rate limit exceeded"}]}` | Per-session `sessionID`; retry the same cursor on new exits at 5 / 10 / 15 / 20 s | [SUKH-apify] 1.0.5–1.0.6 |
| 2026-10-05 | Live Playwright: document **403 with full page**; data before list drawn → scrolling too early "stalled at 30" | Wait for render (height > 1500 px or growth) | [2S-parser-doc], [2S-flow] L76-84, [2S-testing] L44 |
| 2026-10-05/06 | DOM scrapers lost video URLs when media was blocked (the player error handler swapped the video for an image) | DOM media observer | [EREN-repair] |
| 2026-10-20 | **One scroll can bring two batches** (100 ads in 8 batches over 5 scrolls) | Count batches, not scrolls | [2S-changelog] L65 |

---

## 4. Recommended approach for us

**Rec. Browser-first: `playwright-core` + system Chrome (`channel: 'chrome'`), logged out, one page at a time. Read the SSR blob plus the `AdLibrarySearchPaginationQuery` responses the page itself makes, scroll to paginate, and download media in the same run.** This is the existing `lib/collector/adlib-web.mjs` design, which is the right one. §6.8 lists the gaps.

Why not browserless in Node:
- Every browserless repo needs Chrome-TLS impersonation (`curl_cffi`, `tls-client`). Node's undici TLS fingerprint is not Chrome's, so it is exposed to the 2026-02 TLS gate. **[inference from MAC-changelog]**
- Browserless also means a challenge solver, `lsd` mining and `doc_id` self-heal, the three things that broke in 2026.

A browser gets all three for free.

### 4.1 Launch

- `chromium.launch({ channel: 'chrome', headless: true })` drives the installed Google Chrome. Playwright never installs branded Chrome itself, and branded Chrome uses Chrome's "new headless" implementation, which differs from Playwright's default headless shell. [PW-BROWSERS] (`playwright-core` not downloading browsers on install is known package behaviour; I didn't re-verify it here.)
- Headless Chrome advertises `HeadlessChrome` in the UA. Override `userAgent` with the real version, as `adlib-web.mjs` already does.
- athm793 adds `--disable-blink-features=AutomationControlled` plus stealth; thenavidm and 2scraper run plain Playwright and still get data. [ATHM-browser] L50-64, [NAVID-browser] L66-90.
- **Rec.:** stay plain. If captcha or refusals appear, switch to `headless: false` with an off-screen window and a dedicated **logged-out** persistent profile (`launchPersistentContext('data/chrome-profile', {channel:'chrome'})`) before trying anything else.

### 4.2 Logged-out vs login, consent

- **Logged-out is enough.** The library asked for no login across 46 page loads per hour from one residential IP. The rest of facebook.com puts a login dialog over pages, but `/ads/library/` does not. [2S-parser-doc] L13-16, [2S-testing] L14
- MetaAdsCollector's whole flow is logged-out. [MAC-changelog] L98
- **Do not log in. Never use cookies from any account that runs SIRINE's ads.** It adds nothing to the data and ties scraping signals to the accounts we can least afford to have checkpointed (see CLAUDE.md: account loss is the #1 enemy). **Rec.**
- **Consent dialog:** EU visitors, and possibly others, get a cookie banner. Click the first visible one of:
  - `[data-testid="cookie-policy-manage-dialog-accept-button"]`
  - `button[data-cookiebanner="accept_button"]`
  - `button:has-text("Allow all cookies")`
  - `button:has-text("Decline optional cookies")`
  - `button:has-text("Only allow essential cookies")`
  - `button:has-text("Accept All")`

  Matching on text is brittle, so this is best effort. [EREN-nav] L5-10, [ATHM-scraper] L71-89, [CONCAP] L168-185.
- Some proxy pools are served the login page under the requested address. Detect it from `<link rel="canonical" href="https://…facebook.com/login…">`. [2S-parser-code] L321-331

### 4.3 What a block looks like (and what does not)

| Signal | Meaning | Action | Source |
|---|---|---|---|
| Document HTTP **403** + Ad Library shell / data | **Normal** for automated browsers | Ignore the status; judge by content | [2S-parser-doc] L17-22, [RAMSES] L36-38, [NAVID-browser] L129-131 |
| Shell (`AdLibraryFoundationRoot`), no data yet | Loading / streamed late | Poll ≤25 s | [2S-flow] L66-69 |
| `count > 0`, no readable ad | **Schema change** | Alert; don't retry-loop | [2S-parser-code] L340-345 |
| "No ads match your search criteria" / `count: 0` | Empty answer | Record as empty | [2S-parser-doc] L40-41 |
| `"xfb_ad_library_is_captcha_required":true` | Captcha | Stop the session; cool down ≥30 min | [NAVID-harvest] L152, [spike] |
| URL `/login`, `/checkpoint`, canonical → login | Login wall | Stop | [2S-parser-code] L327-352 |
| Body with `/__rd_verify_…?challenge=N` | JS challenge (non-browser) | A real browser auto-solves and reloads, destroying the execution context; wait for the navigation | [MAC-client-challenge], [NAVID-browser] L140-147 |
| GraphQL 200 + `errors[].code 1675004` | IP rate limit | Back off; don't advance the cursor | [SUKH-apify], [ADLIB-client] L301 |
| GraphQL 200 + `1357054` / `1357004` / `1357001` | Refusal / session | New context; if it repeats, stop | [SUKH-const] L34, [MAC-client-search] L1121 |
| Message "Query with id … does not exist" | Stale `doc_id` (replay mode only) | Re-capture from a real scroll | [SUKH-errors] L156-165 |
| `has_next_page:true` but 0 edges, or a repeated `end_cursor` | Pagination dead end | Stop | [SUKH-web] L231-260 |
| "You're Temporarily Blocked" | Hard block | Stop for hours | existing `parse.mjs` |

### 4.4 Scroll pagination behaviour

- The first paint holds the embedded batch (≤30; about 20–26 cards drawn). Then **10 ads per GraphQL batch**, and one scroll can trigger 1–2 batches. [2S-parser-doc] L23-32, [RAMSES] L39, [2S-changelog] L65, [spike]
- Measured throughput (Playwright, one residential IP, no proxy, 2026-10-05): **80 ads / 7 scrolls / 22 s** and **500 ads / 58 scrolls / 2.5 min**, no stall. [2S-testing] L8-9
- Proxy traffic for a 100-ad search with media blocked: **13.5 MB**. Relevant only if we ever use a metered proxy. [2S-changelog] L58

### 4.5 Pacing (single residential IP, no proxy)

| Knob | Rec. value | Evidence |
|---|---|---|
| Concurrency | **1 page at a time** (one browser, a new context per search) | "Meta rate-limits hard on parallel pages" [NAVID-browser] L55 |
| Scroll cadence | wait for the next batch (≤8 s), then 2.5–5 s jitter | [2S-flow] L71-73; [ATHM-scraper] `randomDelay(2500,4000)`; [NAVID-browser] 4 s |
| Ads per search | ≤300–500 (≈30–50 batches) | 500 measured OK [2S-testing] L9 |
| Between searches | **20–45 s** jitter; **≤30 page loads/hour** | 46/h measured OK [2S-testing] L14; leaves margin. The current config's 6–12 s is too aggressive. |
| Details enrichment | in-page replay, ≥1.5–2 s apart, only for shortlisted ads | 30/30 at 1.5 s [2S-flow] L85-91 |
| First refusal / 1675004 | stop the search; cool 60 s → 120 s → 240 s; after 3 in a row **stop the run** | [2S-flow] L61-64; [ATHM-rate] L30-31 (2 s → 60 s cap) |
| Raw-HTTP ceiling (reference only) | ~47 requests/IP → block > 25 min | [SUKH-const] L28-30 |
| Network hygiene | Prefer **not** to crawl from the same IP/device used to log into Business Manager / Ads Manager **[inference: Meta risk systems use IP and device signals]** | Rec. |

### 4.6 Legal / ToS

Meta's Automated Data Collection Terms (dated 2024-10-07 per secondary sources) bar automated collection without express permission, even of public data. Meta has litigated scraping (BrandTotal). [META-SCRAPE-TOS] (not opened), [MEITAR]

**Rec.:** internal competitive research only, low volume, no resale or redistribution of creatives, and no circumvention beyond what a normal logged-out browser does.

---

## 5. Official API `/ads_archive` (for completeness)

**Endpoint:** `GET https://graph.facebook.com/<version>/ads_archive`. The reference shows **v26.0** as current; `config/meta.json` pins v25.0, and the endpoint exists in both. Read-only; no create, update or delete. [primary, META-ARCHIVE]

**Coverage:**
- "Ads that did not reach any EU location are returned only if they concern social issues, elections, or politics", so for DZ, MA or TN commercial ads it returns nothing. [META-ARCHIVE]
- EU ads are kept 1 year after the last impression; political ads 7 years. [META-TRANSP]
- Access needs an app and token, plus identity and location confirmation (facebook.com/ID), per secondary guides. [ADSUPLOADER], [META-ADLIBAPI] (403 to fetchers)

**Parameters** [primary, META-ARCHIVE]:

| Param | Values |
|---|---|
| `ad_reached_countries` (**required**) | `["FR"]` … or `ALL` |
| `ad_active_status` | `ACTIVE` (default) · `INACTIVE` · `ALL` |
| `ad_type` | `ALL` · `EMPLOYMENT_ADS` · `FINANCIAL_PRODUCTS_AND_SERVICES_ADS` (replaces `CREDIT_ADS`) · `HOUSING_ADS` · `POLITICAL_AND_ISSUE_ADS` |
| `search_terms` | ≤100 chars. **A space = AND**; not translated. |
| `search_type` | `KEYWORD_UNORDERED` (default) · `KEYWORD_EXACT_PHRASE` (comma-separated phrases) |
| `search_page_ids` | ≤10 Page IDs |
| `ad_delivery_date_min` / `_max` | `YYYY-mm-dd` |
| `languages` | ISO 639-1 (+ `CMN`, `YUE`) |
| `media_type` | `ALL` · `IMAGE` · `MEME` · `VIDEO` · `NONE` |
| `publisher_platforms` | `FACEBOOK` · `INSTAGRAM` · `AUDIENCE_NETWORK` · `MESSENGER` · `WHATSAPP` · `OCULUS` · `THREADS` · `STREAMING_SERVICES` |
| `bylines`, `delivery_by_region`, `estimated_audience_size_min` / `_max` | political only |
| `unmask_removed_content` | bool |
| standard Graph paging | `limit`, `after` / `paging.next`; empty `data` = end |

Errors: `613` rate limit, `100` invalid param, `2500` parse error, `1009` validation, `190` bad token. [META-ARCHIVE]

**Fields** (`fields=` on the ArchivedAd node) [primary, META-ARCHIVEDAD]:

| Field | Availability |
|---|---|
| `id`, `ad_creation_time`, `ad_creative_bodies`, `ad_creative_link_captions`, `ad_creative_link_descriptions`, `ad_creative_link_titles`, `ad_delivery_start_time`*, `ad_delivery_stop_time`*, `ad_snapshot_url`*, `languages`, `page_id`*, `page_name`, `publisher_platforms` | all ads (* = returned by default) |
| `age_country_gender_reach_breakdown`, `target_ages`, `target_gender`, `target_locations` | UK & EU ads; political ads delivered to Brazil |
| `beneficiary_payers`, `eu_total_reach` | EU ads |
| `total_reach_by_location` | EU / BR / UK |
| `br_total_reach` | political ads delivered to Brazil |
| `bylines`, `currency`, `delivery_by_region`, `demographic_distribution`, `estimated_audience_size`, `impressions`, `spend` | political / issue only (ranges) |

`ad_snapshot_url` renders the ad with **your access token appended**. Treat it like a secret: never log it or share it. [ZERNIO]

Example (EU research on French competitors):

```
GET https://graph.facebook.com/v25.0/ads_archive?ad_reached_countries=["FR"]&ad_active_status=ACTIVE&ad_type=ALL
    &search_terms="sac femme"&search_type=KEYWORD_EXACT_PHRASE&languages=["fr"]&limit=100
    &fields=id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_creative_bodies,ad_creative_link_titles,
            ad_snapshot_url,publisher_platforms,eu_total_reach,age_country_gender_reach_breakdown,target_ages,target_gender,target_locations
    &access_token=…
```

---

## 6. Implementation spec

### 6.1 Exact JSON paths

| What | Path |
|---|---|
| SSR blob | `<script type="application/json" [data-content-len=N] data-sjs>` → JSON → **recursive find** of key `search_results_connection`. Today it sits at `…__bbox.result.data.ad_library_main.search_results_connection`, sibling of `…__bbox.result.data.xfb_ad_library_is_captcha_required`. |
| GraphQL page | for each line of the body (guard stripped): `data.ad_library_main.search_results_connection` (recursive find tolerates labelled parts) |
| Ads | `search_results_connection.edges[].node.collated_results[]` (iterate all; usually 1 per edge; `node.__typename` present; `edges[].cursor` exists) |
| Paging | `search_results_connection.page_info.end_cursor` (string) · `.page_info.has_next_page` (bool) |
| Total | `search_results_connection.count` (SSR batch; capped at 50,001) |
| Captcha | `…data.xfb_ad_library_is_captcha_required === true` (anywhere) |
| Errors | top-level `errors[].code` / `.summary` / `.message`; also `error` (number or object) + `errorSummary` |
| Details | `data.ad_library_main.ad_details.{aaa_info, transparency_by_location, advertiser.ad_library_page_info}` |
| Typeahead | `data.ad_library_main.typeahead_suggestions.page_results[]` |

### 6.2 Normalized records (field ← source)

`r` = one `collated_results[]` item, `s` = `r.snapshot`. Always also store `raw = r` (lossless, as JSON) so new fields can be re-derived later; MetaAdsCollector shipped this as "lossless `api_fields`" [MAC-changelog] 1.5.0.

**`ad`**

| Field | ← Source | Notes |
|---|---|---|
| `ad_archive_id` (PK) | `r.ad_archive_id` | string |
| `collation_id`, `collation_count` | `r.collation_id`, `r.collation_count` | null when ungrouped |
| `page_id`, `page_name` | `r.page_id ?? s.page_id`, `r.page_name ?? s.page_name` | |
| `is_active` | `r.is_active` | |
| `start_ts`, `start_day_pt` | `r.start_date`; date in `America/Los_Angeles` | |
| `end_ts`, `end_day_pt` | `r.end_date`; **null when `is_active`** | the active `end_date` is today |
| `active_seconds` | `r.total_active_time` | may be null |
| `first_seen_at`, `last_seen_at`, `seen_count` | ours | the only history for non-EU ads |
| `platforms[]` | `r.publisher_platform[]` | singular key |
| `reached_countries[]` | `r.targeted_or_reached_countries[]` | |
| `categories[]` | `r.categories[]` | |
| `ai_media` | `r.contains_digital_created_media` | |
| `sensitive` | `r.contains_sensitive_content` | |
| `impressions_text`, `impressions_index` | `r.impressions_with_index.*` | |
| `spend_raw`, `currency`, `reach_raw` | `r.spend`, `r.currency`, `r.reach_estimate` | localized; keep raw |
| `display_format` | `s.display_format` | open enum |
| `body` | `s.body.text` unless templated → first `s.cards[i].body` (string) that isn't templated | `/\{\{[^}]*\}\}/` [2S-parser-code] L117 |
| `body_template` | the templated `s.body.text`, if any | DPA/DCO marker |
| `title` | `s.title` (same template rule → `cards[i].title`) | |
| `caption` (display domain), `link_url`, `link_domain`, `link_description` | `s.caption`, `s.link_url` (fallback `cards[0].link_url`; unwrap `l.facebook.com/l.php?u=`), host of `link_url` | |
| `cta_type` (enum), `cta_text` (localized) | `s.cta_type`, `s.cta_text` | key on `cta_type` |
| `extra_texts[]`, `extra_links[]` | `s.extra_texts[]`, `s.extra_links[]` | |
| `byline`, `disclaimer_label` | `s.byline`, `s.disclaimer_label` | |
| `cards[]` | `s.cards[i].{title, body, caption, link_url, link_description, cta_type, cta_text}` + media refs | |
| `lang` | detect on `body` + `title` (ar / ar-DZ / fr / en) | ours |
| provenance | `query`, `country`, `search_type`, `sort`, `source` (`ssr` \| `graphql`), `batch_no`, `rank`, `reported_total`, `crawled_at` | rank = position within the search |

**`page`**

| Field | ← Source |
|---|---|
| `page_id` (PK) | `r.page_id` |
| `page_name` | `s.page_name` |
| `like_count` (exact) | `s.page_like_count` |
| `categories[]` | `s.page_categories[]` |
| `profile_uri` | `s.page_profile_uri` |
| `picture_url` | `s.page_profile_picture_url` (expires) |
| `is_deleted` | `r.page_is_deleted` |
| *(details, optional)* `ig_username`, `ig_followers`, `verification`, `alias`, `entity_type` | `ad_details.advertiser.ad_library_page_info.{page_info.*, page_verification}` |

**`media`** (one row per asset; download at crawl time)

| Field | ← Source |
|---|---|
| `ad_archive_id`, `role`, `idx` | role ∈ `image`, `video`, `video_preview`, `card_image`, `card_video`, `card_preview`, `extra_image`, `extra_video` |
| `url` | images: `original_image_url ?? resized_image_url ?? watermarked_resized_image_url`; videos: `video_hd_url ?? video_sd_url`; **extra_videos: `video_hd_url ?? video_hd_handle ?? video_sd_url ?? video_sd_handle`**; previews: `video_preview_image_url` |
| `alt_url` | SD variant / resized image |
| `expires_at` | `parseInt(new URL(url).searchParams.get('oe'), 16)` → epoch seconds [SO-OE]; a 2026-10-01 sample: `oe=6AC3FCD7` → 2026-10-05T19:39Z |
| `sha256`, `bytes`, `content_type`, `local_path`, `status` | download result (`expired` on 403/410) |

**`crawl`**

| Field | ← Source |
|---|---|
| `url`, `params` | our input |
| `reported_total` | SSR `count` |
| `ads_read`, `new_ads`, `batches`, `scrolls`, `duration_ms` | ours |
| `stop_reason` | `limit`, `end`, `stalled`, `empty`, `captcha`, `login`, `rate_limited`, `refused`, `parse_error`, `not_painted`, `nav_error` |

### 6.3 Pagination algorithm (browser)

```js
// One search = one fresh context/page; responses are captured BEFORE goto.
const isSearchReq = (req) => req.method() === 'POST' && req.url().includes('/api/graphql') &&
  (req.headers()['x-fb-friendly-name'] === 'AdLibrarySearchPaginationQuery' ||
   new URLSearchParams(req.postData() || '').get('fb_api_req_friendly_name') === 'AdLibrarySearchPaginationQuery');

page.on('response', async (res) => {
  if (!isSearchReq(res.request())) return;
  const docs = parseFbBody(await res.text().catch(() => ''));   // strip "for (;;);", split \n, JSON.parse each "{…"
  const err = firstMetaError(docs);                             // errors[].code / error / errorSummary
  if (err) return signal(err);                                  // 1675004 → rate_limited; 13570xx → refused
  for (const conn of findAll(docs, 'search_results_connection')) ingest(conn, 'graphql');
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });   // status 403 is fine
await clickConsentIfAny(page);
// 1) PAINT: poll ≤25 s, every 1 s, until classify(html) ∈ {content, empty, captcha, login, parse_error}
// 2) ingest(findAll(sjsBlocks(await page.content()), 'search_results_connection'), 'ssr')  // ≤30 + count + page_info
// 3) RENDER: wait ≤30 s until document.scrollingElement.scrollHeight > 1500 or it grows
// 4) LOOP while ads < max && hasNext !== false && stalls < 3 && batches < maxBatches:
//      const next = page.waitForResponse(r => isSearchReq(r.request()), { timeout: 8000 }).catch(() => null);
//      await page.mouse.wheel(0, 6000 + rand(3000));   // or scrollTo(bottom)
//      await next; await sleep(jitter(2500, 5000));
//      stall = (no new ad_archive_id AND scrollHeight unchanged) ? stall + 1 : 0
//      stop on: repeated end_cursor | hasNext true but 0 edges | captcha flag in a later content() | error signal
// 5) finally: page.off(...); context.close(); persist; download media (separate queue)
```

- **Dedupe** on `ad_archive_id` per search *and* globally, keeping the first occurrence for rank. Overlap between SSR and GraphQL is expected. [2S-parser-doc] L59-61
- **Optional in-page replay** for details or collation pages:
  1. Capture one real request's `postData()` (the page's own `doc_id` and tokens).
  2. Swap only `variables` (`adArchiveID` / `pageID`, or `cursor`).
  3. POST it with `page.evaluate(fetch('/api/graphql/', {credentials:'include', …}))`.

  Never replay from Node's own `fetch`. [2S-pw], [ATHM-scraper] L196-200
- **Multi-country / multi-keyword:** one URL per (keyword × country). The UI sends a single country. Queue the searches and apply §4.5 pacing between them.

### 6.4 Error / blocked detection (classifier order)

1. HTML has `"xfb_ad_library_is_captcha_required":true` → `captcha` (stop run).
2. Final URL path `/login` or `/checkpoint`, or canonical → login → `login` (stop run).
3. SSR connection with ads → `content`.
4. "No ads match your search criteria" or `count === 0` → `empty`.
5. `count > 0` but 0 parseable ads → `parse_error` (alert; save the HTML as a fixture).
6. Shell marker `AdLibraryFoundationRoot` and no data → `loading` (keep polling to 25 s, then `not_painted`, retry once later).
7. Anything else → `unknown` (save the HTML; count toward the 3-strikes stop).
8. GraphQL bodies:
   - `errors[].code === 1675004` or `/rate limit/i` → `rate_limited`
   - `1357054 / 1357004 / 1357001` → `refused`
   - "Query with id … does not exist" → `stale_query` (replay mode only)
   - `data` absent and no error → `schema_changed`

   Never treat a data-less 200 as "end of results". [SUKH-errors], [SUKH-apify] 1.0.2

Three consecutive non-content outcomes (`captcha`, `login`, `rate_limited`, `refused`, `unknown`) → stop the whole run and cool down ≥30 min. [2S-flow] L61-64

### 6.5 Pacing budget (defaults to put in `config/lab.json → spy`)

```json
{ "first_wait_ms": [1000, 25000], "render_wait_ms": 30000, "scroll_wait_ms": [2500, 5000], "batch_timeout_ms": 8000,
  "stall_scrolls": 3, "max_results": 300, "between_queries_ms": [20000, 45000], "max_searches_per_hour": 30,
  "details_delay_ms": [1500, 2500], "cooldown_ms": [60000, 120000, 240000], "stop_after_consecutive_blocks": 3 }
```

### 6.6 Media download

- Download in the same run; fbcdn signatures last days. Use plain Node `fetch` with a desktop UA (the repos download without cookies; for example the MCP uses `requests.get(media_url)`). [PROXY-SC], [SUKH-media] L1-16
- **403 / 410 = expired**, so don't retry. Re-crawl the ad (`search_type=page&view_all_page_id=<page_id>`) to get fresh signed URLs instead of giving up. **Rec.**
- On network failure of a regional edge (`scontent.fxxx-1.fna.fbcdn.net`), retry the same path on `scontent.xx.fbcdn.net` (images) or `video.xx.fbcdn.net` (video). [MAC-media] L73-95
- At minimum download every `video_preview_image_url` and first image for all ads; full video only for the scored top N.

### 6.7 Fixtures and checks

- Keep trimmed real fixtures, already present in `tests/fixtures/adlib-first-page.html` and `adlib-graphql-page.txt`. Add to them:
  - a **no-results** page
  - a **captcha=true** page
  - a **DPA/DCO** ad with a templated body
  - a **CAROUSEL** with card videos
  - an **`extra_videos` `*_handle`** sample
  - an **HTTP-200 `errors:[{code:1675004}]`** body
- 2scraper's fixtures are MIT and can be copied as cross-checks. [2S-fixture-search], [2S-fixture-scroll]
- **Live canary** (weekly, as 2scraper does): one fixed DZ query must return ≥30 ads with `count > 0`, at least one `graphql` batch, and ≥1 downloaded media. A red canary means "Meta changed something", not "no ads". [2S-changelog] L59-70

### 6.8 Gaps in the current `creative-lab/lib/collector/*` (read-only review)

1. **GraphQL error bodies are silently dropped.** `onResponse` ignores bodies without `search_results_connection` (`adlib-web.mjs`), so an HTTP-200 `1675004` becomes a "stall" and looks like the end of results. Parse `errors` and set `rate_limited` / `refused` (§6.4).
2. **The paint wait is a fixed 5 s.** Broad searches can stream the SSR batch later (2scraper: still missing at 6 s on 3 of 13 searches). Poll up to 25 s for content / empty / captcha before reading. [2S-flow] L66-69
3. **There is no render wait before scrolling.** The data can arrive before the list is drawn; scrolling then hits a blank page and stalls at 30. Wait for `scrollHeight > 1500` or growth (≤30 s). [2S-flow] L76-84
4. **The stall test uses ad count only.** Add page-height growth, repeated `end_cursor` and `hasNext && 0 edges`. Use `page.waitForResponse` for the next batch instead of a fixed pause (one scroll can bring two batches).
5. **There is no consent-dialog click** (§4.2 selectors).
6. **The empty state isn't recognised.** Add `"No ads match your search criteria"` / `count === 0` → `empty`, and shell-only → `loading`.
7. **`normalize.mjs` keeps templated DPA/DCO top-level text.** `bodyText(s.body)` wins even when it is `{{product.name}}`. Prefer the first non-templated `cards[i].body` / `title`. [2S-parser-code] L117, L430-445
8. **`extra_videos` are missed when Meta sends `video_hd_handle` / `video_sd_handle`.** Read both spellings. [MAC-sample] L30
9. **Persisting is lossy.** Only `snapshot` is stored, so top-level `impressions_with_index`, `categories`, `targeted_or_reached_countries`, `total_active_time`, `regional_regulation_data` and `gated_type` are lost. Store the whole `r` as `raw_json`.
10. **`end_date` for active ads is "today".** Don't compute longevity as `end_date − start_date` without `is_active`; use `total_active_time`, or crawl date − `start_date`.
11. **`between_queries_ms: [6000, 12000]` is faster than any measured-safe rate.** Use 20–45 s and ≤30 searches per hour.
12. **Media:** add the generic-host fallback. On 403, re-crawl the page for fresh URLs; don't mark the asset as permanently lost.
13. **`keyword_unordered` is an any-word match.** Use `keyword_exact_phrase` for the multi-word niche terms in `config/niche-sirine.json`; otherwise relevance scoring must filter the noise.

---

## 7. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Meta changes the page or payload** (new wrapper, renamed key, new challenge). It broke four times in 2026 for browserless tools. | High (every few weeks for raw-HTTP; lower for browser-read) | Recursive key search, `parse_error` alarm, fixtures, weekly live canary, raw JSON stored |
| 2 | **IP-level throttling or captcha** on our single residential IP | Medium | §4.5 pacing, 3-strikes stop, cool-downs, no parallel pages. Keep the crawler off the Business Manager login IP or device if feasible. |
| 3 | **Account-safety spill-over** if anyone "helps" by logging in or using cookies | Low (if forbidden) / impact very high | Hard rule: logged-out only, dedicated profile dir, never import cookies |
| 4 | **Incomplete or misleading data**: any-word matching; country default; `count` cap; collation groups hiding variants; active `end_date` = today; localized strings; ads disappearing when inactive | High | Exact-phrase for multi-word terms, explicit `country`, keep `collation_count`, `first_seen` / `last_seen` history, daily crawl, key on enums |
| 5 | **Media URL expiry** (days) | High | Download in the same run; re-crawl to refresh; generic-host fallback |
| 6 | **Headless detection tightening** (document 403 today; full block tomorrow) | Medium | Fallback to headful plus a persistent logged-out profile; then a residential exit |
| 7 | **ToS / legal** (Automated Data Collection Terms) | Low practical, non-zero | Internal research only, low volume, no redistribution |
| 8 | **Single-source facts** (`AdLibraryV3AdCollationDetailsQuery`; meaning of `is_targeted_country`; non-EU impression sort; `IMAGE_AND_MEME`) | — | Tagged [unverified] above; verify in the first live session before depending on them |

---

## 8. Sources

**Meta (primary):**
- [ads_archive reference][META-ARCHIVE]
- [ArchivedAd node][META-ARCHIVEDAD]
- [Ad Library API landing][META-ADLIBAPI] (403 to fetchers)
- [Ad Library tools / retention][META-TRANSP]
- [Automated Data Collection Terms][META-SCRAPE-TOS] (not opened)

**Repos (pinned commits):** listed below as reference links.

**Vendors and articles:**
- [sukhdipp Apify changelog][SUKH-apify]
- [memo23 Apify actor][MEMO23]
- [prodiger v2 (retired)][PRODIGER]
- [dev.to 2026 write-up][DEVTO]
- [ppc.land Ad Library][PPCLAND]
- [Meitar — scraping cases][MEITAR]
- [Zernio Ad Library docs][ZERNIO]
- [AdsUploader API guide][ADSUPLOADER]
- [Playwright browsers][PW-BROWSERS]
- [oe= expiry (SO mirror)][SO-OE]

**Local:** [`creative-lab/PROGRESS.md`][LOCAL-PROGRESS], `creative-lab/tests/fixtures/*`.

[LOCAL-PROGRESS]: ../PROGRESS.md
[META-ARCHIVE]: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
[META-ARCHIVEDAD]: https://developers.facebook.com/docs/marketing-api/reference/archived-ad/
[META-ADLIBAPI]: https://www.facebook.com/ads/library/api/
[META-TRANSP]: https://transparency.meta.com/researchtools/ad-library-tools/
[META-SCRAPE-TOS]: https://www.facebook.com/apps/site_scraping_tos_terms.php
[PW-BROWSERS]: https://playwright.dev/docs/browsers
[SO-OE]: https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/24656524/facebook-photo-get-parameters-and-photo-available-for-how-long
[PPCLAND]: https://ppc.land/ads-library/
[MEITAR]: https://meitar.com/media/taking-a-swipe-at-scraping-practical-takeaways-from-hiq-v-linkedin-and-meta-v-brandtotal/
[ZERNIO]: https://docs.zernio.com/platforms/meta-ads/ad-library
[ADSUPLOADER]: https://adsuploader.com/blog/facebook-ad-library-api
[DEVTO]: https://dev.to/anasbuilds997/scraping-the-meta-ad-library-in-2026-cursors-one-shot-browsers-and-011-per-1000-ads-50pd
[MEMO23]: https://apify.com/memo23/facebook-ads-library-scraper-cheerio.md
[PRODIGER]: https://apify.com/prodiger/facebook-ads-library-scraper-v2
[SUKH-apify]: https://apify.com/sukhdipp/meta-ad-library-scraper/changelog.md
[GIST]: https://gist.github.com/thuykaka/d3df57f14042a7d5786047f3e976841d
[GIST-comments]: https://api.github.com/gists/d3df57f14042a7d5786047f3e976841d/comments
[MAC-const]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/meta_ads_collector/constants.py#L23-L139
[MAC-client-challenge]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/meta_ads_collector/client.py#L586-L672
[MAC-client-payload]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/meta_ads_collector/client.py#L877-L960
[MAC-client-search]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/meta_ads_collector/client.py#L964-L1141
[MAC-client-parse]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/meta_ads_collector/client.py#L1143-L1201
[MAC-client-typeahead]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/meta_ads_collector/client.py#L1203-L1340
[MAC-changelog]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/CHANGELOG.md#L58-L113
[MAC-sample]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/tests/meta_full_sample.py
[MAC-media]: https://github.com/promisingcoder/MetaAdsCollector/blob/46cb2215756b128ff64f2f59f7df5499c5214f57/meta_ads_collector/media.py#L73-L95
[2S-parser-doc]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/ad_parser.py#L1-L202
[2S-parser-code]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/ad_parser.py#L117-L445
[2S-flow]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/page_flow.py#L1-L95
[2S-pw]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/playwright_scraper.py#L1-L72
[2S-testing]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/TESTING.md#L1-L44
[2S-testing-anyword]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/TESTING.md#L148-L150
[2S-changelog]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/CHANGELOG.md#L56-L70
[2S-fixture-scroll]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/tests/fixtures/fb_ads_scroll_nike_us_20261005.txt
[2S-fixture-search]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/tests/fixtures/fb_ads_search_nike_us_20261005.html
[2S-fixture-details]: https://github.com/2scraper/facebook-ads-scraper/blob/0f3c0df0bb5c282b0827430886a7e36bda9a8374/tests/fixtures/fb_ads_details_form_20261006.txt
[ADLIB-client]: https://github.com/simonbalfe/adlib/blob/c4ebe5ab9afc1d9f8be903ab68610d7d13034f20/client.go
[ADLIB-readme]: https://github.com/simonbalfe/adlib/blob/c4ebe5ab9afc1d9f8be903ab68610d7d13034f20/README.md
[SUKH-const]: https://github.com/sukhhdipsingh/meta-ad-library-scraper/blob/920598331eb3674b6b166ade6a9208b3ff9e9759/src/constants.js
[SUKH-docid]: https://github.com/sukhhdipsingh/meta-ad-library-scraper/blob/920598331eb3674b6b166ade6a9208b3ff9e9759/src/docid.js
[SUKH-errors]: https://github.com/sukhhdipsingh/meta-ad-library-scraper/blob/920598331eb3674b6b166ade6a9208b3ff9e9759/src/errors.js#L105-L170
[SUKH-web]: https://github.com/sukhhdipsingh/meta-ad-library-scraper/blob/920598331eb3674b6b166ade6a9208b3ff9e9759/src/sources/weblibrary.js#L120-L290
[SUKH-media]: https://github.com/sukhhdipsingh/meta-ad-library-scraper/blob/920598331eb3674b6b166ade6a9208b3ff9e9759/src/media.js#L1-L16
[SUKH-changelog]: https://github.com/sukhhdipsingh/meta-ad-library-scraper/blob/920598331eb3674b6b166ade6a9208b3ff9e9759/CHANGELOG.md
[NAVID-harvest]: https://github.com/thenavidm/facebook-ad-library-mcp-cli/blob/1739c09f171fe192402a0bbdd2f0948c8485e852/src/adlibrary/harvest.ts
[NAVID-browser]: https://github.com/thenavidm/facebook-ad-library-mcp-cli/blob/1739c09f171fe192402a0bbdd2f0948c8485e852/src/backends/browser.ts
[NAVID-normalize]: https://github.com/thenavidm/facebook-ad-library-mcp-cli/blob/1739c09f171fe192402a0bbdd2f0948c8485e852/src/adlibrary/normalize.ts
[ATHM-scraper]: https://github.com/athm793/meta-ads-scraper/blob/737feeed5e86b9821dcf57129668a72b38876ca9/src/lib/scraper.ts
[ATHM-rate]: https://github.com/athm793/meta-ads-scraper/blob/737feeed5e86b9821dcf57129668a72b38876ca9/src/lib/rateLimiter.ts#L1-L140
[ATHM-browser]: https://github.com/athm793/meta-ads-scraper/blob/737feeed5e86b9821dcf57129668a72b38876ca9/src/lib/browser.ts
[ATHM-parser]: https://github.com/athm793/meta-ads-scraper/blob/737feeed5e86b9821dcf57129668a72b38876ca9/src/lib/parser.ts
[ATHM-url]: https://github.com/athm793/meta-ads-scraper/blob/737feeed5e86b9821dcf57129668a72b38876ca9/src/lib/adLibraryUrl.ts
[TOOLZ]: https://github.com/toolzerhub/facebook-ad-library-scraper/blob/1f4fda39f444e2d68f849d7bdd3a432b0d9d959e/facebook_ad_library_scraper.py
[KYAM-core]: https://github.com/kyamasam/facebook-ad-library-scraper/blob/7bf60aa50982cc367be9eece31f33c4ca9f09f51/facebook_ad_library_scraper/core.py#L20-L90
[KYAM-cli]: https://github.com/kyamasam/facebook-ad-library-scraper/blob/7bf60aa50982cc367be9eece31f33c4ca9f09f51/facebook_ad_library_scraper/cli.py#L36-L66
[EREN-nav]: https://github.com/erenmyeager15/facebook-ad-library-scraper/blob/677dd9c751fb57cfad08a215e431081dfb1179bd/src/navigation.ts#L5-L10
[EREN-input]: https://github.com/erenmyeager15/facebook-ad-library-scraper/blob/677dd9c751fb57cfad08a215e431081dfb1179bd/src/input.ts#L76-L106
[EREN-repair]: https://github.com/erenmyeager15/facebook-ad-library-scraper/blob/677dd9c751fb57cfad08a215e431081dfb1179bd/REPAIR-2026-10-05.md
[RAMSES]: https://github.com/RamsesAguirre777/facebook-ads-library-mcp/blob/ea3c877855c16fb4594f640634d06f85e414eadb/facebook_ads_mcp_complete.py#L1-L60
[PROXY-SC]: https://github.com/proxy-intell/facebook-ads-library-mcp/blob/9f7630a3c6a611bc753f108f50825528134d78b6/src/services/scrapecreators_service.py#L12-L13
[NAGA]: https://github.com/NagaYu/AdRadar/blob/119b4210695db454ebeca59c3c72c9682fcdb7f8/src/scraper.ts
[CONCAP]: https://github.com/concaptions/meta-ad-library-scraper/blob/ff359537b4f3cadcc9141f74b5914ea8f05776fb/scraper.js
[NIKS]: https://github.com/NiksHacks/meta-ads-library-scraper/blob/7be00f8307fe8fdc3e9ce4d61181708eb296534f/src/main.js
[LOMBAZZ]: https://github.com/lombazz/meta-ads-scraper/blob/93191c2bfb209b3616eecb8e346128eb37449229/meta_ads_scraper.py
[NETTY]: https://github.com/netty-linux/meta-ad-library-mcp/blob/b6df90115be4d661378bbb92b2b3036429181846/clients/meta_api_client.py
[ATDAN]: https://github.com/at-dan/ad-library-mcp/blob/2da03c18a98480cba88f95c099d20ec3209d731d/src/lib/scrapecreators-client.ts
[QUAN]: https://github.com/thedavidquan01/ad-library-mcp
[OLIVER]: https://github.com/oliverames/meta-mcp-server
[LEYOVCO]: https://github.com/leyovco/facebook-ads-library-mcp
