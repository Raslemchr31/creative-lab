// creative-lab :: product family + visual spec (what prompts and QA need to know about a SKU).
//
// Store data has names/prices/colours but not "2 gold rings, zip top, croco emboss". That lives in
// config/product-specs/<family>.json, written by Claude from the reference photos (lab skill step
// "product spec") and confirmed by the owner. Without a spec the compiler falls back to a generic
// descriptor and preflight WARNs that the hardware/logo QA gate can't be strict.

import fs from "node:fs";
import { labPath, readJson } from "../util.mjs";
import { listProducts, getProduct } from "./sync.mjs";

const COLOUR_WORDS = {
  noir: "black", noire: "black", marron: "brown", rose: "pink", beige: "beige", bleu: "blue", bordeaux: "burgundy",
  rouge: "red", nude: "nude pink", camel: "camel", taupe: "taupe", tabac: "tobacco brown", blanc: "white", vert: "green",
  grenad: "garnet red", maron: "brown", kaki: "khaki", gris: "grey", jaune: "yellow", argent: "silver", or: "gold",
};
const COLOUR_TOKENS = new Set(Object.keys(COLOUR_WORDS));

/** "pack-hobo-noire" → "pack-hobo"; "sac-de-sel-gm-rose" → "sac-de-sel-gm". */
export function familyOf(slug) {
  const parts = String(slug).split("-");
  while (parts.length > 1 && (COLOUR_TOKENS.has(parts[parts.length - 1]) || /^[a-z0-9]{5}$/.test(parts[parts.length - 1]) && /\d/.test(parts[parts.length - 1]))) parts.pop();
  return parts.join("-");
}

export function colourOf(slug, product) {
  const last = String(slug).split("-").pop();
  const fr = product?.colors?.[0]?.name?.fr?.toLowerCase();
  return { token: COLOUR_TOKENS.has(last) ? last : null, en: COLOUR_WORDS[last] || (fr && COLOUR_WORDS[fr]) || fr || null, hex: product?.colors?.[0]?.hex || null };
}

/** All in-stock colourways of the same family (for colour-range styles). */
export function siblings(slug, { inStockOnly = true } = {}) {
  const fam = familyOf(slug);
  return listProducts({ inStockOnly }).filter((p) => familyOf(p.slug) === fam);
}

export function specPath(family) {
  return labPath(`config/product-specs/${family}.json`);
}

export function loadSpec(slugOrFamily) {
  const fam = familyOf(slugOrFamily);
  const f = specPath(fam);
  return fs.existsSync(f) ? readJson(f) : null;
}

const CATEGORY_EN = { sacs: "handbag", chaussures: "shoes", packs: "handbag set" };

/**
 * English visual descriptor used inside generation prompts (never contains brand, price or offer).
 * With a spec: "black croco-embossed half-moon shoulder bag with a gold ring at the strap base".
 */
export function describe(slug) {
  const p = getProduct(slug);
  if (!p) throw new Error(`product ${slug} not synced`);
  const spec = loadSpec(slug);
  const col = colourOf(slug, p);
  const cw = spec?.colourways?.[slug] || {};
  const colourEn = cw.name_en || col.en || "";
  if (spec?.pieces?.length) {
    const pieces = spec.pieces.map((pc) => `${colourEn && pc.same_colour !== false ? `${colourEn} ` : ""}${pc.en}${pc.hardware ? ` (${pc.hardware})` : ""}`);
    return { text: pieces.join(" + "), pieces: spec.pieces, colour: { en: colourEn, hex: cw.hex || col.hex }, spec: true, family: familyOf(slug) };
  }
  const kind = CATEGORY_EN[p.category] || "product";
  return { text: `${colourEn ? `${colourEn} ` : ""}${kind}`.trim(), pieces: [{ id: "main", en: kind }], colour: { en: colourEn, hex: col.hex }, spec: false, family: familyOf(slug) };
}
