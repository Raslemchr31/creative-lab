# Stage: batch + pre-generation audit

```
node cli.mjs batch new --file data/batches/batch-001.json        # {name, lang, items:[{product, styles:[...]}]}
node cli.mjs batch new --items "pack-hobo-noire:new-arrival-onmodel,pack-djine-noire:detail-macro-quality" [--placements 9:16,4:5] [--lang fr] [--draft]
node cli.mjs batch preflight --batch <id>
node cli.mjs batch show --batch <id> [--job <id>]
```
Compile = beats → rung → Kie route (`config/routing.json`) → prompts + refs, overlay slots from store + brand kit, ad copy draft (one language, deduped lines), EDL per placement, cost.

Preflight (BLOCK stops generation): P1 stock · P2 refs · P3 spec · P4 FR1 real pixels · P5 FR4 prompt hygiene (+ product-free plates) · P6 Kie input schemas · P7 LP price parity · P8 compliance per FIELD (ad-engine `validate-compliance.mjs`) · P9 one language · P10 brand/Darija rules · P11 shoot needed · P12 COD frame 0 · P13 hook frame 0 · P14 length · P15 compiler · P16 overlay length · B1 distinctness · B2 credit cap.
Report the dry-run cost to the owner before asking for `--confirm`.
