// creative-lab :: overlay/copy slots — every word on screen comes from the store product + brand kit,
// never from a model (LP parity is a hard rule). Missing facts return null and preflight flags them.

import { readJson, labPath } from "../util.mjs";

let _brand;
export function brandKit(id = "sirine") {
  return (_brand ??= readJson(labPath(`config/brand-${id}.json`)));
}

/** 4200 → "4,200" (Western digits, thousands comma — the house price format). */
export function fmtNumber(n) {
  return Math.round(Number(n)).toLocaleString("en-US");
}

export function fmtPrice(n, lang) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  const b = brandKit();
  return lang === "fr" ? `${fmtNumber(n).replace(/,/g, " ")} ${b.offer_lines.fr.currency}` : `${fmtNumber(n)} ${b.offer_lines["ar-DZ"].currency}`;
}

/** Strip the trailing colour from a store name: "طقم كروكو سيرين — أسود" → "طقم كروكو سيرين". */
export function cleanName(name) {
  return String(name || "")
    .replace(/\s*[—–-]\s*[^—–-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const langKey = (lang) => (lang === "fr" ? "fr" : "ar");

/**
 * Build every slot for one product in one language.
 * @param {object} o { product, lang, spec, siblings }
 */
export function buildSlots({ product, lang = "ar-DZ", spec = null, siblings = [] }) {
  const b = brandKit();
  const L = b.offer_lines[lang === "fr" ? "fr" : "ar-DZ"];
  const k = langKey(lang);
  const name = cleanName(product.name?.[k] || product.name?.ar || product.name?.fr);
  const fromStore = (product.details?.[k] || []).map((d) => String(d).trim()).filter(Boolean);
  // Store details are empty for several packs (hobo, tendance, classique, djine-rose): fall back to the
  // owner-confirmed product spec benefits rather than leaving the benefit slots blank.
  const details = fromStore.length ? fromStore : (spec?.benefits?.[k] || []).map((d) => String(d).trim()).filter(Boolean);
  const colours = [...new Set([product, ...siblings].map((p) => p.colors?.[0]?.name?.[k]).filter(Boolean))];
  const pieces = (spec?.pieces || []).map((p) => (k === "fr" ? p.fr || p.en : p.ar)).filter(Boolean);
  let gift = product.freeGift ? product.freeGift[k] || product.freeGift.ar || product.freeGift.fr : null;
  // Store gift text is sometimes Latin-only in the Arabic field ("trousse offerte" on pack-classique). In an
  // ar-DZ creative that mixes languages, so name the gift from the spec's gift piece instead.
  if (gift && k === "ar" && !/[\u0600-\u06FF]/.test(gift)) {
    const gp = (spec?.pieces || []).find((p) => p.gift && p.ar);
    gift = gp ? gp.ar : null;
  }
  return {
    name: name || null,
    price: fmtPrice(product.price, lang),
    strike: product.compareAt && product.compareAt > product.price ? fmtPrice(product.compareAt, lang) : null,
    cod: L.cod,
    delivery: L.delivery,
    cod_delivery: L.cod_delivery,
    inspect: L.inspect,
    cta: L.cta,
    cta_message: L.cta_message,
    new_badge: L.new,
    gift: gift ? (new RegExp(L.gift, "i").test(gift) ? gift : `${L.gift}: ${gift}`) : null,
    gift_raw: gift,
    colours: colours.length > 1 ? colours.join(" · ") : null,
    colours_count: colours.length,
    bundle_items: pieces.length > 1 ? pieces.join(" + ") : null,
    benefit_1: details[0] || null,
    benefit_2: details[1] || null,
    benefit_3: details[2] || null,
    site: b.site,
    phone: b.phone_whatsapp,
    kicker: k === "fr" ? `${b.origin.fr} · ${L.delivery}` : `${b.origin.ar} · ${L.delivery}`,
    question: null, // only from an explicit brief — never invented
    review: null, // only real, consented reviews — never generated
  };
}

/** Fill "{name} بـ {price} فقط" style patterns; returns null if any slot is missing. */
export function fillPattern(pattern, slots) {
  let missing = false;
  const out = String(pattern).replace(/\{(\w+)\}/g, (_, key) => {
    const v = slots[key];
    if (v === null || v === undefined || v === "") {
      missing = true;
      return "";
    }
    return v;
  });
  return missing ? null : out.replace(/\s+/g, " ").trim();
}

export function hookText(style, slots, maxChars = 42) {
  for (const p of style.copy?.hook_patterns || []) {
    const t = fillPattern(p, slots);
    if (t && t.length <= maxChars) return t;
  }
  return slots.name;
}
