# 01 — How Meta (Facebook + Instagram) ads work in late 2026, and how to operate them

> **As of:** 2026-11-01. **For:** the SIRINE creative lab (spy → extract creative DNA → replicate with AI via Kie.ai) and the ad-engine operator.
> **Builds on (does not repeat):** `research/raw/fb-ads-strategy.md`, `research/raw/creative-and-prompts.md`, `playbooks/creative-diversity-andromeda.md`, `playbooks/staleness-myths.md` (all June 2026). Anything already correct there is only referenced here.
>
> **Evidence labels (on every claim):**
> - **[primary]** = Meta first-party: newsroom (about.fb.com), Meta for Business news, Business Help Center, developers.facebook.com docs/changelogs, engineering.fb.com, Meta-authored arXiv paper, Meta earnings-call transcript (Meta IR PDF).
> - **[practitioner]** = third-party operator or trade-press interpretation (Jon Loomer, Common Thread Collective, Foxwell/Motion, Marketing Brew, Social Media Today, PPC Land, agencies). Opinion, not Meta policy.
> - **[unverified]** = single secondary source, a Meta statement I could not open myself, a conflicting date, or our own inference. **Rec.** = our recommendation, derived from the cited facts.
>
> **Method notes.** All 8 earnings calls Q4-2024 → Q3-2026 were read from Meta IR PDFs (text-extracted). Help Center pages are client-rendered (WebFetch returns only titles), so they were read through Meta's own help-article search tool (claude.ai Meta Ads connector, read-only use). engineering.fb.com refused some connections: the Nov-2025 GEM post was not opened directly (its numbers are confirmed by the Q2-2025 transcript). Meta's Apr-2025 and Dec-16-2025 "creative diversification" posts could not be opened; their wording below comes via practitioner quotes and is labelled accordingly.

---

## TL;DR — 10 bullets

1. **Delivery is content-first at every stage.** Andromeda retrieval (Dec 2024) narrows tens of millions of ads to a few thousand. Since Q2-2026, an LLM-based "Meta Generative Recommender" reasons over ad content and user preferences together. In Q3-2026 it went live in Facebook Feed retrieval for about +2% conversions in targeted segments. GEM-taught ranking models then score the candidates, and the auction ranks on bid × estimated action rate + ad quality. Meta's multimodal models read each ad's text and images into semantic tokens where "similar items share tokens." [primary]
2. **Look-alike ads get pooled. Meta now shows you how much.** On 2026-08-26 a "Creative diversity" column arrived in Ads Manager (High/Medium/Low per ad set, "in development"). It compares the images and video thumbnails inside an ad set. Ads Creative Studio groups creatives into "creative styles" by visual, text and story similarity. Fatigue is counted per image or video across every campaign on the Page. "Entity ID" and "60% similarity" are practitioner terms, not Meta's. [primary] / [practitioner]
3. **"Different enough" means a different first impression *and* a different message.** Meta: ads that "look or feel alike" are variations of one creative. Swapping the headline, copy, colour, crop or overlay on the same base asset does not create a new creative. [primary via practitioner quote] / [practitioner]
4. **More ads is not better. Adding an ad resets learning.** Meta warns that too many ads per ad set means fewer ads exit learning. The caps are 50 ads per ad set and 250 live ads per Page for Pages under $100k/month. "Adding a new ad to your ad set" is a significant edit. Meta's built-in **Creative Testing** tests 2–7 variants inside a live campaign on ≤20% of budget with **no learning reset**. It needs the Highest-volume bid strategy. [primary]
5. **The hook is frame 0, not "the first 3 seconds."** Meta: 46% of online purchase conversions from Reels happen within the first 2 seconds of attention. Since March 2026 an engaged view counts at 5 s (down from 10 s), and click-through attribution counts link clicks only. Likes, shares and saves now fall under "engage-through." [primary]
6. **Placement control is being removed.** For Sales, Leads and App objectives, placements can no longer be chosen or excluded at ad-set level (gradual rollout, about Aug 2026). What remains: account-level placement exclusions per objective, placement value rules (bid −90%…+1000%), and per-placement media. **This threatens SIRINE's proven "Facebook feed + stories + reels only" recipe.** [primary] / [practitioner]
7. **Meta is pushing AI creative and has published no penalty for it.** About 10M advertisers used its gen-AI tools in Q3-2026. Video-from-static-image went GA on 2026-10-06, Muse Image was announced on 2026-07-07, and "brand memory" is in testing. Meta reports +3% conversion rate in tests for its video generation. [primary]
8. **AI disclosure.** Meta auto-applies an "AI info" label (under ⋯ → About this ad) to ads made with its own gen-AI tools *and* to third-party AI media it detects via C2PA. Mandatory self-disclosure applies only to social-issue, election and political ads. An optional on-ad label exists in the EU, California, New York, India and Taiwan. Algeria has no on-ad requirement. The gen-AI ad terms merge into the Self-Serve Ad Terms on **2026-11-20**. [primary]
9. **AI enhancements can sneak in.** Ads Manager turns some enhancements on by default. An account setting, "Test new creative features," can apply enhancements even when ad-level Advantage+ creative is off. In the API only `adapt_to_placement` defaults on. There are 23 `creative_features_spec` keys, plus music via `asset_feed_spec.audios`, and ads with AI features must be created PAUSED and previewed before activation. [primary]
10. **API housekeeping.** Marketing API v26 (2026-07-29) removed the Instagram Explore placement. From 2026-10-27, on every API version, Messenger Stories is silently stripped, poll creatives are rejected, `web_only` applinks are blocked and some delivery-estimate fields are gone. v24 expired 2026-10-06, v25's expiry is still TBD, and legacy ASC create/edit has been dead on all versions since 2026-05-19. [primary]

---

## 1. Timeline, 2024 → November 2026

Grouped by period. Impact column = what it means for SIRINE / the creative lab.

### 1a. 2024 – 2025 (context; most already in our June notes)

| Date | Change | Source | Impact for us |
|---|---|---|---|
| 2024-05-06 | Supplemental **Ad creative generative AI terms** launched; cover text generation, background generation, expand image and future gen-AI features. [primary] | https://www.facebook.com/business/help/1684513971952814 | Advertiser stays responsible for AI output. Terms merge into the Self-Serve Ad Terms on 2026-11-20 (see 1c). |
| 2024-06 | **Dynamic creative no longer available** for new Sales / App Promotion ad sets; Meta points to the flexible format instead. [primary] | https://www.facebook.com/business/help/170372403538781 | Don't spec `is_dynamic_creative` for SIRINE Sales. |
| 2024-10 | **Image Animation**, Meta's first gen-AI video tool (static → short video), rolled out; "hundreds of thousands of advertisers" by Q4. [primary] | Q4-2024 call: https://s21.q4cdn.com/399680738/files/doc_financials/2024/q4/META-Q4-2024-Earnings-Call-Transcript.pdf | Its output is auto-labelled "AI info". Key `image_animation`. |
| 2024-12-02 | **Andromeda** engineering post: retrieval stage, tens of millions → a few thousand candidates; hierarchical index jointly trained with the model; 10,000× model capacity; +6% recall, +8% ads quality; built because "the number of ads creatives… is expected to grow significantly" with gen-AI. [primary] | https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/ | Andromeda is **retrieval only**, not the whole system. |
| 2025-01-29 | Q4-24 call: Advantage+ Shopping at a $20B run-rate; testing the **streamlined flow** (Advantage+ on by default for Sales/App/Leads); 4M+ advertisers using gen-AI creative tools. [primary] | Q4-2024 transcript (above) | Start of the "Advantage+ on from the beginning" era. |
| 2025-01 | Threads ads test begins (Q4-24 call: "beginning to test ads this quarter"). [primary] | Q4-2024 transcript | — |
| 2025-02 | **Existing Customer Budget Cap removed** (already in the lint as B6). [practitioner] | Jon Loomer (in fb-ads-strategy fact-check) | — |
| ~2025-02 | "AI info" label on ads made with Meta's gen-AI tools begins (date per practitioners). [practitioner] / [unverified] | https://www.mockingbirdhouse.com/learning/ai-ad-creative/does-meta-allow-ai-generated-ads | Superseded by the 2026 state (see §4). |
| 2025-03-31 | Detailed-targeting **exclusions removed** (lint B4). [primary] | https://www.facebook.com/business/help/458835214668072 | — |
| 2025-04 | Q1-25 call: **GEM** introduced for ranking (tested on FB Reels, up to +5% conversions); **Video Expansion** to FB Reels; **image generation** to all eligible advertisers; **virtual try-on** testing; incremental attribution +46% incremental conversions in tests. Threads opened to all eligible advertisers (30+ markets). [primary] | https://s21.q4cdn.com/399680738/files/doc_financials/2025/q1/Transcripts/META-Q1-2025-Earnings-Call-Transcript-1.pdf | Virtual try-on was never confirmed as launched (see §1c). |
| 2025-04 | Meta for Business post: "the focus has shifted from niche targeting to creative diversification as the best lever to find the most relevant audiences." [primary via practitioner quote] | Quoted by https://www.jonloomer.com/andromeda-3/ | The doctrine behind our diversity gate. |
| 2025-06-02 | WSJ: Meta aims for **fully automated ad creation and targeting by end-2026**. [practitioner (press)] | https://www.exchange4media.com/digital-news/meta-aims-to-fully-automate-advertising-with-ai-by-2026-144037.html | What actually shipped is in §1c. |
| 2025-06 (Q2) | Incremental attribution **global**; Omnichannel ads global; streamlined A+ flow complete for Sales & App; ~2M advertisers using video generation (Image Animation + Video Expansion); AI caption **translation** test in 10 languages; Threads image/video ads in most countries (May); WhatsApp **Status ads + Channels** rolling out gradually; Andromeda adds FB Reels (~+4% conversions); GEM +5% IG / +3% FB; Lattice in early-stage ranking (~+4%). [primary] | https://s21.q4cdn.com/399680738/files/doc_financials/2025/q2/META-Q2-2025-Earnings-Call-Transcript.pdf | — |
| 2025-06-17 | Cannes 2025: **Video Generation 2.0** (multi-image → multi-scene video), expanded virtual try-on test, brand logos/fonts/colours in AI ads, Business AI in ads. [practitioner] (Meta post not opened) | https://ppc.land/meta-announces-generative-ai-advances-for-advertisers-at-cannes-lions/ · https://www.emarketer.com/content/meta-launches-11-new-ai-ad-tools-cannes-lions-2025 | — |
| 2025-10 (Q3) | Streamlined flow complete for Leads → "end-to-end automation turned on from the beginning" for Sales/App/Leads; **$60B** run-rate through end-to-end automation; **AI-generated music**; Lattice to app ads; ~100 models consolidated into Lattice; **Andromeda merged with early-stage ranking** (+14% ads quality on FB). [primary] | https://s21.q4cdn.com/399680738/files/doc_financials/2025/q3/META-Q3-2025-Earnings-Call-Transcript.pdf | Music key = `asset_feed_spec.audios`. |
| 2025-10-08 | Graph/Marketing API **v24.0** released. [primary] | https://developers.facebook.com/docs/graph-api/changelog/versions | Marketing v24 **expired 2026-10-06**. |
| 2025-10-16 | Insights API metric-availability notice: `7d_view`/`28d_view` removed from 2026-01-12; unique-count and hourly breakdowns limited to 13 months; `frequency_value` limited to 6 months; `mmm` async only. [primary] | https://developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/ | Our reporting must not query >6 months of frequency data. |
| 2025-11-10 | Engineering post: **GEM**, "the largest RecSys foundation model in the industry", teaches smaller serving models (Q2-25: +5% IG, +3% FB). [primary] (numbers confirmed by the Q2-25 transcript) | https://engineering.fb.com/2025/11/10/ml-applications/metas-generative-ads-model-gem-the-central-brain-accelerating-ads-recommendation-ai-innovation/ | — |
| 2025-12 | **Lattice** paper (Meta authors): consolidates ranking models across surfaces and objectives; +10% top-line, +11.5% ads quality, +6% conversions. [primary] | https://arxiv.org/abs/2512.09200 | — |
| 2025-12-16 | Meta "Demystifying Creative Diversification": ads that "look or feel alike" are **variations of the same creative**; "Creative iteration… should not replace true creative diversification." [primary via practitioner quote] | Quoted by https://novoads.ai/en/blog/creative-diversity-meta-ads · https://www.apogee.ad/en/blog/meta-andromeda/ | Defines "concept vs iteration" (§2.3). |

### 1b. January – June 2026

| Date | Change | Source | Impact for us |
|---|---|---|---|
| 2026-01-12 | `7d_view` / `28d_view` removed from the Insights API (lint B3). [primary] | Developer blog 2025-10-16 (above) | Already enforced. |
| 2026-01-21 | **Threads ads expanding to all markets globally** (gradual); 4:5 image/video/carousel; Threads auto-added to Advantage+ **and manual** campaigns. [primary] | https://www.facebook.com/business/news/ads-on-threads-one-year-in | Every concept needs a clean **4:5** asset. |
| 2026-01-28 | Q4-25 call: GEM now covers **all major FB+IG surfaces**; new **sequence-learning** architecture (+3.5% FB clicks, >1% IG conversions); new run-time model on IG (+3% CVR); Lattice consolidation +12% ads quality; **video-generation tools at a $10B run-rate**; incremental attribution +24% vs standard; Andromeda runs on Nvidia/AMD/MTIA with ~3× compute efficiency; Meta AI business assistant in test. [primary] | https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/META-Q4-2025-Earnings-Call-Transcript.pdf | — |
| 2026-02-13 / 02-18 | **Marketing API v25.0** (2026-02-18). Legacy **ASC/AAC** campaigns can't be created or updated via API from v25; all versions from **2026-05-19**; remaining ASC/AAC paused in v26. [primary] | https://developers.facebook.com/blog/post/2026/02/13/asc-and-aac-deprecation-mapi-v25/ | Extends lint B2. |
| 2026-03 | Facebook-feed single-media and catalog-collection ads **stop showing the URL in the footer**. [primary] | https://www.facebook.com/business/help/388369961318508 | Domain/brand must be legible *in the creative* or primary text. |
| 2026-03 | "**Sponsored**" label becomes "**Ad**" on Facebook/Instagram (date per trade press). [primary] (label) / [practitioner] (date) | https://www.facebook.com/business/help/1010479435004531 · https://www.socialmediatoday.com/news/meta-is-switching-up-its-ad-transparency-labels-in-stream/814890/ | Update preview mock-ups and safe-zone overlays. |
| 2026-03 | **Flexible format** disappears for some accounts, replaced by **multi-media ads** (up to 10 images/videos per ad, per-asset ratio/text/URL customization). [primary] | https://www.facebook.com/business/help/835561738423867 · https://www.facebook.com/business/help/1546753450586085 | One ad can hold one concept in all ratios. |
| 2026-03-03 | **Click-through attribution = link clicks only**; other clicks move to **engage-through attribution**; engaged view **10 s → 5 s** for video; "46% of online purchase conversions with Reels happen within the first 2 seconds of attention." [primary] | https://www.facebook.com/business/news/click-attribution | Frame-0 hook doctrine; reported conversions may shift. |
| 2026-04-15 | **AI-enriched Pixel** (adds page/product details to events; 30-day notice, can be turned off) + free **one-click Conversions API**; Meta claims CAPI users see 17.8% lower cost per result. [primary] | https://www.facebook.com/business/news/pixel-conversionsapi-updates | Review what the AI-enriched Pixel sends; it may not suit a COD order flow. |
| 2026-04-29 | Q1-26 call: **Adaptive Ranking Model** (LLM-scale inference that routes high-conversion-probability requests to heavier models) extended to offsite conversions (+1.6% CVR); Lattice+GEM give >6% CVR on landing-page-view ads; Meta AI business assistant live for all eligible advertisers; 8M+ advertisers on gen-AI tools; **video generation +3% conversion rate in tests**; partnership ads at a $10B run-rate. Same week: **Meta ads AI connectors (MCP + CLI) open beta**. [primary] | https://s21.q4cdn.com/399680738/files/doc_financials/2026/q1/META-Q1-2026-Earnings-Call-Transcript.pdf · https://www.facebook.com/business/news/meta-ads-ai-connectors | Meta's official MCP is now a first-class route (see open question 9). |
| 2026-05-19 | ASC/AAC API lockout extends to **all** versions. [primary] | Developer blog 2026-02-13 | — |
| 2026-06 | Reels **post-view ads**: skippable ads after organic Reels longer than 60 s, opened to all advertisers. [practitioner] | https://www.socialmediatoday.com/news/instagram-expands-reels-post-view-ads-to-all-advertisers/822317/ | More 9:16 inventory. |
| 2026-06 (from the 1st per IAB) | Meta labels **third-party** AI media in ads (C2PA detection). [practitioner] (date) / [primary] (the mechanism, see §4) | IAB framework PDF (via https://admakeai.com/blog/meta-ads-updates-september-2026) | Kie.ai output may get "AI info" (§4). |
| 2026-06 | Insights API "creative insights" metrics tested with "a small number of agencies/GCR resellers" since June. [primary, Meta spokesperson quoted] | https://www.marketingbrew.com/stories/meta-ad-creative-diversification-best-practices-advertiser-approach | Creative-level data via API may come later. |
| 2026-06-23 | Cannes 2026: **end-to-end creative solution** with **brand memory** (learns brand identity from existing ads; testing); text generation **inside the image**; text-on-media translation adds French (and others); **voiceover translation** adds Arabic and French; creative approval flow (test); Creator Marketing Hub announced. [primary] | https://www.facebook.com/business/news/cannes-2026-cross-ai-threshold | Translation tools ≠ Darija → keep OFF (§3.3). |

### 1c. July – November 2026 (the period we knew least)

| Date | Change | Source | Impact for us |
|---|---|---|---|
| 2026-07-07 | **Muse Image** (Meta Superintelligence Labs) will power image generation in Advantage+ creative "in the coming weeks"; claims on-brand variations and product integrity. Already live: background generation, image variations, video→static images. **Shipping status into Advantage+ not confirmed as of Nov 1.** [primary] / [unverified] (ship status) | https://www.facebook.com/business/news/muse-image-for-businesses | Meta's in-house competitor to our Kie.ai pipeline. Product fidelity still needs checking. |
| 2026-07-16 | Ads MCP update: any AI app can connect through the business's own developer app; portfolio admins can set rules on agent actions (budgets, catalog). [primary] | https://www.facebook.com/business/news/meta-ads-ai-connectors | See open question 9 (our RULE 2). |
| 2026-07-29 | **Marketing API v26.0**: **Instagram Explore placement removed** (error if selected); WhatsApp Status ads gain offsite-conversion and LPV optimization plus 10-card carousels; `advantage_audience` must be set explicitly for restricted special-category targeting; scheduled for all versions on 2026-10-27: Messenger Stories stripped, poll creatives rejected, `web_only` applinks blocked, `estimate_dau`/`daily_outcomes_curve`/`budget_guardrail` removed from `delivery_estimate`. Version auto-upgrade available from this date. [primary] | https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/ · https://developers.facebook.com/docs/graph-api/changelog/versions | Our `config/meta.json` still lists `explore`, `explore_home` and Messenger `story`. |
| 2026-07-29 | Q2-26 call: **Meta Generative Recommender**: "Rather than scoring every possible ad individually, we are now using LLMs to reason about ad content and user preferences together"; first generative model in ads retrieval. User-understanding models + GEM + sequence learning give **+8.3% clicks, +15.7% conversions on Facebook**; Advantage+ at a **$75B** run-rate; image generation now also makes **images from video**, adoption more than doubled; new end-to-end creative solution (performance signals → next creative, "preserving brand identity and tone"). [primary] | https://s21.q4cdn.com/399680738/files/doc_financials/2026/q2/META-Q2-2026-Earnings-Call-Transcript.pdf | The *meaning* of an ad (what an LLM reads in it) now drives matching (§2.2). |
| 2026-08-06 | `frequency_value`, `impression_device` and `hourly_stats_aggregated_by_audience_time_zone` breakdowns **need account opt-in**: `POST /act_<ID>/insights/feature-settings` (enable-only), or use async jobs. [primary] | https://developers.facebook.com/docs/marketing-api/insights/breakdowns/ | Frequency reads (fatigue) may silently return empty. |
| 2026-08-12 | Meta holiday guidance: "Adding three or more creative formats can make a difference"; 2.1× purchase intent when shoppers engage with diverse formats; phone-shot Reels "can outperform most polished brand videos"; "Repurpose first, produce second, refresh throughout." [primary] | https://www.facebook.com/business/news/holiday-advantage-is-creative-advantage | Format mix per ad set: Reel + carousel + static. |
| ~2026-08-20 | **Ad-set placement exclusions removed** for Sales/Leads/App Promotion (gradual). In-product notice: "Excluding placements, platforms, devices and operating systems will no longer be available for your ad sets." Replacements: per-placement media, **placement value rules**, **account-level placement exclusions by objective**. Bid multipliers must move to value rules **by 2027**. [primary] (help) / [practitioner] (date, notice text) | https://www.facebook.com/business/help/1546753450586085 · https://www.facebook.com/business/help/535014515741813 · https://www.jonloomer.com/meta-removing-placement-controls-ad-sets/ | SIRINE's FB-only winner recipe can't be rebuilt per ad set (§3.2). |
| 2026-08-26 | **Creative diversity** column in Ads Manager: "calculated by comparing the images and video thumbnails in your ad set to each other to determine similarity"; High/Medium/Low; "this metric is in development"; meant to decide whether "more varied images and videos need to be added… to help prevent creative fatigue." [primary] (definition) / [practitioner] (date) | https://www.facebook.com/business/help/2371176336684086 | A free, Meta-side similarity readout for every lab batch. |
| 2026-08-25 | Instagram "Reply to Keywords" test (auto-DM people who comment a keyword on an ad). [practitioner] | https://www.jonloomer.com/reply-to-keywords-meta-ads-feature/ | Possible COD lead capture; test later. |
| 2026-09-15 | **Creator Marketing Hub** goes global: content permissions with expiry, one-click Partnership Ads, Facebook creators in the Marketplace API; Partnership Ads coming to the ads MCP. Instagram **Live video ads** GA from 09-29. [primary] | https://www.facebook.com/business/news/iab-global-creator-week-making-it-easier-for-businesses-to-partner-with-creators | Route for running creator/UGC posts as partnership ads. |
| 2026-09 | Click-to-message ads: **up to 7-day free messaging window** (rolling out). WhatsApp billing pages still say 72 h. [primary] (conflicting pages) | https://www.facebook.com/business/help/1633888728080924 · https://www.facebook.com/business/help/2225184664363779 | Longer COD confirmation window on CTWA, if live for SIRINE. |
| 2026-09-28 | Meta spokesperson: diversification guidance is "deliberately outcome-based (not model-specific)"; "We don't get into the specifics of how our ranking models represent individual creative assets." [primary, quoted] | https://www.marketingbrew.com/stories/meta-ad-creative-diversification-best-practices-advertiser-approach | Don't over-fit the lab to rumoured thresholds. |
| 2026-09-29 | **Muse for Small Business** (agent connecting IG/FB/ad accounts; "nothing publishes, sends, or spends without your approval"). Availability as of launch: Muse in US + Canada. [primary] | https://about.fb.com/news/2026/09/introducing-muse-small-business/ | The "fully automated" ambition is still **approval-gated**. |
| 2026-10-06 | Advertising Week: **video from static images GA** in Advantage+ creative; **catalog video** beta; **Ads Creative Studio** rolling out more widely (with gen-AI video); assistant gains memory, with agentic campaign creation/budget changes "soon"; **Customer Lifecycle Strategy** for all advertisers; **AI audience discovery** (plain-language) in Detailed Targeting by year-end; ads MCP supports more workflows with per-action approval. [primary] | https://www.facebook.com/business/news/advertising-week-new-york-2026 | Meta can turn our statics into video for free; weigh fidelity. |
| 2026-10-06 | Marketing API **v24.0 expired**. [primary] | https://developers.facebook.com/docs/graph-api/changelog/versions | We're on v25 (expiry TBD); plan v26. |
| 2026-10-13 | GEM 2026 post: one central model across all surfaces; **Kunlun** architecture (2× vs InterFormer at equal compute); knowledge transfer via LoopFM; **+18.9% conversions, +12% CTR** across surfaces (no timeframe); past year +5.8% FB / +4.1% IG / +1.6% off-site for targeted users. Creative representation is barely described ("ad content representations"). [primary] | https://engineering.fb.com/2026/10/13/ml-applications/generative-ads-model-gem-scaling-frontier-ads-ai/ | — |
| 2026-10-19 | **GenRecs Tokenization**: "Pre-trained multimodal models read each ad, product, and page, including its text and images"; the embedding is quantized into semantic tokens; "**Similar items share tokens**, much as related words share roots"; new items generalize from shared content structure (cold start). +0.35% conversions together with GEM and Adaptive Ranking (Feb-2026 data). [primary] | https://engineering.fb.com/2026/10/19/ml-applications/genrecs-tokenization-transforming-ads-recommendation-at-meta-with-stable-model-vocabulary/ | **The closest primary explanation of "Entity ID" behaviour.** |
| 2026-10-21 | Q3-26 call: Meta Generative Recommender (generative retrieval) live on **Facebook Feed** (~+2% conversions in targeted segments); GEM on more surfaces (+1.7% offsite conversions, +9.6% app); **Andromeda +1.4% conversions** on FB; content-understanding models moving to the Muse model family (−80% processing cost across IG/Threads/FB/**ads**); ~**10M** advertisers using gen-AI tools; video-gen adoption +25% QoQ ("ready-made videos… from a single image upload"); Partnership Ads **+97% YoY, $15B** run-rate; Creator Marketing Hub global. [primary] | https://s21.q4cdn.com/399680738/files/content_files/META-Q3-2026-Earnings-Call-Transcript.pdf | — |
| 2026-10-27 | v26 removals apply to **all** API versions (Messenger Stories, polls, `web_only` applink, delivery-estimate fields). [primary] | v26 blog (above) | Lint items B18, B19, B23, B25. |
| 2026-11-20 | Commercial Terms and Self-Serve Ad Terms updated; the **ad creative generative AI terms are incorporated into the Self-Serve Ad Terms**. (An aggregator said Oct 30; Meta's page says Nov 20.) [primary] | https://www.facebook.com/business/help/2481113349080785 | Re-read before scaling AI creative. |
| by end-2026 | AI-enabled audience discovery in Detailed Targeting. [primary] (announced) | Advertising Week post | Not shipped yet. |
| by 2027 | Bid multipliers → value rules. [primary] | https://www.facebook.com/business/help/535014515741813 | — |

**Announced, not shipped or unconfirmed (as of 2026-11-01):** Muse Image inside Advantage+ creative; the assistant's agentic campaign creation and budget changes ("soon"); Audience Labels (test); AI audience discovery (year-end); virtual try-on (never confirmed past the 2025 test); global completion of WhatsApp Status ads ("on track"). [primary]

**"Fully automated ads by end-2026": verdict.** Not delivered as described. What shipped is Advantage+ on by default, gen-AI creative tools, an assistant and agents (Ads Manager assistant, ads MCP, Muse for SB). All of them keep a human approval step, per Meta's own pages. [primary]

---

## 2. Mechanics — how delivery works now

### 2.1 The pipeline (late 2026)

1. **Eligibility.** Your targeting, account controls (age, location, placement exclusions by objective) and policy review define who and where. With Advantage+ audience on, your inputs are suggestions, not filters. [primary]
2. **Retrieval** narrows "tens of millions" of ads to "a few thousand" per opportunity. [primary]
   - **Andromeda** (since H2-2024): a hierarchical index jointly trained with a deep model, scaled to 10,000× capacity, and merged with early-stage ranking in Q3-2025 (+14% ads quality). It keeps getting tuned: +1.4% FB conversions in Q3-2026. [primary]
   - **Meta Generative Recommender** (Q2-2026 →): LLMs "reason about ad content and user preferences together" and *generate* candidates instead of scoring every ad. Live in Facebook Feed retrieval since Q3-2026. [primary]
   - **GenRecs Tokenization**: each ad's text and images are read by pre-trained multimodal models, embedded, and quantized into short sequences of semantic tokens. Similar ads share tokens, and new ads borrow what the model knows about their category. [primary]
3. **Ranking**: the surviving candidates get predicted CTR/CVR. [primary]
   - **GEM**, the foundation model that is too heavy to serve, teaches hundreds of serving models via distillation and LoopFM. It covers all major surfaces and uses long user sequences (2× in production, 25× demonstrated). [primary]
   - **Lattice** consolidates many per-surface and per-objective models into a few large ones; about 100 models were cut by Q3-2025, with about 200 more planned. [primary]
   - The **Adaptive Ranking Model** spends more compute where conversion probability is high. [primary]
4. **Auction**: the winner is the highest *total value* = **bid × estimated action rates + ad quality**, subject to a price floor. Ad quality draws on feedback (people hiding ads) and low-quality attributes: "withholding information, sensationalized language and engagement bait." Repeated low-quality or violating ads can make Meta treat **all** ads from that Page, domain or ad account as lower quality. [primary] https://www.facebook.com/business/help/430291176997542 · https://www.facebook.com/business/help/423781975167984

### 2.2 Why creative is now the main targeting lever (mechanistically)

- With broad targeting, eligibility is huge, so the ad's content representation decides which people's candidate lists it enters. Meta's own language: the system reasons over "ad content and user preferences together." [primary] **Inference:** an ad that "means" one thing (one product, one angle, one kind of person and setting) reaches the people whose histories match that meaning. Ten ads that mean the same thing reach the same people. [unverified — inference consistent with GenRecs + Generative Recommender]
- **Both visual and semantic diversity count.** The Creative diversity metric is visual (images and thumbnails). Retrieval tokens are built from **text and images**, and Ads Creative Studio clusters on "visual, text and story similarities." So two visually different ads with the same script or angle can still be semantically close, and two visually identical ads with different copy are still "the same creative." [primary] (components) / [unverified] (combined reading)
- **Freshness and cold start.** On the organic side, generative retrieval surfaces new posts "before they've accumulated significant engagement," and about 45% of recommended IG Reels are under a day old. For ads, semantic tokens let new items generalize from their category. [primary] Rec: a new concept doesn't need weeks of history to be retrieved. It needs to be **legibly about something** (product, setting and person clearly visible at frame 0).
- **User understanding has deepened.** Longer behaviour sequences (organic + ads) and LLM-based user-preference models mean the **ad content side** is where advertisers still have leverage. [primary]

### 2.3 How Meta clusters near-duplicates, and what counts as "different enough"

**What Meta itself says or ships** [primary unless noted]:
- Ads that "look or feel alike" are variations of the same creative (Dec-16-2025 post). [primary via practitioner quote]
- **Creative diversity column** = similarity of the images and video thumbnails inside one ad set → High/Medium/Low. Text is not mentioned. https://www.facebook.com/business/help/2371176336684086
- **Ads Creative Studio** groups "each image or video into a creative style… determined by visual, text and story similarities." https://www.facebook.com/business/help/1270229187942739
- **Fatigue** is computed on "all recent exposures of the ad's image or video, including those from other campaigns from your page." The fix Meta prescribes is "a new image or video that is **materially different**." https://www.facebook.com/business/help/1346816142327858
- Meta "doesn't get into the specifics of how our ranking models represent individual creative assets" (spokesperson, Sept 2026).

**What practitioners claim** [practitioner]:
- "Entity ID" (similar ads share one auction entry) and a ">60% similarity → suppression" threshold. Meta has published neither. Treat the *idea* as directionally right (GenRecs: "similar items share tokens") and the *numbers* as folklore.
- CTC (2026-09-09): brief creative "families" that differ on at least 3 of 5 dimensions (content style, messaging theme, hook type, format, spokesperson/visual identity); opening frame, setting and product framing also count. Headline, background-colour and crop swaps don't count.
- Billion Dollar Boy (via Marketing Brew): two videos of the same person with different text overlays are "considered the same creative."

**Rec. Working definition for the lab:**
- **Concept (new creative):** differs from every live ad in the ad set on **≥3 of** first frame / thumbnail, setting, talent (person or hands vs none), format (Reel, carousel, static, GIF), narrative structure / hook mechanism, and dominant on-image text block (incl. language). It also carries a different message or angle (price shock, gift, quality proof, social proof, occasion).
- **Iteration (same creative):** a new hook line, copy, colour grade, crop, music, overlay style, or trim of the same footage. Useful for refreshing a fatigued winner, but it adds no diversity.

### 2.4 Creative fatigue (official mechanics)

- Statuses at ad-set / ad level: **"Creative limited"** = cost per result above your past ads but under 2×; **"Creative fatigue"** = ≥ 2× your past ads. A warning appears before publish if fatigue is predicted within 7 days. Available only for ad sets with one creative (not catalog ads, dynamic creative or A+ app). [primary]
- Exposure counting follows the **asset** (image/video) across all campaigns on the Page. Re-using the same video in a new campaign does **not** reset fatigue. [primary]
- Meta's fixes: a materially different new image or video (keep the original running), audience expansion, or Advantage+ creative. Opportunity Score repeats the advice: "duplicate this ad and replace the image or video." [primary]
- Practitioner (vendor, small sample): AI-generated ads fatigue 15–20% faster than human-produced ones. [practitioner] / [unverified]

### 2.5 Learning phase (unchanged core, one under-appreciated rule)

- Stable delivery after about **50 optimization events** since the last significant edit. [primary]
- **Significant edits:** any targeting change, any creative change, any optimization-event change, **adding a new ad to the ad set**, pausing ≥7 days, and a bid-strategy change. Budget or bid changes count depending on size ($100→$101 no; $100→$1,000 likely). With Advantage+ campaign budget, an edit on one ad set doesn't reset its siblings, and adding a *new ad set* doesn't reset the others. [primary] https://www.facebook.com/business/help/316478108955072
- Rec: at SIRINE's placed-order CPA (~$1–3), a $20–50/day ad set can reach about 50 purchases a week. Learning exit is achievable if we don't fragment. This is our data applied to Meta's threshold. [unverified — inference]

### 2.6 What Meta says about the number of creatives

- "**Too many ads can result in worse performance**": fewer ads exit learning. "Decrease ads per ad set, but maintain diverse creative assets per ad set. One ad can contain multiple (up to 10) creative assets." [primary] https://www.facebook.com/business/help/2720085414702598
- Hard limits: **50 ads per ad set** (all regular accounts). Page tier **250 live ads** if the Page's best month is under $100k. Each dynamic-creative, A+ placements or catalog ad counts as one ad. [primary] https://www.facebook.com/business/help/652738434773716 · https://www.facebook.com/business/help/766697140509126
- Advantage+ sales best practice: "provide a wide variety of diverse creative assets." Meta has published **no number per ad set** tied to Andromeda. [primary]
- Holiday 2026: three or more formats. [primary]
- Practitioners: Loomer found 20–50 ads per ad set **counterproductive** for most budgets and keeps short-form under about 15 s. Agencies suggest 4–6 distinct concepts per ad set with 2–3 new each month. Motion 2026 (550k ads, $1.3B): about 5–8% of ads become winners (≥10× the account's median ad spend), about half get little or no spend, and simple text and product-image statics are frequent winners. [practitioner] https://www.jonloomer.com/andromeda-3/ · https://www.foxwelldigital.com/blog/motion-creative-benchmarks-2026-8-key-takeaways

### 2.7 Measurement mechanics that change how creatives are read

- Click-through = link clicks only. Engaged view = 5 s. Engage-through attribution covers likes, shares and saves. [primary]
- Incremental attribution (Sales/Engagement/Leads, website conversions; **no bid controls**; **can't be changed after publish**; reporting available from 2025-04-01) optimizes for conversions the model believes the ad *caused*. [primary] https://www.facebook.com/business/help/644554008179419
- View-through: only 1-day view remains (lint B3). Frequency, device and audience-timezone hourly breakdowns need opt-in (Aug 2026). [primary]
- Rule unchanged (ours): rank and kill on `spend ÷ DB-confirmed orders` via `source_ad_id`, never on platform ROAS. Meta's own attribution changes in 2026 are another reason to keep it. [unverified — our rule]

---

## 3. Operator playbook — small COD fashion brand (SIRINE), late 2026

### 3.1 What specifically changes for SIRINE

| Change | Why it matters to SIRINE | Rec. |
|---|---|---|
| No ad-set placement exclusions for Sales (rolling) [primary] | The proven "Pack Bordeaux / Croco winner" spec uses `facebook_positions: feed, facebook_reels, story`, Facebook only (`config/clients/sirine-01/builds/pack-croco-launch.spec.json`) | Test on a PAUSED draft whether the API still honours `publisher_platforms` for Sales; read back `targeting` after create. If stripped, use **placement value rules** (cut IG bids) or **account-level exclusions by objective**, which hit *every* Sales campaign in the account. |
| Creative diversity column [primary] | Our batches are often one shoot or one model in several cuts, which risks a "Low" rating | Add the column to the standard view; a lab batch passes only at Medium or High (the metric is "in development", so treat it as advisory). |
| Adding an ad = significant edit [primary] | We often add creatives to live winners | Use **Creative Testing** (2–7 variants, ≤20% of budget, Highest volume) or a new ad set inside the CBO; don't drop new ads into the winning ad set. |
| Hook stat (46% of Reels purchase conversions in the first 2 s) [primary] | Matches our Pack Noir lesson: price + «الدفع عند الاستلام» legible at frame 0 | Make frame 0 a gate in the lab's QA. |
| AI info auto-labels via C2PA [primary] | Kie.ai-generated media may be labelled | Accept it (label is low-visibility in Algeria); never strip provenance to dodge it (§4). |
| v26 / all-version removals [primary] | `config/meta.json` lists `explore`, `explore_home`, Messenger `story` | Add to the staleness lint (§5); plan the v25 → v26 move. |
| CTWA free window up to 7 days (rolling) [primary] | COD confirmation and upsell over WhatsApp | Check whether it's live on SIRINE's WhatsApp Business account before changing flows. |

### 3.2 Account / campaign structure for $20–50/day per campaign (Rec.)

- **Objective:** Sales, website conversion location, optimize Purchase. Send confirmed orders via CAPI when volume allows (existing B11 rule). The legacy "Advantage+ Shopping" type is gone; an "Advantage+ sales campaign" is simply Sales with A+ audience + placements + budget on. Meta reports a 9% better cost per conversion vs constrained setups (Dec-2024 test). [primary] https://www.facebook.com/business/help/1362234537597370
- **One campaign per pack/offer, Advantage+ campaign budget (CBO), Highest volume.** Highest volume is required for Creative Testing; incremental attribution forbids bid controls. [primary]
- **One evergreen ad set** holding **3–6 genuinely distinct concepts.** Each concept is one ad carrying its 9:16 + 4:5 (+1:1 if useful) assets via placement customization / multi-media. Below roughly 3 concepts, Meta has too little to match on. Above roughly 6 at $20–50/day, spend fragments and fewer ads exit learning. [practitioner-informed Rec.]
- **New concepts enter through Creative Testing** (≤20% of budget, 4–7 days, judged on DB-confirmed CAC as well as Meta's metric). Winners keep running in place with learnings intact. [primary mechanics]
- **Advantage+ audience:** keep it as a *tested* lever. SIRINE history: ON worked for the women's Djine bundle, OFF for Croco/Bordeaux (memory). Under A+A, age and gender become suggestions. [primary] / our data
- **Placements:** default Advantage+ placements, with every concept shipped in 9:16 and 4:5 so each surface (Reels, Stories, Feeds, Threads 4:5, WhatsApp Status 9:16) gets native media. If DB CAC proves IG placements unprofitable, prefer **placement value rules** (one rule set per ad set, ≤10 rules, ≤2 criteria per rule, −90%…+1000%; not available with ROAS-goal or bid-cap strategies; overall CPR may rise) over structural splits. [primary]
- **Existing customers:** use Customer Lifecycle Strategy recommendations or custom-audience exclusions in prospecting (the old budget cap is gone). [primary]
- **Scaling:** unchanged (lint B8). Gate each +20–25% step on incremental DB orders (our CLAUDE.md pitfall).

### 3.3 Advantage+ creative enhancements for brand-faithful fashion

**Where defaults hide** [primary]:
- Ads Manager → ad → **Review defaults** tab lists every default-on creative feature by category: creative setup/ad sources, A+ creative enhancements, A+ creative **translations**, interactive experiences, **related media**, **format display options** (auto-generated carousel/collection), **personalized destinations**. https://www.facebook.com/business/help/4321026574777213
- Some enhancements can only be turned off in **Advanced preview**. https://www.facebook.com/business/help/1082295769403815
- **Advertising settings → Creating ads → Creative features → "Test new creative features"**: if checked, enhancements in testing "may be applied to eligible campaigns **regardless of** if you are opted into Advantage+ creative at the ad level." **Set it OFF on every SIRINE account.** https://www.facebook.com/business/help/2084198785720343 · https://www.facebook.com/business/help/223409425500940
- **API:** `degrees_of_freedom_spec.creative_features_spec.<key>.enroll_status = OPT_IN | OPT_OUT`. Only `adapt_to_placement` defaults to opt-in via the API; ineligible opt-ins are dropped silently, so GET the spec after create. Music is `asset_feed_spec.audios: [{"type":"random"}]` to opt in, `[]` to opt out. The `standard_enhancements` bundle has been deprecated since v22. Ads with AI-generated features must be created **PAUSED → previewed → ACTIVE**. [primary] https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started

| API key | UI label | SIRINE setting (Rec.) | Reason |
|---|---|---|---|
| `adapt_to_placement` | Image touch-ups (aspect fit) | **OPT_OUT** when we supply per-placement assets; OPT_IN only for single-ratio statics | Auto-crop can cut burned-in Arabic price/COD overlays |
| `image_touchups`, `video_auto_crop` | Visual touch-ups | OPT_OUT | Same crop risk |
| `image_uncrop`, `video_uncrop` | Expand image / video (AI pixels) | OPT_OUT | Can invent bag details (LP parity) and triggers AI info |
| `image_background_gen` | Generate backgrounds (AI) | OPT_OUT on hero ads; TEST only in a catalog test | Product fidelity |
| `image_animation` | AI animation | OPT_OUT | We animate from real photos ourselves (memory: image→video from REAL photo only) |
| `image_templates` (code example spells it `image_template`), `add_text_overlay` | Add overlays / dynamic overlays | OPT_OUT | Latin fonts on Arabic; breaks one-language-per-creative |
| `text_optimizations` | Text improvements | OPT_OUT | Swaps text between fields and adds caption intros, bypassing our per-field compliance lint |
| `enhance_cta` | Enhance CTA | OPT_OUT | Pulls phrases from the landing page (often French) |
| `text_translation`, `image_text_translation`, `translate_voiceover` | Translations | OPT_OUT | Darija ≠ MSA/French; the API voiceover key lists English→Spanish only, while the UI added Arabic/French (Jun 2026) |
| `creative_stickers` | AI stickers / CTA stickers | OPT_OUT | Brand look |
| `image_brightness_and_contrast`, `video_filtering` | Brightness / video filters (SDR→HDR) | OPT_OUT | Colour fidelity (Bordeaux vs rose is the product) |
| `pac_relaxation` | Flex media | OPT_OUT when 9:16 + 4:5 assets exist | Stops a 9:16 cut being forced into feed |
| `inline_comment` | Relevant comments | TEST | Social proof, but surfaces COD complaints |
| `reveal_details_over_time` | Reveal details over time | TEST | Can reveal price/COD after a few seconds |
| `product_extensions`, `media_type_automation`, `description_automation` | Catalog features | OPT_OUT until a catalog exists | — |
| `asset_feed_spec.audios` | Music | `[]` on designed-audio videos; TEST on statics | Owner rejects sloppy audio (memory) |

### 3.4 Formats, specs and safe zones (2026)

- **Ratios:** 9:16 1080×1920 for Reels, Stories and WhatsApp Status (Status *requires* the IG Stories placement to be included). **4:5** 1080×1350 is recommended for single images in FB Feed; Threads uses 4:5. Carousel: 2–10 cards. [primary] https://www.facebook.com/business/help/388369961318508 · https://www.facebook.com/business/help/723817683917948
- **Safe zones:** Meta's official guidance is qualitative.
  - 9:16 placements: keep the top, bottom and sides free of key elements.
  - 4:5 IG Feed: keep the bottom and sides free.
  - **Reels with disclaimers: keep the bottom 40% free.**
  - Taller screens may zoom the 9:16 (cropping outside the safe zone) or letterbox it.
  - Use the **safe-zone guardrail** (yellow overlay) in Ads Manager. [primary] https://www.facebook.com/business/help/980593475366490
  - The common "14% top / 35% bottom" figures are not on Meta's page. [unverified]
  - Our measured house rule: Reels UI owns y<270 and y>1250 on 1080×1920, so keep content in y 270–1150 (memory, Pack Djine 4192).
- **Video length:** Reels ads can run up to 15 min; IG Stories up to 60 min. Meta publishes no "ideal length"; the 2-second conversion stat is the operative guidance. [primary] Practitioner: under about 15 s for Reels/Stories (Loomer). Our evidence: ≤5 s COD loops work when the offer sits at frame 0.
- **Audio:** Reels ads can't use licensed music; use original or royalty-free audio. Meta recommends sound on Reels. [primary] https://help.instagram.com/546362593027755
- **Text in image:** "There is no longer a limit on the amount of text… The text overlay tool is no longer available." Best practice: clean, large, contrasting text that doesn't obstruct the product, and one message. Primary text 125 / headline 40 / description 25 characters recommended. [primary] https://www.facebook.com/business/help/223409425500940
- **Carousel / catalog (DPA):** product sets need ≥2 unique products for carousel and ≥4 for collection. Variants and duplicate images count as one product. Catalog video is in beta (Oct 2026). "Format display options" may auto-build carousels from your assets, so review the defaults. [primary] https://www.facebook.com/business/help/599014736904594
- **Partnership ads:** combine signals from both profiles. +97% YoY and a $15B run-rate in Q3-2026. Creator Marketing Hub is global with content permissions that expire. [primary] Rec: run Mohamed's/creators' posts as partnership ads (needs creator permission; check availability in Algeria).

### 3.5 Testing — what replaced the old A/B habits

| Need | 2026 tool | Notes |
|---|---|---|
| New creative vs live campaign | **Creative Testing** (UI + Marketing API) | 2–7 variants; test budget split evenly; ≤20% of budget suggested; Highest volume only; no cost or bid cap; can't be edited once started; no learning reset; email with results; **no confidence level**; not compatible with legacy ASC. [primary] https://www.facebook.com/business/help/1423851372208214 · https://www.facebook.com/business/help/1376764284076031 |
| Structural question (A+A on/off, value rule) | A/B test (Experiments) | Separate audiences; slower. [primary] |
| Does the channel cause sales? | Conversion Lift / incremental attribution | Holiday 2026 note: lift tests reach significance in 2–3 weeks at peak vs 6+ weeks off-peak. [practitioner via aggregator] / [unverified] |
| Which part of a video loses people | Video performance card (first 60 s) + Ads Creative Studio hook/hold rate | [primary] https://www.facebook.com/business/help/281871985769645 |
| Is my set too samey? | **Creative diversity column**, Ads Creative Studio "creative styles" | [primary] |

Rec: at $20–50/day, run one evergreen campaign and one Creative Test per week with 3–4 concepts. Promote on DB-confirmed CAC at ≥1× AOV spend per concept (existing framework). Expect a ~5–10% hit rate (Motion) and plan volume for it.

### 3.6 Using this in the creative lab (spy → DNA → replicate)

- **Spy:**
  - The Ad Library **API** returns commercial (non-political) ads only for ads delivered in the EU/UK. For Algeria/MENA commercial ads, use the Ad Library **website** (active ads; no spend/impression data). [practitioner] https://adlibrary.com/posts/meta-ad-library-api-limitations
  - Winner proxies: days active, number of near-identical ad IDs (the advertiser is scaling it), and multi-ratio versions. [practitioner]
- **DNA schema:** encode the dimensions Meta clusters on — first frame/thumbnail, setting, talent, format, narrative/hook mechanism, on-image text (language, price, COD at frame 0), audio, product framing and offer. These are exactly the axes of the Creative diversity metric (visual), creative styles (visual/text/story) and GenRecs tokens (text + images). [primary-derived Rec.]
- **Replicate the mechanism, not the pixels.**
  - A replica must change **≥3 visual dimensions** from both the source ad *and* our own live ads, or Meta pools it with what it copies.
  - Never copy competitor assets or likeness (IP + Meta impersonation rules).
  - After launch, check the ad set's Creative diversity rating and Ads Creative Studio's style grouping, and feed the result back into the lab's similarity model. Meta's grouping is the ground truth. [Rec.]
- **Meta's own generators** (video from static, image variations, Muse Image when live) are free alternatives to Kie.ai for *variation*. Check product fidelity before use (Meta claims "product integrity"; unverified for leather texture, hardware and colour). [primary] / [unverified]

---

## 4. AI-generated creative on Meta — policy and performance

**Labels (current, from the Help Center)** [primary] https://www.facebook.com/business/help/1010479435004531
- Meta **automatically** applies an **"AI info"** label when its gen-AI tools (background generation, image generation, add animation) are used "to create or significantly edit an image or video."
- It also **automatically** labels ads it **detects** were created or edited with **third-party** gen-AI tools ("Photoshop, DALL-E, or others"), using industry standards "such as C2PA."
- **Where:** ⋯ → *About this ad* → AI info, alongside payer/beneficiary and partnership info. Ads Manager shows a pre-publish message when a label will be applied.
- **On-ad self-disclosure** (label next to the Ad/Sponsored tag) applies only where local rules require it: the EU, California, New York, India, Taiwan. In Taiwan and South Korea, photorealistic AI humans from Meta tools may be auto-labelled on the ad itself.
- **Mandatory disclosure** exists only for **social issue / election / political** ads with photorealistic AI people, events or audio. Automated labels can't be removed there, and Meta's gen-AI tools aren't available for those ads. https://www.facebook.com/business/help/1486382031937045
- Restricted verticals (finance, health/pharma, housing/employment/credit, politics) and "certain countries" may lack some gen-AI tools. [primary]
- **Terms:** the Ad creative gen-AI terms (2024-05-06) fold into the Self-Serve Ad Terms effective **2026-11-20**. [primary]

**Is AI creative penalized?**
- No Meta document describes a delivery penalty for AI-made creative. The label is informational. [primary — absence of evidence, noted as such]
- Meta *promotes* AI creative: about 10M advertisers on its tools; +3% conversion rate for video generation in tests (Q1-2026); +7% estimated conversions for image generation (Andromeda post, Dec 2024). [primary]
- What *is* penalized applies to any creative: low ad quality (hides, withheld information, sensationalism, engagement bait). Repeated low-quality or violating ads can lower quality scoring for the whole Page, domain or ad account. [primary] **Inference:** cheap AI slop that people hide hurts the account; well-made AI creative doesn't. [unverified]
- Practitioners: AI vs human creative within 5–15% on CTR, faster fatigue (vendor, small sample); best results from hybrid real-footage + AI-assisted edits. [practitioner] https://socialoperator.ai/learn/ai-ad-creative-benchmarks/

**Policy risk for fashion COD (Rec., grounded in existing rules):**
- **Product misrepresentation** is the real risk. An AI-rendered bag that differs from the delivered product breaks LP parity and drives COD refusals and complaints, which damages ad quality and the account. Generate from **real product photos** (image→video) and QA hardware, texture, colour and logo.
- **Fake people presented as real customers** (AI "testimonials") are deceptive. The US FTC rule bans them explicitly; Meta's deceptive-practices standards apply everywhere. [practitioner] AI models wearing or holding the real product, *without* claiming to be customers, are not prohibited by any Meta rule found. [unverified]
- **Don't strip C2PA metadata to avoid labels.** Meta hasn't banned it, but the label is low-visibility outside the listed regions, Meta says detection will "continue to evolve," and evasion would be a governance risk. [Rec.] Open question: which Kie.ai models actually embed C2PA (§6).

---

## 5. Myths now outdated → proposed staleness-lint additions

### 5.1 BANNED (API-correctness; propose for `playbooks/staleness-myths.md` §A and `config/term-map.json`)

| # | Stale tactic / value | Why | Replacement | Label |
|---|---|---|---|---|
| B17 | `instagram_positions: explore` (and check `explore_home`) | v26: Explore placement removed; selecting it errors | Omit; Advantage+ placements | [primary] |
| B18 | `messenger_positions: story` | Silently stripped on **all** versions from 2026-10-27 | Omit | [primary] |
| B19 | `poll_spec` / `interactive_components_spec.poll` | Rejected on all versions from 2026-10-27 | — | [primary] |
| B20 | Creating or updating legacy ASC/AAC (`smart_promotion_type` …) | API lockout on all versions since 2026-05-19; remaining paused in v26 | Sales + the 3 A+ levers (extends B2) | [primary] |
| B21 | `is_dynamic_creative` on new Sales/App ad sets | Unavailable since Jun 2024 | Flexible / multi-media ads (`asset_feed_spec`) | [primary] |
| B22 | Ad-set placement exclusions (`publisher_platforms`, `*_positions`, `device_platforms`, OS) for Sales/Leads/App | Removed from ad sets (rolling, ~Aug 2026); API enforcement not yet verified → **WARN until tested** | Account-level exclusions by objective · placement value rules · per-placement media | [primary] (UI) / [unverified] (API) |
| B23 | `delivery_estimate` fields `estimate_dau`, `daily_outcomes_curve`, `budget_guardrail` | Removed on all versions 2026-10-27 | Audience-size bounds only | [primary] |
| B24 | Marketing API ≤ v24.0 | v24 expired 2026-10-06; v25 expiry TBD; v26 live | Stay pinned v25 and schedule v26 via `version-upgrade-maintenance` | [primary] |
| B25 | `applink_treatment: web_only` with "Website and app" conversion location | Rejected from 2026-10-27 | Website-only location or proper applinks | [primary] |
| B26 | Synchronous `frequency_value` / `impression_device` / `hourly_stats_aggregated_by_audience_time_zone` without opt-in | Empty since 2026-08-06 | `POST /act_<ID>/insights/feature-settings` (enable-only) or async jobs; frequency history ≤6 months | [primary] |
| B27 | Opt-out templates that list only the old enhancement keys | Newer keys can slip in: `creative_stickers`, `video_filtering`, `video_uncrop`, `image_text_translation`, `translate_voiceover`, `image_background_gen`, `image_animation`, `pac_relaxation` | Enumerate all 23 keys + `asset_feed_spec.audios: []`; GET-verify after create | [primary] |
| B28 | Bid multipliers as a lasting construct | Must migrate to value rules by 2027 | Value rules | [primary] (WARN) |

### 5.2 MYTHS (advisory/WARN; propose for §B)

| # | Myth | Reality (2026) | Label |
|---|---|---|---|
| M9 | "The Andromeda update decides who sees your ad" | Andromeda = retrieval only. Ranking = GEM-taught runtime models + Lattice + Adaptive Ranking. LLM generative retrieval (Meta Generative Recommender) has been live since 2026. | [primary] |
| M10 | "Entity ID" and the ">60% similarity" threshold are Meta facts | Not Meta terms or numbers. Meta's instruments: Creative diversity (H/M/L, images + thumbnails), creative styles (visual/text/story), semantic tokens | [primary] / [practitioner] |
| M11 | Headline, copy, colour, crop or overlay swaps make "new creatives" | Variations of the same creative; diversity needs different visuals *and* message | [primary] |
| M12 | "Load 20–50 ads per ad set; more is better" | Meta: too many ads → fewer exit learning. 50/ad-set cap; 250/Page under $100k/month | [primary] / [practitioner] |
| M13 | "Adding a new ad to a winning ad set is free" | It is a significant edit (re-enters learning); use Creative Testing | [primary] |
| M14 | "Engaged view = 10 s; click attribution includes likes and shares" | 5 s; link clicks only; engage-through for the rest (Mar 2026) | [primary] |
| M15 | "Hook = first 3 seconds" | 46% of Reels purchase conversions happen in the first 2 s of attention → frame 0 | [primary] |
| M16 | "AI creative gets throttled" / "AI creative is invisible to Meta" | No documented penalty; auto "AI info" via C2PA detection; ad quality decides | [primary] |
| M17 | "All AI ads must carry a visible AI disclosure" | Mandatory only for social-issue/election/political ads; on-ad self-disclosure only in EU/CA/NY/India/Taiwan | [primary] |
| M18 | "Meta fully automates ads end-to-end in 2026" | Not shipped; assistants and agents are approval-gated | [primary] |
| M19 | "CTWA free window is 72 h" | Up to 7 days rolling out; billing docs still say 72 h → verify per account | [primary] (conflict) |
| M20 | "Turning off Advantage+ creative at ad level stops all enhancements" | The account-level "Test new creative features" opt-in can still apply them; check Review defaults | [primary] |
| M21 | "Threads/WhatsApp Status are opt-in extras" | Threads auto-included in A+ *and* manual campaigns (4:5). Status (9:16) inside A+ placements where available | [primary] |
| M22 | Mock-ups showing "Sponsored" and a URL footer | Label is "Ad"; FB-feed single-media ads show no URL footer (Mar 2026) | [primary] |

---

## 6. Open questions (to verify in SIRINE's accounts)

1. **API vs UI on placements:** does the API (v25/v26) still accept `publisher_platforms` / `facebook_positions` on Sales ad sets for accounts where the UI removed ad-set placement control, or are they silently ignored? Test on a PAUSED draft and read back `targeting`.
2. **Account-level "placement exclusions by objective":** can it exclude Instagram entirely for Sales, or only the AN/Marketplace/right-column list? (UI check: Advertising settings → Placement controls.)
3. **Creative diversity via API:** is there an Insights field? Meta says creative-insight metrics are in limited agency testing since June 2026.
4. **C2PA in Kie.ai outputs:** which models (Veo, Kling, Seedance, GPT-image, Flux, etc.) write C2PA manifests, and does our ffmpeg/Remotion pipeline preserve them? Test with a C2PA reader, plus Meta's pre-publish "AI info will appear" notice on a PAUSED ad.
5. **Is the 7-day CTWA free window live** on SIRINE's WhatsApp Business account? Are **WhatsApp Status ads** delivering in Algeria?
6. **Muse Image / video-from-static / brand memory:** available in SIRINE's Advantage+ creative? Fidelity test on one bag (hardware, grain, colour) before any use.
7. **Multi-media ads in the API:** exact mapping (`asset_feed_spec` + `asset_customization_rules`?), and whether fatigue and diversity are computed per asset inside a multi-media ad.
8. **v25 expiry date** (TBD) → when to move to v26, and whether to use Meta's new version auto-upgrade (from 2026-07-29).
9. **Our RULE 2:** Meta's official ads MCP now supports any AI app via the business's own developer app, per-tool permission controls (allow/block/ask, per practitioners) and Partnership Ads. Re-evaluate whether it can join the write spine (governance decision for the owner, not made here).
10. **Partnership ads in Algeria:** availability and whether creator permission flows work for Mohamed's account.
11. **GEM's "+18.9% conversions" timeframe** (unstated in the Oct-2026 post) — don't quote it as an annual figure.
12. **Exact date third-party AI detection began for ads** (IAB says June 1, 2026; Meta's page is undated).

---

## Sources

**Meta earnings calls (Meta IR, text-extracted):**
- Q4-2024: https://s21.q4cdn.com/399680738/files/doc_financials/2024/q4/META-Q4-2024-Earnings-Call-Transcript.pdf
- Q1-2025: https://s21.q4cdn.com/399680738/files/doc_financials/2025/q1/Transcripts/META-Q1-2025-Earnings-Call-Transcript-1.pdf
- Q2-2025: https://s21.q4cdn.com/399680738/files/doc_financials/2025/q2/META-Q2-2025-Earnings-Call-Transcript.pdf
- Q3-2025: https://s21.q4cdn.com/399680738/files/doc_financials/2025/q3/META-Q3-2025-Earnings-Call-Transcript.pdf
- Q4-2025: https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/META-Q4-2025-Earnings-Call-Transcript.pdf
- Q1-2026: https://s21.q4cdn.com/399680738/files/doc_financials/2026/q1/META-Q1-2026-Earnings-Call-Transcript.pdf
- Q2-2026: https://s21.q4cdn.com/399680738/files/doc_financials/2026/q2/META-Q2-2026-Earnings-Call-Transcript.pdf
- Q3-2026: https://s21.q4cdn.com/399680738/files/content_files/META-Q3-2026-Earnings-Call-Transcript.pdf

**Meta engineering / research:**
- Andromeda (2024-12-02): https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/
- GEM (2025-11-10): https://engineering.fb.com/2025/11/10/ml-applications/metas-generative-ads-model-gem-the-central-brain-accelerating-ads-recommendation-ai-innovation/
- GEM / Kunlun (2026-10-13): https://engineering.fb.com/2026/10/13/ml-applications/generative-ads-model-gem-scaling-frontier-ads-ai/
- GenRecs Tokenization (2026-10-19): https://engineering.fb.com/2026/10/19/ml-applications/genrecs-tokenization-transforming-ads-recommendation-at-meta-with-stable-model-vocabulary/
- Lattice paper: https://arxiv.org/abs/2512.09200

**Meta for Business news / newsroom:**
- Click attribution (2026-03-03): https://www.facebook.com/business/news/click-attribution
- Pixel + CAPI (2026-04-15): https://www.facebook.com/business/news/pixel-conversionsapi-updates
- Ads AI connectors (2026-04-29, upd. 07-16): https://www.facebook.com/business/news/meta-ads-ai-connectors
- Cannes 2026 (2026-06-23): https://www.facebook.com/business/news/cannes-2026-cross-ai-threshold
- Muse Image (2026-07-07): https://www.facebook.com/business/news/muse-image-for-businesses
- Holiday guidance (2026-08-12): https://www.facebook.com/business/news/holiday-advantage-is-creative-advantage
- Creator Marketing Hub (2026-09-15): https://www.facebook.com/business/news/iab-global-creator-week-making-it-easier-for-businesses-to-partner-with-creators
- Muse for Small Business (2026-09-29): https://about.fb.com/news/2026/09/introducing-muse-small-business/
- Advertising Week NY (2026-10-06): https://www.facebook.com/business/news/advertising-week-new-york-2026
- Threads one year in (2026-01-21): https://www.facebook.com/business/news/ads-on-threads-one-year-in

**Meta developers:**
- v26 (2026-07-29): https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/
- ASC/AAC deprecation (2026-02-13): https://developers.facebook.com/blog/post/2026/02/13/asc-and-aac-deprecation-mapi-v25/
- Insights metric availability (2025-10-16): https://developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/
- Versions / expiry: https://developers.facebook.com/docs/graph-api/changelog/versions
- Breakdowns opt-in: https://developers.facebook.com/docs/marketing-api/insights/breakdowns/
- Advantage+ creative feature keys: https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started

**Meta Business Help Center:**
- Creative diversity: https://www.facebook.com/business/help/2371176336684086
- Managing ad volume: https://www.facebook.com/business/help/2720085414702598
- Ad limits per ad account: https://www.facebook.com/business/help/652738434773716
- Ad limits per Page: https://www.facebook.com/business/help/766697140509126
- Significant edits & learning: https://www.facebook.com/business/help/316478108955072
- Creative fatigue: https://www.facebook.com/business/help/1346816142327858
- Opportunity score types: https://www.facebook.com/business/help/2086509315182746
- Placement settings (what's new): https://www.facebook.com/business/help/1546753450586085
- Placements best practices: https://www.facebook.com/business/help/23942209872116948
- Account controls: https://www.facebook.com/business/help/1438478636941047
- Value rules: https://www.facebook.com/business/help/535014515741813
- Value rules setup: https://www.facebook.com/business/help/1172579563848778
- AI info on ads: https://www.facebook.com/business/help/1010479435004531
- Political/social-issue AI disclosure: https://www.facebook.com/business/help/1486382031937045
- Turn off enhancements: https://www.facebook.com/business/help/1082295769403815
- Review defaults: https://www.facebook.com/business/help/4321026574777213
- Test new creative features: https://www.facebook.com/business/help/2084198785720343
- Creative testing (Ads Manager): https://www.facebook.com/business/help/1423851372208214
- Creative testing (API): https://www.facebook.com/business/help/1376764284076031
- Flexible format: https://www.facebook.com/business/help/835561738423867
- Flexible media: https://www.facebook.com/business/help/1126725172362626
- Dynamic creative: https://www.facebook.com/business/help/170372403538781
- Safe zones: https://www.facebook.com/business/help/980593475366490
- IG Stories specs: https://www.facebook.com/business/help/2222978001316177
- IG Reels ads: https://help.instagram.com/546362593027755
- Reels trending ads: https://www.facebook.com/business/help/705518531802910
- Text in ads: https://www.facebook.com/business/help/223409425500940
- Image ads best practices: https://www.facebook.com/business/help/388369961318508
- Ad auctions: https://www.facebook.com/business/help/430291176997542
- Ad quality: https://www.facebook.com/business/help/423781975167984
- Advantage+ sales campaigns: https://www.facebook.com/business/help/1362234537597370
- Incremental attribution (about): https://www.facebook.com/business/help/2366718460372682
- Incremental attribution (setup): https://www.facebook.com/business/help/644554008179419
- Incremental attribution (results): https://www.facebook.com/business/help/1271619100603114
- WhatsApp Status ads: https://www.facebook.com/business/help/723817683917948
- Click-to-message free window: https://www.facebook.com/business/help/1633888728080924
- WhatsApp billing: https://www.facebook.com/business/help/2225184664363779
- Ads Creative Studio: https://www.facebook.com/business/help/1270229187942739
- Video performance card: https://www.facebook.com/business/help/281871985769645
- Terms streamlining: https://www.facebook.com/business/help/2481113349080785
- Image generation: https://www.facebook.com/business/help/1684513971952814
- Product set minimums: https://www.facebook.com/business/help/599014736904594

**Practitioner / trade press (opinion, labelled):**
- Marketing Brew, Meta spokesperson (2026-09-28): https://www.marketingbrew.com/stories/meta-ad-creative-diversification-best-practices-advertiser-approach
- Jon Loomer, placement controls (2026-08-20): https://www.jonloomer.com/meta-removing-placement-controls-ad-sets/
- Jon Loomer, creative diversification: https://www.jonloomer.com/andromeda-3/
- Jon Loomer, Reply to Keywords: https://www.jonloomer.com/reply-to-keywords-meta-ads-feature/
- Common Thread Collective (2026-09-09): https://commonthreadco.com/blogs/coachs-corner/metas-new-creative-diversity-score-is-live-in-ads-manager-what-ecommerce-brands-must-act-on-now
- Foxwell / Motion benchmarks 2026: https://www.foxwelldigital.com/blog/motion-creative-benchmarks-2026-8-key-takeaways
- Apogee, Andromeda claims audit: https://www.apogee.ad/en/blog/meta-andromeda/
- Novoads, quotes the Dec-2025 Meta post: https://novoads.ai/en/blog/creative-diversity-meta-ads
- 2026 change aggregator (Aurelius): https://www.aureliusmedia.co/blog/meta-ads-updates
- 2026 change aggregator (AdMake): https://admakeai.com/blog/meta-ads-updates-september-2026
- Cannes 2025 (PPC Land): https://ppc.land/meta-announces-generative-ai-advances-for-advertisers-at-cannes-lions/
- Cannes 2025 (eMarketer): https://www.emarketer.com/content/meta-launches-11-new-ai-ad-tools-cannes-lions-2025
- WSJ automation plan (via exchange4media): https://www.exchange4media.com/digital-news/meta-aims-to-fully-automate-advertising-with-ai-by-2026-144037.html
- Reels post-view ads: https://www.socialmediatoday.com/news/instagram-expands-reels-post-view-ads-to-all-advertisers/822317/
- Ad Library API limits: https://adlibrary.com/posts/meta-ad-library-api-limitations
- AI vs human creative benchmarks: https://socialoperator.ai/learn/ai-ad-creative-benchmarks/

*Compiled 2026-11-01. Re-verify placement-control behaviour, Muse Image availability, the CTWA window and v25 expiry before encoding any of them as hard rules.*
