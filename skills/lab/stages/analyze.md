# Stage: analyse → creative DNA

1. `node cli.mjs analyze evidence --ids a,b [--no-asr]` → `data/evidence/<id>/EVIDENCE.md` + contact sheet + 0–3 s hook strip + keyframes + ASR lead (whisper-small, first 25 s; large-v3-turbo is too slow).
2. Read EVIDENCE.md → the contact sheet → the hook strip (keyframes only if ambiguous). **ASR is a lead, never a fact** (music → hallucinated lyrics).
3. `node cli.mjs dna template --id <id> > data/dna-drafts/<id>.json`, fill EVERY field with taxonomy values only (`config/taxonomy.json`).
4. `replication` is written for OUR constraints: real photos, AI plates, camera-only motion, text in Remotion. Hands / unboxing / try-on / talking people → `needs_shoot`. Record `ip_flags` (replica marks, designer names, copyrighted music, other sellers' footage).
5. `node cli.mjs dna set --file data/dna-drafts/<id>.json --analyst claude` — retry until it validates. `dna list` to see the library.

Fan-out: ≤3 opus subagents, 3 ads each, brief = steps 2–5. Example of the expected depth: `data/dna-drafts/1350521436517345.json`.
Traps seen: Moroccan sellers (DH, "maroc") in DZ results — keep the structure, not the market; claims like "جودة مضمونة" and unverified star ratings are copy risks, never copy them.
