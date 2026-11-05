---
name: kie-ai
description: Generate ad images and video with Kie.ai (aggregator for Flux, Nano Banana, GPT Image, Seedream, Kling, Seedance, Veo, Wan, Topaz…) while keeping the REAL product pixels — model routing, fidelity rules FR1–FR5, prompt skeletons, client/mock usage, credit gating. Part of the SIRINE creative-lab ("kei ai").
trigger: ["/kie-ai", "kie ai", "kei ai", "kie.ai", "generate with kie", "which model for", "image to video for the product"]
when_to_use: Choosing a model, writing/fixing a generation prompt, or running/debugging Kie generation for a creative-lab batch. Batches are compiled by skill `lab`; this skill explains the generation layer.
---

# kie-ai

Code: `creative-lab/lib/kie/{client,registry,mock-server}.mjs`, runner `lib/generate.mjs`, prompts `lib/compiler/prompts.mjs`.
Model registry (195 models, input schemas, prices): `config/kie-models.json`. Routes: `config/routing.json` — **change models there, never in code**.
Evidence: `research/03-kie-ai-api.md` (API), `research/04-genai-ad-production-playbook.md` (models, prompts, QA).

## Fidelity rules (research/04 §0.3) — preflight enforces them
- **FR1 Real pixels.** Every product appearance traces to a real photo of that exact SKU + colourway. Text-only product = L6 = blocked (P4).
- **FR2 Pixel-lock.** Unobstructed product = the real cut-out, composited or pasted back after any AI edit (AE fuzz + ΔE00 check).
- **FR3 One state per call.** One SKU-colourway, one angle family, pre-cropped to the ratio, ≤5 s, one slow camera move, no AI hands.
- **FR4 No invention.** No brand, price, offer, gift or box words in prompts; plates never name the product; positive-only models get no negations (P5).
- **FR5 Gate before human.** Deterministic gates, then Claude vision QA; max 3 attempts per shot, then change technique.

## Routing (defaults in config/routing.json)
| Job | Default | Fallback / challenger |
|---|---|---|
| Clean plate (no product) | `flux-3/klein-text-to-image` (exact px, seed, `enhance_prompt:false`) | `nano-banana-2-1` |
| Cut-out | `recraft/remove-background` | `qwen2-1/image-to-image` transparent |
| Harmonise light/shadow around the real cut-out (then paste back) | `nano-banana-pro` | `qwen2-1` mask |
| Product held/worn still (L3) | `gpt-image-2-5-sunburst-image-to-image` | `nano-banana-2-1`, `seedream/5-pro-image-to-image` |
| Several real refs in one scene (colour grid, pack) | `nano-banana-pro` | `gpt-image-2-5-sunburst` |
| Camera-only motion from a real frame (L4) | `kling-3.0-omni/image-to-video` (`aspect_ratio:"auto"`, `audio:false`, element of 2–4 real views) | `bytedance/seedance-2` first+last, `veo-3-1` |
| Person + product (L5, neck-down, no dialogue) | `kling-3.0-omni` | `google/gemini-omni-flash-1-1` |
| Product-free b-roll | `wan/3-0-video` (seed, `audio:false`) | `veo-3-1` fast |
| Upscale (after QA, then re-QA) | `topaz/image-upscale`, `topaz/video-upscale` | `recraft/crisp-upscale` |
| Text, price, logo, gift box | **Remotion only** | — |
Dead/avoid: Sora 2, gpt-image-1/1.5, Midjourney (not on Kie), FLUX.1 Kontext, Runway on Kie, MiniMax H3 when silence or frame+refs are needed.

## Prompt skeletons (research/04 §2.0 / §2.5 — the compiler fills them)
- `LOCK(N)`: "Keep the [pieces] from image N exactly as photographed: same silhouette, colour, material, stitching, hardware ([n] rings…), logo plate size and position. Do not redraw, restyle, recolour, resize, add or remove anything."
- Plate: scene + "an empty area … where objects will be placed later" + light + "Every surface is plain and unprinted" + reserved overlay space.
- i2v (Kling Omni): "@product rests on [surface] exactly as in the first frame. 0–N s: [one camera move], keeping @product centred. @product keeps its exact shape, colour, stitching, hardware and logo; it is the only object. Lighting and white balance stay constant. One continuous take. No subtitles. No background music."
- Strip all model audio; music/foley are added in Remotion.

## API facts that bite
- Errors come back as HTTP 200 with `code` in the JSON. 402 = out of credits → the runner stops.
- Uploads only to `https://kieai.redpandaai.co`; kept 24 h. Outputs kept 14 days; `download-url` links live 20 min → download immediately.
- 20 task creations / 10 s. Upload cache keyed by (sha256, endpoint) so mock URLs never leak into live runs.
- Kling 3.0 Omni needs `aspect_ratio:"auto"` (output follows the first frame → pre-crop the frame). Flux Klein has no 4:5 enum → pass width/height (1088×1360).

## Running
```
node cli.mjs gen run --batch B --confirm B --dry-run     # requests to jobs/*/dry-run/, 0 credits
node cli.mjs gen run --batch B --confirm B --mock        # local mock (lib/kie/mock-server.mjs)
node cli.mjs gen run --batch B --confirm B [--stage A] [--max-credits N]   # live; KIE_API_KEY in creative-lab/.env
```
Live runs spend the owner's money: only with their explicit `--confirm <batch>` and after showing the dry-run cost. Network → Bash sandbox disabled. Never read `creative-lab/.env`.
