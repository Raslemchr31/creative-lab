// creative-lab :: pre-generation audit. Nothing is generated (no credit is spent) until every job
// in a batch is PASS or WARN. Checks map to research/04 FR1–FR5, research/01 (Andromeda
// distinctness, frame-0 hook), the brand kit and ad-engine's compliance lexicon (per FIELD).

import { pathToFileURL } from "node:url";
import { config } from "./util.mjs";
import { validateInput } from "./kie/registry.mjs";
import { brandKit, fmtPrice } from "./compiler/slots.mjs";
import { arabicRatio } from "./util.mjs";

let _validator;
async function complianceValidator() {
  if (_validator !== undefined) return _validator;
  try {
    const mod = await import(pathToFileURL(config().tools.compliance_validator).href);
    const lex = mod.loadLexicon();
    _validator = (lang, text) => mod.validateCreative({ lang, sac: [], text }, lex);
  } catch (e) {
    _validator = null;
  }
  return _validator;
}

const PLACEHOLDER_URL = "https://example.com/ref.png";
function resolveForValidation(v) {
  if (typeof v === "string" && /^\$(ref|local|task):/.test(v)) return PLACEHOLDER_URL;
  if (Array.isArray(v)) return v.map(resolveForValidation);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveForValidation(x)]));
  return v;
}

const PRODUCT_SHOTS = new Set(["product_hero", "product_angle", "detail_macro", "interior", "in_hand", "on_model", "flat_lay", "colour_lineup", "bundle_layout", "gift_reveal", "unboxing"]);
const LATIN_ALLOWED = /\b(SIRINE|sirinealgeria\.store|sirine_algeria|DA|DZD|COD)\b/gi;

/** All on-screen + copy texts of a job, by field (lint each field separately — never a joined blob). */
export function textFields(spec) {
  const out = [];
  for (const s of spec.shots) for (const o of s.overlays) {
    if (o.text) out.push({ field: `overlay:${s.id}:${o.slot}`, text: o.text });
    for (const [i, it] of (o.items || []).entries()) out.push({ field: `overlay:${s.id}:${o.slot}[${i}]`, text: it });
  }
  const e = Object.values(spec.edl)[0];
  for (const it of e?.rail?.items || []) out.push({ field: `rail:${it.slot}`, text: it.text });
  for (const it of e?.endCard?.lines || []) out.push({ field: `end:${it.slot}`, text: it.text });
  spec.copy.primary.forEach((t, i) => out.push({ field: `primary[${i}]`, text: t }));
  spec.copy.headline.forEach((t, i) => out.push({ field: `headline[${i}]`, text: t }));
  spec.copy.description.forEach((t, i) => out.push({ field: `description[${i}]`, text: t }));
  return out;
}

export async function preflightJob(spec) {
  const checks = [];
  const add = (id, level, msg) => checks.push({ id, level, msg });
  const brand = brandKit();
  const p = spec.product;

  // P1 product availability
  add("P1_stock", p.inStock ? "PASS" : "BLOCK", p.inStock ? "in stock" : `${p.slug} is out of stock — never advertise it`);
  // P2 references
  const refs = p.refs || [];
  add("P2_refs", refs.length ? "PASS" : "BLOCK", refs.length ? `${refs.length} approved reference photo(s) (${refs.filter((r) => r.kind === "packshot").length} packshot)` : "no approved reference photos");
  // P3 product spec
  add("P3_spec", spec.has_spec ? "PASS" : "WARN", spec.has_spec ? "product spec present (pieces/hardware/colour)" : `no config/product-specs/${p.family}.json — hardware/logo QA gate cannot be strict; write it first`);

  // P4 FR1 real pixels + P5 FR4 prompt lint + P6 model input validation
  const fr1 = [];
  const lint = [];
  const invalid = [];
  for (const t of spec.tasks) {
    const shot = spec.shots.find((s) => s.id === t.shot_id) || { shot: t.shot_id === "cut" ? "product_hero" : null };
    const showsProduct = PRODUCT_SHOTS.has(shot.shot) && !["plate_still", "broll", "cutout"].includes(t.route);
    const hasRef = JSON.stringify(t.input).match(/\$(ref|local|task):/);
    if (showsProduct && !hasRef) fr1.push(`${t.id} (${t.model})`);
    if (t.prompt_lint?.length) lint.push(`${t.id}: ${t.prompt_lint.join(", ")}`);
    const errs = validateInput(t.model, resolveForValidation(t.input), { variant: t.variant || undefined });
    if (errs.length) invalid.push(`${t.id}: ${errs.join("; ")}`);
  }
  add("P4_fr1_real_pixels", fr1.length ? "BLOCK" : "PASS", fr1.length ? `product shown with no real reference: ${fr1.join(", ")}` : "every product-showing generation is conditioned on a real photo/frame");
  add("P5_fr4_prompts", lint.length ? "BLOCK" : "PASS", lint.length ? lint.join(" | ") : `${spec.tasks.length} prompts clean (no brand/price/offer; positive-only models clean)`);
  add("P6_model_inputs", invalid.length ? "BLOCK" : "PASS", invalid.length ? invalid.slice(0, 6).join(" | ") : "all Kie inputs valid against the documented schemas");

  // P7 LP parity (prices/gift on screen = store)
  const lang = spec.lang;
  const price = fmtPrice(p.price, lang);
  const strike = p.compareAt && p.compareAt > p.price ? fmtPrice(p.compareAt, lang) : null;
  const fields = textFields(spec);
  const priceLike = fields.filter((f) => /(\d[\d,\s]*)\s?(دج|DA)/.test(f.text));
  const wrong = priceLike.filter((f) => {
    const found = [...f.text.matchAll(/(\d[\d,\s]*\d|\d)\s?(دج|DA)/g)].map((m) => `${m[1].trim()} ${m[2]}`);
    return found.some((x) => x !== price && x !== strike);
  });
  add("P7_lp_parity", wrong.length ? "BLOCK" : "PASS", wrong.length ? `price on screen ≠ store (${price}${strike ? ` / ${strike}` : ""}): ${wrong.map((w) => w.field).join(", ")}` : `prices match the store (${price}${strike ? `, was ${strike}` : ""})`);

  // P8 compliance per field (ad-engine lexicon)
  const validate = await complianceValidator();
  if (!validate) add("P8_compliance", "WARN", "compliance validator not loadable — run it by hand");
  else {
    const blocks = [];
    const warns = [];
    for (const f of fields) {
      const r = validate(lang, f.text);
      if (r.verdict === "BLOCK") blocks.push(`${f.field}: ${r.findings.filter((x) => x.severity === "HARD_BLOCK").map((x) => `${x.rule} ${x.term || x.category || ""}`.trim()).join(", ") || "BLOCK"}`);
      else if (r.verdict === "WARN") warns.push(f.field);
    }
    add("P8_compliance", blocks.length ? "BLOCK" : warns.length ? "WARN" : "PASS", blocks.length ? blocks.join(" | ") : warns.length ? `warnings on ${warns.join(", ")}` : `${fields.length} fields PASS (linted one field at a time)`);
  }

  // P9 one language per creative
  if (lang !== "fr") {
    const mixed = fields.filter((f) => {
      const t = f.text.replace(LATIN_ALLOWED, "").replace(/https?:\S+/g, "");
      return /[A-Za-zÀ-ÿ]{3,}/.test(t) && arabicRatio(t) > 0;
    });
    add("P9_one_language", mixed.length ? "WARN" : "PASS", mixed.length ? `Latin words inside ar-DZ fields: ${mixed.map((m) => m.field).join(", ")} (set display_name.ar in the product spec)` : "single language (ar-DZ)");
  }

  // P10 brand rules
  const all = fields.map((f) => f.text).join("\n");
  const bad = (brand.forbidden_spellings || []).filter((s) => new RegExp(`(^|[^\\p{L}])${s}([^\\p{L}]|$)`, "u").test(all));
  const vulgar = /نقش|منقوش|لباب دارك/.test(all);
  const rawUrl = spec.copy.primary.some((t) => /https?:\/\/|www\.|\.store\b|\.com\b/i.test(t));
  add("P10_brand_rules", bad.length || vulgar || rawUrl ? "BLOCK" : "PASS", [bad.length ? `misspelt brand: ${bad.join(",")}` : null, vulgar ? "banned Darija word / housing-trigger phrase" : null, rawUrl ? "raw URL in primary text (lands untagged)" : null].filter(Boolean).join("; ") || "brand spelling, banned words, no raw URLs");

  // P11 shoot requests
  add("P11_shoot", spec.shoot_requests.length ? "WARN" : "PASS", spec.shoot_requests.length ? `${spec.shoot_requests.length} beat(s) need real footage/photos: ${spec.shoot_requests.map((s) => `${s.shot_id} (${s.what})`).join("; ")}` : "no shoot needed");

  // P12 frame-0 hook + ≤5 s COD rule
  const e9 = spec.edl["9:16"] || Object.values(spec.edl)[0];
  if (spec.style.format === "video" && e9) {
    const seconds = e9.durationInFrames / e9.fps;
    const railCod = e9.rail.enabled && e9.rail.fromFrame === 0 && e9.rail.items.some((i) => i.slot === "price") && e9.rail.items.some((i) => /cod/.test(i.slot));
    if (seconds <= 5.5) add("P12_cod_frame0", railCod ? "PASS" : "BLOCK", railCod ? "≤5 s video: price + COD on screen from frame 0" : "≤5 s COD video must show price + «الدفع عند الاستلام» at frame 0 (Pack Noir lesson)");
    const firstSeg = e9.segments[0];
    const hookVisible = (firstSeg?.texts || []).some((t) => (t.at || 0) <= 0.5) || (e9.rail.enabled && e9.rail.fromFrame === 0);
    add("P13_hook_frame0", hookVisible ? "PASS" : "WARN", hookVisible ? "hook text/offer visible in the first 0.5 s" : "nothing readable in the first 0.5 s — 46% of Reels conversions happen in the first 2 s");
    add("P14_length", seconds <= (brand.defaults.max_video_s || 30) ? "PASS" : "WARN", `${seconds.toFixed(1)} s`);
  }

  // P16 overlay length (mobile legibility)
  const long = fields.filter((f) => f.field.startsWith("overlay:") && f.text.length > 42);
  if (long.length) add("P16_overlay_length", "WARN", `long on-screen lines (>42 chars) will be auto-shrunk: ${long.map((l) => `${l.field} (${l.text.length})`).join(", ")}`);

  // P15 warnings from the compiler
  if (spec.warnings.length) add("P15_compiler", "WARN", spec.warnings.join(" | "));

  const verdict = checks.some((c) => c.level === "BLOCK") ? "BLOCK" : checks.some((c) => c.level === "WARN") ? "WARN" : "PASS";
  return { verdict, checks, cost: spec.cost };
}

const KEYS = ["product", "format", "archetype", "hook_type", "first_subject", "setting", "talent", "on_image_text"];
export function distinctness(specs) {
  const pairs = [];
  for (let a = 0; a < specs.length; a++)
    for (let b = a + 1; b < specs.length; b++) {
      const A = specs[a].distinct_key;
      const B = specs[b].distinct_key;
      const diff = KEYS.filter((k) => String(A[k]) !== String(B[k]));
      pairs.push({ a: specs[a].job_id, b: specs[b].job_id, differ_on: diff.length, keys: diff });
    }
  const worst = pairs.reduce((m, p) => (m === null || p.differ_on < m.differ_on ? p : m), null);
  return { pairs, worst };
}

export async function preflightBatch(specs) {
  const jobs = [];
  for (const s of specs) jobs.push({ job_id: s.job_id, ...(await preflightJob(s)) });
  const batchChecks = [];
  const d = distinctness(specs);
  if (specs.length > 1) {
    const level = d.worst.differ_on >= 3 ? "PASS" : d.worst.differ_on === 2 ? "WARN" : "BLOCK";
    batchChecks.push({ id: "B1_distinct", level, msg: `closest pair ${d.worst.a} vs ${d.worst.b} differ on ${d.worst.differ_on}/${KEYS.length} (${d.worst.keys.join(", ") || "nothing"}) — Meta groups look-alike ads (need ≥3)` });
  }
  const credits = specs.reduce((s, x) => s + (x.cost.credits || 0), 0);
  const cap = config().kie.max_credits_per_batch;
  batchChecks.push({ id: "B2_budget", level: credits <= cap ? "PASS" : "BLOCK", msg: `estimated ${credits.toFixed(1)} credits ≈ $${(credits * (config().kie.usd_per_credit || 0.005)).toFixed(2)} (cap ${cap})` });
  const verdict = [...jobs.map((j) => j.verdict), ...batchChecks.map((c) => c.level)].includes("BLOCK") ? "BLOCK" : [...jobs.map((j) => j.verdict), ...batchChecks.map((c) => c.level)].includes("WARN") ? "WARN" : "PASS";
  return { verdict, jobs, batch: batchChecks, distinctness: d };
}
