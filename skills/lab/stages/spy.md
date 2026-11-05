# Stage: spy (find winning ads)

Free collector: logged-out headless system Chrome on the public Ad Library, **impressions-sorted** (`sort_data` is honoured).
Details + traps: research/05 and skill `ad-spy`.

```
node cli.mjs spy niche [--market local|regional|inspiration] [--max 120] [--top 300]   # every query in config/niche-sirine.json
node cli.mjs spy premium [--brands "Coach,Aldo"]                          # big-name stores (niche.premium_brands) → segment=premium
node cli.mjs spy search --q "sac femme" --country DZ [--media-type video]
node cli.mjs spy page --page-id <id>                                       # all active ads of one competitor
node cli.mjs spy top --limit 30 [--format video] [--min-days 30] [--tier proven]
node cli.mjs spy media --top 30                                            # download media NOW (signed URLs expire ~4-5 days)
node cli.mjs spy show --id <ad_archive_id>
```
- Needs network → run with the sandbox disabled. Pacing 20–45 s between queries; stop on GraphQL 1675004/13570xx (blocked).
- Winner score = days active + impressions rank + relaunches + page survival (renormalised). "Proven" ≥ 30 days.
- DZ ads disappear when paused: download media at first sight.
- The library shows ONE ad per creative (same page + same copy + format, or Meta collation = a cluster; best-scored with media is the representative) and only ads whose media is cached. UI toggle “Show everything” / API `all=1` shows the raw rows.
- Off-niche junk is cut by `negative_terms` (storage, Quran-school, lunch, makeup, travel, glasses, wholesale…) — Arabic multi-word phrases match as phrases. Hide anything else by hand: `spy star --id X --hide`.
- Premium segment: 16 big-name bag/shoe stores (Charles & Keith, Pedro, Aldo, Steve Madden, Michael Kors, Coach, Kate Spade, Tory Burch, JW PEI, Songmont, Polène, Longchamp, Parfois, Kurt Geiger, Furla, Guess). Their page vouches for the category; still killed by an off-niche head word. Borrow light, pacing and camera language — never marks, models or music.
- Paid backup if the free collector gets blocked: ScrapeCreators ($47, 25K credits, no expiry); SerpApi free tier.
