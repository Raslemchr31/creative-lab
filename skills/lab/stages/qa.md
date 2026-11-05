# Stage: QA (after generation)

- Deterministic gates run automatically on every output: spec/dims, black/freeze/cuts, pixel-lock on composites (AE `-fuzz 3%` on an eroded mask ≤0.5 % + ΔE00 ≤1.5; PHASH is unstable on near-black products), colour ΔE00.
- Vision QA (Claude): `node cli.mjs qa pack --batch B [--stage A|B]` builds reference-vs-output compare sheets. Read each sheet; judge identity, colour, hardware count, invention (text/boxes/extra products), anatomy, temporal drift against research/04 §6 (Q1–Q10). Record: `node cli.mjs qa set --file qa.json` (schema `schemas/qa-vision.schema.json`).
- Pick the candidate to use: `qa select --task <id>`. Max 3 attempts per shot, then change rung (e.g. L4 → L1 Remotion move).
