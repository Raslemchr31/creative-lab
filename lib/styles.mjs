// creative-lab :: style cards (reusable, product-agnostic recipes distilled from DNA).

import { all, get, upsert } from "./db.mjs";
import { nowIso, j, pj, LabError } from "./util.mjs";
import { assertValid, taxonomy } from "./schema.mjs";

export function saveStyle(style, { status } = {}) {
  if (status) style.status = status;
  assertValid("style", style);
  // Semantic checks the schema can't express.
  const ids = new Set();
  for (const b of style.beats) {
    if (ids.has(b.id)) throw new LabError("STYLE", `duplicate beat id "${b.id}"`);
    ids.add(b.id);
    if (b.from_beat && !ids.has(b.from_beat)) throw new LabError("STYLE", `beat ${b.id}: from_beat "${b.from_beat}" must reference an EARLIER beat`);
    if (style.format === "video" && !(b.dur > 0)) throw new LabError("STYLE", `beat ${b.id}: video beats need dur`);
    if (["ai_t2i", "ai_t2v"].includes(b.strategy) && !["text_card", "end_card", "lifestyle_scene"].includes(b.shot)) {
      throw new LabError("STYLE", `beat ${b.id}: ${b.strategy} may only make product-free plates/b-roll (FR1) — shot "${b.shot}" shows the product`);
    }
  }
  const prev = get("SELECT created_at FROM styles WHERE id=?", style.id);
  upsert("styles", "id", { id: style.id, name: style.name, status: style.status || "draft", json: j(style), refs: j(style.refs || []), created_at: prev?.created_at || nowIso(), updated_at: nowIso() });
  return getStyle(style.id);
}

export function getStyle(id) {
  const r = get("SELECT * FROM styles WHERE id=?", id);
  if (!r) return null;
  return { ...pj(r.json), status: r.status, _meta: { created_at: r.created_at, updated_at: r.updated_at } };
}

export function listStyles() {
  return all("SELECT * FROM styles ORDER BY status='approved' DESC, updated_at DESC").map((r) => {
    const s = pj(r.json, {});
    return { id: r.id, name: r.name, status: r.status, summary: s.summary, format: s.format, aspects: s.aspects, archetype: s.archetype, hook_type: s.hook_type, angle: s.angle, refs: s.refs || [], beats: s.beats || [], duration_s: s.duration_s ?? null };
  });
}

/** Rung of a strategy (from taxonomy). */
export function rungOf(strategy) {
  return taxonomy().generation_strategies.find((g) => g.id === strategy)?.rung || "?";
}

/**
 * Blend several styles into one recipe: hook beats from the first style (or explicit `take` lists),
 * the body from the following ones, end card from the last. Settings (rail/copy/audio) from the first.
 * items: [{ id, take?: [beat ids] }]
 */
export function blendStyles(items) {
  if (!items.length) throw new LabError("STYLE", "no styles given");
  const loaded = items.map((it) => {
    const s = getStyle(typeof it === "string" ? it : it.id);
    if (!s) throw new LabError("NOT_FOUND", `style ${typeof it === "string" ? it : it.id}`);
    return { s, take: typeof it === "object" ? it.take : null };
  });
  if (loaded.length === 1 && !loaded[0].take) return { ...loaded[0].s, blended_from: [loaded[0].s.id] };
  const beats = [];
  loaded.forEach(({ s, take }, i) => {
    let pick = take ? s.beats.filter((b) => take.includes(b.id)) : null;
    if (!pick) {
      if (i === 0) pick = s.beats.filter((b) => b.role === "hook" || b.role === "reveal").slice(0, 2);
      else pick = s.beats.filter((b) => b.role !== "hook" && b.role !== "end_card");
    }
    for (const b of pick) {
      const id = beats.some((x) => x.id === b.id) ? `${b.id}_${i}` : b.id;
      beats.push({ ...b, id, from_beat: b.from_beat && beats.some((x) => x.id === b.from_beat) ? b.from_beat : null, _from_style: s.id });
    }
  });
  const base = loaded[0].s;
  const last = loaded[loaded.length - 1].s;
  const formats = new Set(loaded.map((x) => x.s.format));
  return {
    ...base,
    id: `blend-${loaded.map((x) => x.s.id).join("+")}`.slice(0, 60),
    name: `Blend: ${loaded.map((x) => x.s.name).join(" + ")}`,
    format: formats.has("video") ? "video" : base.format,
    beats,
    end_card: last.end_card || base.end_card,
    duration_s: beats.reduce((s, b) => s + (b.dur || 0), 0) + (last.end_card?.enabled ? last.end_card.dur || 2 : 0),
    blended_from: loaded.map((x) => x.s.id),
  };
}
