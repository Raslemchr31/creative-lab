// creative-lab :: product sync from the SIRINE store.
//
// Primary source: the storefront's Turso DB (full fidelity: Arabic names, every
// colour, free gift, badge). Read-only SELECT; creds are read in-process from the
// storefront's .env.turso.prod and never printed or stored.
// Fallback: the public Meta catalog feed /feed/meta.xml (no creds; French title,
// first colour only, no gift). Product photos are downloaded locally so vision QA
// can compare generations against the real product, and their public URLs are kept
// as model reference inputs.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { all, get, run, tx, upsert } from "../db.mjs";
import { config, labPath, nowIso, j, pj, LabError, ensureDir, dataPath } from "../util.mjs";
import { downloadOne, mapLimit } from "../collector/media.mjs";
import { probe } from "../probe.mjs";

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const abs = (u, site) => (!u ? null : /^https?:\/\//i.test(u) ? u : `${site.replace(/\/+$/, "")}/${String(u).replace(/^\/+/, "")}`);

/** Normalize a DB row (snake_case columns) into the lab's Product shape. */
export function productFromRow(r, site) {
  const json = (v, d) => (typeof v === "string" ? pj(v, d) : v ?? d);
  const images = json(r.images, []).filter(Boolean).map((u) => abs(u, site));
  return {
    slug: r.slug,
    name: { ar: r.name_ar || r.nameAr || "", fr: r.name_fr || r.nameFr || "" },
    category: r.category,
    gender: r.gender || null,
    price: Number(r.price),
    compareAt: r.compare_at ?? r.compareAt ?? null,
    description: { ar: r.desc_ar || r.descAr || "", fr: r.desc_fr || r.descFr || "" },
    details: { ar: json(r.details_ar ?? r.detailsAr, []), fr: json(r.details_fr ?? r.detailsFr, []) },
    images,
    colors: json(r.colors, []),
    sizes: json(r.sizes, null),
    inStock: r.in_stock === undefined ? r.inStock !== false && r.inStock !== 0 : !!Number(r.in_stock),
    badge: r.badge_ar || r.badge_fr ? { ar: r.badge_ar || "", fr: r.badge_fr || "" } : null,
    freeGift: r.free_gift_ar || r.free_gift_fr ? { ar: r.free_gift_ar || r.free_gift_fr || "", fr: r.free_gift_fr || "" } : null,
    freeGiftImage: abs(r.free_gift_image || r.freeGiftImage, site),
    url: config().store.product_url_template.replace("{slug}", r.slug),
    sortOrder: r.sort_order ?? null,
  };
}

export async function fetchFromTurso() {
  const st = config().store;
  if (!fs.existsSync(st.storefront_package_json)) throw new LabError("STORE", `storefront not found at ${st.storefront_package_json}`);
  const env = readEnvFile(st.turso_env_file);
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new LabError("STORE", `Turso creds missing in ${st.turso_env_file}`);
  const req = createRequire(st.storefront_package_json);
  const { createClient } = req("@libsql/client");
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  try {
    const rs = await client.execute("SELECT * FROM products ORDER BY sort_order, id");
    return rs.rows.map((r) => productFromRow({ ...r }, st.site_url));
  } finally {
    client.close?.();
  }
}

/** Parse the public RSS/g: feed into Products (fallback; fewer fields). */
export function productsFromFeed(xml, site) {
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const tag = (block, name) => {
    const m = block.match(new RegExp(`<g:${name}>([\\s\\S]*?)</g:${name}>`));
    if (!m) return null;
    return m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  };
  const tags = (block, name) => [...block.matchAll(new RegExp(`<g:${name}>([\\s\\S]*?)</g:${name}>`, "g"))].map((m) => m[1].trim().replace(/&amp;/g, "&"));
  const money = (s) => (s ? Number(String(s).replace(/[^\d.]/g, "")) : null);
  return items.map((b) => {
    const price = money(tag(b, "price"));
    const sale = money(tag(b, "sale_price"));
    const color = tag(b, "color");
    return {
      slug: tag(b, "id"),
      name: { ar: "", fr: tag(b, "title") || "" },
      category: /shoe/i.test(tag(b, "google_product_category") || "") ? "chaussures" : /pack/i.test(tag(b, "product_type") || "") ? "packs" : "sacs",
      gender: tag(b, "gender") === "male" ? "homme" : tag(b, "gender") === "female" ? "femme" : null,
      price: sale ?? price,
      compareAt: sale ? price : null,
      description: { ar: "", fr: tag(b, "description") || "" },
      details: { ar: [], fr: [] },
      images: [tag(b, "image_link"), ...tags(b, "additional_image_link")].filter(Boolean).map((u) => abs(u, site)),
      colors: color ? [{ name: { ar: "", fr: color }, hex: null }] : [],
      sizes: null,
      inStock: tag(b, "availability") !== "out of stock",
      badge: null,
      freeGift: null,
      freeGiftImage: null,
      url: tag(b, "link"),
      sortOrder: null,
      _partial: true,
    };
  });
}

export async function fetchFromFeed(fetchImpl = fetch) {
  const st = config().store;
  const res = await fetchImpl(st.feed_url, { headers: { accept: "application/xml" } });
  if (!res.ok) throw new LabError("STORE", `feed HTTP ${res.status}`);
  return productsFromFeed(await res.text(), st.site_url);
}

/** Merge store products into the library, keeping owner-approved reference photos. */
export function saveProducts(products, source) {
  const now = nowIso();
  let added = 0;
  tx(() => {
    for (const p of products) {
      if (!p.slug || !p.images.length) continue; // placeholders without photos are not ad-able
      const prev = get("SELECT refs FROM products WHERE slug=?", p.slug);
      if (!prev) added++;
      const prevRefs = pj(prev?.refs, []);
      // Store images become refs (approved by default — they ARE the product); manual refs persist.
      const storeRefs = p.images.map((url, i) => {
        const old = prevRefs.find((r) => r.url === url);
        return { url, role: i === 0 ? "hero" : "alt", source: "store", approved: old ? old.approved : true, path: old?.path || null, w: old?.w || null, h: old?.h || null };
      });
      const manual = prevRefs.filter((r) => r.source !== "store");
      upsert("products", "slug", { slug: p.slug, json: j(p), source, in_stock: p.inStock ? 1 : 0, synced_at: now, refs: j([...storeRefs, ...manual]) });
    }
  });
  return { added, total: products.length };
}

/** Download store reference photos that are not local yet. */
export async function cacheProductImages({ slugs = null, concurrency = 4 } = {}) {
  const rows = slugs ? all(`SELECT slug, refs FROM products WHERE slug IN (${slugs.map(() => "?").join(",")})`, ...slugs) : all("SELECT slug, refs FROM products");
  const jobs = [];
  for (const r of rows) pj(r.refs, []).forEach((ref, i) => ref.url && !(ref.path && fs.existsSync(ref.path)) && jobs.push({ slug: r.slug, i, url: ref.url }));
  const res = await mapLimit(jobs, concurrency, async (jb) => {
    const out = await downloadOne(jb.url, dataPath("media/products", jb.slug), `ref-${jb.i}`, { referer: config().store.site_url });
    return { ...jb, out };
  });
  for (const { slug, i, out } of res) {
    if (!out.ok) continue;
    const row = get("SELECT refs FROM products WHERE slug=?", slug);
    const refs = pj(row.refs, []);
    let meta = {};
    try {
      meta = probe(out.path);
    } catch {}
    refs[i] = { ...refs[i], path: out.path, sha256: out.sha256, w: meta.display_w ?? null, h: meta.display_h ?? null };
    run("UPDATE products SET refs=? WHERE slug=?", j(refs), slug);
  }
  return { attempted: jobs.length, ok: res.filter((r) => r.out.ok).length, failed: res.filter((r) => !r.out.ok).map((r) => ({ slug: r.slug, url: r.url, error: r.out.error })) };
}

export async function syncProducts({ source = "auto" } = {}) {
  let products;
  let used = source;
  if (source === "turso" || source === "auto") {
    try {
      products = await fetchFromTurso();
      used = "turso";
    } catch (e) {
      if (source === "turso") throw e;
      products = null;
      used = `feed (turso failed: ${e.message})`;
    }
  }
  if (!products) products = await fetchFromFeed();
  const saved = saveProducts(products, used.startsWith("turso") ? "turso" : "feed");
  const images = await cacheProductImages();
  const thumbs = makeThumbs();
  return { source: used, ...saved, images, thumbs };
}

export function listProducts({ inStockOnly = false } = {}) {
  return all(`SELECT * FROM products ${inStockOnly ? "WHERE in_stock=1" : ""} ORDER BY slug`).map((r) => ({ ...pj(r.json, {}), refs: pj(r.refs, []), synced_at: r.synced_at, source: r.source }));
}

export function getProduct(slug) {
  const r = get("SELECT * FROM products WHERE slug=?", slug);
  if (!r) return null;
  return { ...pj(r.json, {}), refs: pj(r.refs, []), synced_at: r.synced_at, source: r.source };
}

/** Attach an extra reference photo (owner's real photo / detail shot). */
export async function addProductRef(slug, fileOrUrl, { role = "detail", approved = true, note = null } = {}) {
  const p = get("SELECT refs FROM products WHERE slug=?", slug);
  if (!p) throw new LabError("NOT_FOUND", `product ${slug} not synced`);
  const refs = pj(p.refs, []);
  const dir = ensureDir(dataPath("media/products", slug));
  let ref;
  if (/^https?:\/\//.test(fileOrUrl)) {
    const out = await downloadOne(fileOrUrl, dir, `manual-${refs.length}`);
    if (!out.ok) throw new LabError("DOWNLOAD", out.error);
    ref = { url: fileOrUrl, path: out.path, sha256: out.sha256 };
  } else {
    if (!fs.existsSync(fileOrUrl)) throw new LabError("NOT_FOUND", fileOrUrl);
    const dest = path.join(dir, `manual-${refs.length}${path.extname(fileOrUrl).toLowerCase()}`).replace(/\\/g, "/");
    fs.copyFileSync(fileOrUrl, dest);
    ref = { url: null, path: dest };
  }
  let meta = {};
  try {
    meta = probe(ref.path);
  } catch {}
  refs.push({ ...ref, role, source: "manual", approved, note, w: meta.display_w ?? null, h: meta.display_h ?? null });
  run("UPDATE products SET refs=? WHERE slug=?", j(refs), slug);
  return refs[refs.length - 1];
}

export function setRefApproval(slug, idx, approved) {
  const p = get("SELECT refs FROM products WHERE slug=?", slug);
  if (!p) throw new LabError("NOT_FOUND", `product ${slug}`);
  const refs = pj(p.refs, []);
  if (!refs[idx]) throw new LabError("NOT_FOUND", `ref #${idx}`);
  refs[idx].approved = !!approved;
  run("UPDATE products SET refs=? WHERE slug=?", j(refs), slug);
  return refs[idx];
}

/** 480-px JPEG thumbnails next to each product photo (the UI grid was loading ~1.2 MB PNGs × 66). */
export function makeThumbs({ force = false } = {}) {
  const rows = all("SELECT slug, refs FROM products");
  let made = 0;
  for (const r of rows) {
    for (const ref of pj(r.refs, [])) {
      if (!ref.path || !fs.existsSync(ref.path)) continue;
      const out = ref.path.replace(/\.(png|jpe?g|webp)$/i, ".thumb.jpg");
      if (!force && fs.existsSync(out)) continue;
      const res = spawnSync(config().tools?.magick || "magick", [ref.path, "-auto-orient", "-resize", "480x480>", "-background", "#F4F1EA", "-flatten", "-quality", "82", out], { windowsHide: true });
      if (res.status === 0) made++;
    }
  }
  return { made };
}

/** Thumbnail path for a product photo, if generated. */
export const thumbOf = (p) => (p ? p.replace(/\.(png|jpe?g|webp)$/i, ".thumb.jpg") : null);
