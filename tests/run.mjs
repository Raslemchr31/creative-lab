#!/usr/bin/env node
// creative-lab test suite — zero deps. `node tests/run.mjs [--e2e] [--render] [--only <name>]`
//   unit sections always run (fixtures, no network);
//   --e2e   : full pipeline in a temp data dir against the Kie mock (compile → preflight → generate → ops → QA → EDL)
//   --render: also render the finals with Remotion and run final QA (slow, ~2–4 min)
// Exit 0 = all pass.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, "fixtures");
const args = process.argv.slice(2);
const E2E = args.includes("--e2e") || args.includes("--render");
const RENDER = args.includes("--render");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

// Isolate every DB/file write in a temp data dir BEFORE any lab module loads.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "creative-lab-test-"));
process.env.LAB_DATA_DIR = TMP;
process.env.LAB_EXPORT_ROOT = path.join(TMP, "export");

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}
async function section(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) return;
  const t0 = Date.now();
  process.stdout.write(`▶ ${name} `);
  try {
    await fn();
    console.log(`(${Date.now() - t0} ms)`);
  } catch (e) {
    fail++;
    failures.push(`${name}: threw ${e.stack || e.message}`);
    console.log("THREW");
  }
}

const parse = await import("../lib/collector/parse.mjs");
const norm = await import("../lib/collector/normalize.mjs");
const scoring = await import("../lib/scoring.mjs");
const schema = await import("../lib/schema.mjs");
const color = await import("../lib/color.mjs");
const registry = await import("../lib/kie/registry.mjs");
const { KieClient, KieError, RateLimiter, extractResult } = await import("../lib/kie/client.mjs");
const { startMockKie } = await import("../lib/kie/mock-server.mjs");
const prompts = await import("../lib/compiler/prompts.mjs");
const slots = await import("../lib/compiler/slots.mjs");
const compose = await import("../lib/compose.mjs");
const util = await import("../lib/util.mjs");

await section("parse: embedded first page + GraphQL pages + block signals", async () => {
  const html = fs.readFileSync(path.join(FX, "adlib-first-page.html"), "utf8");
  const conns = parse.findConnectionsInText(html);
  ok("html has 1 connection", conns.length === 1, `got ${conns.length}`);
  const r = parse.resultsFromConnection(conns[0]);
  ok("html 3 results", r.results.length === 3);
  ok("html count 1876", r.count === 1876);
  const gql = fs.readFileSync(path.join(FX, "adlib-graphql-page.txt"), "utf8");
  const gc = parse.connectionsFromGraphql(gql);
  const gr = parse.resultsFromConnection(gc[0]);
  ok("graphql strips for(;;) + extra chunk", gc.length === 1 && gr.results.length === 4, `${gc.length}/${gr.results.length}`);
  ok("graphql has paging", gr.hasNext !== null && !!gr.endCursor);
  ok("no error signal on normal page", parse.graphqlErrorSignal(gql) === null);
  ok("1675004 = rate_limited", parse.graphqlErrorSignal('{"errors":[{"code":1675004,"summary":"Rate limit exceeded"}]}')?.kind === "rate_limited");
  ok("1357054 = refused", parse.graphqlErrorSignal('for (;;);{"error":1357054,"errorSummary":"Your Request Couldn\'t be Processed"}')?.kind === "refused");
  ok("captcha flag detected", parse.detectBlock('{"xfb_ad_library_is_captcha_required":true}').includes("captcha_required"));
  ok("login redirect detected", parse.detectBlock("<html></html>", "https://www.facebook.com/login/?next=x").length === 1);
  ok("oe= expiry decodes", parse.urlExpiry("https://scontent.x/v/abc.jpg?_nc=1&oe=6AC3FCD7") === 0x6ac3fcd7);
  const u = parse.buildLibraryUrl({ q: "sac", country: "DZ", sort: "impressions" });
  ok("sort param", u.includes("sort_data%5Bmode%5D=total_impressions") && u.includes("country=DZ"));
  ok("page view url", parse.buildLibraryUrl({ pageId: "123" }).includes("view_all_page_id=123"));
});

await section("normalize: real records + catalog cards", async () => {
  const gql = fs.readFileSync(path.join(FX, "adlib-graphql-page.txt"), "utf8");
  const res = parse.resultsFromConnection(parse.connectionsFromGraphql(gql)[0]).results;
  const n = norm.normalizeResult(res[0], { country: "DZ", query: "sac" });
  ok("ad id", /^\d+$/.test(n.ad.ad_archive_id));
  ok("page", !!n.ad.page_id && !!n.page);
  ok("start date", Number.isFinite(n.ad.start_date));
  ok("media extracted", n.media.length >= 1, `media ${n.media.length}`);
  ok("top-level fields kept", n.snapshot._top && "gated_type" in n.snapshot._top);
  const dpa = norm.normalizeResult({ ad_archive_id: "1", page_id: "2", is_active: true, start_date: 1, snapshot: { display_format: "DPA", body: { text: "{{product.brand}}" }, cards: [{ body: "Sac Lina noir 3200 DA", title: "Sac Lina", original_image_url: "https://x/y.jpg" }] } });
  ok("catalog uses card copy", dpa.ad.body === "Sac Lina noir 3200 DA", dpa.ad.body);
  ok("catalog bucket", norm.formatBucket(dpa.ad) === "catalog");
  const ev = norm.normalizeResult({ ad_archive_id: "3", snapshot: { extra_videos: [{ video_hd_handle: "https://v/h.mp4" }] } });
  ok("extra_videos handle", ev.media.some((m) => m.role === "extra_video" && m.url === "https://v/h.mp4"));
});

await section("scoring: relevance + winner score", async () => {
  const niche = JSON.parse(fs.readFileSync(path.join(HERE, "..", "config", "niche-sirine.json"), "utf8"));
  const rel = (body, page = "Shop", cats = []) => scoring.relevance({ body, page_name: page, cards: [] }, { categories: cats }, niche).value;
  ok("bag ad in niche", rel("Sac «LAYLA» ♥️ 2000 DA ✅ Livraison sur les 58 wilayas", "Juste un sac") >= 0.6);
  ok("Arabic bag ad in niche", rel("فقط بـ 2550 دج 3 حقائب كاملة متكاملة 🔥 التوصيل متوفر 58 ولاية الدفع عند الإستلام", "Cosmos Bags") >= 0.6);
  ok("Turkish saç ≠ sac", rel("Bu uygulamayla saç stilimi değiştirdikten sonra", "Snapix AI Photo Editor") < 0.35);
  ok("Quran-school bag is off-niche", rel("🌿 حقيبة المصحف للمدرسة القرآنية تعظيمًا لكتاب الله", "يا حافظ القرآن") < 0.35);
  ok("makeup-bag phrase matches (multi-word Arabic)", scoring.hasTerm(scoring.normText ? scoring.normText("كل مكياجك في حقيبة المكياج الأنيقة") : "حقيبه المكياج", "حقيبة المكياج"));
  ok("storage bags are off-niche", rel("Pack 3 sac de rangement 29.9dt seulement", "Dari Mratba") < 0.35);
  ok("premium page with wordless copy stays in", scoring.relevance({ body: "New in. Shop the edit.", page_name: "CHARLES & KEITH", cards: [] }, { categories: [], segment: "premium" }, niche).value >= 0.6);
  ok("premium page still blocked by an off-niche head word", scoring.relevance({ body: "Parfum: the new scent", page_name: "Brand", cards: [] }, { categories: [], segment: "premium" }, niche).value < 0.35);
  ok("comb ad with a pouch mention is off-niche",rel("بأقل سعر و إحصلي على المشط الحراري بدرجة حرارة عالية — يجي مع حقيبة صغيرة") < 0.35);
  ok("'rose bébé' colour keeps a bag in niche", rel("Florence bag ✨ Couleurs: rose bébé, noir. Livraison 69 wilayas", "Juste un sac") >= 0.35);
  const base = { platforms: ["FACEBOOK", "INSTAGRAM"], collation_count: 1, is_active: 1, start_date: 1_700_000_000, display_format: "VIDEO", cards: [] };
  const now = 1_700_000_000 + 200 * 86400;
  const old = scoring.winnerScore(base, { nowSec: now, relevance: 0.8 });
  const young = scoring.winnerScore({ ...base, start_date: now - 5 * 86400 }, { nowSec: now, relevance: 0.8 });
  ok("longevity raises score", old.score > young.score, `${old.score} vs ${young.score}`);
  ok("unknown signals are dropped (no impression → renormalised)", old.sub.impression === null && old.score > 0);
  const cat = scoring.winnerScore({ ...base, display_format: "DPA", templated: true }, { nowSec: now });
  ok("catalog penalised", cat.score < old.score * 0.5);
  ok("winner flag", scoring.winnerScore({ ...base, collation_count: 6 }, { nowSec: now, impPct: 0.95, countries: ["DZ"] }).winner === true);
});

await section("schema validator + taxonomy refs", async () => {
  const style = JSON.parse(fs.readFileSync(path.join(FX, "styles", "t-video-offer.json"), "utf8"));
  ok("fixture style valid", schema.validateAs("style", style).length === 0, schema.validateAs("style", style).join("; "));
  const bad = { ...style, archetype: "not_a_thing" };
  ok("bad enum rejected", schema.validateAs("style", bad).some((e) => e.includes("archetype")));
  const dnaErrs = schema.validateAs("creative-dna", { ref: { kind: "adlib", id: "1" } });
  ok("incomplete DNA rejected", dnaErrs.length > 5);
});

await section("colour: CIEDE2000 (Sharma 2005 test pairs)", async () => {
  const cases = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  ];
  for (const [a, b, want] of cases) ok(`ΔE00 ${want}`, Math.abs(color.deltaE00(a, b) - want) < 1e-3, `got ${color.deltaE00(a, b)}`);
  ok("white Lab", Math.abs(color.rgbToLab(255, 255, 255)[0] - 100) < 0.01);
});

await section("registry: input validation + price estimate", async () => {
  const good = registry.validateInput("nano-banana-pro", { prompt: "x", image_input: ["https://a/b.png"], aspect_ratio: "4:5", resolution: "2K" });
  ok("nano-banana-pro valid", good.length === 0, good.join("; "));
  ok("bad aspect caught", registry.validateInput("nano-banana-pro", { prompt: "x", aspect_ratio: "7:3" }).some((e) => e.includes("aspect_ratio")));
  ok("too many refs caught", registry.validateInput("nano-banana-pro", { prompt: "x", image_input: Array(9).fill("https://a") }).some((e) => e.includes("max 8")));
  ok("unknown field caught", registry.validateInput("nano-banana-pro", { prompt: "x", foo: 1 }).some((e) => e.includes("foo")));
  ok("kling duration bound", registry.validateInput("kling-3.0-omni/image-to-video", { prompt: "x", image_urls: ["https://a"], duration: 20 }).length > 0);
  const k = registry.estimate("kling-3.0-omni/image-to-video", { duration: 5, resolution: "720p", audio: false });
  ok("kling 5 s 720p no-audio = 70 cr ($0.35)", k.credits === 70 && Math.abs(k.usd - 0.35) < 1e-9, JSON.stringify(k));
  const v = registry.estimate("veo-3-1", { model: "veo3_fast", generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", resolution: "720p" });
  ok("veo fast i2v 720p = 60 cr", v.credits === 60, JSON.stringify(v));
  ok("nano-banana-pro 1K = 18 cr", registry.estimate("nano-banana-pro", { resolution: "1K" }).credits === 18);
  ok("discontinued model refused", (() => { try { registry.getModel("runway/gen4-aleph"); return false; } catch { return true; } })());
  ok("ref field per family", registry.refField("gpt-image-2-5-sunburst-image-to-image") === "input_urls" && registry.refField("nano-banana-pro") === "image_input");
});

await section("kie client ↔ mock: lifecycle, errors, uploads", async () => {
  const mock = await startMockKie({ credits: 200, latency: { waiting: 30, queuing: 30, generating: 60 }, rateLimit: { limit: 3, windowMs: 1500 } });
  try {
    const c = new KieClient({ apiKey: mock.apiKey, baseUrl: mock.url, uploadBaseUrl: mock.url, retryBaseMs: 20, limiter: new RateLimiter(100, 1000) });
    ok("credits", (await c.credits()) === 200);
    const up = await c.uploadFile(path.join(FX, "products", "packshot-vernis.png"));
    ok("upload returns url", up.url.startsWith(mock.url));
    const { taskId } = await c.createTask("nano-banana-2-1", { prompt: "studio backdrop", image_input: [up.url], aspect_ratio: "4:5", resolution: "1K" });
    const done = await c.waitTask(taskId, { firstMs: 40, maxIntervalMs: 80 });
    ok("task success + result url", done.ok && done.resultUrls.length === 1, JSON.stringify(done).slice(0, 200));
    ok("credits consumed reported", done.creditsConsumed === 4);
    const dl = await c.downloadUrl(done.resultUrls[0]);
    ok("download-url", dl.startsWith(done.resultUrls[0]));
    const f = await c.createTask("nano-banana-2-1", { prompt: "x [[mock:fail]]", aspect_ratio: "1:1" });
    const fr = await c.waitTask(f.taskId, { firstMs: 40, maxIntervalMs: 80 });
    ok("fail state + failCode string", !fr.ok && fr.failCode === "500" && fr.creditsConsumed === 0);
    let e401 = null;
    try {
      await new KieClient({ apiKey: "wrong", baseUrl: mock.url, uploadBaseUrl: mock.url }).credits();
    } catch (e) {
      e401 = e;
    }
    ok("401 inside HTTP 200 → fatal KieError", e401 instanceof KieError && e401.code === 401 && e401.fatal);
    let e422 = null;
    try {
      await c.createTask("nano-banana-pro", { prompt: "x", aspect_ratio: "7:3" });
    } catch (e) {
      e422 = e;
    }
    ok("local validation blocks bad input before the call", e422?.code === 422 && e422.local);
    let e402 = null;
    try {
      for (let i = 0; i < 20; i++) await c.createTask("veo-3-1", { prompt: "x", model: "veo3", resolution: "1080p" });
    } catch (e) {
      e402 = e;
    }
    ok("402 insufficient credits is fatal", e402?.code === 402 && e402.fatal, e402?.message);
    const noRetry = new KieClient({ apiKey: mock.apiKey, baseUrl: mock.url, uploadBaseUrl: mock.url, maxRetries: 0, limiter: new RateLimiter(100, 1000) });
    mock.state.credits = 10000;
    let e429 = null;
    try {
      for (let i = 0; i < 6; i++) await noRetry.createTask("nano-banana-2-1", { prompt: "x", aspect_ratio: "1:1" });
    } catch (e) {
      e429 = e;
    }
    ok("429 rate limit surfaced (retryable)", e429?.code === 429 && e429.retryable);
    const retrying = new KieClient({ apiKey: mock.apiKey, baseUrl: mock.url, uploadBaseUrl: mock.url, retryBaseMs: 400, maxRetries: 4, limiter: new RateLimiter(100, 1000) });
    const r2 = await retrying.createTask("nano-banana-2-1", { prompt: "x", aspect_ratio: "1:1" });
    ok("429 retried with backoff then accepted", !!r2.taskId);
    let e404 = null;
    try {
      await c._call("GET", `${mock.url}/api/nope`);
    } catch (e) {
      e404 = e;
    }
    ok("unknown path → real HTTP 404", e404?.code === 404);
    ok("extractResult reads Veo 1080p shape", extractResult({ resultJson: JSON.stringify({ data: { result_urls: ["https://a.mp4"] } }) }).resultUrls[0] === "https://a.mp4");
  } finally {
    await mock.close();
  }
});

await section("prompts + slots: FR4 hygiene, price format, patterns", async () => {
  const plate = prompts.platePrompt({ scene: "Warm studio", aspect: "4:5" });
  ok("plate prompt clean for positive-only model", prompts.promptViolations(plate, { positiveOnly: true }).length === 0, prompts.promptViolations(plate, { positiveOnly: true }).join(","));
  ok("brand in prompt caught", prompts.promptViolations("a SIRINE bag").length === 1);
  ok("price in prompt caught", prompts.promptViolations("bag for 4,200 دج").length >= 1);
  ok("negation words caught on FLUX", prompts.promptViolations("no logo, no box", { positiveOnly: true }).length === 1);
  const desc = { text: "black croco handbag", pieces: [{ en: "handbag", hardware: "2 gold rings" }], colour: { en: "black" } };
  ok("i2v kling uses @product", prompts.i2vPrompt({ model: "kling-3.0-omni/image-to-video", desc, camera: "orbit" }).includes("@product"));
  ok("lock clause lists hardware", prompts.lockClause(desc).includes("2 gold rings"));
  ok("price ar", slots.fmtPrice(4200, "ar-DZ") === "4,200 دج");
  ok("price fr", slots.fmtPrice(4200, "fr") === "4 200 DA");
  ok("clean name", slots.cleanName("طقم كروكو سيرين — أسود") === "طقم كروكو سيرين");
  ok("pattern missing slot → null", slots.fillPattern("{name} {gift}", { name: "x", gift: null }) === null);
  const s = slots.buildSlots({ product: { name: { ar: "طقم — أسود" }, price: 3900, compareAt: 6200, freeGift: { ar: "صندل هدية مجاناً" }, details: { ar: ["a", "b"] }, colors: [] }, lang: "ar-DZ" });
  ok("gift not double-prefixed", s.gift === "صندل هدية مجاناً", s.gift);
  ok("strike price", s.strike === "6,200 دج");
  const spec = { benefits: { ar: ["ساك هوبو كروكو", "سبادري بنفس اللون"], fr: ["Sac hobo", "Baskets"] } };
  const s2 = slots.buildSlots({ product: { name: { ar: "pack hobo" }, price: 4200, details: { ar: [] }, colors: [] }, lang: "ar-DZ", spec });
  ok("benefits fall back to spec when store details empty", s2.benefit_1 === "ساك هوبو كروكو" && s2.benefit_2 === "سبادري بنفس اللون", s2.benefit_1);
  const s3 = slots.buildSlots({ product: { name: { ar: "x" }, price: 4200, details: { ar: ["store"] }, colors: [] }, lang: "ar-DZ", spec });
  ok("store details win over spec benefits", s3.benefit_1 === "store" && s3.benefit_2 === null);
  const P = await import("../lib/compiler/prompts.mjs");
  ok("plate prompt naming the product is flagged", P.promptViolations("Dark shelf. All pack pieces together, centred.", { productFree: true }).some((v) => /product noun/.test(v)));
  ok("clean plate prompt passes", P.promptViolations(P.platePrompt({ scene: "Dark walnut shelf against a white wall" }), { productFree: true, positiveOnly: true }).length === 0);
  const giftSpec ={ pieces: [{ ar: "ساك" }, { ar: "تروسة", gift: true }] };
  const s4 = slots.buildSlots({ product: { name: { ar: "x" }, price: 6500, freeGift: { ar: "trousse offerte", fr: "trousse offerte" }, colors: [] }, lang: "ar-DZ", spec: giftSpec });
  ok("Latin-only gift in ar-DZ replaced by the spec gift piece", s4.gift_raw === "تروسة" && /[؀-ۿ]/.test(s4.gift), s4.gift);
  const s5 = slots.buildSlots({ product: { name: { fr: "x" }, price: 6500, freeGift: { fr: "trousse offerte" }, colors: [] }, lang: "fr", spec: giftSpec });
  ok("French gift kept in fr", /trousse/.test(s5.gift), s5.gift);
});

await section("compose: fit, cut-out, composite, pixel-lock", async () => {
  const dir = util.ensureDir(path.join(TMP, "compose"));
  const fit = compose.fitToAspect(path.join(FX, "products", "scene-hobo.jpg"), path.join(dir, "fit.png"), { aspect: "4:5", mode: "crop" });
  const { probe } = await import("../lib/probe.mjs");
  const p = probe(fit);
  ok("fit 1080×1350", p.display_w === 1080 && p.display_h === 1350, `${p.display_w}×${p.display_h}`);
  ok("classify packshot", compose.classifyRef(path.join(FX, "products", "packshot-vernis.png")).kind === "packshot");
  ok("classify scene", compose.classifyRef(path.join(FX, "products", "scene-hobo.jpg")).kind === "scene");
  const cut = compose.localCutout(path.join(FX, "products", "packshot-vernis.png"), path.join(dir, "cut.png"), { fuzz: 6 });
  ok("cut-out has transparency", cut.coverage > 0.2 && cut.coverage < 0.95, String(cut.coverage));
  const { runTool } = await import("../lib/probe.mjs");
  runTool("magick", ["-size", "1080x1920", "gradient:#EFE9DF-#D9D1C4", path.join(dir, "plate.png")]);
  const c = compose.compositeOnPlate({ plate: path.join(dir, "plate.png"), cutout: cut.path, out: path.join(dir, "comp.png"), box: { x: 0.1, y: 0.25, w: 0.8, h: 0.34 } });
  ok("product inside 9:16 safe content zone", c.placement.y >= 270 && c.placement.y + c.placement.h <= 1150, JSON.stringify(c.placement));
  const lock = await compose.pixelLockCheck({ output: c.out, cutout: cut.path, placement: c.placement, workDir: path.join(dir, "lock") });
  ok("own composite is pixel-locked", lock.ok, JSON.stringify(lock));
  runTool("magick", [c.out, "-fill", "#5E1B2A", "-colorize", "35%", path.join(dir, "recol.png")]);
  const bad = await compose.pixelLockCheck({ output: path.join(dir, "recol.png"), cutout: cut.path, placement: c.placement, workDir: path.join(dir, "lock2") });
  ok("recoloured product fails pixel-lock", !bad.ok && bad.dE00 > 3, JSON.stringify(bad));
});

if (E2E) {
  await section("E2E: products → styles → batch → preflight → mock generation → QA → EDL" + (RENDER ? " → render → export" : ""), async () => {
    const { run: dbRun, get } = await import("../lib/db.mjs");
    const { saveProducts } = await import("../lib/products/sync.mjs");
    const { saveStyle } = await import("../lib/styles.mjs");
    const { createBatch, getBatch } = await import("../lib/batch.mjs");
    const { runGeneration } = await import("../lib/generate.mjs");
    const { buildVisionPack, recordVisionQa } = await import("../lib/qa/vision.mjs");
    const { resolveEdl } = await import("../lib/assemble.mjs");
    // Fixture products with LOCAL reference photos (no public URL → uploaded to the mock).
    const prod = (slug, name, price, compareAt, files, gift) => ({ slug, name: { ar: name, fr: name }, category: "packs", price, compareAt, description: { ar: "", fr: "" }, details: { ar: ["تصميم أنيق", "جلد ناعم", "تفاصيل ذهبية"], fr: [] }, images: files.map((f) => `https://fixture.local/${path.basename(f)}`), colors: [{ name: { ar: "أسود", fr: "Noir" }, hex: "#111111" }], inStock: true, freeGift: gift ? { ar: gift, fr: gift } : null, url: `https://sirinealgeria.store/product/${slug}` });
    saveProducts([prod("test-pack-noir", "طقم تجريبي — أسود", 4200, 5800, ["packshot-croco.png", "scene-hobo.jpg"], "صندل هدية"), prod("test-sac-noir", "حقيبة تجريبية — أسود", 3200, null, ["packshot-vernis.png"])], "fixture");
    for (const [slug, files] of [["test-pack-noir", ["packshot-croco.png", "scene-hobo.jpg"]], ["test-sac-noir", ["packshot-vernis.png"]]]) {
      const refs = files.map((f, i) => ({ url: null, path: path.join(FX, "products", f).replace(/\\/g, "/"), role: i === 0 ? "hero" : "alt", source: "store", approved: true }));
      dbRun("UPDATE products SET refs=? WHERE slug=?", JSON.stringify(refs), slug);
    }
    for (const f of ["t-video-offer.json", "t-static-bundle.json"]) saveStyle(JSON.parse(fs.readFileSync(path.join(FX, "styles", f), "utf8")));
    const b = await createBatch({ name: "e2e", items: [{ product: "test-pack-noir", styles: ["t-video-offer"] }, { product: "test-sac-noir", styles: ["t-static-bundle"] }], settings: { id: "test-e2e" } });
    ok("batch compiled", b.jobs.length === 2);
    // Prompt codes: reference ad + product → FL-XXXXX → context pack → saved prompt.
    {
      const B = await import("../lib/briefs.mjs");
      dbRun("INSERT OR IGNORE INTO ads(ad_archive_id, page_id, page_name, display_format, body, is_active, start_date) VALUES('999000111', 'p1', 'Test Page', 'VIDEO', 'Sac test 2000 DA', 1, 1700000000)");
      const br = B.createBrief({ source_kind: "ad", source_id: "999000111", product_slug: "test-pack-noir", aspect: "16:9", duration_s: 10, model: "veo-3.1-fast" });
      ok("brief code format", B.CODE_RE.test(br.code), br.code);
      ok("Veo duration capped at 8 s", br.duration_s === 8 && br.aspect === "16:9");
      ok("code lookup is case/dash tolerant", B.getBrief(br.code.toLowerCase().replace("-", ""))?.code === br.code);
      const cx = B.briefContext(br.code);
      ok("context has reference + product photos", cx.reference.ad_id === "999000111" && cx.product.photos.length === 2 && fs.existsSync(path.join(cx.dir, "CONTEXT.md")));
      const saved = B.savePrompt(br.code, "# test prompt");
      ok("prompt saved", saved.status === "prompted" && fs.existsSync(path.join(cx.dir, "PROMPT.md")));
      let threw = false;
      try {
        B.createBrief({ source_kind: "ad", source_id: "nope", product_slug: "test-pack-noir" });
      } catch {
        threw = true;
      }
      ok("unknown reference ad refused", threw);
    }
    ok("preflight not blocked", b.status === "ready", JSON.stringify(b.jobs.map((x) => x.preflight.checks.filter((c) => c.level === "BLOCK"))));
    ok("LP parity PASS", b.jobs.every((x) => x.preflight.checks.find((c) => c.id === "P7_lp_parity")?.level === "PASS"));
    ok("compliance per field PASS", b.jobs.every((x) => x.preflight.checks.find((c) => c.id === "P8_compliance")?.level !== "BLOCK"));
    ok("FR1 PASS", b.jobs.every((x) => x.preflight.checks.find((c) => c.id === "P4_fr1_real_pixels")?.level === "PASS"));
    ok("model inputs valid", b.jobs.every((x) => x.preflight.checks.find((c) => c.id === "P6_model_inputs")?.level === "PASS"), JSON.stringify(b.jobs.map((x) => x.preflight.checks.find((c) => c.id === "P6_model_inputs"))));
    // A banned claim in a hook must BLOCK.
    const badStyle = JSON.parse(fs.readFileSync(path.join(FX, "styles", "t-static-bundle.json"), "utf8"));
    badStyle.id = "t-bad-claim";
    badStyle.copy.hook_patterns = ["ضمان 100% {name}"];
    saveStyle(badStyle);
    const bb = await createBatch({ name: "bad", items: [{ product: "test-sac-noir", styles: ["t-bad-claim"] }], settings: { id: "test-bad" } });
    ok("banned claim blocks the batch", bb.status === "blocked" && bb.jobs[0].preflight.checks.find((c) => c.id === "P8_compliance").level === "BLOCK", JSON.stringify(bb.jobs[0].preflight.checks.find((c) => c.id === "P8_compliance")));
    let refused = false;
    try {
      await runGeneration({ batchId: "test-bad", confirm: "test-bad", mock: true });
    } catch (e) {
      refused = e.code === "PREFLIGHT";
    }
    ok("blocked batch cannot generate", refused);
    let needConfirm = false;
    try {
      await runGeneration({ batchId: "test-e2e", mock: true });
    } catch (e) {
      needConfirm = e.code === "CONFIRM";
    }
    ok("generation requires --confirm", needConfirm);
    const dry = await runGeneration({ batchId: "test-e2e", dryRun: true });
    ok("dry run lists every request", dry.dry_requests.length === get("SELECT COUNT(*) n FROM tasks WHERE batch_id='test-e2e'").n);
    const s1 = await runGeneration({ batchId: "test-e2e", confirm: "test-e2e", mock: true });
    ok("stage A stops for review", /stage A done/.test(s1.stopped || ""), s1.stopped);
    const pack = buildVisionPack("test-e2e", { stage: "A" });
    ok("vision pack built", pack.items > 0);
    const plate = get("SELECT id FROM tasks WHERE batch_id='test-e2e' AND route='plate_still' AND candidate=1 LIMIT 1");
    const v = recordVisionQa({ task_id: plate.id, verdict: "pass", select: true, same_product: null, reviewer: "claude", confidence: 0.9, style_match: 4, aesthetic: 4 });
    ok("vision verdict recorded + selection moved", v.verdict === "PASS" && get("SELECT selected FROM tasks WHERE id=?", plate.id).selected === 1);
    const s2 = await runGeneration({ batchId: "test-e2e", confirm: "test-e2e", mock: true, stage: "B" });
    ok("stage B ran", s2.succeeded >= 1, JSON.stringify(s2.task_states));
    const final = getBatch("test-e2e");
    const states = final.jobs.flatMap((x) => x.tasks.map((t) => t.state));
    ok("all tasks usable", states.every((s) => ["qa_pass", "qa_warn", "success"].includes(s)), states.join(","));
    ok("composites pixel-locked", final.jobs.flatMap((x) => x.ops).filter((o) => o.kind === "composite").every((o) => o.meta?.pixel_lock?.ok), JSON.stringify(final.jobs.flatMap((x) => x.ops).map((o) => o.meta?.pixel_lock)));
    ok("spend recorded", final.spent_credits > 0 && final.spent_credits <= final.est_credits + 0.01, `${final.spent_credits} vs ${final.est_credits}`);
    const spec = final.jobs[0].spec;
    process.env.LAB_SKIP_STAGE = "1";
    const { edl, missing } = resolveEdl(spec, "9:16");
    ok("EDL fully resolved", missing.length === 0, missing.join("; "));
    ok("EDL has rail from frame 0", edl.rail.enabled && edl.rail.fromFrame === 0 && edl.rail.items.some((i) => i.slot === "price"));
    if (RENDER) {
      const { assembleBatch, approveAsset, exportBatch } = await import("../lib/assemble.mjs");
      const res = assembleBatch("test-e2e");
      const rendered = res.flatMap((r) => r.results || []);
      ok("renders produced", rendered.length >= 3 && rendered.every((x) => x.status === "rendered"), JSON.stringify(res).slice(0, 600));
      ok("final QA no FAIL", rendered.every((x) => x.qa !== "FAIL"), JSON.stringify(rendered.map((x) => x.failing)));
      for (const r of rendered) approveAsset(`${r.file.split("/").pop().replace(/\.(mp4|png)$/, "")}`);
      const ex = exportBatch("test-e2e");
      ok("export written", ex.items === rendered.length && fs.existsSync(path.join(ex.dest, "manifest.json")));
    }
  });
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed${E2E ? "" : "  (unit only — add --e2e for the full pipeline, --render for Remotion)"}`);
if (fail) {
  for (const f of failures) console.log(`  ✗ ${f}`);
}
try {
  const { closeDb } = await import("../lib/db.mjs");
  closeDb();
  if (E2E) fs.rmSync(path.join(util.config().tools.remotion_dir, "public", "lab", "test-e2e"), { recursive: true, force: true });
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {}
process.exit(fail ? 1 : 0);
