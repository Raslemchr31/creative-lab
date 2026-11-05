# Stage: style cards

A style is product-agnostic: beats (role, shot, strategy=fidelity rung, scene, camera, overlays→slots), rail, end card, copy patterns, audio, fit.
Schema: `schemas/style.schema.json`. Source of the current 10: `styles/_build-styles.cjs` → `styles/<id>.json` → `node cli.mjs style set --file styles/<id>.json`.

Rules that preflight enforces (write them in from the start):
- Frame 0 shows the FULL pack (bundle_layout / colour_lineup / on_model photo). Price + COD rail `from_frame0: true`.
- Plate beats (`ai_plate_composite`, `ai_plate_harmonize`, `ai_i2v` start): `scene` and `composition` describe an EMPTY set ("an empty area … where objects will be placed later"). Naming the product in a plate prompt makes the model invent one (P5 BLOCK).
- No negation words (logo/box/text/brand) in scenes — FLUX is positive-only.
- `motion` = what stays still; the camera move comes from `camera`. Don't write degrees that fight the compiler's move.
- Hook patterns ≤ 42 chars after filling; only slots that exist (`question` / `review` are never invented).
- 10 jobs in one batch must differ on ≥3 of 8 keys (product, format, archetype, hook_type, first_subject, setting, talent, on_image_text) — B1.
- Carousel format is NOT supported by the assembler yet (renders frame 0 only) — use image or video.
Blend: `batch new --items "slug:styleA+styleB"` (hook from A, body from B, end card from the last).
