// Writes the per-stage docs of the `lab` skill. Edit the text here, then: node skills/lab/stages/_write.cjs
const fs = require("fs");
const path = require("path");
const D = {
  "spy.md": `# Stage: spy (find winning ads)

Free collector: logged-out headless system Chrome on the public Ad Library, **impressions-sorted** (\`sort_data\` is honoured).
Details + traps: research/05 and skill \`ad-spy\`.

\`\`\`
node cli.mjs spy niche [--market local|regional|inspiration] [--max 120] [--top 300]   # every query in config/niche-sirine.json
node cli.mjs spy premium [--brands "Coach,Aldo"]                          # big-name stores (niche.premium_brands) → segment=premium
node cli.mjs spy search --q "sac femme" --country DZ [--media-type video]
node cli.mjs spy page --page-id <id>                                       # all active ads of one competitor
node cli.mjs spy top --limit 30 [--format video] [--min-days 30] [--tier proven]
node cli.mjs spy media --top 30                                            # download media NOW (signed URLs expire ~4-5 days)
node cli.mjs spy show --id <ad_archive_id>
\`\`\`
- Needs network → run with the sandbox disabled. Pacing 20–45 s between queries; stop on GraphQL 1675004/13570xx (blocked).
- Winner score = days active + impressions rank + relaunches + page survival (renormalised). "Proven" ≥ 30 days.
- DZ ads disappear when paused: download media at first sight.
- The library shows ONE ad per creative (same page + same copy + format, or Meta collation = a cluster; best-scored with media is the representative) and only ads whose media is cached. UI toggle “Show everything” / API \`all=1\` shows the raw rows.
- Off-niche junk is cut by \`negative_terms\` (storage, Quran-school, lunch, makeup, travel, glasses, wholesale…) — Arabic multi-word phrases match as phrases. Hide anything else by hand: \`spy star --id X --hide\`.
- Premium segment: 16 big-name bag/shoe stores (Charles & Keith, Pedro, Aldo, Steve Madden, Michael Kors, Coach, Kate Spade, Tory Burch, JW PEI, Songmont, Polène, Longchamp, Parfois, Kurt Geiger, Furla, Guess). Their page vouches for the category; still killed by an off-niche head word. Borrow light, pacing and camera language — never marks, models or music.
- Paid backup if the free collector gets blocked: ScrapeCreators ($47, 25K credits, no expiry); SerpApi free tier.
`,
  "analyze.md": `# Stage: analyse → creative DNA

1. \`node cli.mjs analyze evidence --ids a,b [--no-asr]\` → \`data/evidence/<id>/EVIDENCE.md\` + contact sheet + 0–3 s hook strip + keyframes + ASR lead (whisper-small, first 25 s; large-v3-turbo is too slow).
2. Read EVIDENCE.md → the contact sheet → the hook strip (keyframes only if ambiguous). **ASR is a lead, never a fact** (music → hallucinated lyrics).
3. \`node cli.mjs dna template --id <id> > data/dna-drafts/<id>.json\`, fill EVERY field with taxonomy values only (\`config/taxonomy.json\`).
4. \`replication\` is written for OUR constraints: real photos, AI plates, camera-only motion, text in Remotion. Hands / unboxing / try-on / talking people → \`needs_shoot\`. Record \`ip_flags\` (replica marks, designer names, copyrighted music, other sellers' footage).
5. \`node cli.mjs dna set --file data/dna-drafts/<id>.json --analyst claude\` — retry until it validates. \`dna list\` to see the library.

Fan-out: ≤3 opus subagents, 3 ads each, brief = steps 2–5. Example of the expected depth: \`data/dna-drafts/1350521436517345.json\`.
Traps seen: Moroccan sellers (DH, "maroc") in DZ results — keep the structure, not the market; claims like "جودة مضمونة" and unverified star ratings are copy risks, never copy them.
`,
  "style.md": `# Stage: style cards

A style is product-agnostic: beats (role, shot, strategy=fidelity rung, scene, camera, overlays→slots), rail, end card, copy patterns, audio, fit.
Schema: \`schemas/style.schema.json\`. Source of the current 10: \`styles/_build-styles.cjs\` → \`styles/<id>.json\` → \`node cli.mjs style set --file styles/<id>.json\`.

Rules that preflight enforces (write them in from the start):
- Frame 0 shows the FULL pack (bundle_layout / colour_lineup / on_model photo). Price + COD rail \`from_frame0: true\`.
- Plate beats (\`ai_plate_composite\`, \`ai_plate_harmonize\`, \`ai_i2v\` start): \`scene\` and \`composition\` describe an EMPTY set ("an empty area … where objects will be placed later"). Naming the product in a plate prompt makes the model invent one (P5 BLOCK).
- No negation words (logo/box/text/brand) in scenes — FLUX is positive-only.
- \`motion\` = what stays still; the camera move comes from \`camera\`. Don't write degrees that fight the compiler's move.
- Hook patterns ≤ 42 chars after filling; only slots that exist (\`question\` / \`review\` are never invented).
- 10 jobs in one batch must differ on ≥3 of 8 keys (product, format, archetype, hook_type, first_subject, setting, talent, on_image_text) — B1.
- Carousel format is NOT supported by the assembler yet (renders frame 0 only) — use image or video.
Blend: \`batch new --items "slug:styleA+styleB"\` (hook from A, body from B, end card from the last).
`,
  "product.md": `# Stage: products

- \`node cli.mjs product sync\` (Turso, falls back to the public feed; network) → \`product list --in-stock\`, \`product show --slug X\`.
- Refs: index 0 = hero, others alt; \`kind\` (packshot/scene/detail) is auto-classified. Packshots feed cut-outs; scene photos feed on-model beats.
- Add real photos: \`product ref-add --slug X --file path --role detail|in_hand|gift|packaging\`; reject a bad one: \`product ref-approve --slug X --idx N --off\`.
- \`config/product-specs/<family>.json\` = pieces (ar/fr/en), hardware counts, colourways, \`display_name\`, \`benefits\`. Written by Claude from the photos, **confirmed by the owner**. Store \`details\` win; spec \`benefits\` fill in when the store field is empty; a Latin-only Arabic gift name is replaced by the spec's gift piece.
- Store-data problems block or warn at preflight — fix them in the STORE, not around it: «منقوش/بنقشة» in cabas-amazigh and croco-trio details (P10 BLOCK), Latin-only Arabic names, AI-looking pack-classique photos.
- Never advertise out-of-stock (P1) or pack-sac/sabo refs (designed ads with text; sabo has health claims).
`,
  "batch.md": `# Stage: batch + pre-generation audit

\`\`\`
node cli.mjs batch new --file data/batches/batch-001.json        # {name, lang, items:[{product, styles:[...]}]}
node cli.mjs batch new --items "pack-hobo-noire:new-arrival-onmodel,pack-djine-noire:detail-macro-quality" [--placements 9:16,4:5] [--lang fr] [--draft]
node cli.mjs batch preflight --batch <id>
node cli.mjs batch show --batch <id> [--job <id>]
\`\`\`
Compile = beats → rung → Kie route (\`config/routing.json\`) → prompts + refs, overlay slots from store + brand kit, ad copy draft (one language, deduped lines), EDL per placement, cost.

Preflight (BLOCK stops generation): P1 stock · P2 refs · P3 spec · P4 FR1 real pixels · P5 FR4 prompt hygiene (+ product-free plates) · P6 Kie input schemas · P7 LP price parity · P8 compliance per FIELD (ad-engine \`validate-compliance.mjs\`) · P9 one language · P10 brand/Darija rules · P11 shoot needed · P12 COD frame 0 · P13 hook frame 0 · P14 length · P15 compiler · P16 overlay length · B1 distinctness · B2 credit cap.
Report the dry-run cost to the owner before asking for \`--confirm\`.
`,
  "gen.md": `# Stage: generate (Kie.ai)

\`\`\`
node cli.mjs gen run --batch B --confirm B --dry-run          # writes every request to jobs/*/dry-run/, runs local ops, 0 credits
node cli.mjs gen run --batch B --confirm B --mock             # faithful local mock of Kie
node cli.mjs gen run --batch B --confirm B [--stage A|B] [--through] [--max-credits N]   # LIVE, needs KIE_API_KEY in creative-lab/.env
node cli.mjs gen status --batch B
\`\`\`
- Stage A = stills (plates, cut-outs, harmonise, compose); review them (stage qa) BEFORE stage B (image-to-video). \`--through\` skips the pause.
- Resumable: tasks with a provider id are polled, never re-created. 402 = out of credits → stops.
- Model choice, prompts and Kie quirks: skill \`kie-ai\`.
- The owner approves spend: never run live without an explicit \`--confirm <batch>\` from them in this conversation.
`,
  "qa.md": `# Stage: QA (after generation)

- Deterministic gates run automatically on every output: spec/dims, black/freeze/cuts, pixel-lock on composites (AE \`-fuzz 3%\` on an eroded mask ≤0.5 % + ΔE00 ≤1.5; PHASH is unstable on near-black products), colour ΔE00.
- Vision QA (Claude): \`node cli.mjs qa pack --batch B [--stage A|B]\` builds reference-vs-output compare sheets. Read each sheet; judge identity, colour, hardware count, invention (text/boxes/extra products), anatomy, temporal drift against research/04 §6 (Q1–Q10). Record: \`node cli.mjs qa set --file qa.json\` (schema \`schemas/qa-vision.schema.json\`).
- Pick the candidate to use: \`qa select --task <id>\`. Max 3 attempts per shot, then change rung (e.g. L4 → L1 Remotion move).
`,
  "assemble.md": `# Stage: assemble (Remotion)

\`node cli.mjs assemble run --batch B [--job J] [--placeholder] [--scale 0.5]\` → resolves the EDL, renders via \`remotion/tools/render-lab.mjs\` (comps \`lab-ad\` video, \`lab-still\` image) for 9:16 + 4:5, then final QA (dims, codec, duration, rail, safe zones).
- Inspect EVERY final yourself: vkit contact sheet (\`~/.claude/skills/video-understanding/scripts/vkit.mjs <mp4> --sub sheet\`) or the PNG. Check Arabic joins + RTL, nothing covers a face or the product, full pack in frame 0, rail from frame 0, Reels safe zone.
- Scene/on-model photos are fitted with \`smart\` mode: crop when it loses ≤12 %, else whole photo + blurred side fill (a 4:5 centre crop cut the face and the shoes).
- \`assemble approve --asset <id>\` is the OWNER's call (required before export).
`,
  "export.md": `# Stage: export → ad-engine

\`node cli.mjs export run --batch B\` copies APPROVED finals + copy (primary/headline/description, \`url_tags\` with \`utm_content={{ad.id}}\`) + lineage + manifest to \`ad-engine/config/clients/sirine-01/creative/lab-<batch>/\`.
Launch only through ad-engine \`/ads launch\` (compliance → dry-run diff → --confirm). Mark AI-made creatives honestly; keep Advantage+ generative enhancements OFF (opt-out lists all enhancement keys).
`,
};
for (const [f, t] of Object.entries(D)) fs.writeFileSync(path.join(__dirname, f), t);
console.log(Object.keys(D).length, "stage docs written");
