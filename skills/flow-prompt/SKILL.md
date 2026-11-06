---
name: flow-prompt
description: Turn a creative-lab prompt code (FL-XXXXX = reference ad + SIRINE store product + format) into a Google Flow prompt — by default ONE combined all-scenes video prompt (Omni, 10 s, fast cuts, optional Arabic-script Darija voice-over, all colourways), delivered as a numbered UPLOAD photo folder + a Notepad prompt file; or the older scene-by-scene production pack.
trigger: ["FL-", "prompt code", "flow prompt", "write the flow prompt", "/flow-prompt", "veo prompt for"]
when_to_use: Whenever the owner sends a code like FL-7K2QM (or "write the Flow prompt for FL-…"). Codes are made in the lab UI (ad → "Get prompt code") or with `node cli.mjs brief new`.
---

# flow-prompt — code → Flow prompt (one-video default, scene-by-scene optional)

Owner's bar (2026-11-05): "split, detailed prompts per scene based on the products, generate the scenes separately
and combine them later; add a Darija voice-over if the original has one; Flow models are advanced — use them,
don't hold back." Sloppy = one vague prompt for a whole ad. Good = the reference rebuilt shot for shot.

Project `C:/Users/DELL/ad-engine/creative-lab/`. Worked example: `data/briefs/FL-KUYV6/PROMPT.md`.

## ★ DEFAULT FORMAT (owner 2026-11-06): ONE video, all scenes, one paste — `format: one-video` in the brief header
The CONTEXT.md header says `ONE video, all scenes, 10s total` / `scenes per scene`, `Darija VO on|off|auto`, and
`colours ALL in-stock colourways | picked colourway only`. For `one-video` (the default from the UI):

1. `node cli.mjs brief context --code …`. Build the evidence if it's missing. Read the contact sheet, the hook strip
   and all product photos, as below.
2. Write **ONE prompt for ONE Flow generation**: Omni (newest), 9:16, **10 s max**, 720p, 1 output, 5–6 shots of
   ~1.5–2 s with hard cuts on movement. Use this skeleton; the worked example is
   `data/briefs/FL-HCGC7/PROMPT-4-COLOURS-v5-10s.txt`:
   `TASK:` first line ("Generate ONE single VIDEO (not images)…", model, ratio, duration, resolution, outputs, audio)
   → `STYLE:` → `REFERENCES (attached): Image 1 = … ` → `PRODUCT` (one design block, no colour words) →
   `THE FOUR COLOURS` (one line per colourway: colour + sole/lace exceptions; for `colours one` keep only the picked
   one) + a "never mix/swap" sentence + a fixed left→right line-up order, alternating light/dark →
   `STUDIO` (+ hands) → `SHOTS:` `1 (0–2 s) …` → `VOICE-OVER` → `SOUND EFFECTS` (no music, no whooshes).
3. **Voice-over** (`vo on`; for `auto`, only if the reference has speech): 2 short lines in 10 s, max ~8 words each.
   - Write the Arabic **in Arabic script with tashkeel**. Put each line **alone on its own line**, with no
     «» quotes and no Latin text on that line.
   - Put the timing on the line above it ("Line 1, from 0.3 to 4.5 seconds:"). Put a
     `(pronounced: …)` Latin guide on the line below it.
   - Describe the voice: young Algerian woman, Algiers Darija, NOT Egyptian/Gulf/Moroccan/MSA, warm, clean
     close-mic, off-screen.
   - Keep the price out of the voice. It goes in the edit.
   - Validate every line with validate-compliance (the Arabic and the arabizi, one line at a time).
   - Arabizi-only lines came out sloppy, and Arabic copied from chat came out reversed. Arabic copied from Notepad
     comes out right.
4. **Deliver with `tools/flow-deliver.mjs`. Do this every time; it is not optional.** It copies the numbered photos to
   `Downloads/<CODE> <label>/UPLOAD/`, writes `<CODE> FLOW PROMPT.txt` as UTF-8 with a BOM, and opens **Explorer on
   UPLOAD plus Notepad on the prompt**:
   `node tools/flow-deliver.mjs --code FL-X --label <slug> --prompt <file> --photo "1-ROSE-pack=<src>" --photo …`
   - Photo order = the `Image N` order in the prompt.
   - For `colours all`: one pack/hero photo per colourway in line-up order, then 1–2 detail photos and a 4-up
     sneaker/variant board if useful (`magick … +append`).
   - Product photos are `data/media/products/<slug>/ref-N`; each colourway is its own slug (`pack-hobo-rose`, …).
5. Also save the prompt with `brief prompt --code … --file …` so the code page keeps it.
6. **Reply to the owner = the image list + the full prompt in one code block. Nothing else**
   (memory `feedback-flow-deliver-prompt-plus-images-only`). Tell him to copy the prompt from Notepad.

`format: scenes` still uses the scene-by-scene pack below.

## Scene-by-scene steps (`format: scenes`, from evidence)
1. `node cli.mjs brief context --code FL-XXXXX` → `data/briefs/<code>/CONTEXT.md` (+ `context.json`).
   It lists the **shot list** (start/end/keyframe per shot), speech detection and the product photos.
   No evidence yet → `node cli.mjs analyze evidence --ids <ad_id>` and re-run.
2. **Break the reference down** — read the contact sheet, the hook strip and EVERY shot keyframe. For each shot write:
   framing (ECU/CU/MS/WS), angle, lens feel, camera move + speed, subject action, set/props, light (direction,
   hardness, colour temp, time of day), grade/texture, transition into the next shot, sound. Merge shots the detector
   split by mistake; split shots it merged (watch for the same framing on both sides of a "cut").
3. **Voice:** if `video.speech` is `likely` (or the owner set VO `on`), transcribe it properly first
   (`whisper-cli` large-v3-turbo `--lang ar|fr`, or the skill `video-understanding`), note gender/tone/pace, then
   write a NEW Darija script for our product (same structure: hook → proof → offer → CTA), timed to the scenes.
   If the reference is music-only and VO is `auto` → no VO, but give one optional VO line set.
4. **Study every product photo** (`product.photos[].local_path`): silhouette, exact colour (name + hex from
   `product.colours`), material/texture, stitching, hardware with counts, straps/handles, logo plate, every pack piece,
   gift. Write ONE canonical product description and reuse it verbatim in every scene that shows the product.
5. **Write the pack** (format below) to `data/briefs/<code>/PROMPT.md` and save:
   `node cli.mjs brief prompt --code FL-XXXXX --file data/briefs/FL-XXXXX/PROMPT.md`. Run every Darija line through
   `node tools/validate-compliance.mjs --lang ar-DZ --sac '[]' --text "<line>"` (one line at a time).
6. **ALWAYS (owner rule 2026-11-06): deliver with `tools/flow-deliver.mjs`** (folder + Notepad prompt, see DEFAULT above). Manual equivalent: create
   `C:/Users/DELL/Downloads/<CODE> <product-slug>/` holding the pack's numbered photos (`2-pack-studio.jpg`,
   `3-sneakers-side.jpg`, … — photo N = `data/media/products/<slug>/ref-(N-1)`, skip unused ones), then open it:
   `explorer.exe "$(cygpath -w "$dir")"`. Do it unasked at the end of every pack and at the start of every Flow run.

## Flow capabilities to USE (checked 2026-11-04/05; third-party items flagged)
- **Models:** Veo 3.1 **Quality** (best image; no Ingredients) · **Fast** (Ingredients, good) · **Lite** (drafts, Extend) ·
  **Gemini Omni Flash** (any input, up to 10 s, **voices** via Add → Voices, `@Voice` in an Ingredients prompt) [third-party].
- **Modes:** Text→video · **Frames** (start and/or end image; start is followed closely) · **Ingredients** (product /
  character / style refs) · **Extend** · Scenebuilder to join. Frames + Ingredients can't mix in one generation.
- **Characters** (left nav) + **image generation** inside Flow: build the model once, reuse her as `@Character` in every
  scene → same woman, same wardrobe across the ad.
- **Audio** is native: ambience, foley, music, and spoken lines in quotes. Lip-synced on-camera Darija is unreliable —
  put Darija as **off-screen narration** (or record/clone it and lay it in the edit).
- 9:16 native; 4/6/8 s on Veo (Omni 4–10 s). Upscale 1080p free; 4K on Ultra.
- Prompt grammar that works: **[Shot & lens] → [Subject with locked product description] → [Action with in-shot
  timing] → [Setting] → [Light] → [Grade/texture] → [Audio] → [Continuity + lock sentence]**. Positive phrasing.
  One camera move per scene. Name the time of day and the light source.

**Seen in the live Flow UI 2026-11-06 (owner's Plus account = `flow.google.com/u/1/`):** video models in the
dropdown are exactly **Omni 1.1 Flash** (default) · **Veo 3.1 - Lite** · **Veo 3.1 - Fast** · **Veo 3.1 - Quality**;
image default **Nano Banana 2.1**. The project opens on an **agent chat** whose settings (sliders icon) hold
"Confirm before generating: Always/Never" (keep **Always** — Never spends credits unprompted), image aspect
16:9/4:3/1:1/3:4/9:16 × x1–x4, video aspect 16:9/9:16 × x1–x4; prompt chip shows `Video · 720p · 6s`.
Changelog: **Omni 1.2** rolling out — up to 15 s, extend 10 s at a time with image/character/voice ingredients.
Plus gives 50 extra Flow credits daily. Don't change the owner's Flow settings without asking.

**End-frame landing (FL-HCGC7):** when the reference shot is "an item gets set down", use Frames with the store
packshot as the **END** frame — the clip starts with the item in the air (full pack still visible at 0) and lands
exactly on the real product. Write the settings line as `Attach: **2**. Use it as the END (last) frame only; …` —
the UI parser reads any "start frame" text on the line as a start frame, and `**2** as the END…` breaks the photo list.

**Batch / multi-shot in ONE generation WORKS (owner test 2026-11-06, FL-HCGC7):** a combined prompt with several
shots joined by hard cuts generated fine — so "one scene = one generation" below is the fidelity-first default, not a
hard limit. Batch format that reads cleanly (`data/briefs/FL-HCGC7/COLOURS-BATCH.txt`): global blocks once
(REFERENCES with image numbers · PRODUCT · COLOURWAYS · STUDIO · HANDS · RULES), then `SHOT n · NAME · abs time`
with CAMERA / FRAME 0 / ACTION (absolute seconds of the whole film, not 0–8 s per scene) / COLOUR CHECK / AUDIO.
**All-colourways version:** owner wants the range shown (every in-stock colourway). One design block without colour
words + one line per colourway (hex + sole/lace exceptions) + ONE combined lock ("each keeps its own shade, a bag and
its sneakers are always the same colourway, never blend/swap, no fifth colour") + a FIXED left→right line-up order
alternating light/dark so similar colours never touch (hobo: ROSE · NOIRE · BEIGE · MARRON). Upload folder = one
pack photo per colour in line-up order + scene details + a 4-up sneaker board; also a `0-FALLBACK-lineup-board.jpg`
(all packs side by side) for when Flow caps the number of ingredients.

## Production rules
- **One scene = one generation.** Generate each reference shot as its own 4–8 s clip (even if the final cut uses 1 s
  of it — the extra length gives handles to cut on motion). Never ask Flow for multi-cut sequences.
- **Prep first (Scene 0):** (a) a **Character** sheet if people appear (faceless/neck-down unless the owner wants faces;
  modest Algerian styling by default — hijab, long sleeves); (b) a **product hero still** made in Flow image gen from
  the real photos in the ad's world, used as the **Frames start image** for product-critical scenes → strongest
  fidelity; (c) the product photos uploaded as ingredients.
- **Continuity bible** (location, time of day, light, palette, wardrobe, grade, lens family, film texture) is pasted
  verbatim at the end of EVERY scene prompt.
- **Product lock sentence** at the end of every product scene: exact shape, colour, texture, stitching, hardware count,
  every pack piece; "nothing added, nothing missing".
- Owner rules: the **full pack visible in the first scene's first frame**; no on-screen text/prices/logos from the model
  (they're added in the edit); price + «الدفع عند الاستلام» rail from frame 0; no SFX on cuts; never copy the
  competitor's marks, faces, signature sets or music — borrow light, pacing, camera language, styling.
- **Colour variants (owner 2026-11-05):** every product prompt carries exactly one bracketed
  `[COLOUR LOCK: …]` segment (from `product.colourways[].colour_lock` in context.json — measured hex + descriptor +
  per-piece exceptions like sole colour). Everywhere else describe shape/material/hardware WITHOUT colour words for
  the product, so the UI's colour picker can swap the lock (and the photo strip) to any colourway. Product-free scenes
  have no lock.
- **Photo list format** near the top: a numbered list `N. **label:** <url>` using the store photo URLs — the UI matches
  them to thumbnails and builds the zip downloads; settings lines say `Attach: **5, 6, 2**` / `**Start frame:** photo 2`.
- Choose the model per scene: product-in-scene → Fast Ingredients (or Frames from the hero still); product-free
  atmosphere → **Quality** Text/Frames; anything with a voice → Omni Flash.

## Deliverable format (PROMPT.md) — keep the headings exactly (the UI makes one Copy button per `> ` line under each `## Scene` heading)
```
# FL-XXXXX · <product> × <reference> · 9:16 · ~N s · <n> scenes
## Breakdown of the reference      (table: shot · time · framing/angle · camera · action · light · sound · why it works)
## Product lock                     (the canonical description, reused verbatim)
## Continuity bible                 (pasted at the end of every scene prompt)
## Voice-over                       (Darija script timed to scenes + delivery notes, or "none — music only" + optional lines)
## Scene 0a — Character …            (Flow image prompt as a `> ` line)
## Scene 0b — Product hero still …   (Flow image prompt as a `> ` line, attach photos)
## Scene 1 — <role> (<ref time> → use <n> s)
Model · Mode · Aspect · Length · Outputs · Attach/start frame
> <one line, 180–320 words, the full grammar above>
Use: <which seconds to keep, cut point>  ·  If it drifts: <fallback>
## Scene 2 … (one per reference shot, merged/adapted where needed)
## Assembly                         (timeline table: scene · in/out · transition · VO line · overlay text · music)
## QA                               (product checks + continuity checks + policy)
```
