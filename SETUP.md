# Setting up creative-lab on a new machine

Requirements: **Node 22.13+**, **Git**, **Google Chrome**, **ffmpeg** (+ffprobe), **ImageMagick 7** (`magick`). Optional: `whisper-cli` + a ggml model in `~/.whisper/models` (reference-ad transcripts), a Kie.ai key (live generation).

```bash
git clone https://github.com/Raslemchr31/creative-lab.git
cd creative-lab
npm install                      # lab (playwright-core only)
npm run setup:remotion           # render engine in ./remotion (Remotion 4.0.540)
npm run doctor                   # checks every dependency, says what's missing

# library (DNA, styles, curated ads, prompt codes, product photos) — ~880 MB
curl -L --create-dirs -o dist/creative-lab-seed.tar.gz https://github.com/Raslemchr31/creative-lab/releases/download/seed-2026-11-05/creative-lab-seed.tar.gz
node --no-warnings tools/seed.mjs import --file dist/creative-lab-seed.tar.gz

npm run setup:skills             # links /lab /ad-spy /kie-ai /flow-prompt into ~/.claude/skills (restart Claude Code)
npm test                         # unit tests (≈ 90)
npm start                        # UI → http://127.0.0.1:4317
```

Windows installs: `winget install OpenJS.NodeJS.LTS Git.Git Google.Chrome Gyan.FFmpeg ImageMagick.ImageMagick `.

Notes
- The **store product sync** uses Turso credentials that only exist on the main PC; elsewhere `node cli.mjs product sync` falls back to the public feed (`--source feed`). The seed already contains all 66 products and photos.
- Network commands (spy, product sync, live Kie) need internet; nothing here spends on Meta.
- Machine overrides go in `config/lab.local.json` (gitignored), e.g. `{ "ui_port": 4318 }`.
- Move the library again later: `npm run seed:export` on one machine → upload → `seed:import --force` on the other.
