# Stage: assemble (Remotion)

`node cli.mjs assemble run --batch B [--job J] [--placeholder] [--scale 0.5]` → resolves the EDL, renders via `remotion/tools/render-lab.mjs` (comps `lab-ad` video, `lab-still` image) for 9:16 + 4:5, then final QA (dims, codec, duration, rail, safe zones).
- Inspect EVERY final yourself: vkit contact sheet (`~/.claude/skills/video-understanding/scripts/vkit.mjs <mp4> --sub sheet`) or the PNG. Check Arabic joins + RTL, nothing covers a face or the product, full pack in frame 0, rail from frame 0, Reels safe zone.
- Scene/on-model photos are fitted with `smart` mode: crop when it loses ≤12 %, else whole photo + blurred side fill (a 4:5 centre crop cut the face and the shoes).
- `assemble approve --asset <id>` is the OWNER's call (required before export).
