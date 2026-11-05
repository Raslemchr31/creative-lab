# creative-lab — architecture

> Spy on winning Meta ads → library of creative DNA → reusable styles → pick a SIRINE store product + style(s)
> → compiled shot plan with auto-written prompts → pre-generation audit → Kie.ai generation (gated) →
> post-generation audit → Remotion edit → final audit → export to ad-engine (launch stays in the gated
> `campaign-launch` flow). Evidence: `research/01–05`.

## 1. Principles (non-negotiable)

1. **Real product pixels** (research/04 FR1–FR5). Product appearances come from real photos. The fidelity
   ladder decides how each beat is made: L0 real · L1 real cut-out composited on an AI plate · L2 L1 +
   AI harmonise + paste-back · L3 reference-conditioned edit (held/worn) · L4 image-to-video from a real
   first frame, camera-only · L5 reference-to-video with people · **L6 text-only product = blocked**.
2. **No text from models.** Plates are clean; every word/number/logo is composited in Remotion
   (Cairo, RTL, Western digits). Prompts never contain brand, price, offer, gift or box words (FR4).
3. **Humans approve spend.** Generation needs `--confirm <batch_id>` and respects a credit cap. Nothing
   here touches Meta; finished creatives are exported for the gated ad-engine launch.
4. **Claude is the analyst, not a guesser.** DNA and vision QA are written by Claude from evidence packs
   (contact sheets, hook strips, keyframes, ASR leads) and validated against JSON schemas.
5. **Config is the single source of values**: `config/lab.json`, `taxonomy.json`, `routing.json`,
   `brand-sirine.json`, `niche-sirine.json`, `kie-models.json`, `qa-rubric.json`, `product-specs/*.json`.

## 2. Pipeline

```
spy (web Ad Library, impressions-sorted)  ─► ads/pages/sightings/media (SQLite)  ─► winner score
     └─ media downloaded at first sight (signed URLs expire ~4–5 days; DZ ads vanish when paused)
analyze  ─► evidence pack (vkit sheet + 0–3 s hook strip + keyframes + ASR lead + palette)
dna      ─► Claude writes DNA JSON ─► schemas/creative-dna.schema.json ─► dna table
style    ─► style card (product-agnostic beats + routes + overlay slots) ─► schemas/style.schema.json
product  ─► store sync (Turso → feed fallback) + photos + product spec (pieces, hardware, colour hex)
batch    ─► compile(product × style[s]) → job spec: beats → rung → route → Kie tasks (+prompts),
            overlay slots filled from store + brand, ad copy draft, EDL per placement, cost estimate
preflight─► BLOCK/WARN/PASS: fidelity rules, LP parity, compliance per field, model input validation,
            budget cap, Andromeda distinctness across the batch, missing refs/specs
generate ─► (confirm + cap) upload refs → createTask → poll → download → deterministic QA
qa       ─► deterministic gates (spec, cuts, black/freeze, PHASH pixel-lock, ΔE00) + Claude vision QA
            (side-by-side compare sheets) → pass / regenerate (≤3 attempts) / change rung
assemble ─► EDL → Remotion `lab-ad` (video) / `lab-still` (static) for 9:16 + 4:5 → final QA
export   ─► ad-engine/config/clients/sirine-01/creative/lab-<batch>/ + lineage + upload manifest
```

## 3. Data layout

```
creative-lab/
  cli.mjs                     node cli.mjs <group> <cmd> [--flags]   (help lists all)
  lib/                        util, db (node:sqlite migrations), schema validator, probe (ffprobe),
                              collector/ (parse, normalize, adlib-web, media), spy, scoring, analyze,
                              products/sync, styles, compose (ImageMagick), compiler/, preflight,
                              kie/ (registry, client, mock-server), generate, qa/, assemble/, batch, commands
  server/                     local UI (zero-dep http + vanilla JS)  → http://localhost:4317
  config/  schemas/  research/  skills/  tests/
  data/ (gitignored)          lab.db · media/ads/<id>/ · media/products/<slug>/ · evidence/<id>/ ·
                              batches/<batch>/jobs/<job>/{spec.json, preflight.json, refs/, tasks/, qa/, edl-*.json, renders/}
```

## 4. Key contracts

### 4.1 Rung → route (config/routing.json)

| strategy | rung | Kie route (default → fallback) |
|---|---|---|
| real_photo / existing_footage | L0 | none |
| needs_shoot | L0 | none — emits a shoot request for the owner |
| real_photo_motion | L1 | none — Remotion moves the real photo |
| ai_plate_composite | L1 | cutout `recraft/remove-background` + plate `flux-3/klein-text-to-image` → `nano-banana-2-1` |
| ai_plate_harmonize | L2 | L1 + `nano-banana-pro` harmonise of the flattened composite + paste-back |
| ai_image_edit / ai_image_compose | L3 | `gpt-image-2-5-sunburst-image-to-image` → `nano-banana-2-1` / `nano-banana-pro` |
| ai_i2v | L4 | `kling-3.0-omni/image-to-video` (first frame = L0/L1 still, elements = 2–4 real views, audio off, ≤5 s) → `bytedance/seedance-2` → `veo-3-1` |
| ai_r2v | L5 | `kling-3.0-omni/image-to-video` → `google/gemini-omni-flash-1-1` |
| ai_t2i (plate only) / ai_t2v (b-roll only) | — | `flux-3/klein-text-to-image` / `wan/3-0-video`; BLOCKED if the beat shows the product |
| graphic | — | Remotion only |

### 4.2 Lab EDL v1 (props of Remotion compositions `lab-ad` / `lab-still`)

```jsonc
{
  "version": 1, "id": "b001/j03/9x16",
  "width": 1080, "height": 1920, "fps": 30, "durationInFrames": 450,
  "lang": "ar", "dir": "rtl",
  "theme": { "ink": "#0A0A0A", "paper": "#F4F1EA", "panel": "#101012", "accent": "#FFFFFF", "smoke": "#B9B4AB" },
  "safe": { "top": 270, "bottom": 1250, "side": 65 },            // px; text never outside
  "segments": [{
    "id": "b1", "from": 0, "frames": 60,
    "transitionIn": { "kind": "cut|fade|push|slide|zoom", "frames": 8, "dir": "L|R|U|D" },
    "layers": [                                                    // bottom → top, paths relative to remotion public/
      { "kind": "video",  "src": "lab/b001/j03/b1.mp4", "trimStart": 0, "fit": "cover|contain", "bg": "#F4F1EA" },
      { "kind": "image",  "src": "lab/b001/j03/plate.png", "fit": "cover", "motion": { "type": "push_in|pull_out|pan_left|pan_right|none", "amount": 0.06 } },
      { "kind": "cutout", "src": "lab/b001/j03/cutout.png", "box": { "x": 0.12, "y": 0.40, "w": 0.76, "h": 0.40 }, "shadow": true, "motion": { "type": "push_in", "amount": 0.05 } },
      { "kind": "fill", "color": "#F4F1EA" }
    ],
    "texts": [{ "slot": "hook_text", "text": "باك هوبو جديد", "style": "headline|kicker|big|pill|badge|price_tag|checklist|subtitle",
                "position": "top|upper_third|center|lower_third", "at": 0, "until": null, "emphasis": "normal|big|highlight",
                "items": ["…"] }]                                   // items only for checklist
  }],
  "rail": { "enabled": true, "fromFrame": 0, "y": 1157, "h": 86,
            "items": [{ "slot": "price", "text": "4,200 دج" }, { "slot": "strike", "text": "5,800 دج" }, { "slot": "cod_delivery", "text": "الدفع عند الاستلام · 69 ولاية" }] },
  "endCard": { "enabled": true, "from": 390, "frames": 60,
               "lines": [{ "slot": "name", "text": "باك هوبو" }, { "slot": "price", "text": "4,200 دج" }, { "slot": "strike", "text": "5,800 دج" }, { "slot": "cta", "text": "اطلبي دروك" }, { "slot": "site", "text": "sirinealgeria.store" }] },
  "audio": { "src": null, "volume": 0.5, "fadeOutFrames": 20 }
}
```
Rules baked into the renderer: Arabic never clip-path/mask-wiped (opacity/translate/blur only); Cairo
with the arabic subset; Western digits; strike price rendered as a struck line, not a font feature;
no audio effects at cuts; 4:5 uses the same EDL with its own safe box.

### 4.3 Batch lifecycle

`draft → compiled → (preflight) blocked | ready → approved(confirm) → generating → generated →
qa → assembling → assembled → done/exported`. Jobs mirror it; tasks are
`planned → submitted → success|fail → downloaded → qa_pass|qa_fail`. Every Kie call is logged to
`data/logs/kie-calls.jsonl` (never the key). Generation is resumable: a task with a provider id is
polled, never re-created.

### 4.4 UI API (server/server.mjs, read-mostly)

`GET /api/stats` · `GET /api/ads?…` · `GET /api/ads/:id` · `POST /api/ads/:id/star|hide` ·
`GET /api/dna` · `GET /api/styles[/:id]` · `GET /api/products[/:slug]` ·
`POST /api/products/:slug/refs/:idx/approve` · `GET /api/batches[/:id]` · `POST /api/batches` (compile) ·
`POST /api/batches/:id/preflight` · static `/files/*` (data/ read-only). Generation is CLI-only
(`gen run --batch <id> --confirm <id>`) so a click can never spend credits.

## 5. Distinctness (Andromeda)

Meta clusters look-alike ads (research/01): a new concept must differ on ≥3 of
{first-frame subject, setting, talent, format, story/archetype, on-image text}. Preflight computes this
key per job and BLOCKS a batch where two jobs differ on <3 (WARN at 3).
