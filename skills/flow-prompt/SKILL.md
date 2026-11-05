---
name: flow-prompt
description: Turn a creative-lab prompt code (FL-XXXXX = reference ad + SIRINE store product + format) into a scene-by-scene Google Flow production pack — the reference broken into its shots, one rich standalone prompt per scene rebuilt around the real product, a continuity bible repeated in every scene, prep assets (character + product hero still), an optional Darija voice-over, and the edit/assembly plan.
trigger: ["FL-", "prompt code", "flow prompt", "write the flow prompt", "/flow-prompt", "veo prompt for"]
when_to_use: Whenever the owner sends a code like FL-7K2QM (or "write the Flow prompt for FL-…"). Codes are made in the lab UI (ad → "Get prompt code") or with `node cli.mjs brief new`.
---

# flow-prompt — code → scene-by-scene Flow production pack

Owner's bar (2026-11-05): "split, detailed prompts per scene based on the products, generate the scenes separately
and combine them later; add a Darija voice-over if the original has one; Flow models are advanced — use them,
don't hold back." Sloppy = one vague prompt for a whole ad. Good = the reference rebuilt shot for shot.

Project `C:/Users/DELL/ad-engine/creative-lab/`. Worked example: `data/briefs/FL-KUYV6/PROMPT.md`.

## Steps (all of them, from evidence)
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
