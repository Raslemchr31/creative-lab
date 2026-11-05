// creative-lab :: compiler — (store product × style[s]) → job spec.
//
// A job spec is everything needed to produce one concept in every placement without a human
// writing a prompt: shots with their fidelity rung, the Kie tasks (model, input with symbolic
// references, prompt, cost), the local compositing ops, shoot requests for what must be filmed
// for real, the overlay texts (all from the store + brand kit), ad-copy drafts, and a Lab EDL per
// placement for the Remotion edit. Symbolic references are resolved by the generation runner:
//   "$ref:<slug>#<i>"      approved product photo i (public URL if it has one, else uploaded)
//   "$local:<opId>"        file produced by a local op (fit / composite / pasteback) → uploaded
//   "$task:<taskId>"       selected output of an earlier Kie task
//   "$asset:<shotId>:<placement>"  (EDL only) final asset of a shot, filled at assembly

import fs from "node:fs";
import { config, readJson, labPath, slugify, shortHash, j } from "../util.mjs";
import { getProduct } from "../products/sync.mjs";
import { describe, siblings, loadSpec, familyOf } from "../products/spec.mjs";
import { blendStyles, rungOf } from "../styles.mjs";
import { classifyRef } from "../compose.mjs";
import { estimate, getModel } from "../kie/registry.mjs";
import { buildSlots, hookText, brandKit } from "./slots.mjs";
import * as P from "./prompts.mjs";

let _routing;
export const routing = () => (_routing ??= readJson(labPath("config/routing.json")));

const DIMS = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080] };
const FPS = 30;
const PKEY = (p) => p.replace(":", "x");

const TRANSITIONS = { hard_cut: "cut", jump_cut: "cut", match_cut: "cut", none: "cut", dissolve: "fade", flash: "fade", push: "push", slide: "slide", whip_pan: "slide", zoom_through: "zoom" };
const TEXT_STYLE = { headline: "headline", price_tag: "price_tag", badge_sticker: "badge", pill_labels: "pill", checklist: "checklist", subtitles: "subtitle", countdown: "badge", end_card: null, none: null, review_card: null, arrow_pointer: null, split_compare: null };
const MOTION = { push_in: "push_in", zoom_punch: "push_in", dolly: "push_in", pull_out: "pull_out", pan: "pan_left", orbit: "push_in", turntable: "push_in", static: "none", top_down: "none", tilt: "pull_out", handheld: "push_in", whip: "pan_right", macro_slide: "pan_right" };

/** Pick the route config, honouring --draft overrides. */
function route(name, draft) {
  const r = routing().routes[name];
  if (!r) throw new Error(`routing: unknown route ${name}`);
  if (!draft || !routing().draft?.[name]) return { name, ...r };
  const d = routing().draft[name];
  return { name, ...r, ...d, defaults: { ...(d.model && d.model !== r.model ? {} : r.defaults), ...(d.defaults || {}) } };
}

/** Classify + rank the product's approved reference photos (cached in-memory per compile). */
function productRefs(product) {
  return (product.refs || [])
    .map((r, i) => ({ ...r, i }))
    .filter((r) => r.approved && r.path && fs.existsSync(r.path))
    .map((r) => ({ ...r, kind: r.kind || classifyRef(r.path).kind }));
}

function pickRefs(refs, roles = ["any"], n = 4) {
  const want = new Set(roles);
  let out = [];
  if (want.has("hero")) out.push(...refs.filter((r) => r.role === "hero"));
  if (want.has("alt")) out.push(...refs.filter((r) => r.role === "alt"));
  if (want.has("on_model")) out.push(...refs.filter((r) => r.kind === "scene" || r.role === "on_model"));
  if (want.has("detail")) out.push(...refs.filter((r) => r.role === "detail"));
  if (want.has("packaging")) out.push(...refs.filter((r) => r.role === "packaging"));
  if (want.has("gift")) out.push(...refs.filter((r) => r.role === "gift"));
  if (want.has("in_hand")) out.push(...refs.filter((r) => r.role === "in_hand"));
  if (want.has("any") || !out.length) out.push(...refs);
  out = out.filter((r, i, a) => a.findIndex((x) => x.i === r.i) === i);
  return out.slice(0, n);
}

const refToken = (slug, r) => `$ref:${slug}#${r.i}`;

/**
 * Compile one job.
 * @param {object} o { batchId, jobId, idx, slug, styles: [id | {id,take}], placements, lang, draft }
 */
export function compileJob({ batchId, jobId, idx = 0, slug, styles, placements, lang, draft = false }) {
  const product = getProduct(slug);
  if (!product) throw new Error(`product ${slug} is not synced — run: node cli.mjs product sync`);
  const brand = brandKit();
  const style = blendStyles(styles);
  lang ??= brand.defaults.language;
  placements = (placements?.length ? placements : style.aspects).filter((p) => style.aspects.includes(p) || style.format !== "image");
  if (!placements.length) placements = [style.aspects[0]];
  const spec = loadSpec(slug);
  const desc = describe(slug);
  const sibs = siblings(slug).filter((p) => p.slug !== slug);
  const slots = buildSlots({ product, lang, spec, siblings: sibs });
  if (spec?.display_name?.[lang === "fr" ? "fr" : "ar"]) slots.name = spec.display_name[lang === "fr" ? "fr" : "ar"];
  slots.hook_text = hookText(style, slots);
  const refs = productRefs(product);
  const packshots = refs.filter((r) => r.kind === "packshot");
  const scenes = refs.filter((r) => r.kind === "scene");
  const warnings = [];
  const tasks = [];
  const ops = [];
  const shoot = [];
  const shots = [];
  const assets = {}; // `${shotId}:${placement}` → { kind, from: taskId|opId|refPath, layer }

  const addTask = (t) => {
    const m = getModel(t.model);
    const est = estimate(t.model, t.input);
    const lint = P.promptViolations(t.input.prompt || "", { positiveOnly: !!t.positive_only, productFree: ["plate_still", "broll"].includes(t.route) });
    const id = `${jobId}-${t.shot_id}-${t.route}-${PKEY(t.placement || "any")}-c${t.candidate || 0}`;
    tasks.push({ id, stage: t.stage, shot_id: t.shot_id, route: t.route, placement: t.placement || null, candidate: t.candidate || 0, model: t.model, family: m.family, input: t.input, depends_on: t.depends_on || [], est, prompt_lint: lint, variant: t.variant || null });
    return id;
  };
  const addOp = (o) => {
    const id = `${jobId}-${o.shot_id}-${o.kind}-${PKEY(o.placement || "any")}`;
    if (!ops.find((x) => x.id === id)) ops.push({ id, ...o });
    return id;
  };

  // One cut-out per job (best packshot), shared by every beat that composites.
  let cutoutTask = null;
  const ensureCutout = () => {
    if (cutoutTask) return cutoutTask;
    const ref = packshots[0];
    if (!ref) return null;
    const r = route("cutout", draft);
    cutoutTask = addTask({ stage: "A", shot_id: "cut", route: "cutout", model: r.model, input: { [r.ref_field || "image"]: refToken(slug, ref), ...r.defaults }, depends_on: [] });
    return cutoutTask;
  };

  const plateTasks = (beat, placement, candidates) => {
    const r = route("plate_still", draft);
    const [w, h] = r.sizes?.[placement] || [1152, 2048];
    const prompt = P.platePrompt({ scene: beat.scene, composition: beat.composition, aspect: placement });
    const ids = [];
    for (let c = 0; c < candidates; c++) {
      const isFlux = r.model.startsWith("flux");
      const input = isFlux
        ? { prompt, width: w, height: h, seed: 1000 + Number(shortHash(`${jobId}${beat.id}${placement}${c}`, 6).replace(/[^0-9]/g, "").slice(0, 6) || 7) , ...r.defaults }
        : { prompt, aspect_ratio: placement, ...r.defaults };
      ids.push(addTask({ stage: "A", shot_id: beat.id, route: "plate_still", placement, candidate: c, model: r.model, input, positive_only: !!r.positive_only }));
    }
    return ids;
  };

  const beats = style.beats;
  for (const beat of beats) {
    const strategy = beat.strategy;
    const rung = rungOf(strategy);
    const shot = { id: beat.id, role: beat.role, shot: beat.shot, strategy, rung, dur: style.format === "video" ? beat.dur : null, camera: beat.camera || "static", transition_in: beat.transition_in || "hard_cut", talent: beat.talent || "none", from_style: beat._from_style || style.id, scene: beat.scene || null, overlays: [] };
    shots.push(shot);
    const candidates = (r) => (draft ? routing().draft?.[r]?.candidates ?? 1 : routing().routes[r]?.candidates ?? 1);

    for (const placement of placements) {
      const key = `${beat.id}:${placement}`;
      switch (strategy) {
        case "real_photo":
        case "real_photo_motion": {
          const pool = ["on_model", "lifestyle_scene"].includes(beat.shot) ? (scenes.length ? scenes : refs) : packshots.length ? packshots : refs;
          const ref = pickRefs(pool, beat.ref_roles || ["any"], 1)[0];
          if (!ref) {
            shoot.push({ shot_id: beat.id, what: `${beat.shot} photo of ${desc.text}`, why: "no approved reference photo fits this beat" });
            break;
          }
          const opId = addOp({ kind: "fit", shot_id: beat.id, placement, inputs: { src: ref.path, aspect: placement, mode: ref.kind === "packshot" ? "pad" : "smart" }, depends_on: [] });
          assets[key] = { kind: "image", from: opId, motion: strategy === "real_photo_motion" ? MOTION[beat.camera] || "push_in" : "none" };
          break;
        }
        case "existing_footage":
        case "needs_shoot": {
          if (placement === placements[0]) shoot.push({ shot_id: beat.id, what: `${beat.shot}${beat.talent && beat.talent !== "none" ? ` with ${beat.talent.replace("_", " ")}` : ""} — ${beat.scene || desc.text}`, why: strategy === "needs_shoot" ? "this beat must be filmed for real (FR1/FR3: hands, faces, unboxing, try-on are never generated)" : "uses owner footage", dur: beat.dur || null });
          assets[key] = { kind: "video", from: `shoot:${beat.id}`, pending_shoot: true };
          break;
        }
        case "ai_plate_composite":
        case "ai_plate_harmonize": {
          const cut = ensureCutout();
          if (!cut) {
            warnings.push(`beat ${beat.id}: no packshot reference on a plain background — cannot cut out; falling back to real_photo`);
            const ref = refs[0];
            if (ref) assets[key] = { kind: "image", from: addOp({ kind: "fit", shot_id: beat.id, placement, inputs: { src: ref.path, aspect: placement, mode: "crop" }, depends_on: [] }), motion: MOTION[beat.camera] || "push_in" };
            break;
          }
          const plates = plateTasks(beat, placement, candidates("plate_still"));
          const box = beat.box || (placement === "9:16" ? { x: 0.1, y: 0.25, w: 0.8, h: 0.34 } : { x: 0.12, y: 0.22, w: 0.76, h: 0.58 });
          const comp = addOp({ kind: "composite", shot_id: beat.id, placement, inputs: { plate: `$task:${plates[0]}`, plate_candidates: plates.map((p) => `$task:${p}`), cutout: `$task:${cut}`, box, shadow: true }, depends_on: [cut, ...plates] });
          if (strategy === "ai_plate_composite") {
            assets[key] = { kind: "composite", from: comp, plate: `$task:${plates[0]}`, cutout: `$task:${cut}`, box, motion: MOTION[beat.camera] || "push_in" };
          } else {
            const r = route("harmonize", draft);
            const h = addTask({ stage: "B", shot_id: beat.id, route: "harmonize", placement, model: r.model, input: { prompt: P.harmonizePrompt(desc), [r.ref_field || "image_input"]: [`$local:${comp}`], aspect_ratio: placement, ...r.defaults }, depends_on: [comp] });
            const pb = addOp({ kind: "pasteback", shot_id: beat.id, placement, inputs: { base: `$task:${h}`, cutout: `$task:${cut}`, composite: comp }, depends_on: [h, comp] });
            assets[key] = { kind: "image", from: pb, motion: MOTION[beat.camera] || "push_in" };
          }
          break;
        }
        case "ai_image_edit":
        case "ai_image_compose": {
          const isCompose = strategy === "ai_image_compose";
          const r = route(isCompose ? "image_compose" : "image_edit", draft);
          let refTokens;
          let pieces;
          if (isCompose && (beat.ref_roles || []).includes("family")) {
            const fam = [product, ...sibs].map((p) => ({ p, ref: productRefs(p).find((x) => x.kind === "packshot") || productRefs(p)[0] })).filter((x) => x.ref).slice(0, 6);
            refTokens = fam.map((x) => refToken(x.p.slug, x.ref));
            pieces = fam.map((x) => describe(x.p.slug).text);
            if (fam.length < 2) warnings.push(`beat ${beat.id}: colour-range needs ≥2 colourways in stock, found ${fam.length}`);
          } else {
            const pool = isCompose ? (packshots.length ? packshots : refs) : refs;
            const chosen = pickRefs(pool, beat.ref_roles || ["any"], isCompose ? 6 : 4);
            refTokens = chosen.map((x) => refToken(slug, x));
            pieces = (desc.pieces || []).map((p) => `${desc.colour?.en ? desc.colour.en + " " : ""}${p.en}`);
          }
          if (!refTokens.length) {
            shoot.push({ shot_id: beat.id, what: `reference photo for ${desc.text}`, why: "no approved references" });
            break;
          }
          const aspect = r.aspect_map?.[placement] || placement;
          const prompt = isCompose ? P.composePrompt({ pieces, scene: beat.scene, composition: beat.composition }) : P.editPrompt({ desc, scene: beat.scene, action: beat.motion, shot: beat.shot, talent: beat.talent });
          const ids = [];
          for (let c = 0; c < candidates(isCompose ? "image_compose" : "image_edit"); c++) {
            ids.push(addTask({ stage: "A", shot_id: beat.id, route: r.name, placement, candidate: c, model: r.model, input: { prompt, [r.ref_field]: refTokens, aspect_ratio: aspect, ...r.defaults }, depends_on: [] }));
          }
          if (aspect !== placement) warnings.push(`beat ${beat.id}: ${r.model} has no ${placement}; generating ${aspect} and cropping in the edit`);
          assets[key] = { kind: "image", from: ids[0], candidates: ids, motion: MOTION[beat.camera] || "none" };
          break;
        }
        case "ai_i2v":
        case "ai_r2v": {
          // Video is generated once in 9:16; other placements crop it in Remotion (FR3: one call, one state).
          if (placement !== "9:16" && placements.includes("9:16")) {
            assets[key] = { kind: "video", from_shared: `${beat.id}:9:16` };
            break;
          }
          const isR2v = strategy === "ai_r2v";
          let first = null;
          if (beat.from_beat && assets[`${beat.from_beat}:${placement}`]) {
            const src = assets[`${beat.from_beat}:${placement}`];
            first = src.kind === "composite" || src.kind === "image" ? (src.from.startsWith(`${jobId}-`) && tasks.find((t) => t.id === src.from) ? `$task:${src.from}` : `$local:${src.from}`) : null;
          }
          if (!first) {
            if (isR2v || ["on_model", "lifestyle_scene", "in_hand"].includes(beat.shot)) {
              const ref = scenes[0] || refs[0];
              if (ref) first = `$local:${addOp({ kind: "fit", shot_id: `${beat.id}-ff`, placement, inputs: { src: ref.path, aspect: placement, mode: "crop" }, depends_on: [] })}`;
            } else {
              const cut = ensureCutout();
              if (cut) {
                const plates = plateTasks({ ...beat, id: `${beat.id}-ff` }, placement, 1);
                const comp = addOp({ kind: "composite", shot_id: `${beat.id}-ff`, placement, inputs: { plate: `$task:${plates[0]}`, cutout: `$task:${cut}`, box: placement === "9:16" ? { x: 0.1, y: 0.25, w: 0.8, h: 0.34 } : { x: 0.12, y: 0.2, w: 0.76, h: 0.6 }, shadow: true }, depends_on: [cut, ...plates] });
                first = `$local:${comp}`;
              } else if (refs[0]) first = `$local:${addOp({ kind: "fit", shot_id: `${beat.id}-ff`, placement, inputs: { src: refs[0].path, aspect: placement, mode: "pad" }, depends_on: [] })}`;
            }
          }
          if (!first) {
            shoot.push({ shot_id: beat.id, what: `${beat.shot} clip of ${desc.text}`, why: "no real first frame available (FR1)" });
            break;
          }
          const r = route(isR2v ? "r2v" : "i2v", draft);
          const dur = Math.max(3, Math.min(r.max_duration || 5, Math.round(beat.dur || 5)));
          const input = { ...r.defaults };
          const prompt = isR2v ? P.r2vPrompt({ model: r.model, desc, action: beat.motion }) : P.i2vPrompt({ model: r.model, desc, camera: beat.camera, motion: beat.motion, dur, surface: beat.surface || "the surface" });
          input.prompt = prompt;
          const ff = r.ref_field || "image_urls";
          input[ff] = ff === "image_urls" ? [first] : first;
          if ("duration" in input || r.model.startsWith("kling") || r.model.startsWith("bytedance")) input.duration = dur;
          if (r.model.startsWith("veo")) {
            input.generation_type = "FIRST_AND_LAST_FRAMES_2_VIDEO";
            input.aspect_ratio = "9:16";
            input.duration = [4, 6, 8].reduce((a, b) => (Math.abs(b - dur) < Math.abs(a - dur) ? b : a), 4);
          }
          if (r.model.startsWith("kling") && packshots.length >= 2) {
            input.elements = [{ name: "product", description: `${desc.text}; ignore the background`, element_input_urls: packshots.slice(0, 4).map((x) => refToken(slug, x)) }];
          }
          const deps = [first].filter((x) => x.startsWith("$task:") || x.startsWith("$local:")).map((x) => x.split(":").slice(1).join(":"));
          const ids = [];
          for (let c = 0; c < candidates(isR2v ? "r2v" : "i2v"); c++) ids.push(addTask({ stage: "B", shot_id: beat.id, route: r.name, placement, candidate: c, model: r.model, input: { ...input }, depends_on: deps }));
          assets[key] = { kind: "video", from: ids[0], candidates: ids, first_frame: first };
          break;
        }
        case "ai_t2i": {
          const plates = plateTasks(beat, placement, 1);
          assets[key] = { kind: "image", from: plates[0], motion: MOTION[beat.camera] || "none" };
          break;
        }
        case "ai_t2v": {
          const r = route("broll", draft);
          const id = addTask({ stage: "A", shot_id: beat.id, route: "broll", placement, model: r.model, input: { prompt: P.brollPrompt({ scene: beat.scene, camera: beat.camera }), ...r.defaults, seed: 4242 }, depends_on: [] });
          assets[key] = { kind: "video", from: id };
          break;
        }
        case "graphic":
        default:
          assets[key] = { kind: "fill", color: beat.shot === "end_card" ? brand.palette.ink : brand.palette.cream };
      }
    }

    // Overlays: slot → real text.
    for (const ov of beat.overlays || []) {
      const st = TEXT_STYLE[ov.kind];
      if (!st) continue;
      if (ov.slot === "review" || ov.slot === "question") {
        if (!slots[ov.slot]) {
          warnings.push(`beat ${beat.id}: overlay slot "${ov.slot}" needs real input (never generated) — skipped`);
          continue;
        }
      }
      const text = ov.slot === "hook_text" ? slots.hook_text : slots[ov.slot];
      if (!text && st !== "checklist") {
        warnings.push(`beat ${beat.id}: slot "${ov.slot}" is empty for ${slug} — overlay skipped`);
        continue;
      }
      shot.overlays.push({ slot: ov.slot, style: st, text: st === "checklist" ? null : text, items: st === "checklist" ? [slots.benefit_1, slots.benefit_2, slots.benefit_3].filter(Boolean) : undefined, position: ov.position && ov.position !== "rail" ? ov.position : "upper_third", at: ov.at || 0, emphasis: ov.emphasis || "normal" });
    }
  }

  // ── EDL per placement ──────────────────────────────────────────────────────
  const edl = {};
  for (const placement of placements) {
    const [W, H] = DIMS[placement] || DIMS["9:16"];
    const sz = brand.safe_zones[placement] || brand.safe_zones["9:16"];
    const safe = placement === "9:16" ? { top: sz.content_y[0], bottom: sz.content_y[1] + 100, side: 65 } : { top: sz.content_y[0], bottom: sz.content_y[1], side: 60 };
    const segments = [];
    let cursor = 0;
    for (const s of shots) {
      const a = assets[`${s.id}:${placement}`] || (assets[`${s.id}:${placement}`]?.from_shared ? assets[assets[`${s.id}:${placement}`].from_shared] : null);
      const asset = a?.from_shared ? assets[a.from_shared] : a;
      const frames = style.format === "video" ? Math.max(1, Math.round((s.dur || 1) * FPS)) : 1;
      const trans = TRANSITIONS[s.transition_in] || "cut";
      const layers = [{ kind: "fill", color: brand.palette.cream }];
      if (asset?.kind === "composite") {
        layers.push({ kind: "image", src: `$asset:${s.id}:${placement}:plate`, fit: "cover", motion: { type: "none", amount: 0 } });
        layers.push({ kind: "cutout", src: `$asset:${s.id}:${placement}:cutout`, box: asset.box, shadow: true, motion: { type: asset.motion || "push_in", amount: 0.05 } });
      } else if (asset?.kind === "image") layers.push({ kind: "image", src: `$asset:${s.id}:${placement}`, fit: "cover", motion: { type: asset.motion || "none", amount: 0.06 } });
      else if (asset?.kind === "video") layers.push({ kind: "video", src: `$asset:${s.id}:${a?.from_shared ? "9:16" : placement}`, trimStart: 0, fit: "cover", bg: brand.palette.cream });
      else if (asset?.kind === "fill") layers.push({ kind: "fill", color: asset.color });
      const overlap = trans === "cut" || !segments.length ? 0 : 8;
      const from = Math.max(0, cursor - overlap);
      segments.push({ id: s.id, from, frames: frames + overlap, transitionIn: { kind: segments.length ? trans : "cut", frames: overlap, dir: "L" }, layers, texts: s.overlays.map((o) => ({ ...o, until: null })) });
      cursor = from + frames + overlap;
    }
    const ecDur = style.end_card?.enabled && style.format === "video" ? Math.round((style.end_card.dur || 2) * FPS) : 0;
    const railSlots = style.rail?.enabled ? style.rail.slots?.length ? style.rail.slots : ["price", "strike", "cod_delivery"] : [];
    edl[placement] = {
      version: 1,
      id: `${batchId}/${jobId}/${PKEY(placement)}`,
      width: W,
      height: H,
      fps: FPS,
      durationInFrames: style.format === "video" ? cursor + ecDur : 1,
      lang: lang === "fr" ? "fr" : "ar",
      dir: lang === "fr" ? "ltr" : "rtl",
      theme: { ink: brand.palette.ink, paper: brand.palette.cream, panel: brand.palette.panel, accent: brand.palette.white, smoke: brand.palette.smoke },
      safe,
      segments,
      rail: { enabled: railSlots.length > 0, fromFrame: style.rail?.from_frame0 === false ? Math.round(FPS * 1.5) : 0, y: sz.rail_y[0], h: sz.rail_y[1] - sz.rail_y[0], items: railSlots.map((k) => ({ slot: k, text: slots[k] })).filter((x) => x.text) },
      endCard: { enabled: ecDur > 0, from: cursor, frames: ecDur, lines: (style.end_card?.slots?.length ? style.end_card.slots : ["name", "price", "strike", "cta", "site"]).map((k) => ({ slot: k, text: slots[k] })).filter((x) => x.text) },
      audio: { src: null, volume: 0.5, fadeOutFrames: 20 },
    };
  }

  // ── copy drafts (one language; validated per field in preflight) ───────────
  const isFr = lang === "fr";
  const lines = (arr) => arr.filter(Boolean).join("\n");
  // Drop lines that repeat what an earlier line already said (hook = bundle list = benefit 1 on packs).
  const norm = (t) => String(t || "").replace(/[^\p{L}\p{N}]+/gu, "");
  const dedupe = (arr) => {
    const seen = [];
    return arr.filter((line) => {
      const core = norm(line);
      if (!core || seen.some((x) => x === core || (core.length > 6 && x.includes(core)))) return false;
      seen.push(core);
      return true;
    });
  };
  const primary = [
    lines(dedupe([
      `✨ ${slots.hook_text}`,
      slots.bundle_items ? `${isFr ? "Le set" : "الطقم"}: ${slots.bundle_items}` : null,
      ...[slots.benefit_1, slots.benefit_2, slots.benefit_3].filter(Boolean).map((b) => `✔️ ${b}`),
      slots.gift ? `🎁 ${slots.gift}` : null,
      `💰 ${slots.price}${slots.strike ? (isFr ? ` au lieu de ${slots.strike}` : ` بدل ${slots.strike}`) : ""}`,
      `🚚 ${slots.cod_delivery}`,
      `🔍 ${slots.inspect}`,
      `👉 ${slots.cta}`,
    ])),
    lines([`${slots.name} — ${slots.price}`, slots.colours ? `🎨 ${slots.colours}` : null, `🚚 ${slots.cod_delivery}`, `👉 ${slots.cta}`]),
  ];
  const headlines = [`${slots.name} ${isFr ? "à" : "بـ"} ${slots.price}`, slots.hook_text].filter((h, i, a) => h && a.indexOf(h) === i);
  const copy = { language: lang, primary, headline: headlines, description: [slots.cod_delivery], cta_type: "SHOP_NOW", url_tags: "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.id}}", link: product.url };

  const cost = tasks.reduce((acc, t) => {
    acc.credits += t.est.credits || 0;
    acc.usd += t.est.usd || 0;
    acc.by_route[t.route] = Number(((acc.by_route[t.route] || 0) + (t.est.usd || 0)).toFixed(4));
    if (t.est.uncertain) acc.uncertain = true;
    return acc;
  }, { credits: 0, usd: 0, by_route: {}, uncertain: false });
  cost.credits = Number(cost.credits.toFixed(2));
  cost.usd = Number(cost.usd.toFixed(3));

  const first = shots[0];
  const distinct_key = {
    product: familyOf(slug),
    format: style.format,
    archetype: style.archetype,
    hook_type: style.hook_type,
    first_subject: first?.shot || null,
    setting: slugify(first?.scene || "studio", 24),
    talent: shots.find((s) => s.talent && s.talent !== "none")?.talent || "none",
    on_image_text: slots.hook_text,
  };

  return {
    version: 1,
    job_id: jobId,
    batch_id: batchId,
    idx,
    compiled_at: new Date().toISOString(),
    draft,
    product: { slug, family: familyOf(slug), name: product.name, price: product.price, compareAt: product.compareAt ?? null, freeGift: product.freeGift || null, url: product.url, category: product.category, inStock: product.inStock !== false, refs: refs.map((r) => ({ i: r.i, path: r.path, url: r.url, kind: r.kind, role: r.role })) },
    descriptor: desc,
    has_spec: !!spec,
    style: { id: style.id, name: style.name, format: style.format, archetype: style.archetype, hook_type: style.hook_type, angle: style.angle, blended_from: style.blended_from || [style.id], duration_s: style.duration_s ?? null },
    lang,
    placements,
    slots,
    shots,
    tasks,
    ops,
    shoot_requests: shoot,
    assets,
    edl,
    copy,
    cost,
    distinct_key,
    warnings,
  };
}

export const _test = { pickRefs, route, DIMS };
