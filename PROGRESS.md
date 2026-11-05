# creative-lab — build progress (living checklist)

Started 2026-11-01. Last updated 2026-11-04 (evening session). Design: `ARCHITECTURE.md`. Research: `research/01–05`.

## Decisions (flagged to owner)
- Project `ad-engine/creative-lab/`, Node 22 ESM, only dep `playwright-core@1.61.0` (drives system Chrome).
- Library = `node:sqlite` (`data/lab.db`). UI = zero-dep local server :4317 (cannot spend).
- Spy = public web Ad Library via headless Chrome, impressions-sorted by default.
- "kei ai" = Kie.ai (aggregator). Generation is adapter-based (`lib/kie/*`).
- Fidelity ladder L0–L6 (research/04): real product pixels always; text only in Remotion; L6 blocked.
- Generation gated by `--confirm <batch>`, staged A (stills) → review → B (motion), credit cap.

## Done + verified (2026-11-01 → 11-03)
- [x] Collector + scoring — LIVE crawl: 14 searches, 1,141 ads, 624 in-niche, 97 winners, 206 media files, 0 blocks
- [x] Product sync from Turso — LIVE: 66 products, 175 photos
- [x] Evidence packs (25), DNA schema/taxonomy/CLI, styles schema + blend, compiler, preflight P1–P16 + B1/B2
- [x] Kie registry (195 models), client, mock; runner (dry-run/mock/live, staged, resumable); compose + pixel-lock; QA
- [x] Product specs for 8 families (owner not yet confirmed)

## Done + verified (2026-11-04)
- [x] Remotion engine: tsc clean; `out/lab-sample-9x16.mp4` re-rendered; contact sheet read — Arabic joins/RTL OK, rail from frame 0 at y≈1200, hook inside the safe band
- [x] UI: /api/stats, /api/ads, /api/batches, /api/batches/<id> → 200; traversal guard 403 on `../`, `..%2f..`, `%2e%2e`; screens 11–13 (batches, new batch, batch detail), 0 console errors
- [x] assemble/approve/export: `node tests/run.mjs --render` 103/103
- [x] 9 remaining DNA saved (25 total)
- [x] 10 style cards (`styles/_build-styles.cjs` → `styles/*.json` → DB); fixture styles removed from DB; test batch b20261101-01 deleted
- [x] batch-001 = **b20261104-01**: 10 jobs, 0 BLOCK, 749 credits ≈ $3.75; dry-run wrote 59 requests; j06 (real photo, 0 credits) assembled
- [x] Fixes: spec.benefits fallback; Latin-only Arabic gift → spec gift piece; deduped copy lines; P5 blocks product nouns in plate prompts; fit mode `smart` (blurred side fill) for scene photos; hobo spec «بنقشة» removed
- [x] Skills `lab` (+9 stage docs), `ad-spy`, `kie-ai` junctioned into ~/.claude/skills; `/ads lab` in the ad-engine router + COMMANDS.md
- [x] README.md, COMMANDS.md, .env.example, .gitignore, deny `Read(./creative-lab/.env)`; memory `project-creative-lab.md`

## Open (owner)
- [ ] Kie.ai API key → `creative-lab/.env`, then `node cli.mjs gen run --batch b20261104-01 --confirm b20261104-01 --stage A`
- [ ] Store text: «بنقشة/منقوش» in pack-croco-trio + cabas-amazigh details (P10 blocks them); Latin-only Arabic names; pack-classique gift "trousse offerte"
- [ ] Confirm the 8 product specs; pack-classique photos look AI-made
- [ ] Carousel assembly not implemented (renders frame 0 only)

## 2026-11-05 — library refinement + prompt codes + premium tier
- [x] Library curated by default: one representative per creative cluster (same page+copy+format or Meta collation), only ads with cached media; "Show everything" toggle; result line bug ("undefinednull") fixed
- [x] Fresh DZ/MA/TN/FR crawl (13 queries, 1,047 media files) + `spy premium`: 13 big brands (Charles & Keith, Pedro, Aldo, Steve Madden, Michael Kors, Coach, Kate Spade, JW PEI, Songmont, Polène, Longchamp, Kurt Geiger, Furla; Guess/Tory Burch/Parfois found no page), 641 media files; brand page match = name starts with brand (fixed "Migraine Coach"/"Furlan Marri" false matches)
- [x] Visual curation by Claude: 234 off-niche/replica/apparel/jewellery ads hidden → 132 local + 182 big-brand creatives
- [x] negative_terms expanded (storage, Quran-school, lunch, makeup bag, travel/sport, glasses, wholesale, tools…); Arabic multi-word phrases now match
- [x] Product thumbnails (480 px) — the product grid loaded 66 × 1.2 MB PNGs
- [x] Prompt codes: `briefs` table + `lib/briefs.mjs` + CLI `brief new/list/context/prompt/show` + API + UI (ad/style → "Get prompt code" → product + format → FL-XXXXX; code page with per-clip copy buttons + catalog photos); skill `flow-prompt`
- [x] 9 premium DNA (34 total) + 3 premium styles (13 total); demo code FL-7QDW4 (Polène cloud × Sac Vernis Noir) with full prompt
- [x] Tests 92 unit / 117 e2e
