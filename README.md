# SIRINE creative-lab — quickstart

Find the ads that win in our niche, turn them into reusable styles, and make new SIRINE ads from **real store
products** + a style, with an audit before and after generation. Nothing here spends on Meta; finished ads go to
ad-engine and launch only through `/ads launch`.

Open Claude Code in `C:/Users/DELL/ad-engine` and say what you want (`/lab`, "find winning bag ads", "make 10 ads
for the hobo pack"). Or run the commands yourself from `creative-lab/` — full list: `COMMANDS.md`.

## Fastest path: a ready-to-paste Google Flow prompt
1. UI → **Library** → pick an ad (filter *Big brands* for the high-end references) → **Get prompt code**.
2. Pick the store product, aspect (9:16 / 16:9), length, model → **Get the code** → e.g. `FL-7K2QM`.
3. Send the code to Claude. You get back the Flow settings, the exact catalog photos to attach, 1–3 clip
   prompts, the Darija overlay lines for the edit and a QA checklist. It also appears on the code's page
   (UI → **Prompt codes**) with copy buttons.

## The flow
1. **Spy** — `node cli.mjs spy niche` collects the niche from the Ad Library (most impressions first) and downloads media.
2. **Library** — `node cli.mjs spy top` · Claude analyses winners into *creative DNA* (`dna list`, 25 so far).
3. **Styles** — 10 style cards distilled from the DNA (`style list`; UI → Styles).
4. **Pick** — product(s) + style (or a blend `styleA+styleB`) → `batch new`. Claude writes every prompt, shot plan,
   overlay text and ad-copy draft; you don't write prompts.
5. **Audit before** — preflight blocks bad stock, invented product pixels, brand/price words in prompts, wrong
   prices vs the store, policy words (per field), Darija register traps, look-alike ads (Andromeda).
6. **Generate** — `gen run --dry-run` shows the cost; live needs a Kie.ai key and your `--confirm <batch>`.
7. **Audit after** — automatic gates (pixel-lock, colour, cuts) + Claude's visual review of every output.
8. **Edit** — Remotion assembles 9:16 + 4:5 with the price + «الدفع عند الاستلام» rail from frame 0.
9. **Approve + export** — you approve; export lands in `ad-engine/config/clients/sirine-01/creative/lab-<batch>/`.

## Setup
New machine? Follow `SETUP.md`.

- Node 22, ffmpeg, ImageMagick, Google Chrome (already on this PC). `npm install` once in `creative-lab/`.
- Kie.ai: copy `.env.example` to `.env` and put your key in `KIE_API_KEY` (only needed for live generation).
- UI: `node --no-warnings server/server.mjs` → http://127.0.0.1:4317 (browse winners, styles, products, compile batches; it cannot spend).
- Remotion render engine: `remotion/` inside this repo (comps `lab-ad`, `lab-still`; `cd remotion && npm install` once).

## Tests
`node tests/run.mjs` (unit) · `--e2e` (whole pipeline on a mock Kie) · `--render` (adds Remotion renders + export).

## Where things are
`cli.mjs` · `lib/` (collector, scoring, analyze, compiler, preflight, kie, generate, compose, qa, assemble) ·
`config/` (lab, taxonomy, routing, brand, niche, Kie model registry, product specs) · `schemas/` · `styles/` ·
`server/` (UI) · `skills/` (lab, ad-spy, kie-ai — junctioned into `~/.claude/skills`) · `research/01–05` ·
`data/` (runtime, not committed: `lab.db`, media, evidence, batches).
