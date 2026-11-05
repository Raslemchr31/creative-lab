// creative-lab :: briefs — "reference ad (or style) + store product + format" → a short code (FL-7K2QM).
// The owner picks in the UI (or CLI), gets the code, and hands it to Claude. Claude runs
// `node cli.mjs brief context --code FL-7K2QM`, reads the reference evidence + product photos, and writes a
// ready-to-paste prompt for the video tool (Google Flow today), saved with `brief prompt`.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { all, get, run } from "./db.mjs";
import { config, dataPath, ensureDir, j, pj, nowIso, LabError, readJson, labPath } from "./util.mjs";
import { getProduct } from "./products/sync.mjs";
import { loadSpec, familyOf, siblings } from "./products/spec.mjs";
import { getDna } from "./analyze.mjs";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L — readable over WhatsApp
export const CODE_RE = /^FL-[2-9A-HJKMNP-Z]{5}$/;

export const TOOLS = {
  flow: {
    label: "Google Flow",
    models: ["veo-3.1-fast", "veo-3.1-quality", "veo-3.1-lite", "omni-flash"],
    modes: ["auto", "ingredients", "frames", "text"],
    aspects: ["9:16", "16:9"],
    durations: [4, 6, 8, 10],
  },
};

export function newCode() {
  for (let t = 0; t < 20; t++) {
    const bytes = crypto.randomBytes(5);
    const code = "FL-" + [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
    if (!get("SELECT 1 FROM briefs WHERE code=?", code)) return code;
  }
  throw new LabError("CODE", "could not allocate a unique code");
}

export function normalizeCode(c) {
  return String(c || "").trim().toUpperCase().replace(/^FL(?!-)/, "FL-");
}

/**
 * @param {object} o { source_kind: 'ad'|'style', source_id, product_slug, aspect, duration_s, model, mode, notes }
 */
export function createBrief(o = {}) {
  const kind = o.source_kind === "style" ? "style" : "ad";
  const sid = String(o.source_id || "").trim();
  if (!sid) throw new LabError("ARGS", "pick a reference ad (or style)");
  if (kind === "ad" && !get("SELECT 1 FROM ads WHERE ad_archive_id=?", sid)) throw new LabError("NOT_FOUND", `ad ${sid} is not in the library`);
  if (kind === "style" && !get("SELECT 1 FROM styles WHERE id=?", sid)) throw new LabError("NOT_FOUND", `style ${sid} not found`);
  const slug = String(o.product_slug || "").trim();
  const p = getProduct(slug);
  if (!p) throw new LabError("NOT_FOUND", `product ${slug} not synced`);
  const T = TOOLS.flow;
  const aspect = T.aspects.includes(o.aspect) ? o.aspect : "9:16";
  const model = T.models.includes(o.model) ? o.model : "veo-3.1-fast";
  const maxDur = model === "omni-flash" ? 10 : 8;
  const duration = Math.min(maxDur, T.durations.includes(Number(o.duration_s)) ? Number(o.duration_s) : 8);
  const mode = T.modes.includes(o.mode) ? o.mode : "auto";
  // Darija voice-over: "auto" = only if the reference has speech; "on" = always write one; "off" = never.
  const vo = ["auto", "on", "off"].includes(o.vo) ? o.vo : "auto";
  const code = newCode();
  const notes = o.notes ? String(o.notes).slice(0, 1000) : null;
  run(
    "INSERT INTO briefs(code, source_kind, source_id, product_slug, tool, aspect, duration_s, lang, notes, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    code, kind, sid, slug, "flow", aspect, duration, "none", j({ text: notes, model, mode, vo }), "new", nowIso(), nowIso(),
  );
  return getBrief(code);
}

export function getBrief(code) {
  const r = get("SELECT * FROM briefs WHERE code=?", normalizeCode(code));
  if (!r) return null;
  const n = pj(r.notes, {}) || {};
  return { ...r, notes: n.text || null, model: n.model || "veo-3.1-fast", mode: n.mode || "auto", vo: n.vo || "auto" };
}

export function listBriefs(limit = 100) {
  return all("SELECT code FROM briefs ORDER BY created_at DESC LIMIT ?", limit).map((r) => getBrief(r.code));
}

export function savePrompt(code, text) {
  const b = getBrief(code);
  if (!b) throw new LabError("NOT_FOUND", `brief ${code}`);
  run("UPDATE briefs SET prompt=?, status='prompted', updated_at=? WHERE code=?", String(text), nowIso(), b.code);
  const dir = ensureDir(dataPath("briefs", b.code));
  fs.writeFileSync(path.join(dir, "PROMPT.md"), String(text));
  return getBrief(b.code);
}

function daysBetween(a, b) {
  return a ? Math.round(((b || Date.now() / 1000) - a) / 86400) : null;
}

/** Everything Claude needs to write the prompt, as JSON + a readable CONTEXT.md under data/briefs/<code>/. */
export function briefContext(code) {
  const b = getBrief(code);
  if (!b) throw new LabError("NOT_FOUND", `brief ${code} — check the code`);
  const dir = ensureDir(dataPath("briefs", b.code));
  let reference;
  if (b.source_kind === "ad") {
    const a = get("SELECT * FROM ads WHERE ad_archive_id=?", b.source_id);
    const sb = pj(a.score_breakdown, {});
    const media = all("SELECT role, idx, local_path, mime, width, height, duration FROM media WHERE owner_kind='ad' AND owner_id=? AND status='ok' ORDER BY role, idx", a.ad_archive_id);
    const evDir = dataPath("evidence", a.ad_archive_id);
    const ev = fs.existsSync(path.join(evDir, "evidence.json")) ? readJson(path.join(evDir, "evidence.json"), null) : null;
    const pageSeg = get("SELECT segment, brand FROM pages WHERE page_id=?", a.page_id) || {};
    reference = {
      kind: "ad",
      ad_id: a.ad_archive_id,
      library_url: `https://www.facebook.com/ads/library/?id=${a.ad_archive_id}`,
      page: a.page_name,
      segment: pageSeg.segment || "local",
      brand: pageSeg.brand || null,
      format: sb.format || a.display_format,
      days_active: Math.round(sb.days_active ?? daysBetween(a.start_date, a.is_active ? null : a.end_date) ?? 0),
      score: a.score,
      variants_in_cluster: a.cluster_size,
      title: a.title,
      body: a.body,
      media: media.map((m) => ({ ...m, local_path: m.local_path })),
      evidence: ev ? { dir: evDir, md: path.join(evDir, "EVIDENCE.md"), files: fs.readdirSync(evDir).filter((f) => /\.(png|jpg|md|json)$/i.test(f)) } : null,
      // Scene-by-scene skeleton for the recreation: every detected shot with its keyframe, plus the audio picture.
      video: ev ? videoBreakdown(ev, evDir) : null,
      dna: getDna(a.ad_archive_id) || null,
    };
  } else {
    const s = get("SELECT * FROM styles WHERE id=?", b.source_id);
    reference = { kind: "style", style_id: s.id, card: pj(s.json, {}) };
  }
  const p = getProduct(b.product_slug);
  const spec = loadSpec(b.product_slug);
  const sibs = siblings(b.product_slug).map((x) => ({ slug: x.slug, colour: x.colors?.[0]?.name?.fr || null, in_stock: x.inStock }));
  const product = {
    slug: p.slug,
    name: p.name,
    family: familyOf(p.slug),
    price_dzd: p.price,
    compare_at_dzd: p.compareAt || null,
    free_gift: p.freeGift || null,
    colours: (p.colors || []).map((c) => ({ ar: c.name?.ar, fr: c.name?.fr, hex: c.hex })),
    in_stock: p.inStock,
    store_url: p.url,
    photos: (p.refs || []).map((r, i) => ({ idx: i, role: r.role, kind: r.kind || null, url: r.url, local_path: r.path, approved: r.approved !== false })).filter((r) => r.approved),
    spec: spec || null,
    other_colourways: sibs,
  };
  const brand = readJson(labPath("config/brand-sirine.json"), {});
  const ctx = { brief: b, tool: { name: "Google Flow", ...TOOLS.flow }, reference, product, brand: { name: brand.name || "SIRINE", never: brand.never || [] } };
  fs.writeFileSync(path.join(dir, "context.json"), JSON.stringify(ctx, null, 2));
  fs.writeFileSync(path.join(dir, "CONTEXT.md"), contextMd(ctx));
  return { ...ctx, dir };
}

const HALLUCINATION = /^\s*[[(](music|musique|applause|silence|موسيقى)[\])]\s*$|amara\.org|sous-titres|اشتركوا|subscribe|thanks for watching|merci d'avoir regardé|موسيقى/i;

/** Shots (start/end/keyframe) + whether the ad has real speech (VO) from the evidence pack. */
function videoBreakdown(ev, evDir) {
  const item = (ev.items || []).find((x) => x.kind === "video");
  if (!item) return null;
  const vdir = path.join(evDir, `video-${item.idx ?? 0}`);
  const an = readJson(path.join(vdir, "analysis.json"), {}) || {};
  const keyframes = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => /^video-\d+\.shot\d+_.*\.jpg$/.test(f)).sort() : [];
  const shots = (an.shots || []).map((s, i) => ({ n: s.i ?? i + 1, start: Number(s.start.toFixed(2)), end: Number(s.end.toFixed(2)), dur: Number(s.dur.toFixed(2)), keyframe: keyframes[i] ? path.join(vdir, keyframes[i]).replace(/\\/g, "/") : null }));
  const lines = (item.transcript || []).filter((t) => t.text && !HALLUCINATION.test(t.text));
  return {
    duration: item.duration,
    aspect: item.aspect,
    shots,
    sheet: item.sheet,
    hook_strip: item.hook_strip,
    has_audio: !!item.has_audio,
    speech: lines.length > 0 ? "likely" : "none_detected",
    transcript_lead: lines,
    transcript_model: item.transcript_model || null,
  };
}

function contextMd({ brief: b, reference: r, product: p }) {
  const L = [];
  L.push(`# Brief ${b.code} — ${b.tool} · ${b.aspect} · ${b.duration_s}s per scene · model ${b.model} · mode ${b.mode} · Darija VO ${b.vo}`);
  L.push("", b.notes ? `Owner notes: ${b.notes}` : "Owner notes: —", "");
  if (r.kind === "ad") {
    L.push(`## Reference ad ${r.ad_id} (${r.segment}${r.brand ? ` · ${r.brand}` : ""})`);
    L.push(`${r.page} · ${r.format} · ${r.days_active} days active · score ${r.score} · ${r.library_url}`);
    if (r.title) L.push(`Title: ${r.title}`);
    if (r.body) L.push(`Copy: ${String(r.body).replace(/\s+/g, " ").slice(0, 600)}`);
    L.push(`Media: ${r.media.map((m) => m.local_path).join(" · ") || "none downloaded"}`);
    L.push(r.evidence ? `Evidence: ${r.evidence.md} (contact sheet + hook strip in ${r.evidence.dir})` : "Evidence: none — build it: node cli.mjs analyze evidence --ids " + r.ad_id);
    L.push(r.dna ? "DNA: analysed (see context.json → reference.dna)" : "DNA: not analysed yet");
    if (r.video) {
      const v = r.video;
      L.push("", `### Shot list (${v.shots.length} shots · ${Number(v.duration).toFixed(1)} s · ${v.aspect}) — recreate scene by scene`);
      for (const s of v.shots) L.push(`- S${s.n}  ${s.start.toFixed(2)}–${s.end.toFixed(2)} s (${s.dur.toFixed(2)} s)  keyframe: ${s.keyframe || "—"}`);
      L.push(`Contact sheet: ${v.sheet} · hook strip: ${v.hook_strip}`);
      L.push(`Speech: ${v.speech}${v.transcript_lead.length ? " → " + v.transcript_lead.map((t) => `[${t.t}s] ${t.text}`).join(" ") : ""} (ASR ${v.transcript_model || "?"}; a lead only)`);
    }
  } else {
    L.push(`## Reference style ${r.style_id}`);
  }
  L.push("", `## Product ${p.slug} — ${p.name?.ar || ""} / ${p.name?.fr || ""}`);
  L.push(`${p.price_dzd} DA${p.compare_at_dzd ? ` (was ${p.compare_at_dzd})` : ""} · ${p.in_stock ? "in stock" : "OUT OF STOCK"} · ${p.store_url}`);
  if (p.free_gift) L.push(`Gift: ${JSON.stringify(p.free_gift)}`);
  if (p.spec?.pieces) L.push(`Pieces: ${p.spec.pieces.map((x) => x.en).join(" + ")}`);
  L.push("Photos (paste these into Flow as ingredients/frames):");
  for (const ph of p.photos) L.push(`- [${ph.role}${ph.kind ? `/${ph.kind}` : ""}] ${ph.url}  (local: ${ph.local_path})`);
  return L.join("\n") + "\n";
}
