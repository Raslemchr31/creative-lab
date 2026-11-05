// creative-lab :: Kie.ai model registry — input validation + price estimation.
// Source of truth: config/kie-models.json (195 models, parsed from docs.kie.ai OpenAPI
// blocks + kie.ai/pricing on 2026-11-01 by research/03). Validate BEFORE calling so a bad
// field never costs a round-trip (Kie answers 422 inside an HTTP-200 envelope).

import { labPath, readJson, config } from "../util.mjs";

let _models;
export function models() {
  if (!_models) {
    const arr = readJson(labPath("config/kie-models.json"));
    _models = new Map(arr.map((m) => [m.id, m]));
  }
  return _models;
}

export function getModel(id) {
  const m = models().get(id);
  if (!m) throw Object.assign(new Error(`unknown Kie model "${id}"`), { code: "KIE_MODEL" });
  if (/discontinued/i.test(m.status || "")) throw Object.assign(new Error(`Kie model "${id}" is discontinued`), { code: "KIE_MODEL" });
  return m;
}

const typeOk = (v, t) => {
  if (t === "integer") return Number.isInteger(v);
  if (t === "number") return typeof v === "number" && Number.isFinite(v);
  if (t === "array") return Array.isArray(v);
  if (t === "object") return v && typeof v === "object" && !Array.isArray(v);
  return typeof v === t;
};

/**
 * Validate an `input` object against the model's documented schema.
 * @param {string} variant optional doc variant (e.g. "First and Last Frames") for per-variant rules.
 * @returns {string[]} errors (empty = ok)
 */
export function validateInput(id, input, { variant = null } = {}) {
  const m = getModel(id);
  const sch = m.input_schema || {};
  const errs = [];
  for (const [k, f] of Object.entries(sch)) {
    if (k.includes("[]")) continue; // nested item specs (multi_prompt[].x) — validated loosely
    const v = input[k];
    const requiredHere = f.required === true || (!!variant && Array.isArray(f.required_in) && f.required_in.includes(variant));
    if (v === undefined || v === null) {
      if (requiredHere) errs.push(`${id}: input.${k} is required${variant && f.required !== true ? ` for "${variant}"` : ""}`);
      continue;
    }
    if (f.deprecated) errs.push(`${id}: input.${k} is deprecated — remove it`);
    if (f.type && !typeOk(v, f.type)) {
      errs.push(`${id}: input.${k} must be ${f.type} (got ${Array.isArray(v) ? "array" : typeof v})`);
      continue;
    }
    const en = (variant && f.enum_by_variant?.[variant]) || f.enum;
    if (en && !Array.isArray(v) && !en.includes(v)) errs.push(`${id}: input.${k}="${v}" not in [${en.join(", ")}]`);
    if (typeof v === "number") {
      if (f.min !== undefined && v < f.min) errs.push(`${id}: input.${k}=${v} < min ${f.min}`);
      if (f.max !== undefined && v > f.max) errs.push(`${id}: input.${k}=${v} > max ${f.max}`);
    }
    if (typeof v === "string") {
      if (f.max_length && v.length > f.max_length) errs.push(`${id}: input.${k} is ${v.length} chars > ${f.max_length}`);
      if (f.min_length && v.trim().length < f.min_length) errs.push(`${id}: input.${k} shorter than ${f.min_length}`);
    }
    if (Array.isArray(v)) {
      const max = (variant && f.max_items_by_variant?.[variant]) || f.max_items;
      if (max !== undefined && v.length > max) errs.push(`${id}: input.${k} has ${v.length} items > max ${max}${variant ? ` for "${variant}"` : ""}`);
      if (f.min_items !== undefined && v.length < f.min_items) errs.push(`${id}: input.${k} needs ≥ ${f.min_items} items`);
      if (f.items === "string" && v.some((x) => typeof x !== "string" || !x)) errs.push(`${id}: input.${k} items must be non-empty strings`);
    }
  }
  for (const k of Object.keys(input)) if (!sch[k]) errs.push(`${id}: input.${k} is not a documented field`);
  return errs;
}

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ");

/** Tokens describing this request, matched against pricing-tier variant labels. */
function requestTokens(m, input) {
  const t = [];
  const res = input[m.resolution_field || "resolution"] ?? input.resolution ?? input.quality;
  if (res) t.push(norm(res).replace("k", "k"));
  if (input.model) t.push({ veo3_fast: "fast", veo3_lite: "lite", veo3: "quality" }[input.model] || norm(input.model));
  if (input.generation_type) t.push({ TEXT_2_VIDEO: "text-to-video", FIRST_AND_LAST_FRAMES_2_VIDEO: "image-to-video", REFERENCE_2_VIDEO: "reference-to-video" }[input.generation_type] || "");
  if (input.audio === true || input.generate_audio === true || input.sound === true) t.push("with native audio");
  if (input.audio === false || input.generate_audio === false || input.sound === false) t.push("no native audio");
  if (input.reference_video_urls?.length || input.video_urls?.length) t.push("with video");
  else t.push("no video");
  return t.filter(Boolean);
}

function tierScore(variant, tokens) {
  const v = norm(variant).replace(/1\/2k/, "1k 2k");
  let s = 0;
  for (const tok of tokens) {
    if (/^\d+(k|p)$/.test(tok)) {
      // resolution: "1k" must not match "1080p"; treat 1k/2k labels as one bucket when combined.
      const re = new RegExp(`(^|[^0-9])${tok}([^0-9a-z]|$)`, "i");
      if (re.test(v)) s += 3;
    } else if (v.includes(tok)) s += 2;
  }
  return s;
}

/**
 * Estimate cost of one createTask. Conservative: when several tiers match equally, the
 * most expensive wins. Returns { credits, usd, unit, tier, quantity, uncertain }.
 */
export function estimate(id, input = {}) {
  const m = getModel(id);
  const p = m.price || {};
  const usdPerCredit = config().kie?.usd_per_credit ?? 0.005;
  const tiers = p.tiers?.length ? p.tiers : p.credits !== undefined ? [{ variant: "default", credits: p.credits, usd: p.usd, unit: p.unit }] : [];
  if (!tiers.length) return { credits: null, usd: null, unit: p.unit || null, tier: null, quantity: null, uncertain: true };
  const tokens = requestTokens(m, input);
  let best = null;
  for (const t of tiers) {
    const s = tierScore(t.variant, tokens);
    if (!best || s > best.s || (s === best.s && t.credits > best.t.credits)) best = { s, t };
  }
  const unit = best.t.unit || p.unit;
  let qty = 1;
  if (/per second/.test(unit)) qty = Number(input.duration ?? input.duration_s ?? m.input_schema?.duration?.default ?? 5);
  else if (/1000 characters/.test(unit)) {
    const text = input.text ?? (input.dialogue || []).map((d) => d.text).join("") ?? "";
    qty = Math.max(1, String(text).length) / 1000;
  } else if (/per image/.test(unit)) qty = Number(input.num_images ?? input.n ?? 1);
  const credits = Number((best.t.credits * qty).toFixed(3));
  return { credits, usd: Number((credits * usdPerCredit).toFixed(4)), unit, tier: best.t.variant, quantity: qty, uncertain: best.s === 0 && tiers.length > 1 };
}

/** Field name that carries reference images for this model (they differ per family). */
export function refField(id) {
  const sch = getModel(id).input_schema || {};
  for (const k of ["image_input", "image_urls", "input_urls", "reference_image_urls", "files_url", "image_url", "input_image", "image", "first_frame_url"]) if (sch[k]) return k;
  return null;
}
