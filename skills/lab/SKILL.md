---
name: lab
description: SIRINE creative-lab router — spy on winning Meta ads, analyse them into creative DNA, distil styles, pick a store product + style(s), compile prompts + shot plans, audit before generation, generate with Kie.ai (gated), audit after, assemble in Remotion, export to ad-engine.
trigger: ["/lab", "/ads lab", "creative lab", "spy winning ads", "make ads from a style", "new creative batch", "lab batch"]
when_to_use: Any request to find winning competitor ads, build/browse the style library, or produce a batch of AI-assisted ads from SIRINE store products. Not for launching (export goes to ad-engine's gated campaign-launch) and not for Meta account reads (ad-engine skills).
---

# lab — creative-lab router

Project: `C:/Users/DELL/ad-engine/creative-lab/` (Node 22 ESM, `node cli.mjs help`). Design: `ARCHITECTURE.md`.
Evidence base: `research/01–05` (read the TL;DRs; don't redo them). Python is NOT installed.

## Non-negotiables
1. **Real product pixels** (research/04 FR1–FR5): products come from real photos; AI makes plates, light and
   camera-only motion. Text-only product generation (L6) is blocked by preflight P4.
2. **No text from models.** Every word, price and logo is composited in Remotion (Cairo, RTL, Western digits).
   Prompts never carry brand/price/offer/gift/box words (P5); plate prompts never name the product.
3. **Spend is gated.** `gen run` needs `--confirm <batch_id>` and respects the credit cap. Nothing here touches Meta.
4. **Claude is the analyst.** DNA and vision QA come from evidence packs (contact sheet, hook strip, keyframes),
   validated against `schemas/*.json`. ASR is a lead only.
5. **Owner rules** (ad-engine memory): full pack visible from frame 0; price + «الدفع عند الاستلام» rail from frame 0
   (Reels content y 270–1150, rail y 1157–1243); no SFX at cuts; never pause other campaigns; Darija register
   traps (نقش/منقوش is vulgar; «حتى لباب دارك» trips HOUSING).
6. Subagents: `opus`, max 5 at once; no Workflow tool unless the owner asks.

## Stages (one doc each in `stages/`)
| Stage | Command(s) | Doc |
|---|---|---|
| Spy | `spy niche`, `spy premium` (big brands), `spy search`, `spy page`, `spy top`, `spy media` | `stages/spy.md` (+ skill `ad-spy`) |
| Prompt codes | UI ad → “Get prompt code”, or `brief new/list/context/prompt` | skill `flow-prompt` (owner sends FL-XXXXX) |
| Analyse → DNA | `analyze evidence`, `dna template`, `dna set` | `stages/analyze.md` |
| Style | `style set/list/show` | `stages/style.md` |
| Product | `product sync/list/show/ref-add/ref-approve` + `config/product-specs/*` | `stages/product.md` |
| Batch + preflight | `batch new`, `batch preflight`, `batch show` | `stages/batch.md` |
| Generate | `gen run --dry-run | --mock | --confirm` | `stages/gen.md` (+ skill `kie-ai`) |
| QA | `qa pack`, `qa set`, `qa select` | `stages/qa.md` |
| Assemble | `assemble run`, `assemble approve` | `stages/assemble.md` |
| Export | `export run` | `stages/export.md` |

UI: `node --no-warnings server/server.mjs` → http://127.0.0.1:4317 (read/compile only; it can never spend).

## Routing
- owner sends a code like **FL-7K2QM** → skill `flow-prompt`
- "find winners / spy / what are competitors running" → `stages/spy.md`
- "analyse this ad / add to library" → `stages/analyze.md`
- "make N ads for <product>" → check styles exist → `stages/batch.md` → dry-run cost → owner `--confirm`
- "is it good?" → `stages/qa.md`; "render / finish" → `stages/assemble.md`; "send to ads" → `stages/export.md`

## Verification
`node tests/run.mjs` (unit) · `--e2e` (mock pipeline) · `--render` (Remotion finals + export). Run before claiming done.
Network commands (spy, product sync, live Kie) need the Bash sandbox disabled.
