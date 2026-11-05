# creative-lab — commands

Run from `creative-lab/`. Add `--json` for machine output. Network commands (spy, product sync, live gen) need internet; generation spends Kie credits only with `--confirm <batch>`.

**Prompt codes:** in the UI open any ad → *Get prompt code* → pick product + format → send the `FL-XXXXX` code to Claude (skill `flow-prompt`).

| Command | What it does / options |
|---|---|
| `spy search` | Collect ads for a keyword (impressions-sorted): --q "sac femme" --country DZ [--max 150] [--exact] [--sort relevance] [--all (incl. ended)] [--media-type video] [--no-media] |
| `spy page` | Collect all active ads of one Facebook page: --page-id 123 [--country DZ] [--max 300] |
| `spy niche` | Run every saved niche query (config/niche-<id>.json): [--niche sirine] [--market local\|regional\|inspiration] [--max 120] [--no-media] |
| `spy premium` | Big-name inspiration segment (config niche.premium_brands): find each brand's page, pull its ads impressions-sorted, download media for its best creatives: [--brands "Coach,Aldo"] [--per-page 60] [--media 15] |
| `spy top` | Show top in-niche winners: [--limit 30] [--country DZ] [--format video\|image\|carousel] [--min-days 30] [--tier proven\|rising] [--q text] |
| `spy media` | Download media for ads: --ids a,b,c  or  --top 30 (in-niche, best first) |
| `spy rescore` | Recompute relevance + winner scores for the whole library |
| `spy show` | Show one ad with its media + score breakdown: --id <ad_archive_id> |
| `spy star` | Star / unstar / hide an ad: --id X [--off] [--hide] |
| `product sync` | Sync products from the SIRINE store (Turso DB, falls back to the public feed) + cache photos: [--source auto\|turso\|feed] |
| `product list` | List synced products: [--in-stock] |
| `product show` | Show one product with its reference photos: --slug pack-hobo-noire |
| `product ref-add` | Attach an extra reference photo (real photo/detail): --slug X --file path\|url [--role detail\|hero\|in_hand\|packaging\|gift] [--note text] |
| `product ref-approve` | Approve / reject a reference photo for generation: --slug X --idx 2 [--off] |
| `analyze evidence` | Build evidence packs (contact sheet, hook strip, keyframes, ASR, palette): --ids a,b \| --top 12 [--force] [--no-asr] [--concurrency 2] |
| `dna template` | Print a DNA skeleton for an ad (fill it, then dna set): --id <ad_archive_id> |
| `dna set` | Validate + save a DNA JSON: --file dna.json [--analyst claude\|owner] |
| `dna show` | Show a stored DNA: --id <ref id> |
| `dna list` | List analysed references (archetype · hook · angle · format) |
| `style set` | Validate + save a style card: --file style.json [--status draft\|approved] |
| `style list` | List style cards |
| `style show` | Show a style card: --id <style id> |
| `batch new` | Compile a batch + run preflight: --items "slug:style1+style2,slug2:style3" [--name x] [--placements 9:16,4:5] [--lang ar-DZ\|fr] [--draft]  or  --file batch.json |
| `batch preflight` | Re-run the pre-generation audit: --batch <id> |
| `batch list` | List batches |
| `batch show` | Show a batch (jobs, tasks, prompts): --batch <id> [--job <id>] |
| `batch delete` | Delete a batch and its files: --batch <id> --confirm <id> |
| `gen run` | Generate (staged, resumable): --batch B --confirm B [--stage A\|B] [--through] [--mock] [--dry-run] [--max-credits N] |
| `gen status` | Task/op states for a batch: --batch B |
| `qa select` | Use this candidate downstream (unselects its siblings): --task <task id> |
| `qa pack` | Build vision-QA compare sheets (reference vs outputs) for Claude/owner review: --batch B [--stage A\|B] |
| `qa set` | Record a vision-QA verdict for a task output: --file qa.json  (schema: schemas/qa-vision.schema.json) |
| `assemble run` | Render finals (9:16 + 4:5) in Remotion from the EDLs: --batch B [--job J] [--placeholder (grey boxes for missing shots)] [--scale 0.5 draft] |
| `assemble approve` | Owner approval of a rendered final (needed before export): --asset <asset id> [--off] |
| `export run` | Copy approved finals + copy + lineage to ad-engine/config/clients/<client>/creative/lab-<batch>/: --batch B |
| `brief new` | Make a prompt code (FL-XXXXX) from a reference + a product: --ad <ad_id> \| --style <id>  --product <slug> [--aspect 9:16\|16:9] [--duration 8] [--model veo-3.1-fast\|veo-3.1-quality\|veo-3.1-lite\|omni-flash] [--mode auto\|ingredients\|frames\|text] [--notes text] |
| `brief list` | List prompt codes: [--limit 50] |
| `brief context` | Everything Claude needs for a code (writes data/briefs/<code>/CONTEXT.md + context.json): --code FL-XXXXX |
| `brief prompt` | Save the finished prompt for a code (shows in the UI): --code FL-XXXXX --file prompt.md |
| `brief show` | Show one code (and its prompt if written): --code FL-XXXXX |

Other: `node --no-warnings server/server.mjs` (UI, :4317) · `node tests/run.mjs [--e2e] [--render]` · `node tools/gen-commands-md.mjs` (this file) · Remotion render of one EDL (inside remotion-studio): `node tools/render-lab.mjs <edl.json> <out> [--still] [--scale 0.5]`.
