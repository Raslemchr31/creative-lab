# 04 — GenAI Ad Production Playbook: replicate winning styles with the REAL product

> **Client:** SIRINE (`sirine-01`): Algerian women's bags, shoes and "packs" (bag + matching sneakers + free gift, 4,200 DZD vs ~~5,800~~, COD, 69 wilayas). Copy is in Darija, MSA or French.
> **Pipeline:** creative-lab (spy → DNA → compiler → Kie.ai → QA → Remotion assemble). Models are called through **Kie.ai**. All text, price and brand marks are composited in **Remotion**.
> **Research date:** 2026-11-01. Every model fact below was re-verified live today, because the landscape moved a lot after the June-2026 notes.
> **Reads first:** `research/raw/creative-and-prompts.md` (formats, hooks, copy frameworks, generic prompt anatomy) and `templates/higgsfield-3layer.md` (keyframe / identity / motion separation). This file does not repeat them; it extends them.
>
> **Evidence tags:**
> - **[official]**: vendor documentation, model card or vendor blog.
> - **[practitioner]**: a credible third-party guide, test or benchmark.
> - **[unverified]**: a single anecdote, or a claim I could not confirm.
>
> I also use two extra tags:
> - **[first-party]**: SIRINE's own data or the project memory files.
> - **[inference]**: my own reasoning from the cited facts.
>
> URLs are inline and collected in §10.

---

## 0. TL;DR

### 0.1 The one-paragraph version
- Product pixels come from real photos.
- Models make the *world around* the product: plates, light, environment, and camera-only motion.
- Remotion makes every word and number.
- QA proves the product wasn't changed before a human ever looks.

Rung labels (L0–L6) are defined in the fidelity ladder in §3.1.

### 0.2 Per-task model choice (Kie ids, verified 2026-11-01)

| Task | Default | Challenger(s) | Why |
|---|---|---|---|
| Clean background plate (still) | `flux-3/klein-text-to-image` (exact 1088×1360 for 4:5, `seed`, `enhance_prompt:false`; about $0.008–0.03/image) | `nano-banana-2-1` (native 4:5, 2K/4K) | Cheapest controllable plate; no product is generated |
| Cut-out of the real product | `recraft/remove-background` | `qwen2-1/image-to-image` with `background:"transparent"` (licence check) | Alpha for the L1 composite |
| Product **unobstructed** in a scene | **No model on the product**: Remotion composite (L1). Optional harmonise with `nano-banana-2-1` / `nano-banana-pro` (semantic edit) or `qwen2-1` (`mask_url`), then **paste-back** | `ideogram/v3-edit` (mask + negative prompt) | Only compositing guarantees pixel identity; OpenAI says so explicitly [official] |
| Product **worn or held** (still) | `gpt-image-2-5-sunburst-image-to-image` (16 refs; **#1 on AA image editing, Elo 1199**) | `nano-banana-2-1` (#6, 1151; 10 object refs, native 4:5) · `seedream/5-pro-image-to-image` (#9, 1131) · `nano-banana-pro` (#18, 1108; best documented Arabic/French text) | Best documented preserve-list editing. **The board is overall editing, not product fidelity**, so A/B on your SKU with §6 |
| Clone a reference ad's layout | `seedream/5-pro-layer-decomposition` → background plate + real cut-outs | `gpt-image-2-5-sunburst` ("image 1 = layout only") | Strips the reference's text, logos and product cleanly |
| Product camera move / loop | **Remotion 2.5D on the real cut-out (L1)** | `kling-3.0-omni/image-to-video` | Zero generated product pixels; the Pack Noir loop format [first-party] |
| Product-only AI motion (light sweep, small arc, reveal) | `kling-3.0-omni/image-to-video`: real first (+last) frame, element of 2–4 real views, `audio:false`, ≤5 s | `bytedance/seedance-2` first+last frame, `aspect_ratio:"9:16"`, `generate_audio:false` | Kling 3.0 / 3.0 Omni are the only Kie endpoints with frame lock + multi-view identity in one call. Seedance 2.0 is #3 on AA image-to-video and best on AdSpark product text, key-region and cross-shot scores |
| Orbit / turntable | **Real phone turntable (L0)** | `kling-4.0/keyframe-to-video` with 3–4 real angle photos → `kling-3.0-omni` first+last+element | Every angle is real, so there is no invented back side |
| Lifestyle (person carrying or wearing) | **Real model (L0)** → `kling-3.0-omni/image-to-video` (real outfit photo as first frame + product element, neck-down) | `google/gemini-omni-flash-1-1` (`IMAGE_REF`s, "one single continuous shot") · `wan/3-0-video` (seed, "No dialogue") | Frame + refs in one call. Seedance rejects real faces in refs |
| Transition between two real photos | `bytedance/seedance-2` first+last frame, ≤5 s | `kling-3.0-omni` first+last+element · `veo-3-1` FIRST_AND_LAST 4 s · `pixverse-v6/transition` (seed, cheap) | Both ends are real, so motion quality decides |
| 3 s seamless loop | Remotion loop of a real still | `google/gemini-omni-flash-1-1` with first = last frame (4 s → trim) | Omni officially supports a "looping start and end frame" |
| Environment b-roll (no product) | `wan/3-0-video` (#9 on AA image-to-video; `seed`; `audio:false`; 9:16) | `veo-3-1` `veo3_fast` text-to-video | No fidelity risk; Wan is seedable and silent |
| Upscale | `topaz/video-upscale` ×2 / `topaz/image-upscale`, **after QA, then re-QA** | `recraft/crisp-upscale` | Upscalers synthesise texture |
| Audio | **Strip all model audio**; use library music and real foley | Suno instrumental only if the owner approves | Generated audio is unusable [first-party] |
| Text / price / brand / gift box | **Remotion + real photos only** | — | No model is verified for Darija; LP parity; the brand gets misspelled |
| **Do not use** | Sora 2 (dead), gpt-image-1/1.5 (dead or dying), Midjourney (no API, not on Kie), FLUX.1 Kontext (1 ref, English only), Runway on Kie (Gen-4 Turbo only, no end frame), MiniMax H3 when silence or frame+refs are needed, Ideogram character-ref for products | | |

### 0.3 The five fidelity rules (full JSON in §3.9)

1. **FR1 Real pixels.** Every product appearance traces to a real photo or footage of that exact SKU and colourway. Text-only product generation is blocked.
2. **FR2 Pixel-lock.** An unobstructed product is the real cut-out: composited, or pasted back after any AI edit, because masks are only guidance. Generated product pixels are allowed only where interaction or motion forces it, and then they must pass the identity gate.
3. **FR3 One state per call.** One SKU-colourway and one angle family per call. The real image is pre-cropped to the delivery ratio. ≤5 s, one slow camera move, a single continuous shot, no AI hands handling the product. Colour changes and sequences are Remotion cuts.
4. **FR4 No invention.** No brand name, price, offer or described gift box in any prompt. Packaging and logo words appear only inside the approved CLEAN negation, and never on positive-only models. Plates must be OCR-clean and packaging-free. All text and the gift box come from Remotion or real photos.
5. **FR5 Gate before human.** Automated identity, colour, hardware and temporal gates run first, then a 100%-zoom side-by-side human check. Max 3 attempts per shot, then change technique.

### 0.4 QA gates (full rubric in §6)

| Gate | Pass threshold |
|---|---|
| Q0 Provenance | Logged |
| Q1 Identity | Composite: PHASH ≤0.001. Generated: embedding ≥ τ_SKU + VLM "same product" + human |
| Q2 Colour | ΔE00 ≤3 (composite ≤1.5); video drift ≤3 |
| Q3 Hardware / logo | Exact hardware counts; logo exactly "SIRINE" or not legible |
| Q4 Invention | 0 OCR tokens; no box, packaging or extra product |
| Q5 Anatomy / faces | 0 defects; no moving mouths |
| Q6 Temporal | 0 unplanned cuts, freezes or blacks; mask-area change ≤15% |
| Q7 Spec | H.264 yuv420p, CFR ≤30 fps, 1080×1920 / 1440×2560 / 1080×1350 |
| Q8 Safe zone | 14 / 35 / 6 %; contrast ≥4.5:1; price + COD at frame 0 |
| Q9 Audio | No model audio; −14 LUFS ±1.5; true peak ≤ −1 dBTP |
| Q10 Policy | Compliance per field; LP parity; no fake proof; generative Advantage+ enhancements off |

**Q11 effectiveness** is a score only. It ranks the variants that passed every gate.

### 0.5 What changed since the June-2026 research (don't build on dead models)

| Change | Date | Source |
|---|---|---|
| **Sora 2 is dead.** The Videos API, `sora-2` and `sora-2-pro` were shut down, and no replacement was named. The consumer app closed 2026-04-26. | 2026-09-24 | API: [official] OpenAI deprecations https://developers.openai.com/api/docs/deprecations · app date: [practitioner] https://alternativeto.net/news/2026/3/openai-is-shutting-down-sora-its-ai-video-slop-app-less-than-six-months-after-launch |
| **gpt-image-1 retired.** gpt-image-1.5 and gpt-image-1-mini shut down 2026-12-01. Their replacements are **GPT Image 2.5 Sunburst** (quality) and **GPT Image 2.5 Flare** (speed); `gpt-image-2` remains for existing integrations. | 2026-10-23 | [official] same page and https://developers.openai.com/api/docs/guides/image-prompting.md |
| **Veo 3.1 preview IDs were shut down on the Gemini API.** The GA Veo 3.1 (`veo-3.1-generate-001`, `-fast-generate-001`) lives on Vertex / Gemini Enterprise Agent Platform and on Kie. Google points Gemini-API users to **Gemini Omni Flash 1.1**. | 2026-10-22 | [official] https://ai.google.dev/gemini-api/docs/video |
| **Gemini Omni Flash** (any-input → video, conversational editing) launched at I/O 2026-05-19. It is on Kie as `google/gemini-omni-flash-1-1`. | 2026-05 | [official] https://ai.google.dev/gemini-api/docs/omni · [practitioner] https://9to5google.com/2026/05/19/gemini-omni-create-anything-model-video/ |
| **Nano Banana 2** (Gemini 3.1 Flash Image) and **Nano Banana 2.1** (GA, Oct 2026) sit alongside **Nano Banana Pro** (Gemini 3 Pro Image). | 2026-03 / 2026-10 | [official] https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1 |
| **Seedream 5.0 Pro / Flash / Lite** released, including layer decomposition. | 2026-07-08 | [official] https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro |
| **FLUX.2** (pro/flex) and **FLUX 3**: Kie carries only the **Klein** variant of FLUX 3. FLUX.1 Kontext is legacy. | 2026 | [official] https://docs.bfl.ai/guides/prompting_guide_flux2 · Kie index |
| **Midjourney is not on Kie.** It is at V8.x and has no official API, so treat it as manual-only. | 2026-07 | [official] https://updates.midjourney.com/v8-1-is-now-the-default-model/ · Kie index |
| **New video models on Kie:** Kling 3.0 / 3 Omni / 4.0, Seedance 2.0 / 2.5, MiniMax H3, Wan 2.7 / 3.0, Vidu Q4, PixVerse v6, HappyHorse 1.1. | 2026 | [official] https://docs.kie.ai/llms.txt |
| **Tooling vendors:** MagicBrief shut down 2026-07-31. Motion's 2026 creative benchmarks are published under the **Runneth** brand. | 2026 | [official] https://magicbrief.com/release/ai-tagging · https://runneth.com/library/research/creative-benchmarks-2026/methodology |
| **Meta AI labelling:** ads made with Meta's GenAI tools, **or detected (via C2PA) as made with third-party GenAI**, get an "AI info" label. | updated 2026-06-01 / 2026-07-09 | [official] https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/ · [practitioner] https://www.marketingdive.com/news/sociable-meta-adds-updated-disclosure-tags-for-ai-generated-ads/824833/ |

---

## 1. Kie.ai: the integration facts every model shares

**Call pattern**
- **Create:** `POST https://api.kie.ai/api/v1/jobs/createTask` with body `{ "model": "<id>", "callBackUrl": "<optional>", "input": { … } }` and header `Authorization: Bearer <KEY>` [official] https://docs.kie.ai/market/quickstart.md
- **Poll:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…`. The state moves through `waiting → queuing → generating → success | fail`.
  - `resultJson` is a **JSON string**, so parse it. It holds `{resultUrls:[…]}`; Seedance 2.x with `return_last_frame` also returns `lastFrameUrl`.
  - `param.input` is double-encoded.
  - `failCode`/`failMsg` and `creditsConsumed` are present [official] https://docs.kie.ai/market/common/get-task-detail.md
- **Errors come back as HTTP 200.** Always check the body `code` (200 = ok; 401, 402 credits, 422, 429, 500) [official].
- **Polling cadence:** start at 2–3 s and back off. Some video tasks take more than 10 minutes, and a 408 means no result after 10 minutes [official]. `lab.json` already uses first 4 s, max 20 s and a 20-minute timeout, which is consistent.

**Retention.** **Generated files are kept 14 days. Uploaded inputs are deleted after 24 hours** [official] https://docs.kie.ai/file-upload-api/quickstart.md
- So re-upload references for every batch older than one day, and download outputs immediately into `data/media/`.

**Uploads**
- Base URL: `https://kieai.redpandaai.co`.
- `/api/file-base64-upload` (keep it ≤10 MB), `/api/file-stream-upload` (multipart; best for local files), `/api/file-url-upload` (≤100 MB, 30 s fetch).
- Use the `data.downloadUrl` from the response [official].

**Field names are NOT uniform across models.** This is the #1 integration trap. Keep a per-model field map in `lib/kie/` and never assume `image_urls`.

| Kie `model` | Product/ref image field (max) | Size controls | Seed | Negative prompt | Notes |
|---|---|---|---|---|---|
| `nano-banana-pro` | `image_input` (8) | `aspect_ratio` incl. **4:5**, 9:16, auto · `resolution` 1K/2K/4K · `output_format` png/jpg | no | no | Google's own limit is 14 refs; Kie caps at 8 [official] https://docs.kie.ai/market/google/pro-image-to-image.md |
| `nano-banana-2-1` | `image_input` (10) | `aspect_ratio` incl. 4:5, extremes 1:8–8:1, default auto · `resolution` 1K/2K/4K | no | no | [official] https://docs.kie.ai/market/google/nanobanana-2-1.md |
| `gpt-image-2-5-sunburst-image-to-image` (also `-flare-`, `gpt-image-2-image-to-image`) | `input_urls` (16) | `aspect_ratio` auto, 1:1, 3:2, 2:3, 4:3, **3:4**, 16:9, 9:16, 21:9 (+4 ratios at 1K only) · `resolution` 1K/2K/4K · `background` transparent only at 1K | no | no | 4:5 appears only in metadata, so treat it as unconfirmed [official] https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-image-to-image.md |
| `seedream/5-pro-image-to-image` (also `5-flash-`, `4.5-edit`) | `image_urls` (10; 4.5 = 14) | `aspect_ratio` (no 4:5) · `quality` basic=1K / high=2K (Flash uses `size`) | no | no | [official] https://docs.kie.ai/market/seedream/5-pro-image-to-image.md |
| `flux-2/pro-image-to-image` (also `flex`) | `input_urls` (1–8) | `aspect_ratio` · `resolution` 1K/2K | no | no | [official] Kie |
| `flux-3/klein-edit-image` (also `klein-text-to-image`) | `image_urls` (1–10) | `width`/`height` 256–4096 (exact 4:5 = 1088×1360) · `resolution` · `num_images` 1–4 | **yes** | no | Set `enhance_prompt:false` for controlled plates [official] Kie |
| `qwen2-1/image-to-image` | `image_urls` (1–10) + **`mask_url`** (single-image mode) | `aspect_ratio` · `resolution` 1K/2K · `background` transparent | yes | no (qwen3: yes) | The open weights are under a non-commercial research licence, so check Kie's terms [practitioner] |
| `ideogram/v3-edit` / `v3-text-to-image` / `v3-remix` | `image_url` + **`mask_url`** | `image_size` presets | yes | **yes** | Ideogram 4.x is not on Kie. Mask polarity on Kie is untested [unverified] |
| `recraft/remove-background` | `image` (≤5 MB, 16 MP) | — | — | — | Cut-outs. Verify the alpha survives WebP [official] |
| `seedream/5-pro-layer-decomposition` | one `image_url` | `size` | — | — | Splits a reference ad into ≥10 transparent layers, which is useful for cloning a layout [official] |
| `topaz/image-upscale`, `recraft/crisp-upscale` | image | factor | — | — | Re-run QA after upscaling (see §3.7) |
| `veo-3-1` (`input.model` = `veo3` / `veo3_fast` / `veo3_lite`) | `image_urls` + `generation_type` | `aspect_ratio` 16:9/9:16/Auto · `resolution` 720p/1080p/4k · `duration` 4/6/8 | no | no | Audio always on. `REFERENCE_2_VIDEO` is fast/lite only and 8 s only [official] https://docs.kie.ai/veo3-api/generate-veo-3-video.md |
| `veo/extend` | `input.task_id` | — | `seeds` 10000–99999 | no | Output is 720p; only Veo-3.1-made clips can be extended [official] |
| `google/gemini-omni-flash-1-1` | `image_urls` (≤7) **XOR** `first_frame_url` (+`last_frame_url`) · `video_list` (1) · `character_ids` (≤3) | `aspect_ratio` 16:9/9:16 · `resolution` 360p/720p/1080p/4k · `duration` "4"/"6"/"8"/"10" | yes | no | Slot budget: images + 2×videos + characters ≤ 7 [official] https://docs.kie.ai/market/google/gemini-omni-flash-1-1.md |
| `topaz/video-upscale` | `video_url` (≤50 MB) | `upscale_factor` "1"/"2"/"4" | — | — | [official] https://docs.kie.ai/market/topaz/video-upscale.md |
| Kling / Seedance / Hailuo / Wan / Runway / others | see §2.3 | | | | |

**Exact-ratio custom sizes for FLUX 3 Klein** (both sides divisible by 16): 4:5 = **1088×1360**; 9:16 = **1152×2048**, downscaled to 1080×1920 in Remotion [inference].

**Aspect-ratio trap for Feed 4:5:**
- **Native 4:5:** Nano Banana Pro / 2.1, FLUX 3 Klein (via width/height) and GPT Image 2.5 (unconfirmed).
- **No 4:5:** Seedream, FLUX.2, Kontext, Qwen and Ideogram. Generate 3:4 (1080×1440) and crop 90 px of height, but **plan the crop in the prompt** by keeping the subject away from the top and bottom 3%. [inference]

---

## 2. Per-model prompting guides → fill-in skeletons

### 2.0 Universal clauses (paste into every skeleton)

These are distilled from OpenAI's and Google's official edit guidance (§2.1) plus our failure history [first-party: "SIRNE", invented boxes, colour morphs].

```text
LOCK(N)   = "Keep the [bag/sneakers/pack] from image N exactly as photographed: same silhouette and proportions,
             colour [#HEX / name], material and texture, stitching, handle and strap shape, hardware colour and count
             ([n] rings, [n] zips, [buckle]), logo plate size and position. Do not redraw, restyle, recolour, resize,
             add to, or remove anything from it."
CLEAN     = "No text, letters, numbers, logos, watermarks, price tags, labels, boxes, shopping bags or packaging
             anywhere in the image."                     (use only where negatives work; see the FLUX/Veo rule below)
CLEAN+    = "Every surface is plain and unprinted; the background is an uncluttered [material]."   (positive-only form)
SPACE     = "The [top 30% / right third] is empty [seamless wall / soft gradient] with no objects, reserved for an overlay."
STILL     = "The product stays completely still and unchanged for the whole shot; only the camera moves."
ONE-SHOT  = "One single continuous shot. No scene cuts, no transitions."
NO-TALK   = "Nobody speaks. Mouths stay closed. No dialogue, no on-screen text."
LIGHT-FIX = "Lighting and white balance stay constant throughout."                 (i2v only; no relighting in motion)
```

**Relation to `templates/higgsfield-3layer.md`.** That template's separation still holds and maps onto this playbook:

| Higgsfield layer | Here |
|---|---|
| Keyframe = framing + light | The real photo, or the generated plate |
| Identity edits | The edit models in §2.1 |
| Motion-only video prompt | The i2v prompts in §2.2–2.5 |

- Two current vendor guides back the motion-only rule:
  - Wan 3.0: "when a first frame is given, describe only motion, plot and camera" [official].
  - Runway: "prompt the subject action and camera action, not the picture" [official].
- For **text-to-video plates** (no first frame), the vendor formulas *do* include light and style: Veo's `[Style & Ambiance]`, Seedance's summary sentence. Lighting belongs there.
- In **image-to-video** prompts, add `LIGHT-FIX` and never re-describe the lighting [inference].

**Rules for using these clauses**
- Prefer **positive phrasing** ("an empty marble counter") over negation for Google and FLUX. Google's guides say to describe what you want rather than what you don't [official] https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1. BFL says FLUX.2 has **no negative prompts** [official] https://docs.bfl.ai/guides/prompting_guide_flux2.
- For FLUX, never write the words "logo", "box" or "brand" at all [inference].
- **Never put the brand name, price or offer in a generation prompt.** Text is composited (§4).

### 2.1 Image models

#### A. Nano Banana Pro (Gemini 3 Pro Image) · Nano Banana 2 / 2.1 (Gemini 3.1 Flash Image) — Google

**Sources**
- [official] https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana (2026-03-06)
- [official] https://ai.google.dev/gemini-api/docs/image-generation
- [official] https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-generation-limitations

**Prompt structure [official]**
- Text-to-image: `[Subject] + [Action] + [Location/context] + [Composition] + [Style]`.
- With references: `[Reference images] + [Relationship instruction] + [New scenario]`, for example *"Using the attached napkin sketch as the structure and the attached fabric sample as the texture, transform this into…"*. **Assign each reference a role in words.**
- Start with a strong verb that names the operation.
- Use positive framing ("empty street", not "no cars").
- Lighting vocabulary works: "three-point softbox setup", "golden hour backlighting".
- There is a product-mockup template: *"A high-resolution, studio-lit product photograph of a [product description] on a [background surface/description]."*
- There is a "minimalist & negative space" pattern for overlay room.

**Edit phrasing that holds the product [official]**
- *"Using the provided image, change only the [specific element] to [new element]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition."*
- Text acts as a "semantic mask".
- **Be explicit about what must stay exactly the same.**

**Reference limits [official]**

| Model | Object images (high fidelity) | Character images | Style references | Total |
|---|---|---|---|---|
| Pro | up to 6 | up to 5 | up to 3 | 14 |
| NB 2 / 2.1 | up to 10 | up to 4 | — | 14 |
| NB 2 Lite | — | — | — | not optimised for multiple references |

- **Kie caps the inputs at 8 (Pro) and 10 (2.1).**
- For a pack (bag + sneakers + gift = 3 objects) both families are inside the high-fidelity limit.

**Specs [official]**
- **Ratios:** 1:1, 3:2, 2:3, 3:4, 4:3, **4:5**, 5:4, 9:16, 16:9, 21:9.
- **Resolution:** 1K/2K/4K, with an **uppercase K**; lowercase is rejected.
- 2.1 has `thinking` levels minimal/medium/high (default medium) on Google's API; this is not exposed on Kie.
- **All outputs carry SynthID; the Cloud blog says C2PA Content Credentials too.** This matters for Meta's C2PA-based AI label (§6.6).

**Text [official]**
- Pro's best-performance text languages include **ar-EG** and **fr-FR**. No list is published for NB 2 / 2.1, and Gemini 2.5 Flash Image's list has no Arabic or French.
- Google's own tip: *"first generate the text and then generate an image with that text."*
- See §4. We still don't let it render prices or the brand.

**Failure modes**
- [official] It may not return the requested number of images, may stop early, and may render text as an image.
- [practitioner] Multi-turn edits drift, so re-attach the reference each turn and restate LOCK.

**Skeletons (Kie `nano-banana-pro` / `nano-banana-2-1`)**

```text
(a) PRODUCT INTO NEW SCENE — image_input=[product_cutout.png]
"Place the [product] from the provided image [on/against] [surface] in [scene]. [Composition: medium shot, product
centred in the lower half, eye-level, 50mm, shallow depth of field]. [Light: soft key light from the upper left at 45°,
matching the product photo; gentle fill; natural contact shadow under the product]. [Style: high-end e-commerce
lifestyle photography, true-to-life colour]. LOCK(1). SPACE. CLEAN."
aspect_ratio: "4:5" | "9:16"   resolution: "2K"   output_format: "png"

(b) PRODUCT SWAP INTO A REFERENCE AD'S COMPOSITION — image_input=[ref_ad.jpg, product_front.png, product_34.png]
"Using the first image ONLY as the layout, camera angle, lighting and prop reference, and the second and third images
as the product (front and three-quarter views of the same bag), recreate the first image's composition with this bag
replacing its product. Remove every text element, logo and person from the first image's design. LOCK(2,3). CLEAN."

(c) CLEAN PLATE WITH RESERVED SPACE — no image_input (or a mood reference)
"Create a minimalist [scene] background plate for a vertical ad: [surface/material], [palette: #HEX, #HEX],
[light]. The lower-centre third holds an empty [plinth/marble slab] where a product will be placed later.
SPACE. CLEAN+."

(d) SEMANTIC EDIT AROUND A REAL PRODUCT (harmonise step of §3.5)
"Using the provided image, change only the lighting and shadows around the bag so it sits naturally on the surface:
add a soft contact shadow and a faint reflection. Keep the bag itself exactly the same — every pixel of its shape,
colour, hardware and logo — and keep everything else unchanged."   → then PASTE-BACK (§3.5 step 6)
```

#### B. GPT Image 2.5 (Sunburst / Flare) · GPT Image 2 — OpenAI

**Sources**
- [official] https://developers.openai.com/api/docs/guides/image-prompting.md
- [official] https://developers.openai.com/api/docs/guides/image-generation.md

**Which model**
- **Sunburst** is the quality base model, "where editing precision matters most".
- **Flare** is the fast model, with quality comparable to GPT Image 2.
- OpenAI says to start with Sunburst for complex work, then test whether Flare holds [official].
- **Artificial Analysis Image-Editing v2.1, read 2026-11-01** [practitioner] https://artificialanalysis.ai/image/leaderboard/editing (overall only, about ±12–26 Elo):

| Rank | Model | Elo | Notes |
|---|---|---|---|
| 1 | **GPT Image 2.5 Sunburst (max)** | 1199 | |
| 3 | GPT Image 2.5 Flare | 1182 | |
| 6 | **Nano Banana 2.1** | 1151 | |
| 8 | GPT Image 2 | 1136 | |
| 9 | **Seedream 5.0 Pro** | 1131 | |
| 13 | Nano Banana 2 | 1123 | |
| 15 | FLUX 3 Image | 1122 | not on Kie |
| 18 | Nano Banana Pro | 1108 | |
| 21 | Qwen-Image-3.0-Pro | 1091 | |
| 27 | FLUX 3 Klein | 1072 | |
| 46 | FLUX.2 [pro] | 1012 | |

- A September 2026 category view (not on the current page) reportedly put Seedream 5.0 Pro top for identity-preserving edits [unverified].

**Prompt rules [official]**
- State the **intended use** (product photo / ad), subject, composition, aspect and placement constraints.
- For complex jobs use **labelled sections** (scene / subject / details / constraints).
- Ask for "photorealistic" explicitly.
- Camera specs are *appearance cues*, not physics.

**References [official]**
- **Label inputs by number and role**: "image 1", "the second image" as subject, style, clothing or background.
- Kie accepts up to 16 inputs.

**Edits [official]**
- Say **what to change, then list what must stay the same** (identity, geometry, layout, lighting, camera angle, labels).
- Make one change per turn, and pass the previous output back in.
- Restate constraints when it drifts.
- OpenAI's own identity clause is a template for products: *"Do not change her face, facial features, skin tone, body shape, pose, or identity in any way."*

**Two lines that matter most for us [official]**
- ***"If a region must remain pixel-identical, composite the approved edit into the original image instead of relying on prompting."***
- Masks are guidance only: *"The model uses the mask as guidance, but may not follow its exact shape with complete precision"*, and with multiple inputs the mask applies to the first image.
- Both lines make §3.5's paste-back mandatory.

**Text [official]**
- Quote the words, give position and typography, spell brand names letter by letter, and say how many times the text appears.
- Use the phrasing *"Render the tagline exactly once … No extra text, no watermarks, no unrelated logos."*
- Only English and Spanish examples are documented; no Arabic claim was found [unverified].

**Transparency [official]**
- Set `background: "transparent"` and use PNG/WebP output. A painted checkerboard is **not** transparency, so check the alpha.
- On Kie, transparent works only at 1K.

**Quality [official]**
- `low`…`max` on the API, but raise it only if it fixes an unmet requirement.
- Kie does not expose `quality`.

**Limitations [official]**
- Struggles with precise text placement and layout-sensitive composition.
- Recurring-character consistency.
- Repeated edits drift.

```text
(a) Kie gpt-image-2-5-sunburst-image-to-image  input_urls=[product_cutout.png, scene_ref.jpg]
SCENE: [scene, time of day, surface]. Use image 2 only for mood and palette.
SUBJECT: the [bag] from image 1, [placement].
DETAILS: photorealistic e-commerce lifestyle photo, [lens look], soft key from upper left, natural contact shadow.
USE: Meta feed ad, product must read clearly at phone size.
CONSTRAINTS: Do not change the bag's shape, proportions, colour, material, stitching, hardware or logo in any way.
SPACE. No text, no watermarks, no logos, no packaging.
aspect_ratio "3:4" (crop to 4:5) | "9:16"   resolution "2K"

(b) input_urls=[ref_ad.jpg, product_front.png]
"Recreate image 1's layout, camera angle, props and lighting as a new photo, but the product is the bag in image 2.
Change: product only. Keep from image 1: composition, light direction, colour grade. Do not copy any text, logo,
face or packaging from image 1. Do not change the bag from image 2 in any way."

(c) transparent product cutout from a photo with a messy background (1K only on Kie)
"Isolate the bag from image 1 on a transparent background. Do not add a solid backdrop, checkerboard, scenery, or
shadow. Do not change the bag." background:"transparent"   → verify alpha; prefer recraft/remove-background first.
```

#### C. Seedream 5.0 Pro / Flash / Lite (+4.5) — ByteDance

**Sources**
- [official] launch post https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro (2026-07-08)
- BytePlus guides https://docs.byteplus.com/en/docs/modelark/seedream-5-0-pro. These are JS-rendered, so I could not read their body [unverified].

**Prompt and references**
- Coherent natural language beats keyword lists. Put the **format first** ("Vertical Instagram ad photo …"), then subject → composition → light → style. Keep it under about 600 words [practitioner] https://runware.ai/docs/models/bytedance-seedream-5-0-pro/guides/prompting
- References are addressed **by number**: "Image 1", "Images 2 to Image 6" [official].
- Pin everything that must not drift, e.g. "Preserve the exact appearance of each product from its reference". Anything not pinned drifts [practitioner].

**Other features**
- **Layer decomposition** (`seedream/5-pro-layer-decomposition`) splits an image into ≥10 transparent layers (text / subject / background / decor) and fills behind the subject [official]. This is the cleanest way to strip a reference ad down to its background plate before re-using its layout.
- **Text:** ByteDance claims 10+ languages including French and Arabic, and that it *"correctly process[es] the right-to-left cursive script of Arabic"*. It also concedes *"room to improve in finer-grained text rendering and pixel-level editing consistency"* [official].
- **Kie fields:** `image_urls` (≤10), `aspect_ratio` (no 4:5), `quality` (`basic` 1K / `high` 2K), `output_format`. No seed, no negative prompt, no mask. Roughly $0.035 per image at 1K and $0.07 at 2K [official] https://kie.ai/seedream-5-0-pro

```text
(a) "Vertical lifestyle ad photo. Image 1 is the product: [description]. Place the product from Image 1 [on/held by …]
     in [scene], [light], [lens]. LOCK(1). CLEAN. SPACE."
(b) "Image 1 is a layout reference only; Image 2 is the product. Recreate Image 1's composition, camera angle, lighting,
     props and colour grade, replacing its product with the bag from Image 2. LOCK(2). Remove all of Image 1's text,
     logos and people. CLEAN."   Tip: layer-decompose Image 1 first and feed only its background layer. [inference]
(c) seedream/5-pro-text-to-image: "Clean background plate for a 9:16 ad: [scene]. SPACE. CLEAN."
```

#### D. FLUX.2 (pro/flex) · FLUX 3 Klein · FLUX.1 Kontext (legacy) — Black Forest Labs

**Sources**
- [official] FLUX.2 guide https://docs.bfl.ai/guides/prompting_guide_flux2
- [official] unified FLUX 3 / Kontext reference https://docs.bfl.ml/guides/prompting_unified_reference.md
- [official] bounding boxes https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes

**FLUX.2 [official]**
- Structure is **subject → action → style → context**. Earlier words weigh more.
- Name a camera or film stock for photorealism.
- Hex colours work as "color #HEX" tied to one object.
- Quoted text gets rendered.
- **JSON prompts work as well as prose.**
- **No negative prompts.**
- References by role: "subject from image 1, style from image 2, background from image 3".
- Pro has a 9 MP total budget, so 8 refs at 1 MP output or 7 at 2 MP; sending 8 refs at 2K on Kie may fail [inference].

**FLUX 3 [official]**
- Refs are "image 1" or `<ref_image_0>`, up to 10.
- Edit template: *"Modify &lt;ref_image_0&gt; by replacing … with … Keep the rest of the image exactly unchanged, preserving …"*.
- **Bounding boxes:** a JSON array after the caption, `[top,left,bottom,right]` on a 0–1000 grid. They guide layout but are not masks. A "Keep" row holds an element in place.
- Unknown fields return 422.
- Whether bounding boxes survive Kie's prompt rewriter is [unverified], so set `enhance_prompt:false`.

**Kontext [official]**
- One input image only, and English only (Kie auto-translates).
- Name what to keep ("while maintaining the same…").
- Use precise verbs ("change the clothes", not "transform").

**Failure modes [practitioner]**
- Klein: hands, tiny unreadable labels, plasticky textures. https://www.mindstudio.ai/blog/flux-3-klein-image-tests

```text
FLUX.2 pro (input_urls) / FLUX 3 Klein (image_urls, enhance_prompt:false, seed:<fixed>)
(a) "[Bag in colour #HEX] from image 1, standing on [surface] in [scene], shot on [camera, 50mm, f/2.8], [light]. LOCK(1). CLEAN+."
    Klein edit: "Modify image 1 by replacing the background with [scene]. Keep the bag exactly unchanged,
    preserving its shape, colour #HEX and hardware."
(b) "Product from image 2, composition, lighting and props from image 1. LOCK(2). CLEAN+."
(c) Klein text-to-image, width:1088 height:1360 (exact 4:5): "[scene], [surface], [palette #HEX]. CLEAN+."
    + optional layout box: [{"id":"copy","bbox":[0,0,300,1000],"desc":"empty soft-grey wall"}]
Kontext (flux-kontext-max, one input_image):
    "Change the background to [scene] while keeping the bag exactly the same: identical shape, colour, hardware,
     position and scale."
```

#### E. Qwen Image Edit (2509 → 2511 → 2.0 / 2.1 / 3 on Kie) — Alibaba

**Official model cards**
- **2509** [official] https://huggingface.co/Qwen/Qwen-Image-Edit-2509: "optimal" with 1–3 input images. It supports **person + product** composites, has "better preservation of product identity", and makes "product posters from plain-background product images".
- **2511** [official] https://huggingface.co/Qwen/Qwen-Image-Edit-2511: less drift.

**Qwen-Image 2.1** (2026-09-20)
- Up to 10 refs and native **RGBA** output.
- The **open weights are under the Qwen Research License (non-commercial)**, so confirm Kie's commercial terms before production [practitioner] https://www.marktechpost.com/2026/09/21/alibaba-qwen-releases-qwen-image-2-1/

**Masks [official Kie]**
- `qwen2-1/image-to-image` takes a **`mask_url`**: white = change, black = keep. It requires exactly one input image.
- This is the most direct "repaint only the background around a locked product" tool on Kie.
- Reference order matters ("the first image", "the second image").

**Negative prompt** exists only on the `qwen3/*` and legacy `qwen/image-edit` endpoints.

**Trap:** `qwen2/image-edit` has an **800-character prompt cap**, and its image field is `image_url` even though it takes an array.

```text
(a) qwen2-1 mask mode: image_urls=[product_on_any_bg.png], mask_url=[white everywhere EXCEPT the product]
    "Replace the white-masked area with [scene], matching the light falling on the bag; leave the bag untouched."
(b) qwen2-1 multi-ref: "Put the bag from the second image into the scene and layout of the first image. LOCK(second). CLEAN."
qwen3 endpoints: add negative_prompt:"text, letters, logo, watermark, packaging, box, deformed handle"
```

#### F. Ideogram v3 (Kie) — 4.0 / 4.5 exist but are not on Kie

**Kie endpoints [official]**
- `ideogram/v3-text-to-image`: `negative_prompt`, `style` REALISTIC, `expand_prompt` (set it **false**), `image_size` presets.
- `v3-edit`: `image_url` + `mask_url`.
- `v3-remix`: `strength`.
- Ideogram's own docs say **black = edit, white = keep**. The convention on Kie is untested [unverified].

**Character reference** is built for people, so don't use it to hold a bag [official] https://developer.ideogram.ai/api-reference/images/remix/ideogram-3-character.md

**Ideogram 4.5 `precise-edit`** (up to 4 product/material/style references) exists only on Ideogram's own API [official] https://developer.ideogram.ai/ideogram-api/api-overview.md

**Use** Ideogram only when you need a real `negative_prompt` on a clean plate.

#### G. Midjourney — manual only

**Status**
- **Not on Kie.** The old `mj-api` pages return 404 and Midjourney is absent from the Kie index.
- There is no official API [practitioner].
- V8.1 became the default 2026-06-11 and **V7 `--oref` remains available while V8 omni-reference trains** [official] https://updates.midjourney.com/v8-1-is-now-the-default-model/

**Parameters**
- `--oref <url> --ow 0–1000` works in V7 only (not Draft or Fast).
- `--sref` / `--sw` for style; `--no` for negatives.
- Arabic fails [practitioner].

**Use** for human-in-the-loop mood boards only:

```text
[scene], [light] --oref <product_url> --ow 300 --v 7 --ar 4:5 --raw --stylize 50 --no text, letters, logo, packaging
```

#### H. Utilities that make fidelity possible

- **Cut-outs:** `recraft/remove-background`. Fallback: `qwen2-1` with `background:"transparent"` (licence caveat), or a local matting model (§8).
- **Layer split of a reference ad:** `seedream/5-pro-layer-decomposition`.
- **Upscale:** `topaz/image-upscale` or `recraft/crisp-upscale`, **after** QA, then re-QA (§3.7).

### 2.2 Google video: Veo 3.1 and Gemini Omni Flash 1.1

#### A. Veo 3.1 (GA). Kie model `veo-3-1`, with `input.model` set to `veo3` (quality), `veo3_fast` or `veo3_lite`

**Sources**
- [official] https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1 (2025-10-16)
- [official] Vertex prompt guide https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide
- [official] Vertex references https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/use-reference-images-to-guide-video-generation

**Formula [official]:** `[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]`, with cinematography first.

**Camera vocabulary [official]:** static, pan, tilt, dolly, truck, pedestal, zoom, crane, aerial, handheld, whip pan, arc shot; wide / close-up / extreme close-up / low angle; shallow depth of field, macro, rack focus.

**Negatives**
- Describe the wanted state positively, e.g. "a desolate landscape with no buildings" [official blog].
- Vertex's `negativePrompt` takes a **list without "no"**, e.g. "wall, frame" [official].
- **Kie does not expose a negative prompt, seed or audio-off switch** [official Kie]. Every Kie Veo clip has audio, so strip it (§6).

**Frames to video**
- `generation_type: FIRST_AND_LAST_FRAMES_2_VIDEO`: one image is the first frame, two images are first and last [official Kie]. Describe the *transition*.
- One developer reports that the first frame is followed closely while the last frame is "a guide", with tighter end-frame adherence on 4 s clips [unverified] https://dev.to/akaranjkar08/veo-31-developer-guide-timestamp-prompting-multi-shot-video-and-full-api-june-2026-3l5i

**Ingredients to video**
- `REFERENCE_2_VIDEO` takes 1–3 images of **a single person, character or product**; "Veo preserves the subject's appearance" [official].
- Limits: **8 s only**, and on Kie **`veo3_fast`/`veo3_lite` only** [official].
- Google's own phrasing: *"Using the provided images for [A], [B] and [C], create a [shot] of …"* [official].
- **Frames and references cannot be combined in one call.**

**Timestamp prompting [official]:** `[00:00-00:02] … [00:02-00:04] …` produces multi-shot in one generation. Avoid it for product shots (cross-shot drift, §3.6).

**Specs [official]**
- 4/6/8 s · 16:9 or 9:16 · 720p/1080p/4k (Kie charges extra for 1080p/4k and returns them in `result_urls`) · SynthID.
- `aspect_ratio: "Auto"` centre-crops your image to the nearest of 16:9 or 9:16, so **pre-crop to 1080×1920 yourself**.
- `veo/extend` continues a clip at 720p only [official Kie].
- **Positioning:** low on today's AA image-to-video board (#20–21, Elo 957; Fast 937) and #13 on Arena (2026-09-21) [practitioner]. Use Veo as a challenger for transitions and empty environment plates, not as the product-motion default.

```text
(a) Product push-in from a REAL first frame — generation_type FIRST_AND_LAST_FRAMES_2_VIDEO, image_urls=[hero_9x16.jpg],
    model veo3_fast, duration 4, aspect_ratio "9:16", resolution "1080p"
"Slow dolly-in on the [colour] [material] handbag standing on [surface], eye-level, shallow depth of field.
 The handbag stays completely still and unchanged; only the camera moves. Soft, constant studio light.
 One continuous shot. Nobody in frame. Ambient room tone only."            (audio is stripped anyway)

(b) Transition between two REAL photos — image_urls=[front_9x16.jpg, three_quarter_9x16.jpg], duration 4
"The camera performs a smooth, slow arc of about thirty degrees from the front view to the three-quarter view of the
 same handbag; the bag itself never moves or changes; lighting stays constant. One continuous shot."

(c) Lifestyle with product ingredients — generation_type REFERENCE_2_VIDEO, image_urls=[bag_front, bag_34, outfit_ref],
    model veo3_fast, duration 8, aspect_ratio "9:16"
"Using the provided images for the handbag (front and three-quarter views) and the outfit, create a neck-down
 tracking shot of a woman walking slowly along a sunlit [street/corridor] carrying this exact handbag on her shoulder.
 Nobody speaks. One continuous shot."                → QA every frame; 8 s is long for product fidelity (§3.6)
```

#### B. Gemini Omni Flash 1.1. Kie model `google/gemini-omni-flash-1-1`

**Sources**
- [official] https://ai.google.dev/gemini-api/docs/omni
- [official] https://docs.kie.ai/market/google/gemini-omni-flash-1-1.md

**Ranking**
- #2 on Arena image-to-video (2026-09-21) and #1 on AA in July 2026, but **#14 (Elo 1046) on AA image-to-video v2.1 today** [practitioner].

**Default behaviour [official]**
- **The default output is a multi-shot narrative.** Ask for *"a single unbroken scene / a single continuous shot / No scene cuts"*.
- Negatives go inline ("No dialogue", "No extra sound effects"); there is no negative-prompt field.
- Timing works in natural language or as `[0-3s]`.
- Put on-screen text in quotes; we never use this.

**Reference tagging [official]**

| Tag | What it does |
|---|---|
| `<FIRST_FRAME>` | The opening frame |
| `<LAST_FRAME>` | The final frame; requires `<FIRST_FRAME>` |
| `<IMAGE_REF_N>` | An identity/style reference, 0-indexed |
| `<VIDEO_REF_N>` | A video reference |
| `[# Sources …]` / `[# References …]` | Prefixes for multi-input prompts |

- **Always close with a sentence on how each input is used**, e.g. "use the reference images for identity only; do not use them as literal initial frames" [official].
- Google mentions **"a looping start and end frame"**, i.e. the same image as first and last frame, which is our 3-second-loop format.

**Editing [official]**
- Simple prompts work best ("Overly descriptive prompts can lead to unintended changes"), followed by **"Keep everything else the same."**
- Extend adds 10 s per call, up to 40 s total.

**Limits [official]**
- **Only English prompts are evaluated**, so write prompts in English.
- Recognizable-people uploads are blocked.
- Uploaded-video editing is unavailable in the EEA, Switzerland and the UK.
- 1080p and 4k are **upscaled**.
- SynthID is applied.

**Kie specifics [official]**
- `image_urls` (≤7) and `first_frame_url`/`last_frame_url` are **mutually exclusive**: you choose identity references *or* a frame lock.
- `duration` takes the strings "4" / "6" / "8" / "10".
- `character_ids` come from `gemini-omni-character`, which takes 1–2 images plus a description and is framed for people. Using it for products is [unverified].
- There is a `seed`.
- **The tag syntax (`<FIRST_FRAME>`, `<IMAGE_REF_N>`) is documented for Google's own Interactions API.** Whether Kie's wrapper maps `first_frame_url` / `image_urls` order onto those tags is [unverified]. Verify with one test call. If tags misbehave, fall back to plain language ("the first reference image shows…").

```text
(a) Seamless loop from ONE real photo — first_frame_url = last_frame_url = hero_9x16.jpg, duration "4", aspect_ratio "9:16"
"<FIRST_FRAME> and <LAST_FRAME> are the same photo of a [colour] handbag on [surface]. One single continuous shot:
 the camera drifts slowly closer and settles back so the clip ends exactly on the opening frame and loops seamlessly.
 The bag never moves or changes. Lighting constant. No dialogue. No extra sound effects. No text."   → trim to 3 s in Remotion
(b) Lifestyle with identity refs — image_urls=[bag_front, bag_34, bag_detail, outfit_ref], duration "6"
"[# References <IMAGE_REF_0>,<IMAGE_REF_1>,<IMAGE_REF_2> = the handbag; <IMAGE_REF_3> = outfit]
 A single continuous neck-down tracking shot: a woman in the outfit from <IMAGE_REF_3> walks slowly through a bright
 [location] carrying the handbag from <IMAGE_REF_0>–<IMAGE_REF_2> on her shoulder; the bag keeps its exact shape, colour,
 hardware and logo. No scene cuts. No dialogue. Use the reference images for identity only, not as literal frames."
(c) Edit pass on a generated clip (video_list) — "Make the background slightly warmer. Keep everything else the same."
```

#### C. Sora 2: retired, but the lessons transfer

- **Status:** the API shut down 2026-09-24 and it is not on Kie [official] https://developers.openai.com/api/docs/deprecations
- **What still applies** (OpenAI's archived guide, updated March 2026) [official] https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide:
  - Use **one camera move plus one subject action per shot**.
  - Describe actions in beats or counts.
  - Name **3–5 palette colours** to stabilise the look.
  - **"Stitching two 4-second clips may beat one 8-second clip."**
  - Edit one change at a time.
  - On a misfire, simplify: "freeze the camera, reduce the action, clear the background".

### 2.3 Other video models on Kie: Seedance, Kling, MiniMax H3, Wan, Runway, others

**How the models rank on general quality (not product fidelity)**
- **AA image-to-video v2.1 (with audio), read 2026-11-01, roughly ±16–19 Elo** [practitioner] https://artificialanalysis.ai/video/leaderboard/image-to-video

| Rank | Model | Elo |
|---|---|---|
| 1 | Seedance 2.5 | 1153 |
| 3 | Seedance 2.0 | 1136 |
| 4 | MiniMax H3 768p | 1128 |
| 8 | H3 Max | 1117 |
| 9 | Wan 3.0 | 1111 |
| 13 | Grok Imagine 1.5 | 1052 |
| 14 | **Gemini Omni Flash 1.1** | 1046 |
| 15 | HappyHorse 1.1 | 1037 |
| 17–18 | Kling 3.0 Pro / 3.0 Omni | 1000 (the anchor) |
| 20 | PixVerse V6 | 959 |
| 20–21 | **Veo 3.1** | 957 |
| 22–24 | Veo 3.1 Fast | 937 |

  - Kling 4.0, Vidu Q4 and Runway are not on the board.
  - Arena (2026-09-21) ranked Omni #2 and Veo 3.1 #13 [practitioner] https://arena.ai/leaderboard/video/image-to-video, so the boards disagree.
- **These are overall-quality boards, not product-fidelity boards.**

**The only product-fidelity benchmark found: AdSpark-Bench** (PKU + JD.com, arXiv 2610.10047, 2026-10-07) [official paper] https://arxiv.org/html/2610.10047v1

| Closed model | Subject (DINOv3) | Key-region (logo/brand marks) | Text (OCR) | Cross-shot |
|---|---|---|---|---|
| Seedance 2.0 | 63.04 | 59.79 | **34.31** | **94.99** |
| HappyHorse 1.1 | 59.98 | 57.26 | 31.04 | 93.27 |
| ViduQ3 | 60.57 | 58.72 | 33.60 | 84.76 |
| Kling 3.0 Omni | 57.62 | 53.89 | 29.14 | 90.84 |
| PixVerse V6 | 58.75 | 55.27 | 22.94 | 55.18 |

- Veo and Gemini Omni were not tested.
- The authors' conclusion: closed models "struggle to preserve product fidelity during complex motion", with colour shifts, deformation and appearance drift.

#### A. ByteDance Seedance 2.0 / 2.5

**Sources**
- [official] https://ai.byteplus.com/resources/how-to-write-better-seedance-2-5-prompts
- [practitioner] https://runway.com/resources/seedance-2-0-prompt-guide

**Prompt structure**
- Open with one summary sentence: *subject + location + event + style + special camera move*.
- Give each reference a role, and put the **essential constraints at the end** [official].
- Time ranges have whole-second precision [official].
- Within a shot, order camera → subject action → spatial change → audio [practitioner].

**References**
- "Image 1 is [subject]. Image 2 is [location]." [official]
- Product lock: *"@Image 1 is the sole authority on the shoe's silhouette, upper material… The shoe's design stays identical in every shot"* [practitioner].
- Use **one close-up plus one full-view reference**. **Not** a multi-view sheet, which gets read as several objects. Use about 4–5 assets, not the maximum [practitioner].

**Camera and negatives**
- Camera words [official 2.5 list]: push-in, pull-back, pan, tracking, orbit, low angle, overhead, first-person, handheld, aerial, rack focus. Use **one move per shot**.
- Negatives: there is no field, so end with "No subtitles. No background music." [official]. Subtitles and logos appear unasked [practitioner].

**Failure modes**
- Fast motion warps.
- In-video text is unreliable.
- **Real human faces in references are rejected (HTTP 400)** without ByteDance's liveness `asset://` flow [practitioner/unverified]. Use faceless crops.

**Kie `bytedance/seedance-2` [official]** https://docs.kie.ai/market/bytedance/seedance-2.md

| Field | Values |
|---|---|
| `first_frame_url` / `last_frame_url` | **XOR** the `reference_*` fields: `reference_image_urls` ≤9 · `reference_video_urls` ≤3 (≤15 s total) · `reference_audio_urls` ≤3 |
| `generate_audio` | default **true**; set false |
| `resolution` | 480p/720p/1080p/4k (4k is **H.265**, so transcode to H.264) |
| `aspect_ratio` | 1:1/4:3/3:4/16:9/**9:16**/21:9/adaptive. **The default is 16:9, so always set 9:16** |
| `duration` | 4–15 or −1 |
| `seed` | none |

Kie also says frame mode is "more reliable" than prompt-based frame matching.

**Kie `bytedance/seedance-2-5` [official Kie; conflicting third-party reports]**
- Up to 30 images, 10 videos and 10 audio references, 4–30 s.
- `draft:true` gives a 480p preview; upgrade it later via `seedance-2-5-draft`.
- Together/AIMLAPI report 2.5 as 720p-only and always-audio. **Test one call before relying on it.**
- `seedance-2-fast`/`-mini` are 480p/720p only. The legacy `v1-pro-image-to-video` is the only Seedance with `seed` and `camera_fixed`.

#### B. Kuaishou Kling 3.0 / 3.0 Omni / 4.0

**Sources**
- [official] 4.0 guide (2026-10-26) https://kling.ai/quickstart/kling-4-model-user-guide
- [official] 3.0 / Omni / Elements / Start-End guides https://kling.ai/quickstart

**Prompt order for 4.0 [official]**
1. What each asset controls and what it must preserve
2. Scene, texture, style and camera tone
3. Timed events ("0–X s …")
4. Audio

- Use concrete visuals, not "premium look".
- ***"Negative prompts can increase the likelihood of errors."*** and ***"Only two types of negative instructions are truly necessary: no subtitles and no background music."*** (verified on the 2026-10-26 page)
- Assets without a stated role behave unpredictably.
- The 4.0 product example: *"Reference the design of the blue motorcycle in @Image4 and keep it strictly consistent."*
- First/last-frame example: *"with no cuts, angle changes, or scene changes."*

**Frames and Elements [official]**
- From Kling's Start/End-Frame guide (3.x): start and end frames "should be as similar as possible", or the model may insert a **"lens switch"** (a cut). Transitions are smoothest at ≤5 s.
- An **Element** is 2–4 images: one front main view plus 1–3 angle or detail shots. Its description should name the core traits **and "features the model should ignore"**.
- 3.0 binds up to 3 elements to start/end frames, and "the elements must appear in the reference frames".
- Kling claims Omni keeps element features consistent "regardless of how the camera moves" [official claim].

**Kie `kling-3.0-omni/image-to-video` [official, verified 2026-11-01]** https://docs.kie.ai/market/kling/v3-omni-image-to-video.md

| Field | Values |
|---|---|
| `image_urls` | 1 image = first frame; 2 = first + last |
| `elements` | ≤3 items of `{name, description, element_input_urls: 2–4 images}`, mentioned in the prompt as `@name` |
| `audio` | boolean, so you can turn it off |
| `duration` | 3–15 |
| `resolution` | 720p/1080p/4k |
| `aspect_ratio` | must be `auto` (follows the first frame) unless `customize_multi_shots` |
| `prompt` | ≤3,072 characters |

- **Kling 3.0 Omni, and `kling-3.0/video` with `kling_elements`, are the only Kie endpoints that combine a frame lock with multi-view product identity in one call.** Seedance 2.x, Wan 3.0, MiniMax H3, Veo and Omni are all frames *or* references.

**Other Kling endpoints on Kie [official]**
- `kling-3.0/video`: [first] or [first, last] frames; `kling_elements` ≤3, mentioned as `@element_x` (each mention costs 37 prompt characters); `sound`; `mode` std/pro/4K; 16:9/9:16/1:1.
- `kling-4.0/keyframe-to-video`: `first_frame_url`, `keyframe_urls` ≤8, `last_frame_url`, mentioned as `@first_frame`, `@keyframe_1`, `@last_frame`. 3–30 s, where duration caps the frame count (3 s → 4 frames, ≥9 s → 10). There is no audio toggle and no references. **This is the best orbit tool when you have 3–4 real angle photos.**
- `kling-4.0/reference-to-video`: ≤10 images, ≤5 videos, ≤7 elements (15 assets total). Audio is always on. Kie uses `@image_1` while Kling's own docs use `@Image1`, and **Kie rejects mentions it can't match**.
- `kling/v2-5-turbo-image-to-video-pro`: the only Kling with `negative_prompt` (≤2,496 characters), `cfg_scale` (0–1) and `tail_image_url`; 5 or 10 s.

#### C. MiniMax H3 (= Hailuo 3) · Hailuo 2.3 / 02

**Sources**
- [official] https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md (and `…_ref_en.md`)
- [official] blog https://www.minimax.io/blog/minimax-h3

**Prompt format [official]**
- For image-to-video, the first line is fixed: *"For the target video, at 0.00 seconds into the target video, &lt;Picture 1&gt; (from [Shot 1]) is fully referenced."*
- Then a blank line, then `[Shot 1]` with style and composition, then Soundscape, then Music.
- Describe *first-frame anchor → action onset → development → result*.
- First+last frame: describe the motion path; a single shot is preferred.
- In reference mode, use `<Subject N>`, `<Picture N>`, `<Video N>`.

**Camera vocabulary [official table]:** Push In/Pull Out, Pan, Truck, Tilt, Pedestal, Arc Shot, Tracking, Static, Shake, POV, Roll, each with "small/large amplitude" and "slow/fast speed". Write these in natural English.

**Older bracket grammar**
- The bracket commands (`[Push in]`, `[Truck left]`) belong to Hailuo 02/2.3 "Director" [official] https://hailuoai.video/pages/blog/camera-movement-prompt-cheatsheet

**Audio and claims [official]**
- Audio cannot be turned off on Kie (the guide allows "Soundscape: N/A" only for explicit silence), so strip it.
- A voice-over speaker's lips stay closed.
- MiniMax claims "accurate text and brand rendering" [official claim]. Output is 24 fps [practitioner].

**Kie [official]**
- `minimax-h3/image-to-video`: `{prompt ≤7000, first_frame_url, last_frame_url, duration 4–15 (default 6), resolution "768P"|"2K"}`. The aspect follows the image; no seed, no negative prompt.
- `minimax-h3/reference-to-video`: ≤9 images, ≤3 videos, ≤3 audio; aspect adaptive or 7 ratios.
- Legacy: `hailuo/02-image-to-video-pro` has `end_image_url` and `prompt_optimizer` (set it false).

#### D. Alibaba Wan 3.0 / 2.7

**Source:** [official] https://help.aliyun.com/en/model-studio/wan3-video-generation-prompt-guide

**Prompt structure [official]**
- Formula: *[Overall description] + [reference citations: Image N / Video N / Audio N]*, then timestamped shot blocks of 2–5 s, dialogue, sound, style, then a **negative list**.
- With a first frame, describe only motion, plot and camera.

**References [official]**
- Number references per type in upload order, or "the wrong material will be cited".
- You can scope a reference's role: *"Only reference the color tone and lighting of Image 2, not the characters."*
- Wan's own product example: the packaging's *"gold-stamped logo, text, deep-forest-green color scheme and printed pattern stay highly consistent without deformation"* + *"keep everything else unchanged"*. Change one thing at a time.

**Static camera and dialogue [official]**
- For a static camera write *"Fixed shot, camera static, position unchanged."*
- **Write "No dialogue" or the model decides by itself.**
- Fast repeated actions are unreliable.
- Frame mode and reference mode are exclusive.

**Kie [official]**
- `wan/3-0-video` (also `-prime`):
  - `first_frame_url` (+`last_frame_url`) **or** `reference_image_urls` ≤10 / videos ≤5 / audio ≤5.
  - 480P/720P/1080P · adaptive or 5 ratios incl. 9:16 · 2–30 s · `audio` boolean · **`seed`**.
- `wan/2-7-image-to-video`: first/last frame plus a **`negative_prompt` ≤500 characters**, `prompt_extend` (default true, so set false), seed.
- `wan/2-7-r2v`: reference to video.

#### E. Runway (only Gen-4 Turbo on Kie; Aleph is listed as discontinued)

- **Official guidance** (Runway's help centre returned 403, so these come from search snippets):
  - *"Negative phrasing is not supported and may produce unpredictable or even opposite results"* [official].
  - Image-to-video prompts should describe subject action and camera action, not the picture.
  - Gen-4.5 (Dec 2025) has first-frame image-to-video but is **not on Kie** [official changelog] https://runway.com/changelog
- **Kie `runway`:** `{prompt ≤1800, image_url, duration 5|10, quality 720p|1080p (no 10 s at 1080p)}`. It has no end frame, references, seed or audio.
- **Use it only as a cheap positive-phrasing fallback.**

#### F. Others on Kie (brief) [official Kie]

- **PixVerse V6**
  - `pixverse-v6/transition`: first + last frame, 1–15 s, `generate_audio_switch` (default false), `seed`. A cheap, seedable transition fallback.
  - `pixverse-v6/reference-to-video`: 1–7 refs `@ref_name`, with `type` subject|background.
- **Vidu Q4**
  - `vidu-q4/image-to-video`: first frame only, 3–16 s, `audio` boolean.
  - `vidu-q4/reference-to-video`: 1–15 refs.
- **HappyHorse 1.1**
  - `happyhorse-1-1/reference-to-video`: ≤9 refs `[Image 1]`, aspect options include **4:5** and 9:16.
  - No audio toggle and no seed. Second on AdSpark cross-shot consistency.
- **Grok Imagine** (`grok-imagine-video-1-5-preview`): first/last frame, `loop_url`, ≤4 timed `keyframes`, `enable_audio`.

### 2.4 Video comparison table (Kie endpoints, verified 2026-11-01)

| Model (Kie id) | First+last frame | Identity refs | **Frame + refs in one call** | Max length | Aspect | Negative prompt | Audio off | Seed |
|---|---|---|---|---|---|---|---|---|
| Veo 3.1 `veo-3-1` | Y (4/6/8 s) | 1–3 (fast/lite, 8 s) | N | 8 s (+extend 720p) | 16:9, 9:16 | N | **N** | N |
| Gemini Omni 1.1 `google/gemini-omni-flash-1-1` | Y | ≤7 images (+video, chars) | N | 10 s (+extend) | 16:9, 9:16 | inline | N (prompt "No…") | Y |
| Seedance 2.0 `bytedance/seedance-2` | Y | 9 img / 3 vid / 3 aud | N | 15 s | 7 incl. 9:16 (**default 16:9**) | inline | Y | N |
| Seedance 2.5 `bytedance/seedance-2-5` | Y | 30 / 10 / 10 | N | 30 s | 7 | inline | Y (per Kie; disputed) | N |
| **Kling 3.0 Omni** `kling-3.0-omni/image-to-video` | Y | 3 elements × 2–4 views | **Y** | 15 s | follows frame | N | Y | N |
| Kling 3.0 `kling-3.0/video` | Y | 3 elements | Y | 15 s | 16:9, 9:16, 1:1 | N | Y | N |
| Kling 4.0 `kling-4.0/keyframe-to-video` | Y + 8 middle keyframes | — | — | 30 s | follows frame | N | N | N |
| Kling 4.0 `kling-4.0/reference-to-video` | N | 10 img / 5 vid / 7 elements | — | 30 s | 5 incl. 9:16 | N | N | N |
| Kling 2.5 Turbo `kling/v2-5-turbo-image-to-video-pro` | Y (tail) | — | — | 10 s | follows image | **Y** + cfg | N | N |
| MiniMax H3 `minimax-h3/image-to-video` | Y | — | — | 15 s | follows image | N | **N** | N |
| Wan 3.0 `wan/3-0-video` | Y | 10 / 5 / 5 | N | 30 s | 6 incl. 9:16 | inline list | Y | **Y** |
| Wan 2.7 `wan/2-7-image-to-video` | Y | — | — | 15 s | follows image | **Y** | ? | Y |
| Runway `runway` (Gen-4 Turbo) | N | — | — | 10 s | follows image | N (harmful) | silent | N |
| PixVerse V6 `pixverse-v6/transition` | Y | — | — | 15 s | follows image | N | Y (default) | Y |

**Notes**
- **No Kie video endpoint exposes fps.** H3 and Seedance output 24 fps [practitioner], so run ffprobe on every clip and conform it to the Remotion composition rate.
- **Most i2v endpoints take the aspect ratio from the input image.** Always upload the real photo **pre-cropped to 1080×1920 (or 1080×1350)**.

### 2.5 Video skeletons (3–5 s, 9:16, clean plate, real product)

```text
SEEDANCE 2.0  first_frame_url=real_9x16.jpg [, last_frame_url=real2_9x16.jpg]  generate_audio:false  aspect_ratio:"9:16"
              duration:5  resolution:"1080p"
"Product film: a [colour] [material] [handbag|sneaker] on [surface] in [setting]. [Slow orbit left with small amplitude |
 slow push-in | locked-off camera]. Soft studio key light, gentle rim light, sharp focus on the product. The [bag] keeps
 exactly the shape, colour, stitching, [gold] hardware and logo of the first frame in every frame; it is the only object
 in the scene. One continuous shot. No subtitles, no on-screen text, no added logo or watermark, no packaging, no people,
 no background music."

KLING 3.0 OMNI  image_urls:[start(,end)]  elements:[{name:"bag", description:"[colour] [material] handbag, [hardware];
                ignore the background", element_input_urls:[front, 3/4, side, clasp]}]  audio:false  duration:5  "1080p"
"@bag stands on [surface] exactly as in the first frame. 0–5 s: the camera orbits slowly left, about a quarter turn,
 keeping @bag centred; soft light glides across the [leather] and the [gold] clasp catches a small highlight. @bag keeps
 its exact shape, [colour], stitching, hardware and logo throughout; it is the only object on the plinth. Clean
 photorealistic product film, one continuous take. No subtitles. No background music."

KLING 4.0 KEYFRAME  first_frame_url=front, keyframe_urls:[45°], last_frame_url=side   duration:5
"Turntable product film. Use @first_frame as the opening frame, @keyframe_1 at the midpoint and @last_frame as the final
 frame; the camera arcs slowly and continuously between these exact views with no cuts. The bag's shape, colour, hardware
 and logo match the keyframes exactly. Soft studio light, plain [colour] backdrop. No subtitles. No background music."

MINIMAX H3  first_frame_url (+last_frame_url)  duration:5  resolution:"768P" (draft) | "2K" (final)
"For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

 [Shot 1] Live-action commercial product film. The [colour] [material] handbag from <Picture 1> rests on [surface].
 Arc shot with small amplitude at slow speed to the left while soft light slides over the leather; the bag's shape,
 colour, stitching, hardware and logo stay exactly as in <Picture 1>, and no other objects enter. No subtitles,
 on-screen text, watermarks or logos are added. Soundscape: N/A. Music: N/A."

WAN 3.0  first_frame_url (+last_frame_url)  audio:false  seed:<fixed>  duration:5  aspect_ratio:"9:16"
"E-commerce product showcase of the [colour] [material] handbag in the reference image on [surface]. Shot 1
 (00:00–00:05): the camera orbits slowly left in a small arc, keeping the bag centred; soft side light reveals the
 leather grain and the [gold] clasp. The bag's shape, colour, stitching, hardware and logo stay highly consistent
 without deformation; keep everything else unchanged. No dialogue. No background music. Clean warm-tone studio,
 photorealistic. No subtitles, no watermark, no extra brand names, no complex text, no packaging or box, no extra
 objects, no colour change, no frequent shot cuts."

RUNWAY (Gen-4 Turbo)  image_url pre-cropped 9:16  duration:5    — positive phrasing only
"The camera slowly orbits left around the handbag as soft light glides over the leather and the gold clasp glints.
 The handbag stays still and unchanged against the plain studio background."

LIFESTYLE SWAP (any model above) — replace the motion block with:
"Neck-down tracking shot: a woman walks slowly toward camera carrying the bag on her shoulder, hand relaxed on the strap,
 the bag swinging gently; [the white sneakers stay identical]."  + "No dialogue" wherever supported.
```

---

## 3. Product-fidelity techniques that actually work (2026)

### 3.1 The fidelity ladder: always use the highest rung the shot allows

| Rung | Technique | Where the product pixels come from | Use for | Main risk |
|---|---|---|---|---|
| **L0** | Real photo or footage: phone on a lazy-Susan turntable, real hands, real model | real | unboxing, try-on, hands, orbit, demo, ASMR | production effort only |
| **L1** | **Real cut-out composited on an AI plate.** All "camera" motion (push-in, parallax, slide) is done in Remotion | **real, pixel-identical** | packshots, price/bundle cards, push-ins, loops, colour-way slideshows | integration realism (shadow, light, grain) |
| **L2** | AI harmonise or relight *around* the real product, then **paste back** the original product pixels ("sandwich") | real (restored) | product in a lit scene with believable shadow and reflection | edge halos; mismatched light direction |
| **L3** | Reference-conditioned image generation (multi-ref), then paste back wherever the angle matches | generated, partly restored | worn/held stills, reference-layout clones | identity drift, hardware count, colour |
| **L4** | Image-to-video from a **real first frame** (+ real last frame): camera-only motion, product static | generated, anchored at the ends | light play, slow arc ≤30°, reveal | mid-clip drift, invented back sides |
| **L5** | Reference-to-video, product motion, person interacting | generated | lifestyle walk, wearing, carrying | highest: morph, colour drift, hands |
| **L6** | Text-only generation of the product | invented | — | **banned**. It invents a different bag [first-party] |

**Evidence**
- OpenAI: *"If a region must remain pixel-identical, composite the approved edit into the original image instead of relying on prompting"* [official].
- AdSpark: closed video models "struggle to preserve product fidelity during complex motion" [official paper].
- Krea: keep "claims, labels, and fine packaging details out of the animation unless frames pass product review" [practitioner] https://www.krea.ai/blog/top-6-ai-video-models-for-ecommerce-ads-in-2026
- Atria's Clone-Ad flow checks generated images "against the real product photo" [official] https://intercom.help/atria-e5456f8f6b7b/en/articles/13907653-generate-image-ads-with-raya

### 3.2 Multi-reference conditioning: how each model wants references

| Model | Max refs (Kie) | Address them as | Lock phrase that the vendor documents |
|---|---|---|---|
| Nano Banana Pro / 2.1 | 8 / 10 (Pro: ≤6 *objects* at high fidelity) | by role in words ("the attached bag") | "Keep everything else … exactly the same" [official] |
| GPT Image 2.5 | 16 | "image 1", "the second image" + role | "Do not change … in any way" + list what stays [official] |
| Seedream 5 Pro | 10 | "Image 1", "Images 2 to 6" | "Preserve the exact appearance of each product from its reference" [practitioner] |
| FLUX.2 / FLUX 3 | 8 (7 at 2 MP) / 10 | "image 1", `<ref_image_0>` + role | "… exactly same as image 2 with the exact logo" (Kie example); "Keep the rest … exactly unchanged" [official] |
| Qwen 2.1 | 10 | "the first image" (order matters) | — |
| Veo 3.1 | 3 (fast/lite, 8 s) | "Using the provided images for …" | "Veo preserves the subject's appearance" [official] |
| Gemini Omni 1.1 | 7 | `<IMAGE_REF_N>` + a closing usage sentence | "Keep everything else the same" [official] |
| Seedance 2.0 / 2.5 | 9 / 30 | "Image 1 is …", "@Image 1 is the sole authority on …" | "The shoe's design stays identical in every shot" [practitioner] |
| Kling 3.0 Omni | 3 elements × 2–4 views + frames | `@name` | element description lists "features the model should ignore" [official] |
| Wan 3.0 | 10 | "Image N" per type | "… stay highly consistent without deformation; keep everything else unchanged" [official] |
| MiniMax H3 (ref) | 9 | `<Picture N>`, `<Subject N>` | "stay exactly as in &lt;Picture 1&gt;" [official pattern] |

**Reference-prep rules.** These are the inputs to every rung L2–L5.
1. **Neutral, evenly lit packshots.** Grey/white seamless, soft key light at 45° camera-left, fill, grey-card white balance, ≥2,000 px.
   - ByteDance's fusion example uses packshots on white [practitioner].
   - Neutral light gives the model the most room to relight [practitioner] https://lumalabs.ai/news/ai-relighting-product-photography
2. **One colourway per reference set.** Never mix colours across one call's references [inference + first-party colour morphs].
3. **Shot list per SKU:** front, 3/4, side, back, top, a **hardware/clasp macro**, a **logo macro**, the sole (shoes), and the inside (bags). Store them in the product record with a `light_recipe` note.
4. **Don't send collage or "multi-view sheet" images** to Seedance: they get "read as several different people" [practitioner]. Send separate files.
5. **Pre-crop and pad** to the delivery ratio before upload. Most image-to-video endpoints inherit the aspect from the image, and Veo's `Auto` centre-crops [official].

### 3.3 Edit vs generate: decision tree

```text
Is the product's final appearance unobstructed (no hand/body over it) in this frame?
├─ YES → L1 composite the real cut-out. Need believable shadow/reflection? → L2 sandwich (§3.5).
│        Need motion? → animate the cut-out in Remotion (push-in / parallax / slide) over a still or AI video plate.
└─ NO (worn, held, carried, interacting)
   ├─ Can you shoot it for real (phone, model, 10 min)? → L0. Always cheaper than 30 failed generations.
   ├─ Still image → L3: edit model with the REAL product refs (GPT Image 2.5 Sunburst / Nano Banana Pro / Seedream 5 Pro),
   │                 then paste back the product pixels wherever geometry matches; QA every hardware piece.
   └─ Video → L4 if the product can stay still (camera-only motion, real first/last frame);
              L5 only with multi-view references (Kling 3.0 Omni elements) + strict QA; ≤5 s; one move.
NEVER L6.
```

### 3.4 Masking and inpainting: what Kie actually exposes

| Tool | Mask type | Notes |
|---|---|---|
| `qwen2-1/image-to-image` `mask_url` | Pixel mask: **white = change**, black = keep. Single input image | The cleanest "repaint the background around a locked product" call [official Kie] |
| `ideogram/v3-edit` `mask_url` | Pixel mask. Ideogram's API uses **black = edit**; polarity on Kie is untested | Has a `negative_prompt` [official / unverified] |
| Nano Banana family | **Semantic mask in text**: "change only the [element]…" | No pixel mask [official] |
| GPT Image (OpenAI API) | Alpha mask, but *"the model uses the mask as guidance, but may not follow its exact shape with complete precision"* | **Kie's GPT endpoints don't expose a mask** [official] |
| FLUX 3 bounding boxes | Layout hints `[top,left,bottom,right]` on a 0–1000 grid, **not masks** | Behaviour on Kie is [unverified] |

**Consequence:** a mask never guarantees pixel identity. **Always paste back** (§3.5, step 6).

### 3.5 The compositing recipe (L1 / L2): real cut-out onto a generated scene

1. **Shoot to a recipe.** Record camera height, focal length, key-light direction and white balance in the product record. You will prompt the plate with the *same* recipe [inference].
2. **Cut out** with `recraft/remove-background` (or a local matting model, §7). Check the alpha around handle loops, strap gaps and laces. Keep the full-resolution PNG.
3. **Generate the plate with an empty product slot.**
   - Example: "an empty white marble slab in the lower-centre third where an object will be placed later; key light from the upper left at 45°, soft; eye-level camera, 50mm look; shallow depth of field."
   - Keep the plate's camera angle the same as the product photo's. A top-down plate under a 3/4 product reads fake.
   - For a moving background, generate an **empty-plate video** (Veo 3.1 fast T2V, Wan 3.0 with a seed) with a slow move and **no product**.
4. **Composite in Remotion**, layer by layer:
   1. the plate
   2. a **contact shadow**: a blurred ellipse in multiply at 30–50%, offset away from the key light
   3. the product cut-out
   4. an optional **light-wrap**: the plate colour blurred onto the product edge at 10–20%
   5. **grain matched** to the plate
5. **Grade the plate to the product, never the product to the plate.** The product's colour is what the COD customer receives. A colour shift shows up as an RTO (return to origin) [inference + CLAUDE.md COD complaints].
6. **Optional AI harmonise (L2 sandwich).**
   - Send the flattened composite to `nano-banana-pro` with: "Using the provided image, change only the lighting and shadows around the bag so it sits naturally… Keep the bag itself exactly the same" (skeleton A(d)), or to `qwen2-1` with a mask that is white *except* the product.
   - Then **paste the original cut-out back on top** at the identical transform, with a 1–2 px feather.
   - This keeps the AI's shadow and reflection and restores the true product.
   - It is the same idea as IC-Light's **Detail Transfer** node, which recovers "high frequency detail (Text, etc) from original input image" [practitioner] https://www.runcomfy.com/comfyui-nodes/ComfyUI-IC-Light-Native
7. **Verify pixel-lock deterministically.** Compare the product region in the output against the source cut-out with ImageMagick `PHASH`. In a local test (IM 7.1.2), PHASH stayed ≤0.0002 under JPEG q85 and a 2 px shift but rose to 0.0105 for a 5% hue rotation. So **normalised PHASH ≤0.001 plus ΔE00 ≤1.5** proves the product wasn't regenerated or recoloured [inference + local test].

### 3.6 Video control: frames, shot length, cuts, loops

- **A real first frame is mandatory. A real last frame is strongly preferred.**
  - Setting the last frame to the real hero photo guarantees the frame where Remotion lands the price is the true product [inference].
  - Kling: start and end frames "should be as similar as possible", or the model inserts a cut ("lens switch"). Transitions are smoothest at **≤5 s** [official].
- **Use short clips and cut them together; don't ask for long takes.**
  - "Stitching two 4-second clips may beat one 8-second clip" [official, OpenAI's Sora guide].
  - Gemini Omni defaults to multi-shot, so ask for "one single continuous shot" [official].
  - On AdSpark, *cross-shot* product consistency ranges from 94.99 (Seedance 2.0) down to near-zero for some models [official paper].
  - **Rule:** one AI generation = one shot; sequences are Remotion cuts.
- **One camera move, slow; the product stays still.**
  - "Combining moves increases image instability" [practitioner].
  - Use the H3 / Hailuo modifiers "small amplitude, slow speed" [official].
  - Arcs ≤30° unless you supplied the other angles (Kling 4.0 keyframes or Kling 3.0 Omni elements). An orbit forces the model to invent the unseen side [inference].
- **One colourway per clip.** For a "4 colours" ad, generate four clips and cut between them [inference + first-party].
- **Hands and faces.**
  - Never let AI hands *manipulate* the product: use real footage. Start any held-product shot from a real photo where the hand already holds the strap, and ask for one slow action [practitioner].
  - For faces: frame neck-down, set audio off, and write "No dialogue"/"Nobody speaks". Wan's official control is "No dialogue". H3 keeps voice-over speakers' lips closed [official]. This addresses the owner's mute-talking-face veto [first-party].
- **Loops.** Use the same real image as first and last frame. Omni documents a "looping start and end frame" [official]; Grok Imagine has `loop_url`. Alternatively make the loop in Remotion from a real still, as in the Pack Noir 3s format [first-party]. Verify the seam with SSIM(last, first) ≥0.90.
- **Candidates and attempts.** Make 2–4 candidates per shot (fixed seed where available: Wan, PixVerse, Omni, FLUX 3 Klein). Allow at most **3 attempts per shot**, then change rung or technique. This matches `lab.json kie.max_attempts_per_shot = 3` and the global "3 failures = stop" rule.
- **Prompt rewriters off:** `enhance_prompt:false` (FLUX 3, Qwen 2.1), `prompt_extend:false` (Wan 2.7), `prompt_optimizer:false` (Hailuo 02), `expand_prompt:false` (Ideogram). Rewriters add props [unverified/inference].

### 3.7 Upscaling: only after QA, then QA again

- **Tools:** `topaz/video-upscale` (×2, input ≤50 MB); `topaz/image-upscale` or `recraft/crisp-upscale` for stills [official Kie].
- **Prefer native 1080p where offered** (Veo 1080p/4k, Seedance 1080p, Kling 1080p). Omni's 1080p/4k are themselves upscales [official].
- **Upscalers synthesise texture.** Re-run the colour, logo and stitching checks on the upscaled file before it goes to Remotion [inference].
- **Seedance 4k comes out as H.265**, so transcode to H.264 for Remotion and Meta [official Kie].
- **Meta recommends 1440×2560 for Reels ads** (1080×1920 is accepted) [official] https://www.facebook.com/business/ads-guide/update/video/instagram-reels. Render finals at 1440×2560 only if the source plates hold up at that size.

### 3.8 How professionals QA fidelity (what to copy)

- **AdSpark-Bench protocol** [official paper] https://arxiv.org/html/2610.10047v1
  - GroundingDINO + SAM2 → product crops.
  - **DINOv3 cosine** against the reference (subject consistency).
  - **Key-region similarity** on annotated logo and brand-mark regions.
  - **OCR text fidelity** (RapidOCR, edit distance).
  - **Cross-shot consistency** (crops before and after each cut).
  - **Product motion stability**: centroid displacement, mask-area variation, adjacent-mask IoU.
  - A VLM judge (GPT-5.5) for shot execution and "ad effectiveness".
- **Metric caution**
  - CLIP-I and DINOv2 correlate poorly with human judgement on composites; **DreamSim** tracked humans better [practitioner, arXiv] https://arxiv.org/html/2509.21278v4
  - So any embedding score must be **calibrated per SKU** and backed by a VLM attribute check plus a human.
- **Practitioner checklists**
  - Check silhouette, lid/flap, colour and wordmark from the first frame to the last. A logo "may look right in the opening frame and then stretch when the product turns" [practitioner] https://www.nemovideo.com/blog/video-tool-comparisons/kling-4-0-vs-veo-3-1
  - A product-accuracy failure means **discard and regenerate, don't patch** [practitioner] https://oakgen.ai/blog/ai-ad-quality-checklist
- **Ours** [first-party, `reference-ai-broll-clip-selection`]:
  - Dedupe by md5.
  - **Zoom strips catch morphs that scdet misses.**
  - Reject invented packaging.
  - Use exact-frame plates and gridded slot measurement.

### 3.9 The 5 fidelity rules to hard-code (compiler + QA enforce them; humans can't override)

```json
{
  "fidelity_rules": [
    {"id": "FR1_REAL_PIXELS",
     "rule": "Every product appearance traces to a real photo/footage of the exact SKU + colourway. Any AI call that shows the product attaches >=1 real reference or a real first frame. Text-only product generation is blocked.",
     "check": "plan.shots[*].route.product_refs.length >= 1 && dna.product_framing.fidelity != 'ai_text_only'"},
    {"id": "FR2_PIXEL_LOCK",
     "rule": "Where the product is unobstructed in the final frame, its pixels are the real cut-out (composited, or pasted back after any AI edit; masks are guidance only). Generated product pixels are allowed only where interaction or motion makes compositing impossible, and then must pass the identity gate.",
     "check": "rung in [L1,L2] => phash_norm(product_region, cutout) <= 0.001 && dE00 <= 1.5"},
    {"id": "FR3_ONE_STATE_PER_CALL",
     "rule": "One SKU-colourway and one angle family per AI call. Real image pre-cropped to delivery ratio. <=5 s, one slow camera move, product static unless real multi-view refs are supplied, no AI hand manipulation, single continuous shot. Sequences and colour changes are Remotion cuts.",
     "check": "len(colourways)==1 && duration<=5 && cuts_detected==0"},
    {"id": "FR4_NO_INVENTION",
     "rule": "Prompts never contain the brand name, price, currency, offer or a described gift/box. Packaging and logo words may appear ONLY inside the approved CLEAN negation clause, and never on positive-only models (FLUX, Runway; Kling beyond 'no subtitles'). Every plate/clip is OCR-clean and packaging-free before overlay. Text, price, logo and gift box come only from Remotion or real photos.",
     "check": "scene_fields !~ /SIRINE|سيرين|DZD|دج|\\bDA\\b|gift|هدية|box|packag|logo/i && (positive_only(model) => prompt !~ /logo|box|packag/i) && ocr_tokens(plate)==0 && vlm.invented_elements==[]"},
    {"id": "FR5_GATE_BEFORE_HUMAN",
     "rule": "Automated identity, colour, hardware/logo and temporal gates run first, then a side-by-side 100% zoom human check against the reference. Max 3 attempts per shot, then change technique. Nothing ships with a failed gate.",
     "check": "qa.gates.all(PASS) && qa.human.verdict=='PASS' && attempts<=3"}
  ]
}
```

---

## 4. Text in AI images: Arabic, Darija and French

### 4.1 What the models claim and what testing shows

| Model (current) | Official claim | Evidence of Arabic quality |
|---|---|---|
| **Nano Banana Pro** (Gemini 3 Pro Image) | Best-performance text languages include **ar-EG** and **fr-FR**. Advice: "first generate the text and then generate an image with that text" [official] https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-generation-limitations | RTL respected in an infographic test [practitioner] https://fliki.ai/blog/nano-banana-pro-review; "Arabic ~75%, ≤8 chars" with no method given [unverified] |
| Nano Banana 2 / 2.1 | No language list. Gemini 2.5 Flash Image's list (EN, es-MX, ja-JP, zh-CN, hi-IN) has no Arabic or French [official] | none independent |
| **Seedream 5.0 Pro** | 10+ languages incl. French and Arabic; *"correctly process[es] the right-to-left cursive script of Arabic"*; also admits fine text needs work [official] | vendor demo only; small-text typos [practitioner] |
| GPT Image 2 / 2.5 | Only English and Spanish examples in the docs; the launch page was unreachable [unverified] | third parties claim Arabic; no native-speaker test |
| Ideogram 3 / 4 | no Arabic claim | Ideogram 4 Arabic "documented as unreliable"; diacritics dropped [practitioner] https://invideo.io/blog/best-ai-model-text-in-images/ |
| FLUX.2 / FLUX 3 Klein / Kontext | no Arabic claim; Kontext prompts are English-only [official] | one Klein shop sign "appeared correct (pending native check)" [practitioner, weak] |
| Qwen-Image 2.x | "multilingual in-image text", languages not listed [official] | strongest in Chinese [practitioner] |
| Video (Veo 3.1, Kling, Seedance, Omni, H3) | Kling 3.0 claims readable signs, but its dialogue languages are zh/en/ja/ko/es [official]; Omni: non-English "not evaluated" [official] | **no Arabic on-screen text test found** [unverified] |

**No source tests Algerian Darija.** The `ar-EG` entry means Egyptian Arabic. Letter joining, dots, tashkeel and lam-alef ligatures have not been independently verified for any model.

### 4.2 The pipeline: generate clean, then composite the text

1. The plate is generated with **CLEAN/CLEAN+** (§2.0) and gated **OCR-clean** (§6).
2. All copy is typeset in Remotion. The established project traps [first-party] are:
   - Use **Cairo** with the Arabic subset.
   - Set `<html lang/dir>` from `report_language`, and give each creative block its own `dir`.
   - Use **Western digits** in Arabic (Maghreb convention: 4200, never ٤٢٠٠).
   - **Never use a `clipPath` left-inset wipe on RTL** («هدية» → «هدي»).
   - Arabic headlines at ≥76 px overflow 1080; use 64 px plus `nowrap`.
   - `direction:rtl` combined with `row-reverse` cancel each other out.
3. Run `tools/validate-compliance.mjs` **once per field** (never on concatenated variants) [first-party].
4. Check the Darija register by hand. Compliance PASS says nothing about slang (نقش is a swear word) [first-party].

### 4.3 When model-rendered text is acceptable

- **Never** for the price, strike price, COD line, wilaya count, brand name, offer or claims. These must match the landing page character for character, pass the lint, and stay A/B-editable.
- **Maybe** for 1–3 words of ambient Latin or Arabic *prop* text (a café sign in the background), on Nano Banana Pro or Seedream 5 Pro only, after a native speaker checks it at 100% zoom. It is easier to keep props blank (CLEAN+) [inference].

---

## 5. Winning formats, creative DNA and tagging

### 5.1 Key findings

1. **Vendors tag ads on about 8 common axes**: asset/production type, visual format, hook tactic, messaging angle, persona, offer, emotion/tone, seasonality.
   - VidMob adds measurable *time-windowed* booleans (logo early, ≥3 shots in 5 s, text ≥0.8% of screen…).
   - Atria, Segwise and Runneth also parse ad names.
   - Sources: [official] Motion https://help.motionapp.com/en/articles/12461770-getting-started-with-ai-tagging-in-motion · Atria https://intercom.help/atria-e5456f8f6b7b/en/articles/13885360-find-winning-ad-formulas-with-raya-s-ai-creative-tagging · Segwise https://segwise.ai/blog/creative-tag-taxonomy · VidMob https://help.vidmob.com/en/articles/6519983-what-guidelines-are-available-for-creative-scoring · Foreplay https://www.foreplay.co/post/introducing-content-style-filters
2. **Motion's 2026 benchmarks** (published under Runneth):
   - Coverage: $1.29B spend, 578,750 creatives, 6,015 accounts, Sep 2025–Jan 2026.
   - **A "winner" means spend ≥10× the account median and ≥$500.** That is a spend winner, not a profit winner, and the window includes Black Friday.
   - Fashion data gives **rank order only** [official] https://runneth.com/library/research/creative-benchmarks-2026/methodology
3. **Meta won't define "distinct".**
   - Meta's on-record answer: "We don't get into the specifics of how our ranking models represent individual creative assets."
   - Agencies relay that the same visual style or opening hook means "fundamentally the same ad" [official quote + practitioner] https://www.marketingbrew.com/stories/meta-ad-creative-diversification-best-practices-advertiser-approach
   - **Working rule:** two ads are distinct only if they differ on ≥2 of {visual format, first-frame subject + hook tactic, talent, angle}. Text or colour changes alone never count [inference].
4. **First-party trumps vendor data.**
   - Pack Noir 3 s loop: CTR 5.17% vs carousel 3.53%, **but LPV→purchase 1.09% vs 3.09%.** Price appeared only at 2.0 s, only 31% watched to the end, and COD was never on screen.
   - Rule: on a ≤5 s COD video, price + «الدفع عند الاستلام» are legible at frame 0 and stay [first-party].
   - SIRINE's 3-colour carousels were its top platform-ROAS ads, even though Motion ranks carousel last [first-party vs official].
5. **Tools that changed.** MagicBrief shut down 2026-07-31 [official]. motionapp.com now serves benchmarks under runneth.com [official].

### 5.2 Vendor taxonomy (condensed)

| Vendor | Dimensions → example values |
|---|---|
| **Motion/Runneth** | Asset type (UGC, lifestyle image, high production; 15 types) · Visual format (113-name library: listicle, founder story, skit, podcast, green screen…) · Intended audience · Messaging theme/angle · Seasonality · Offer type · Hook/headline tactic (25+) · naming `pp:<pain>_ma:<angle>_vf:<format>` |
| **Atria (Raya)** | Persona · Core desire · USP · Theme (Us vs Them, Testimonial, Announcement) · Key message · Emotion · Visual hook (Before/After, Bold Text Overlay) · Offer type (Discount, **Bundle**, Free Trial) · Media format · Production quality |
| **Foreplay** | Content style (Before/After, Facts & Stats, Features & Benefits, Holiday, Media & Press, Promotion & Discount, Reasons Why, Testimonial, Us vs Them) · `display_format` · niches · emotional drivers · language |
| **Superads** | hook type, ad format, visual style, creator, language, custom; scores Hook/Hold/Click/Engagement/Conversion 0–100 |
| **Segwise** (most complete published) | Hook (type/format/subject) · Format (aspect, duration band, production style, pacing) · CTA (placement, framing) · Visual (palette, setting, text density, composition) · Audio (VO, music, sound-on dependency) · Messaging (value prop, appeal, proof, awareness) · Offer (type, depth, urgency, season) · Branding (logo timing) · Nomenclature (concept ID, version, **source incl. "AI-generated"**) |
| **VidMob** | Benefit · CTA type · Tone · Production type · Level · Story type · Sound type, plus **deterministic time-window checks**. This is the model for our D fields |

### 5.3 Ranked archetypes for a fashion/accessories COD brand, with the AI-safe production rung

**Statics**

| # | Archetype | Evidence | Rung (§3.1) |
|---|---|---|---|
| 1 | **Price-anchor bundle card** (bag + sneakers + gift, 4200 / ~~5800~~ / COD) | Offer-First Banner 8.6% hit rate; Price Anchor is the #3 hook by hit rate and #2 by spend use; "product image with text" is the #2 asset type [official, Runneth] | **L1**: real cut-outs + AI plate; all text in Remotion |
| 2 | **Colour-way carousel** (one colour per card, price + COD on each) | SIRINE's top-ROAS ads; carousel LPV→purchase 3.09% [first-party] | L0/L1 |
| 3 | Text-forward native statics (post-it, sign, billboard, unconventional text placement) | Post-it is fashion's #1 by hit rate [official, Runneth] | L1: real packshot pasted in perspective; Darija in a font |
| 4 | Social-proof screenshots (comments, WhatsApp) | Social Comments is in fashion's top 10 [official] | **Rebuild real comments only** (consent, names blurred). Never generate them |
| 5 | Gift-reveal static ("واش الهدية؟") | indirect; bag buyers skew male, 233 vs 158 [first-party] | L0 photo of the real gift; AI-invented boxes are banned [first-party] |
| 6 | Stylized product / lifestyle | top 10 by hit rate in fashion [official] | L1/L2 relit packshot; on-body only from real photos (L0) or L3 + strict QA |
| 7 | Quiz/meme ("which colour are you?") | Quiz #2 in fashion by hit rate [official] | L1 template; check the register by hand |
| 8 | Us-vs-them / feature callouts (zip, pouch, eyelets) | Us vs Them ~5–10% hit rate overall [official] | L0 macros + Remotion arrows; claims literally true |

**Video**

| # | Archetype | Evidence | Rung |
|---|---|---|---|
| 1 | **Unboxing / gift reveal** (real hands) | **Top format overall: 9.8% hit rate, 1.3× spend use** [official, Runneth] | **L0**; AI only for intro/outro plates |
| 2 | **3 s seamless loop with the offer rail from frame 0** | Pack Noir data [first-party]; Meta building blocks +29% CVR (app campaigns) [official via trade press]; no independent loop evidence | L1 Remotion push-in on a real still, or L4 Omni/Seedance first=last frame |
| 3 | Try-on / styling with the matching sneakers | in the library, no figure [official] | L0 real model |
| 4 | Podcast/talking head in Darija | fashion's #1 by spend use [official] | **L0 only.** The owner vetoes AI talking faces |
| 5 | Demo (compartments, detachable pouch, sole flex) | 8.1% hit rate [official] | L0 |
| 6 | ASMR (zip, patent leather, lid) | fashion hit-rate top 10 [official] | L0 macro + real foley |
| 7 | Slideshow/montage of colourways | fashion spend-use top 10 [official] | **L1 in Remotion**: the cheapest carousel→video conversion |
| 8 | Product orbit/stylized studio clip | static version ranks well [official] | L4: Kling 3.0 Omni / Kling 4.0 keyframes from real angles; strict QA |
| 9 | Street interview / "guess the price" | data only for Health & Wellness [official] | L0 real people only; a fake interview is a fabricated testimonial |

**Hooks** [official, Runneth top-hook-tactics https://runneth.com/library/research/creative-benchmarks-2026/top-hook-tactics]
- By hit rate the leaders are Newness, Sale Announcement, **Price Anchor**, Urgency, Announcement, Offer Only and FOMO.
- By spend use: Giveaway, Price Anchor, Announcement, Event, Offer Only, Confession.
- Hooks that work outside sale periods: Confession, Contrarian, Shocking Statement, Warning.
- **SIRINE default:** Price Anchor + gift-with-purchase + Newness. Test a Darija Confession or Relatability hook as the non-promo arm. **Every hook carries the offer rail**, because a hook can win the click and lose the order [first-party].

### 5.4 Creative-DNA schema (`sirine.creative_dna/0.1`)

**Field markers**
- `D` = deterministic: measured from the file by ffprobe, `scdet`, OCR, Whisper, k-means or LUFS.
- `J-lite` = judgement with a closed visual definition.
- `J` = judgement with a decision rule.

**Calibration.** Two taggers tag the same 20 ads. Any J field below 80% agreement gets coarser values or is dropped [practitioner method].

```json
{
 "schema":"sirine.creative_dna/0.1",
 "source":{"ref_url":"str","ad_library_id":"str","brand":"str","captured":"date","tagger":"str","contains_ai_media":"bool ·D (Ad Library contains_digital_created_media)"},
 "format":"static|carousel|video|static_to_video_hybrid ·D",
 "aspect":"9:16|4:5|1:1|1.91:1 ·D", "duration_s":"num ·D", "duration_band":"<=3|3-6|6-15|15-30|>30 ·D",
 "loop":{"seamless":"bool ·D (SSIM last↔first >= 0.90)","len_s":"num ·D"},
 "language":{"text":"ar-DZ|ar|fr|en|none ·D+J","script":"arab|latn|mixed ·D","vo":"ar-DZ|ar|fr|en|none ·D+J"},
 "visual_format":"one Motion/Runneth library name ·J (R1)",
 "asset_type":"one of Runneth's 15 asset types ·J",
 "hook":{"tactic":"price_anchor|gift_with_purchase|newness|offer_only|urgency|fomo|exclusivity|curiosity|question|callout|confession|bold_claim|contrarian|relatability|contrast|warning|social_proof|pov|direct_address ·J (R2)",
  "carrier":"text|speech|text+speech|visual_only ·D",
  "first_frame":{"subject":"product_only|hands_product|person_product|person_only|text_only|packaging ·J-lite",
   "product_visible":"bool ·D","all_pieces_visible":"bool ·D","face":"bool ·D","price_visible":"bool ·D","cod_visible":"bool ·D","text_cov_pct":"num ·D"}},
 "shots":[{"t_in":"s ·D","t_out":"s ·D","size":"ecu|cu|ms|ws ·J-lite","subject":"as first_frame.subject ·J-lite",
   "action":"static|reveal|unbox|try_on|demo|point|walk|spin ·J","camera":"static|push_in|pull_out|pan|tilt|orbit|handheld|zoom_digital ·J-lite",
   "transition_in":"hard_cut|match_cut|whip|zoom|dissolve|wipe|loop_seam|none ·D/J-lite"}],
 "pacing":{"cuts":"int ·D","cuts_per_s":"num ·D","mean_shot_s":"num ·D","scenes_first_3s":"int ·D"},
 "text_overlays":[{"role":"hook|price|strike_price|cod|delivery|gift|cta|feature|proof|brand","text":"str ·D",
   "pos":"tl|tc|tr|ml|mc|mr|bl|bc|br ·D","cap_h_pct":"num ·D","t_in":"s ·D","t_out":"s ·D","persistent":"bool ·D","anim":"none|pop|slide|type|shine ·J-lite"}],
 "offer":{"type":["bundle|price_anchor|gift_with_purchase|free_delivery|discount_pct|limited_stock|none"],"price":"num ·D","anchor":"num ·D",
   "currency":"DZD","price_first_s":"num ·D","price_on_screen_pct":"num ·D","cod_first_s":"num ·D","coverage_claim":"str ·D"},
 "audio":{"music":"none|trending|upbeat|ambient|vocal_nasheed|percussion ·J","sfx":["none|riser|whoosh|foley|pop"],
   "sfx_on_cuts":"bool ·D","vo":{"present":"bool ·D","voice":"human_f|human_m|ai_tts|none ·J"},"lufs":"num ·D"},
 "cta":{"button":"Meta CTA enum ·D","on_screen":"str|null ·D","spoken":"bool ·D","first_s":"num|null ·D"},
 "palette":{"hex":["3 × #RRGGBB ·D (k-means)"],"brand_present":"bool ·D","mood":"bright|dark|pastel|neutral|high_contrast ·J"},
 "talent":{"human":"none|hands|face|full_body ·D","role":"customer|creator|founder|model|presenter|ai_avatar ·J",
   "gender":"f|m|mixed|none ·J","age_band":"18-24|25-34|35-44|45+ ·J","face_first_s":"num|null ·D"},
 "angle":"price_value|gift_for_her|treat_yourself|matching_set|material_quality|new_drop|cod_trust|scarcity|social_proof|local_pride ·J (R3)",
 "awareness":"unaware|problem|solution|product|most ·J",
 "proof":{"type":"none|review_screenshot|comment_screenshot|order_count|ugc_testimonial|star_rating|return_policy ·J-lite","first_s":"num|null ·D"},
 "product_framing":{"shot":"packshot|studio|flatlay|on_body|in_hand|lifestyle|unboxing ·J-lite","on_screen_pct":"num ·D","first_s":"num ·D",
   "pieces":["bag","sneakers","gift"],"fidelity":"real_photo|real_video|ai_from_real_ref|ai_text_only ·D(provenance)","lp_parity":"bool ·D"},
 "distinct_key":"visual_format|hook.tactic|first_frame.subject|talent.role|angle ·derived"
}
```

**Decision rules for the J fields**
- **R1 visual format:** the format with the most screen time. On a tie, the one present at 0–3 s.
- **R2 hook tactic:** classify the first text or spoken line in 0–3 s. If text and speech disagree, text wins, because Feed autoplays muted. With no words, map the visual: box/reveal → `curiosity`, price card → `price_anchor`.
- **R3 angle:** the one reason-to-buy the CTA leans on. If there are two, take the one in the hook.
- **Blocking:** `fidelity: ai_text_only` blocks launch (FR1).
- A filled example for a "bag + sneakers bundle, gift reveal, 3 s loop" ad is in Appendix A.

### 5.5 From DNA to a generation plan: the compiler's routing table (DNA shot → rung → model)

The DNA stays model-agnostic. The **compiled plan** adds a `route` per shot.

| DNA `shot.subject` + `action`/`camera` | Rung | Default route | Challenger / fallback |
|---|---|---|---|
| `product_only` + static / push_in / pull_out / pan / zoom_digital | **L1** | Remotion camera on the real cut-out over a plate (`flux-3/klein-text-to-image` or `nano-banana-2-1`) | L4 `kling-3.0-omni/image-to-video` (first frame = real, element = 2–4 real views, `audio:false`) |
| `product_only` + orbit / spin | **L0** phone turntable | L4 `kling-4.0/keyframe-to-video` with 3–4 real angle photos | `kling-3.0-omni` first+last + element · `bytedance/seedance-2` first+last |
| `product_only` + reveal (light sweep) | L4 | `bytedance/seedance-2` first(+last) frame | `kling-3.0-omni` · `veo-3-1` FIRST_AND_LAST (4 s) |
| `hands_product` + unbox / reveal / demo / point | **L0 only** | real phone footage | none (AI hands on the product are blocked) |
| `person_product` + walk / try_on | L0 → L5 | `kling-3.0-omni/image-to-video` (real outfit photo as first frame, product element, neck-down, `audio:false`) | `google/gemini-omni-flash-1-1` (IMAGE_REF, one shot) · `wan/3-0-video` (seed, "No dialogue") |
| `person_only` (face) | L0 | real UGC/creator | AI faces only non-speaking, never posed as customers |
| `packaging` (gift box) | **L0 only** | real photo of the real gift | — |
| `text_only` / price card / proof | Remotion | Remotion (proof = real comments with consent) | — |
| environment b-roll (no product) | AI allowed | `wan/3-0-video` (seed, `audio:false`) | `veo-3-1` fast T2V · `google/gemini-omni-flash-1-1` |

```json
{"plan_id":"P-2026-11-01-001","dna_ref":"dna_2026_017","sku":"PACK-NOIR","colourway":"noir","aspect":"9:16",
 "shots":[
  {"dna_shot":0,"rung":"L1","route":{"kind":"composite","plate":{"model":"flux-3/klein-text-to-image","input":{"width":1152,"height":2048,"seed":4242,"enhance_prompt":false}},
    "product_layers":["cutout/bag_front.png","cutout/sneakers_34.png"],"remotion_camera":"push_in_6pct_3s"},
   "qa_profile":"pixel_lock"},
  {"dna_shot":2,"rung":"L4","route":{"kind":"i2v","model":"kling-3.0-omni/image-to-video",
    "input":{"image_urls":["real/bag_front_9x16.jpg","real/bag_34_9x16.jpg"],"elements":[{"name":"bag","description":"black patent leather handbag, gold ring hardware x2; ignore background","element_input_urls":["real/bag_front.png","real/bag_34.png","real/bag_side.png","real/bag_clasp.png"]}],"audio":false,"duration":4,"resolution":"1080p"}},
   "candidates":3,"max_attempts":3,"qa_profile":"product_motion_strict"}]}
```

### 5.6 Per-ad tagging record (frozen at launch, joined to outcomes later)

**Rules**
- Every field takes **one value**; only `offer` is multi-select.
- Values are copied from the DNA **before** results exist.
- Use Runneth names for `visual_format` and `asset_type` so its benchmarks stay comparable.
- Compare tag groups only once each has **≥5 ads and about 30 delivered orders** [inference].
- **`utm_content={{ad.id}}` is mandatory.** A hard-coded value previously broke per-ad attribution [first-party].

```json
{"ad_id":"1202…","creative_id":"…","client":"sirine-01","launched":"2026-11-01","dna_ref":"dna_2026_017","plan_ref":"P-2026-11-01-001",
 "name":"SIR_C014_v2_vf-unbox_hk-gwp_ang-giftHer_of-anchor_lg-arDZ_916_3s",
 "concept_id":"C014","iteration":2,"skus":["<bag-sku>","<sneaker-sku>"],
 "tags":{"format":"video","asset_type":"lifestyle_product_image_with_text","visual_format":"Unboxing",
  "hook_tactic":"gift_with_purchase","headline_tactic":"price_anchor","angle":"gift_for_her",
  "persona":"female_self_buyer|male_gift_buyer|mother_for_daughter","awareness":"product",
  "offer":["bundle","price_anchor","gift_with_purchase"],"proof":"none","talent_role":"model","language":"ar-DZ",
  "production":"real_photo|real_video|ai_from_real_ref","production_rungs":["L0","L1"],"models":["flux-3/klein-text-to-image"],
  "season":"evergreen|ramadan|eid_al_fitr|eid_al_adha|mar8|summer_weddings|rentree|winter|black_friday",
  "aspect":"9:16","duration_band":"<=3","loop":true,"cod_frame0":true,"price_first_band":"0|<1|1-3|>3|absent",
  "ai_label_expected":true},
 "crosswalk":{"runneth_vf":"Unboxing","atria_theme":"Announcement","atria_offer":"Bundle","foreplay_style":"Promotion and Discount","vidmob_benefit":"Pricing","segwise_hook":"pattern interrupt"},
 "tracking":{"url_tags":"utm_content={{ad.id}}","join":"orders.source_ad_id"},
 "outcomes_d7":{"spend_usd":null,"impressions":null,"hook_rate":"3s_views/impr","hold_rate":"p100/impr","ctr_link":null,"lpv":null,
  "lpv_to_order":null,"orders_db":null,"confirmed_db":null,"delivered_db":null,"cac_delivered":"spend/delivered_db"}}
```

> Rank and kill on `spend ÷ DB delivered orders`, never platform ROAS. ROAS ranked SIRINE's ads backwards [first-party `reference-platform-roas-inverted`].

---

## 6. Automated QA rubric for AI ad outputs

### 6.1 Where QA runs

- **Stage A, raw model output** (plate or clip straight from Kie, before overlay) → identity, colour, hardware/logo, invention, anatomy, temporal.
- **Stage B, final Remotion render** → technical spec, safe zones and legibility, audio, policy.
- **Methods:**
  - **D** = deterministic: ffprobe, ffmpeg or ImageMagick, verified on the local ffmpeg 8.0 and IM 7.1.2. Pure-JS maths works too.
  - **V** = vision-model judge.
  - **H** = human.
- **All gates must PASS. The score only ranks variants that passed.**

### 6.2 Rubric

| # | Dimension | Method | PASS threshold | Gate? |
|---|---|---|---|---|
| Q0 | **Provenance** | D | The record holds real-ref hashes, model, prompt, seed, params and Kie `taskId`; md5 not a duplicate of an earlier output | gate |
| Q1 | **Product identity** | D + V + H | *Composited (L1/L2):* normalised PHASH(product region, source cut-out) ≤0.001. *Generated (L3–L5):* masked-crop embedding cosine ≥ τ_SKU (§6.4) **and** the VLM returns `same_product:true` with every attribute `match` **and** a human side-by-side PASS | **gate** |
| Q2 | **Product colour** | D | ΔE00 (product-mask mean Lab vs reference): ≤3.0 pass · 3–5 → human review · >5 fail. Composited regions ≤1.5. *Video:* max drift vs frame 0, sampled at 4 fps, ≤3.0 (morph detector) | **gate** |
| Q3 | **Hardware / logo / stitching** (key regions) | V + H (+D OCR) | Hardware counts = product spec (rings, zips, buckles, eyelets, sole pattern) **exactly**. Logo either matches the reference position and reads exactly "SIRINE", or is not legible. Any 1–2-edit misspelling ("SIRNE") → fail | **gate** |
| Q4 | **Invented elements** | D (OCR) + V | Plate OCR tokens = **0** (confidence ≥60). VLM finds **no** boxes, bags, packaging, extra products, brand marks or watermarks unless they are in the reference | **gate** |
| Q5 | **Anatomy and faces** | V + H | 0 defects in any frame where hands/feet/faces appear for >0.2 s (finger count, fused fingers, melted soles). **No moving mouths without approved VO**. No AI human presented as a customer | **gate** |
| Q6 | **Temporal integrity** | D + H | `scdet t=10` cuts = **0** for single-shot generations (= plan for multi-shot). `freezedetect n=-58dB:d=0.5` none. `blackdetect d=0.15:pix_th=0.10` none unless planned. Product mask-area change ≤±15% between 0.25 s samples on static-camera shots. Human pass on a zoom strip of every motion segment | **gate** |
| Q7 | **Technical spec** (final) | D | H.264 High, `yuv420p`, constant fps ≤30 (r_frame_rate = avg_frame_rate), SAR 1:1, progressive. 9:16 at 1080×1920 or 1440×2560; 4:5 at 1080×1350. AAC stereo ≥128 kb/s. Duration = plan ±0.05 s. File <4 GB. Stills JPG/PNG ≤30 MB, ≥1080 px short side | **gate** |
| Q8 | **Safe zones and legibility** (final) | D (layout JSON) + V | 9:16: no text, logo or critical product detail in the top 14%, bottom 35% or sides 6%. At 1080×1920 that means y <269, y >1248, x <65 or x >1015; at 1440×2560 it means y <358, y >1664, x <86 or x >1354; **bottom 40%** if there is a disclaimer [official Meta]. Overlay contrast ≥4.5:1 [official WCAG]. Price/COD cap height ≥2.5% of frame height [inference]. **≤5 s COD video: price + COD legible at frame 0** [first-party] | **gate** |
| Q9 | **Audio** (final) | D | **No model-generated audio stream in the mix** (replaced from the library/foley). Integrated −14 LUFS ±1.5, true peak ≤−1.0 dBTP [practitioner]. No SFX on cuts (owner rule) [first-party] | **gate** |
| Q10 | **Policy and compliance** | D + H | `validate-compliance.mjs` PASS **per field**. LP parity (product, colourway, price, gift match the landing page). No generated testimonials, comments or reviews. Generative Advantage+ enhancements OFF for fidelity-critical ads. AI label accepted (provenance not stripped) | **gate** |
| Q11 | **Effectiveness** | D + V | Product visible at 0 s, offer at frame 0, distinct from live ads on ≥2 of 4 DNA keys, VLM-as-customer 1–5 | score only |

**Score, 0–100, to rank passing variants** [inference]:
- 25 × identity margin
- 15 × colour margin (1 − ΔE/3)
- 15 × temporal smoothness
- 20 × hook/first-frame (Q11 deterministic part + VLM)
- 10 × aesthetic (VLM)
- 15 × distinctness

### 6.3 Deterministic recipes (option names verified with `ffmpeg -h filter=…` on ffmpeg 8.0)

```bash
# Q7 spec  (ONE -show_entries; sections joined with ':' — tested on ffprobe 8.0)
ffprobe -v error -show_entries "stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,sample_aspect_ratio,field_order,bit_rate,channels:format=duration,size" \
        -of json final.mp4        # expect h264/High, yuv420p, SAR 1:1, progressive, r_frame_rate == avg_frame_rate, aac channels 2
# Q6 unrequested cuts (scdet threshold 0-100, default 10) — same parse as vkit.mjs shots()
ffmpeg -hide_banner -i clip.mp4 -vf "scdet=t=10" -an -f null -           # parse lavfi.scd.time
# Q6 black + freeze (vkit.mjs motionEvents uses exactly these)
ffmpeg -hide_banner -i clip.mp4 -vf "blackdetect=d=0.15:pix_th=0.10,freezedetect=n=-58dB:d=0.5" -an -f null -
# Q9 loudness + true peak, silences
ffmpeg -hide_banner -i final.mp4 -af "ebur128=peak=true" -vn -f null -
ffmpeg -hide_banner -i final.mp4 -af "silencedetect=n=-32dB:d=0.35" -vn -f null -
# Q1/FR2 pixel-lock and loop seam (IM 7.1.2 prints distortion; the value in parentheses is normalised, 0 = identical)
magick compare -metric PHASH region_out.png region_src.png null:       # pass <= 0.001
magick compare -metric DSSIM last.png first.png null:                  # loop seam; calibrate (content-sensitive: JPEG q85 gave 0.12 on noise)
# Q2 colour: sample frames, crop product mask, mean Lab -> CIEDE2000 in JS (Sharma 2005 reference implementation + test data)
ffmpeg -i clip.mp4 -vf fps=4 frames/%04d.png
magick crop.png -alpha on -background none -colorspace Lab -format "%[fx:mean.r*100] %[fx:mean.g*255-128] %[fx:mean.b*255-128]" info:
```

- **ΔE00 maths:** Sharma, Wu and Dalal (2005), with the reference implementation and test pairs [official] https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
- **ΔE bands** [practitioner]:
  - <1: imperceptible
  - 1–2: visible only side by side
  - 2–3: photographic tolerance
  - 3.2–6.5: may read as a different colour
- **Watch out:** a single ΔE can hide a directional hue error, so also log ΔH and ΔC. Coloured scene light shifts the measured colour legitimately, so hero frames get the strict 3.0 and warm-light lifestyle frames go to human review [inference].

### 6.4 Identity calibration and the VLM judge

**τ_SKU calibration** [inference]
- For each SKU, embed 10–20 *real* photos (masked crops) and compute all real↔real pairs.
- **τ_SKU = the 5th percentile of those similarities.** Bootstrap at 0.80 until you have the photos.
- Verify that real↔*other-colourway* pairs fall below τ. If they don't, the embedding can't see colour, so rely on Q2.
- Prefer **DreamSim or DINOv2/v3 on masked crops**; avoid CLIP-I alone (it correlates poorly with humans) [practitioner arXiv].

**VLM judge prompt** (Claude or Gemini via Kie chat models or direct). Feed **side-by-side composites** (reference left, candidate right, native-resolution crops). For video, use the vkit contact sheet + zoom strips [first-party].

```text
SYSTEM: You are a strict e-commerce product-fidelity inspector. You never assume; if unsure, say "uncertain".
INPUT: REFERENCE images R1..Rn = real photos of SKU {sku}, colourway {colourway}.
       PRODUCT SPEC = {"hardware":{"rings":2,"zips":1,"buckles":0},"logo":{"text":"SIRINE","position":"front plate, centred"},
                       "colour":{"name":"noir","hex":"#111111"},"material":"patent leather","sole":"white rubber, wave tread"}
       CANDIDATE frames C1..Cm (timestamps given).
TASK: For EACH candidate return JSON:
{"frame":"C1","same_product":true|false,
 "attributes":{"silhouette":"match|minor_diff|mismatch","colour":"…","material_texture":"…","stitching":"…",
   "hardware":{"expected":{...},"seen":{...}},"logo":"match|not_legible|misspelled|moved|added","sole_pattern":"…"},
 "invented_elements":["box","text","extra_product","watermark",...],
 "anatomy_defects":["fused_fingers",...],"mouth_moving":true|false,
 "confidence":0.0-1.0,"notes":"one line"}
RULES: any "mismatch" or invented element => same_product=false. "minor_diff" or confidence<0.7 => route to human.
```

**Judge calibration** [first-party + inference]
- Run it on ≥20 known-good outputs and ≥20 known-bad ones (e.g. the rejected Djine AI clips c04–c07 with invented SIRINE boxes) before trusting it.
- Target agreement with humans of ≥90% on gate decisions.

### 6.5 QA rubric as config (for `creative-lab/lib/qa`)

```json
{"qa_rubric":"sirine.qa/0.1",
 "profiles":{
  "pixel_lock":{"gates":["Q0","Q1.phash<=0.001","Q2.dE00<=1.5","Q4","Q7","Q8","Q9","Q10"]},
  "product_still_generated":{"gates":["Q0","Q1.embed>=tau_sku","Q1.vlm.same_product","Q1.human","Q2.dE00<=3","Q3","Q4","Q5"]},
  "product_motion_strict":{"gates":["Q0","Q1","Q2.drift<=3","Q3","Q4","Q5","Q6.cuts==0","Q6.freeze==0","Q6.black==0","Q6.mask_area<=0.15"]},
  "final_render":{"gates":["Q7","Q8","Q9","Q10"]}},
 "score_weights":{"identity_margin":25,"colour_margin":15,"temporal":15,"hook_first_frame":20,"aesthetic":10,"distinctness":15},
 "attempts":{"max_per_shot":3,"on_exhaust":"change_rung"}}
```

### 6.6 Meta policy, AI disclosure and placement facts the QA must encode

- **AI labels.** Meta's newsroom post (2025-02-03, **updated 2026-06-01**) [official] https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/:
  - Ads created or significantly edited with Meta's GenAI tools carry "AI info" in "About this ad".
  - **If the tools produce a photorealistic AI human, the label moves next to "Sponsored".**
  - Meta "will begin automatically detecting ads made or edited with third-party AI tools using industry-standard signals".
- **The July 2026 tag update** [practitioner, quoting Meta] https://www.marketingdive.com/news/sociable-meta-adds-updated-disclosure-tags-for-ai-generated-ads/824833/:
  - Labels apply on Background Generation, Image Generation and Add Animation.
  - "Meta uses industry-standard detection methods, such as C2PA… When we detect this metadata, we label the content accordingly."
- **Self-disclosure is mandatory only for social-issue/electoral/political ads** (not our category) [official 2024 + practitioner].
  - Commercial ads are labelled automatically; no penalty regime is published.
  - Viral claims of a "global mandatory disclosure since March 2026" and "3 strikes" have **no Meta source** [practitioner] https://www.digitalapplied.com/blog/ai-content-labeling-rules-advertisers-2026-reference
- **What this means for SIRINE** [inference]:
  - Nano Banana outputs carry SynthID and C2PA; Veo/Omni carry SynthID. Remotion re-renders, so source C2PA manifests usually don't survive into the final MP4.
  - **Policy: never strip or spoof provenance to dodge the label.** Expect and accept "AI info".
  - **Avoid photorealistic AI humans.** They push the label next to "Sponsored", the owner vetoes talking AI faces, and COD trust is fragile.
- **No fabricated social proof.** Don't generate testimonials, comments, reviews, "customers" or interviews.
  - Neither Meta nor Google bans AI-made ad creative, but "the product and offer must not be presented deceptively" [practitioner] https://nightjar.so/help-desk/are-ai-generated-product-images-allowed-in-meta-and-google-ads
  - The same source says an AI scene around the real product "should not change the product's material, shape, color, scale, included accessories, packaging claims".
  - That list is exactly FR1–FR4. LP parity is already a hard rule in this repo [first-party CLAUDE.md].
- **Advantage+ creative enhancements.**
  - There are 17 AI-labelled enhancements, e.g. Visual/Video Touch-ups, Text Improvements, Image Generation, Background Generation, Add Animation, Add Overlays, Add Music and Translations. Some are on by default or switched on when Meta predicts a gain.
  - These "can generate content that never existed in your original creative" [practitioner] https://adsuploader.com/blog/advantage-plus-creative-enhancements
  - Turn the generative ones **off** for fidelity-critical ads; they also trigger the label. Watch especially for **Translations**: it would put machine-made MSA over Darija copy [inference].
- **Reels ad spec** [official] https://www.facebook.com/business/ads-guide/update/video/instagram-reels:
  - 9:16, **1440×2560 recommended**, MP4/MOV, ≤4 GB, H.264, square pixels, fixed frame rate, progressive, stereo AAC ≥128 kb/s.
  - **Safe zone: ≥14% top, 35% bottom, 6% sides** (40% bottom with a disclaimer).
- **EU AI Act Art. 50** applies from 2026-08-02 [practitioner summary of the legal text]:
  - Providers must mark outputs machine-readably; deployers must disclose deepfake-like content.
  - It isn't binding for Algeria-only targeting, but **any EU (e.g. French-diaspora) targeting needs legal review** [inference].

---

## 7. Open-source reference code worth borrowing

**How to read this section**
- Stars, last push, licence and language were pulled from the GitHub REST API on 2026-11-01 [official GitHub API]. I re-checked the top three myself: `LordVayron/video-factory` ★60 MIT pushed 2026-10-30; `AtlasCloudAI/atlas-marketing-studio` ★46, **no licence file**; `smixs/visual-skills` ★609 CC-BY-4.0.
- Feature descriptions come from the READMEs. **Nothing was executed.**
- **Py** means it needs Python, which is not installed here. **"none"** means GitHub found no LICENSE file, so copy *ideas*, not code.

### 7.1 Reference ad + product → new ad pipelines

| Repo | ★ / last push / licence / lang | What it does | Borrow |
|---|---|---|---|
| [LordVayron/video-factory](https://github.com/LordVayron/video-factory) | 60 / 2026-10-30 / MIT / JS (Node 22 `.mjs`); Py partial (faster-whisper; whisper.cpp replaces it) | Agent-run AI video studio on **Kie.ai** + ElevenLabs. Approved script → voices first (they set shot lengths) → storyboard → "Production Book" (prompts + costs) → **budget approval** → one Seedance generation per scene → **vision QC of every take** → auto-edit | **Budget lock in code** (refuses jobs over the approved book). Live price comparison. **Per-take QC checklist**: identity vs a locked reference, multiplying objects, painted-on words, unplanned cuts. One "playbook" file per format |
| [AtlasCloudAI/atlas-marketing-studio](https://github.com/AtlasCloudAI/atlas-marketing-studio) | 46 / 2026-10-16 / **none** (the README says MIT) / TS (Next.js) | Self-hosted "Marketing Studio" clone. **Reference-to-Ad:** a viral ad goes through `gemini-omni-flash` video-edit to swap in your product and presenter, falling back to Kling motion-control. **UGC:** `nano-banana/edit` first frame → `seedance-2.0` image-to-video | Both recipes and the fallback chain; the prompts and schemas in `src/lib/marketing-studio/`; the duration × resolution cost formula. Clear the licence with the authors before copying code |
| [charlesdove977/UGC-Factory](https://github.com/charlesdove977/UGC-Factory) | 94 / 2026-10-23 / MIT / JS | Brief → beat sheet (hook/problem/reveal/demo/CTA) with an approval gate → reusable Elements (creator, setting, product from a **real photo**) → keyframes → Seedance 2.0 → ffmpeg stitch | The beat→clip mapping; the "never leave a clip's script blank" rule; the style files `07-ecommerce-ad`, `09-product-360`, `13-fashion-lookbook` |
| [tenfoldmarc/meta-ads-generator-skill](https://github.com/tenfoldmarc/meta-ads-generator-skill) | 29 / 2026-05-08 / none / Markdown skill | Product URL → brand voice, palette, fonts → reviews + competitor ads → 4–6 buying drivers → 4 concepts, approved before render → statics via Kie/OpenAI/Higgsfield | Step order and the buying-driver map (ideas only) |
| [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) | 74,262 / 2026-10-28 / **AGPL-3.0** / Python + Remotion; **Py** | Can start from a reference Reel and keep its pacing and hook structure; approval on a storyboard contact sheet showing cost and quality per asset; **pins approved stills as the first and last frame** | Ideas only (AGPL): the contact-sheet gate, and first/last-frame pinning of real product photos |
| [poseljacob/agentic-video-editor](https://github.com/poseljacob/agentic-video-editor) | 506 / 2026-04-14 / MIT / Python; **Py** | Director → trimmer → editor → reviewer loop | The YAML retry rule: reviewer score <0.65 sends notes back, max 2 retries, each attempt saved as `_vN.mp4` |

Also:
- `anirudhaeran/Automated-UGC-Ad` (★4, n8n, no licence): Kie Nano Banana puts the product in a hand, **GPT-4o checks that still before animating**, then Veo 3.1 animates it. Copy the check-the-still step; its Sora path is dead.
- `Anil-matcha/Open-AI-UGC` (★409, MIT): only its `@image1…@image7` mention style is worth taking.
- Skip anything built only on Sora 2.

### 7.2 Product-fidelity image tools

| Repo | ★ / push / licence | Borrow | Py / licence flags |
|---|---|---|---|
| [ZhengPeng7/BiRefNet](https://github.com/ZhengPeng7/BiRefNet) | 4,349 / 2026-10-25 / **MIT** | Best open matting for the L1 cut-out. Runs in **Node via transformers.js**: `onnx-community/BiRefNet-ONNX` (about 490 MB fp16) or `BiRefNet_lite-ONNX` | No Python needed. MIT is safer than Bria RMBG, whose weights are non-commercial |
| [lllyasviel/IC-Light](https://github.com/lllyasviel/IC-Light) | 8,569 / 2025-02-20 (seminal) / Apache-2.0 | **Relight only**: keep the placed product pixels and change their lighting. Detail-Transfer equivalent (§3.5). ComfyUI port: kijai/ComfyUI-IC-Light ★1,162 | Py + GPU |
| [TencentARC/IC-Custom](https://github.com/TencentARC/IC-Custom) | 163 / 2025-09-15 / custom | Mask a region and it places the reference product; the README calls out **bags**, perfume, clothes and rigid objects | Py + GPU; FLUX.1-dev weights are non-commercial |
| [Kunbyte-AI/OmniTry](https://github.com/Kunbyte-AI/OmniTry) | 274 / 2025-08-29 / Apache-2.0 | Mask-free try-on of wearables; the paper covers **shoes and bags** | Py, ≥28 GB VRAM; FLUX-Fill-dev base |
| [song-wensong/insert-anything](https://github.com/song-wensong/insert-anything) | 579 / 2025-12-05 / MIT code | Mask- or text-guided object insertion; 10 GB VRAM build; ComfyUI port | Py; FLUX-dev base |
| [QwenLM/Qwen-Image](https://github.com/QwenLM/Qwen-Image) | 8,442 / Apache-2.0 | The open weights behind Kie's Qwen edit, and the most commercially friendly self-host fallback | Py + GPU |

Also: `imgly/background-removal-js` (★7,360) is **AGPL**, so avoid it. ACE++ has no licence and its FLUX branch is discontinued. In-Context-LoRA (2024) is seminal. OmniGen2 (★4,120, Apache-2.0).

### 7.3 Creative-DNA extraction

| Repo | ★ / push / licence | Borrow |
|---|---|---|
| [athm793/meta-ads-scraper](https://github.com/athm793/meta-ads-scraper) | 62 / 2026-08-01 / Apache-2.0 / TS (Playwright + SQLite) | **9-type hook classifier**: Question, Stat, How-to, Offer, Urgency, Curiosity, Social proof, Emoji-led, Statement. **Longevity tiers**: ≥30 days "battle-tested" / 14–30 "gaining" / <14 "new". Signed-webhook export. Scraping carries a ToS risk, so never run it logged into the business account. The official Ad Library API covers commercial ads only for EU/UK delivery [practitioner, unverified] |
| [google-marketing-solutions/abcds-detector](https://github.com/google-marketing-solutions/abcds-detector) | 75 / 2026-10-23 / Apache-2.0 / Py | YouTube ABCD checklist: quick pacing, dynamic start, supers, supers+audio, **brand and product visuals/mentions in the first 5 s**. Two-pass design: machine annotations, then LLM questions, then a human |
| [google-marketing-solutions/vigenair](https://github.com/google-marketing-solutions/vigenair) | 242 / 2026-10-15 / Apache-2.0 / Py | Gemini segments an ad into A/V units without cutting mid-dialogue, writes `analysis.json`, and recombines units into cut-downs. Borrow the segment schema for cut-downs of our winners |
| [creatify-ai/ad-creative-evaluator](https://github.com/creatify-ai/ad-creative-evaluator) | 33 / 2026-03-03 / MIT / Markdown skill | **8 weighted dimensions** (hook, message, visual, audience, pacing, CTA, emotion, sound-off), hook and CTA weighted highest; **3-persona judging** (performance marketer, creative director, customer) with disagreement analysis. Feeds Q11 |

Also: `promisingcoder/MetaAdsCollector` (★106, MIT, Py; internal API, ToS risk); `byjlw/video-analyzer` (★1,607, Py; `vkit.mjs` already covers it).

### 7.4 Prompt compilers and enhancers

| Repo | ★ / push / licence | Borrow |
|---|---|---|
| [smixs/visual-skills](https://github.com/smixs/visual-skills) | 609 / 2026-09-16 / **CC-BY-4.0** (credit required) | One exact-syntax file per model: Seedance up to 2.5 (from ByteDance's 2026-07-31 guide), Kling 3.0 / Turbo / Omni, **Veo 3 / 3.1 JSON**, Nano Banana 2 and Pro, GPT Image; plus preservation rules for exact edits. Timed-shot structure: `Shot 1 · 0.0–1.6s · wide, 24mm, static` |
| [VigoZhao/AI-Visual-Prompt-Cookbook](https://github.com/VigoZhao/AI-Visual-Prompt-Cookbook) | 824 / 2026-10-30 / MIT / JSON | **`style.json` shape**: `prompt_template` with `{VARIABLE}` slots, a variable list and filled examples. A ready target for "winning-ad style → template, product facts → variables" |
| [shinpr/mcp-image](https://github.com/shinpr/mcp-image) | 187 / 2026-11-01 / MIT / TS (Node 22) | Enhancer that keeps intent and adds composition, light and camera, and changes less as the input gets more detailed. `SKIP_PROMPT_ENHANCEMENT=true` gives an A/B baseline |
| [google-gemini/cookbook](https://github.com/google-gemini/cookbook) | 17,891 / 2026-10-30 / Apache-2.0 | `Get_started_Veo_REST.ipynb` is plain HTTP and ports to Node `fetch`; also Nano Banana editing and timestamped video understanding |

Also: `YouMind-OpenLab/ai-image-prompts-skill` (★1,355, MIT; 10k+ prompts for Nano Banana / Seedream 5 / GPT Image), `freestylefly/awesome-gpt-image-2` (★35,347, MIT), `OSideMedia/higgsfield-ai-prompt-skill` (★834, MIT; Seedance 2.5).

### 7.5 Kie.ai clients, SDKs and MCP servers

**Kie's official skill** (`npx skills add https://kie.ai`) installs `kie-models` and `kie-chat-agents`. There is no official GitHub repo, MCP server or npm package. A copy of `kie-models` documents these endpoints:
- **Model list:** `GET /api/v1/models?taskType=&provider=&q=`.
- **Per model:** `/schema`, `/price` and **`/success-rate`** (last 24 hours in 10-minute samples). Route away from a model whose recent success rate is abnormal.
- **Gotchas:**
  - Not every model uses `createTask`; use the path from the model's schema.
  - Don't URL-encode the `/` in model ids.
  - Poll about every 3 s (limit 10 requests/s).
  - The skill's examples need **jq, which isn't installed here**.

Third-party clients:

| Repo | ★ / push / licence | Borrow |
|---|---|---|
| [nick-vels/VelsVisual](https://github.com/nick-vels/VelsVisual) | 81 / 2026-08-06 / MIT / JS, zero deps | The cleanest **Node client skeleton**: 24 h cache of models and schemas, `--dry-run`, `upload`, `run --wait --download`, `pricing`, `recommend`, `credits`. Docs are in Russian |
| [elibarnett/kie-mcp](https://github.com/elibarnett/kie-mcp) | 9 / 2026-10-27 / MIT / JS | The **most current per-model notes** (Kling 4.0 / 3.0 Omni, Seedance 2.5, Gemini Omni, FLUX 3 Klein, GPT Image 2.5, Nano Banana 2.1): prompt formulas, weaknesses, credit and USD costs. Use them to seed the registry |
| [mrdainami/kie-mcp](https://github.com/mrdainami/kie-mcp) | 41 / 2026-08-20 / MIT / JS | Minimal: 5 generic tools, with the agent building requests from docs.kie.ai, so new models work on day 0 |
| [Cripacx/mediagen](https://github.com/Cripacx/mediagen) | 51 / 2026-10-07 / MIT / TS | The `mark` command writes standard "AI-generated" metadata and can add a visible label. Useful if we ever need to **add** provenance (see §6.6) |

Avoid `alfman99/kie-ai-mcp`'s hosted server, which requires sending your Kie key to a third party.

### 7.6 Automated QA for generated media (Node-friendly first)

| Repo | ★ / push / licence | Borrow |
|---|---|---|
| [jackships/ai-video-qc](https://github.com/jackships/ai-video-qc) | 0 (new) / 2026-10-07 / MIT / JS | Single-pass ffmpeg pass/fail: decode errors, truncation, duration ±0.5 s, aspect ±2%, audio required or forbidden, black and frozen sections; exit 0 only if everything passes. Small enough to vendor for Q6/Q7 |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | 16,394 / 2026-10-30 / Apache-2.0 | Runs **DINOv2, CLIP and BiRefNet in Node** (`dinov2-base` q4 ≈49 MB per the HF card). This is Tier 2 for Q1 embeddings and masks. There is no maintained JS LPIPS, so use DINOv2 |
| [Evercoder/culori](https://github.com/Evercoder/culori) · [color-js/color.js](https://github.com/color-js/color.js) | 1,246 / 2,314; Oct 2026; MIT | **CIEDE2000** (Q2), e.g. to catch rose vs bordeaux |
| [gemini-testing/looks-same](https://github.com/gemini-testing/looks-same) · [dmtrKovalenko/odiff](https://github.com/dmtrKovalenko/odiff) · pixelmatch | 828 / 3,288 / 7,007; MIT | Tolerant pixel diff (looks-same uses CIEDE2000, tolerance 2.3) to **prove the real product layer survived the Remotion render** (FR2) |
| [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | 38,802 / 2026-05-17 / Apache-2.0 | Q4 OCR and the "SIRINE" check. **Weak on stylised Arabic**, so use the VLM for Arabic |
| [Vchitect/VBench](https://github.com/Vchitect/VBench) | 1,834 / 2026-08-21 / Apache-2.0 / Py + GPU | Take the **metric definitions**, not the code: subject consistency (DINO across frames), background consistency, flicker, motion smoothness. Subject consistency and flicker are cheap to rebuild in Node |

Also (Python): VideoScore2, ffmpeg-quality-metrics (call ffmpeg's `ssim`/`psnr` directly instead), IQA-PyTorch.

### 7.7 Remotion-based ad generators

**Licence check:** Remotion is free for individuals and for companies of **≤3 employees**; larger teams need a company licence, so verify the agency headcount. HyperFrames (★76,925, Apache-2.0) is already in the pipeline as the fallback.

| Repo | ★ / push / licence | Borrow |
|---|---|---|
| [Maartenlouis/remotion-ads](https://github.com/Maartenlouis/remotion-ads) | 65 / 2026-05-06 / MIT | Reels and 4:5 carousels; scene file → ElevenLabs VO with a **pronunciation dictionary** (Darija brand and product names) → word-level captions; a brand-config template with compliance rules |
| [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 15,734 / 2026-10-29 / Apache-2.0 | 124 **"shot recipe" cards** (spec + Remotion implementation), beat-synced cuts, ffmpeg frame checks against a visual checklist, SFX licence records. Copy the card-library pattern for our proven shot types |
| [remotion-dev/skills](https://github.com/remotion-dev/skills) | 6,017 / 2026-10-26 / Remotion licence | Official agent skills (best practices, captions, rendering) |
| [gyoridavid/short-video-maker](https://github.com/gyoridavid/short-video-maker) | 1,453 / 2025-06-21 / MIT | A Remotion render server over REST + MCP with Whisper-timed captions (English voices only) |

### 7.8 Top 5 to borrow, and exactly what to take

1. **Pipeline shape: video-factory + Atlas.**
   - From video-factory, take the budget lock in code (align it with `lab.json max_credits_per_batch`), live price comparison and the per-take QC checklist. Turn its *identity* checks into *product* checks (Q1–Q4).
   - From Atlas, take the reference-to-ad recipe as a **challenger route**, with the fidelity rules still applied.
   - Add the n8n "check the still before animating" gate.
2. **Node Kie client: Kie's skill endpoints + VelsVisual.**
   - Flow: models → `/schema` → `/price` → `/success-rate` routing → upload host → `createTask` → poll → `code` check → immediate download.
   - 24 h schema cache plus `--dry-run`.
   - Seed the registry from elibarnett's notes, then **verify each entry against docs.kie.ai** (§1).
3. **DNA extractor:**
   - Our `vkit.mjs` (scdet, contact sheets, whisper.cpp) + athm793's 9 hook types and longevity tiers + ABCD first-5-second checks + VidMob time-window booleans, writing `sirine.creative_dna/0.1` (§5.4).
   - Use ViGenAiR's no-mid-dialogue cut rule for cut-downs.
4. **Prompt compiler:**
   - DNA + product facts → a `style.json`-shaped template (VigoZhao).
   - Rendered into each model's syntax using smixs/visual-skills (credit CC-BY) plus §2 of this file.
   - Optional mcp-image enhancer, A/B-tested against the raw prompt.
5. **Fidelity stack in Node:**
   - BiRefNet-lite (transformers.js) cut-out → generate the scene only → place real pixels in Remotion.
   - Verify with culori ΔE00, looks-same/odiff (layer survived render), DINOv2 similarity (generated shots), ai-video-qc and VBench-style subject consistency.
   - IC-Light / IC-Custom only on a GPU host, and only if a scene truly needs blending (non-commercial FLUX-dev caveat).

**Licence watch-list:**
- AGPL: OpenMontage, imgly.
- CC-BY: smixs.
- No LICENSE file: Atlas, tenfoldmarc, the n8n workflow, ACE++.
- Non-commercial weights: the FLUX.1-dev family, Bria RMBG.

---

## 8. Implementation notes for the creative-lab modules

The lab is "zero runtime deps except playwright-core" (`package.json`), so keep Tier 2 optional.

**`lib/kie/`**
- One **model registry** (JSON) holding each model's id, field names, limits and enums. Build it from the §1 and §2.4 tables, **not from assumptions**: `image_input` vs `image_urls` vs `input_urls` vs `image_url` vs `first_frame_url`.
- Call pattern: upload → createTask → poll with backoff (lab.json: 4 s → 20 s, 20 min timeout) or `callBackUrl`. Always check `code` (HTTP is 200 even on failure). Parse `resultJson` (a string). Download immediately (14-day expiry).
- **Re-upload references for any batch older than 24 hours.**
- Log `creditsConsumed`.
- Use Kie's discovery endpoints (§7.5):
  - `GET /api/v1/models/<id>/schema` to auto-validate the registry.
  - `/price` for the pre-spend estimate.
  - `/success-rate` (24 h) to skip a model that is currently failing.
  - Don't URL-encode the `/` in ids.

**`lib/compiler/`**
- Route DNA → plan (§5.5), then fill the per-model skeletons (§2) with the clause library (§2.0).
- Run the **FR4 prompt lint** before any spend, on the scene/subject fields:
  - Reject the brand, price, currency, offer and gift/box words.
  - Allow packaging/logo words only inside the CLEAN clause, and strip that clause entirely for positive-only models (FLUX, Runway).
  - Reject empty LOCK fields.
- Force `aspect_ratio:"9:16"` on Seedance (its default is 16:9) and the rewriter-off flags (§3.6).
- Every shot carries `qa_profile`, `candidates` and `max_attempts` (3).

**`lib/qa/`**
- **Tier 0 (zero-dep):** ffprobe, ffmpeg and ImageMagick plus pure-JS CIEDE2000. Covers Q0, Q6 (cuts, freeze, black), Q7, Q8 (computed from the Remotion layout JSON, which is deterministic), Q9, and Q1/Q2 for composites (PHASH and ΔE inside the known cut-out mask).
  - For Q2 on *generated* frames you need a product mask: Tier 2 segmentation, or a bbox returned by the VLM judge with a centre-crop fallback.
- **Tier 1 (VLM judge, §6.4):** Q1 for generated shots, Q3, Q4 and Q5. Use contact sheets and zoom strips from `vkit.mjs` (already wired in `lab.json tools.vkit`).
- **Tier 2 (optional deps):**

| Library | Used for |
|---|---|
| `@huggingface/transformers` | DINOv2 embeddings and BiRefNet-lite masks in Node |
| `culori` | ΔE00 (or hand-roll it from Sharma 2005) |
| `looks-same` / `odiff` | Layer-survival diffs |
| `tesseract.js` | Latin OCR; use the VLM for Arabic |

  Vendor `ai-video-qc` ideas into Tier 0. Load Tier 2 lazily so the core stays dependency-free.

**`lib/assemble/`**
- Remotion layer order: plate → contact shadow → real cut-out → overlays.
- Render 1080×1920, or 1440×2560 if the plates allow.
- **Drop every model audio stream.** Mix library music and foley; no SFX on cuts.
- Normalise loudness (two-pass `loudnorm`, then verify with `ebur128`).
- Transcode any H.265 input (Seedance 4k) to H.264.

**`lab.db`**
- Store provenance per output: reference hashes, model id, full input JSON, prompt, seed, `taskId`, credits, QA results.
- **Freeze the tagging record** (§5.6) at launch.

**Budget**
- `max_credits_per_batch: 4000` × `usd_per_credit 0.005` = $20 per batch.
- **Indicative "from" prices** (lowest option per model) [official] https://kie.ai/pricing, 1 credit ≈ $0.005:

| Model | Starting price |
|---|---|
| Kling 3.0 Omni | $0.07/s |
| Kling 4.0 keyframe | $0.1425/s (720p) · $0.2125/s (1080p) |
| Seedance 2.0 | $0.057/s |
| Seedance 2.0 fast | $0.034/s |
| Seedance 2.5 | $0.085/s |
| Wan 3.0 | $0.04/s |
| Veo 3.1 | $0.025/video |
| Gemini Omni 1.1 | $0.315/video |
| Topaz video | $0.04/s |
| Nano Banana Pro | $0.09/image |
| Nano Banana 2.1 | $0.02/image |
| GPT Image 2.5 | $0.03/image |
| FLUX 3 Klein | $0.008–0.0325/image |
| Recraft remove-bg | $0.005 |

  - The Seedream 5 Pro model page gives about $0.035 (1K) / $0.07 (2K).
  - The real cost depends on resolution, duration and audio, so log `creditsConsumed` per call and keep a running per-model table.
- **Bake-off cost estimate (§9.1):** 2 tasks × 3 models × 3 candidates × 5 s ≈ **under $10** [inference].

---

## 9. Experiments to run next, in order (cheap and decisive)

1. **Video fidelity bake-off**
   - Setup: one SKU (Pack Noir bag) × two tasks (light sweep; ≤30° arc) × {`kling-3.0-omni`, `bytedance/seedance-2`, `google/gemini-omni-flash-1-1`} × 3 seeds/candidates.
   - Score everything with §6 profile `product_motion_strict`, and set the routing defaults from the pass rate, **not from arena Elo**.
2. **Composite-realism live test**
   - L1 composite statics vs L3 generated statics for the same bundle offer.
   - Read hook rate **and LPV→delivered order**.
   - This answers whether pixel-locked composites read as "fake".
3. **VLM-judge calibration** on ≥40 historical outputs: 20 approved and 20 rejected, including the c04–c07 invented-box clips. Aim for ≥90% agreement.
4. **One-call schema probes** (each ≤1 cheap call):
   - Seedance 2.5 1080p and audio-off on Kie (Kie and third parties conflict).
   - Kling 4.0 mention syntax (`@image_1` vs `@Image1`).
   - Ideogram v3 mask polarity on Kie.
   - Whether FLUX 3 bounding boxes survive `enhance_prompt:false`.
   - GPT Image 2.5 `aspect_ratio:"4:5"`.
5. **Arabic text sanity test**, for knowledge only: production never uses model text. One Darija headline plus one French accented line on Nano Banana Pro, Seedream 5 Pro and GPT Image 2.5, reviewed by a native speaker at 100%.

---

## 10. Sources

**Official: model vendors**
- Google:
  - Veo 3.1 guide https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
  - Nano Banana guide https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
  - Image generation https://ai.google.dev/gemini-api/docs/image-generation
  - Nano Banana 2.1 https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1
  - Video / Veo shutdown note https://ai.google.dev/gemini-api/docs/video
  - Omni https://ai.google.dev/gemini-api/docs/omni
  - Veo references https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/use-reference-images-to-guide-video-generation
  - Veo prompt guide https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide
  - Image limitations and languages https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-generation-limitations
- OpenAI:
  - Deprecations https://developers.openai.com/api/docs/deprecations
  - Image prompting https://developers.openai.com/api/docs/guides/image-prompting.md
  - Image generation https://developers.openai.com/api/docs/guides/image-generation.md
  - Sora 2 guide (archived) https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide
- ByteDance:
  - Seedream 5.0 Pro https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro
  - Seedance 2.5 prompts https://ai.byteplus.com/resources/how-to-write-better-seedance-2-5-prompts
  - ModelArk guides (JS-only, unread) https://docs.byteplus.com/en/docs/modelark/seedream-5-0-pro · https://docs.byteplus.com/en/docs/modelark/seedance-2-0-prompt-guide
- BFL:
  - FLUX.2 guide https://docs.bfl.ai/guides/prompting_guide_flux2
  - Unified reference https://docs.bfl.ml/guides/prompting_unified_reference.md
  - Bounding boxes https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes
- Qwen: https://huggingface.co/Qwen/Qwen-Image-Edit-2509 · https://huggingface.co/Qwen/Qwen-Image-Edit-2511 · https://help.aliyun.com/en/model-studio/qwen-image-2-0-pro
- Ideogram: https://developer.ideogram.ai/ideogram-api/api-overview.md · https://developer.ideogram.ai/api-reference/images/remix/ideogram-3-character.md
- Midjourney: https://updates.midjourney.com/v8-1-is-now-the-default-model/
- Kling: https://kling.ai/quickstart/kling-4-model-user-guide · https://kling.ai/quickstart · https://kling.ai/quickstart/klingai-video-3-model-user-guide
- MiniMax: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md · https://www.minimax.io/blog/minimax-h3 · https://hailuoai.video/pages/blog/camera-movement-prompt-cheatsheet
- Wan: https://help.aliyun.com/en/model-studio/wan3-video-generation-prompt-guide
- Runway: https://runway.com/changelog · https://help.runwayml.com/hc/en-us/articles/39789879462419 (search snippet; page returned 403)

**Official: Kie.ai**
- Index https://docs.kie.ai/llms.txt
- Quickstart https://docs.kie.ai/market/quickstart.md
- Task detail https://docs.kie.ai/market/common/get-task-detail.md
- Uploads https://docs.kie.ai/file-upload-api/quickstart.md
- Veo:
  - Generate https://docs.kie.ai/veo3-api/generate-veo-3-video.md
  - Extend https://docs.kie.ai/veo3-api/extend-video.md
- Omni:
  - Video https://docs.kie.ai/market/google/gemini-omni-flash-1-1.md
  - Character https://docs.kie.ai/market/gemini-omni-character.md
- Nano Banana:
  - Pro https://docs.kie.ai/market/google/pro-image-to-image.md
  - 2.1 https://docs.kie.ai/market/google/nanobanana-2-1.md
- GPT 2.5 Sunburst https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-image-to-image.md
- Seedream 5 Pro https://docs.kie.ai/market/seedream/5-pro-image-to-image.md
- Kling 3.0 Omni https://docs.kie.ai/market/kling/v3-omni-image-to-video.md
- Seedance 2 https://docs.kie.ai/market/bytedance/seedance-2.md
- Topaz video https://docs.kie.ai/market/topaz/video-upscale.md
- Other model pages linked inline in §1–§2.

**Official: Meta and standards**
- AI labels in ads (updated 2026-06-01) https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/
- Reels ad spec and safe zone https://www.facebook.com/business/ads-guide/update/video/instagram-reels
- Copy variety https://www.facebook.com/business/help/520653528712504
- Andromeda https://engineering.fb.com/2026/10/28/ml-applications/meta-andromeda-next-gen-ads-retrieval-gpu-co-design/
- WCAG contrast https://www.w3.org/TR/WCAG22/#contrast-minimum
- CIEDE2000 https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/

**Official: tools and benchmarks**
- AdSpark-Bench https://arxiv.org/html/2610.10047v1
- Motion/Runneth:
  - AI tagging help https://help.motionapp.com/en/articles/12461770-getting-started-with-ai-tagging-in-motion
  - Benchmark methodology https://runneth.com/library/research/creative-benchmarks-2026/methodology
  - Formats https://runneth.com/library/formats/
  - Formats by vertical https://runneth.com/library/research/creative-benchmarks-2026/visual-formats-by-vertical
  - Hook tactics https://runneth.com/library/research/creative-benchmarks-2026/top-hook-tactics
  - Asset types https://runneth.com/library/research/creative-benchmarks-2026/top-asset-types
- Atria:
  - Tagging https://intercom.help/atria-e5456f8f6b7b/en/articles/13885360-find-winning-ad-formulas-with-raya-s-ai-creative-tagging
  - Image ads https://intercom.help/atria-e5456f8f6b7b/en/articles/13907653-generate-image-ads-with-raya
- Foreplay:
  - Content styles https://www.foreplay.co/post/introducing-content-style-filters
  - AI briefs https://www.foreplay.co/post/how-we-make-creative-briefs-with-ai-at-foreplay
- Segwise https://segwise.ai/blog/creative-tag-taxonomy
- VidMob https://help.vidmob.com/en/articles/6519983-what-guidelines-are-available-for-creative-scoring
- Superads https://superads.ai/llm-info
- Marpipe https://www.marpipe.com/blog/how-to-improve-your-top-performing-creative-in-3-easy-steps
- MagicBrief shutdown https://magicbrief.com/release/ai-tagging

**Practitioner**
- Leaderboards:
  - AA image editing https://artificialanalysis.ai/image/leaderboard/editing
  - AA image-to-video https://artificialanalysis.ai/video/leaderboard/image-to-video
  - Arena image-to-video https://arena.ai/leaderboard/video/image-to-video
- Video model comparisons:
  - Krea https://www.krea.ai/blog/top-6-ai-video-models-for-ecommerce-ads-in-2026
  - Nemovideo https://www.nemovideo.com/blog/video-tool-comparisons/kling-4-0-vs-veo-3-1
  - Veo developer post (unverified) https://dev.to/akaranjkar08/veo-31-developer-guide-timestamp-prompting-multi-shot-video-and-full-api-june-2026-3l5i
  - Seedance 2.0 guide (Runway) https://runway.com/resources/seedance-2-0-prompt-guide
- Image models:
  - Seedream 5 prompting (Runware) https://runware.ai/docs/models/bytedance-seedream-5-0-pro/guides/prompting
  - FLUX 3 Klein tests (MindStudio) https://www.mindstudio.ai/blog/flux-3-klein-image-tests
  - Qwen-Image 2.1 https://www.marktechpost.com/2026/09/21/alibaba-qwen-releases-qwen-image-2-1/
- Text and relighting:
  - Nano Banana Pro review (Fliki) https://fliki.ai/blog/nano-banana-pro-review
  - Text in images (InVideo) https://invideo.io/blog/best-ai-model-text-in-images/
  - Luma relighting https://lumalabs.ai/news/ai-relighting-product-photography
  - IC-Light Native https://www.runcomfy.com/comfyui-nodes/ComfyUI-IC-Light-Native
  - Composition metrics paper https://arxiv.org/html/2509.21278v4
- QA and policy:
  - Oakgen https://oakgen.ai/blog/ai-ad-quality-checklist
  - Digital Applied https://www.digitalapplied.com/blog/ai-content-labeling-rules-advertisers-2026-reference
  - Marketing Dive https://www.marketingdive.com/news/sociable-meta-adds-updated-disclosure-tags-for-ai-generated-ads/824833/
  - AdsUploader https://adsuploader.com/blog/advantage-plus-creative-enhancements
  - Nightjar https://nightjar.so/help-desk/are-ai-generated-product-images-allowed-in-meta-and-google-ads
- Creative diversity:
  - Marketing Brew https://www.marketingbrew.com/stories/meta-ad-creative-diversification-best-practices-advertiser-approach
  - Jon Loomer https://www.jonloomer.com/meta-andromeda-creative-diversification/
  - Social Media Today https://www.socialmediatoday.com/news/meta-shares-tips-on-best-performing-ad-approaches-ai/749897/
- Hook-rate benchmarks (Biddyco) https://www.biddyco.com/blog-posts/hook-rate-benchmarks-meta
- Loudness:
  - https://dev.to/arthurvalle1_a2586dd2b4bc/mastering-for-reels-tiktok-and-youtube-shorts-the-lufs-14-standard-2ck5
  - https://opus.pro/blog/best-loudness-normalizers
- Sora shutdown coverage https://alternativeto.net/news/2026/3/openai-is-shutting-down-sora-its-ai-video-slop-app-less-than-six-months-after-launch
- Gemini Omni launch https://9to5google.com/2026/05/19/gemini-omni-create-anything-model-video/

**First-party** (project memory, `C:/Users/DELL/.claude/projects/C--Users-DELL-ad-engine/memory/`)
- `reference-pack-noir-3s-v2.md`
- `project-sirine-sac-vernis-carousel.md`
- `reference-platform-roas-inverted.md`
- `reference-ai-broll-clip-selection.md`
- `reference-darija-copy-register.md`
- `feedback-no-sfx-at-cuts.md`
- `reference-remotion-sirine-video-edits.md`
- `project-sirine-djine-ai-ad.md`

---

## Appendix A: filled creative-DNA example (bag + sneakers bundle, gift reveal, 3 s loop)

```json
{"schema":"sirine.creative_dna/0.1","source":{"ref_url":"<Ad Library URL>","captured":"2026-11-01","tagger":"A","contains_ai_media":false},
 "format":"video","aspect":"9:16","duration_s":3.0,"duration_band":"<=3","loop":{"seamless":true,"len_s":3.0},
 "language":{"text":"ar-DZ","script":"arab","vo":"none"},"visual_format":"Unboxing","asset_type":"lifestyle_product_image_with_text",
 "hook":{"tactic":"gift_with_purchase","carrier":"text","first_frame":{"subject":"packaging","product_visible":true,"all_pieces_visible":true,
   "face":false,"price_visible":true,"cod_visible":true,"text_cov_pct":14}},
 "shots":[{"t_in":0.0,"t_out":1.0,"size":"ms","subject":"product_only","action":"static","camera":"push_in","transition_in":"loop_seam"},
  {"t_in":1.0,"t_out":2.0,"size":"cu","subject":"hands_product","action":"unbox","camera":"static","transition_in":"hard_cut"},
  {"t_in":2.0,"t_out":3.0,"size":"cu","subject":"hands_product","action":"reveal","camera":"push_in","transition_in":"match_cut"}],
 "pacing":{"cuts":2,"cuts_per_s":0.67,"mean_shot_s":1.0,"scenes_first_3s":3},
 "text_overlays":[{"role":"hook","text":"واش الهدية؟","pos":"tc","cap_h_pct":4.0,"t_in":0,"t_out":3,"persistent":true,"anim":"none"},
  {"role":"price","text":"4200 دج","pos":"bc","cap_h_pct":5.5,"t_in":0,"t_out":3,"persistent":true,"anim":"shine"},
  {"role":"strike_price","text":"5800","pos":"bc","cap_h_pct":3.0,"t_in":0,"t_out":3,"persistent":true,"anim":"none"},
  {"role":"cod","text":"الدفع عند الاستلام · 69 ولاية","pos":"bc","cap_h_pct":2.6,"t_in":0,"t_out":3,"persistent":true,"anim":"none"}],
 "offer":{"type":["bundle","price_anchor","gift_with_purchase"],"price":4200,"anchor":5800,"currency":"DZD","price_first_s":0.0,
   "price_on_screen_pct":100,"cod_first_s":0.0,"coverage_claim":"69 wilayas"},
 "audio":{"music":"percussion","sfx":["foley"],"sfx_on_cuts":false,"vo":{"present":false,"voice":"none"},"lufs":-14},
 "cta":{"button":"ORDER_NOW","on_screen":null,"spoken":false,"first_s":null},
 "palette":{"hex":["#111111","#F4F1EC","#8C1C2B"],"brand_present":true,"mood":"high_contrast"},
 "talent":{"human":"hands","role":"model","gender":"f","age_band":"25-34","face_first_s":null},
 "angle":"gift_for_her","awareness":"product","proof":{"type":"none","first_s":null},
 "product_framing":{"shot":"unboxing","on_screen_pct":55,"first_s":0.0,"pieces":["bag","sneakers","gift"],"fidelity":"real_video","lp_parity":true},
 "distinct_key":"Unboxing|gift_with_purchase|packaging|model|gift_for_her"}
```

**How the compiler routes this DNA (§5.5)**
- **Shot 0** (product_only + push_in) → L1 Remotion push-in on the real cut-outs over a `flux-3/klein` plate.
- **Shots 1–2** (hands_product + unbox/reveal) → **L0 real phone footage**. AI is blocked for hands on the product.
- **Overlays** → Remotion: price, strike price and COD from frame 0, inside the 14/35/6 safe zone.
- **Loop seam** → SSIM(last, first) ≥0.90.

## Appendix B: minimal Kie request bodies

```json
{"model":"nano-banana-pro","input":{"prompt":"<skeleton A(a)>","image_input":["<downloadUrl cutout>"],"aspect_ratio":"4:5","resolution":"2K","output_format":"png"}}
{"model":"kling-3.0-omni/image-to-video","input":{"prompt":"@bag stands on … No subtitles. No background music.","image_urls":["<front_9x16>","<34_9x16>"],
  "elements":[{"name":"bag","description":"black patent leather handbag, two gold rings; ignore the background","element_input_urls":["<front>","<34>","<side>","<clasp>"]}],
  "audio":false,"duration":4,"resolution":"1080p","aspect_ratio":"auto"}}
{"model":"bytedance/seedance-2","input":{"prompt":"Product film: … No subtitles, no on-screen text …","first_frame_url":"<front_9x16>","last_frame_url":"<34_9x16>",
  "generate_audio":false,"aspect_ratio":"9:16","duration":5,"resolution":"1080p"}}
{"model":"google/gemini-omni-flash-1-1","input":{"prompt":"<FIRST_FRAME> and <LAST_FRAME> are the same photo … loops seamlessly … No dialogue.","first_frame_url":"<hero_9x16>","last_frame_url":"<hero_9x16>","duration":"4","aspect_ratio":"9:16","resolution":"1080p","seed":4242}}
{"model":"veo-3-1","input":{"prompt":"Slow dolly-in … only the camera moves … One continuous shot.","model":"veo3_fast","generation_type":"FIRST_AND_LAST_FRAMES_2_VIDEO","image_urls":["<hero_9x16>"],"aspect_ratio":"9:16","resolution":"1080p","duration":4}}
{"model":"flux-3/klein-text-to-image","input":{"prompt":"<skeleton D(c)>","width":1088,"height":1360,"seed":4242,"enhance_prompt":false,"output_format":"png","num_images":2}}
```
