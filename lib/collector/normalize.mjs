// creative-lab :: raw Ad Library result -> normalized records (pure, fixture-tested).

import { hostOf, guessLang } from "../util.mjs";

const str = (v) => (typeof v === "string" && v.trim() ? v : null);
const bodyText = (b) => (typeof b === "string" ? b : str(b?.text) || str(b?.markup?.__html) || null);

/** True when the copy still carries catalog template tokens ({{product.name}}) = DPA/DCO. */
export const isTemplated = (s) => /\{\{\s*product\./i.test(String(s || ""));

/**
 * Normalize one `collated_results[]` entry.
 * Returns { ad, page, media[] } where media items are download candidates (url may be null).
 */
export function normalizeResult(r, ctx = {}) {
  const s = r.snapshot || {};
  const cards = Array.isArray(s.cards) ? s.cards : [];
  // Catalog (DPA/DCO) ads carry a {{product.name}} template at top level; the real copy is in the cards.
  const topBody = bodyText(s.body);
  const cardBody = cards.map((c) => bodyText(c.body)).find((t) => t && !isTemplated(t)) || null;
  const body = (topBody && !isTemplated(topBody) ? topBody : cardBody || topBody) || null;
  const topTitle = str(s.title);
  const title = (topTitle && !isTemplated(topTitle) ? topTitle : cards.map((c) => str(c.title)).find((t) => t && !isTemplated(t)) || topTitle) || null;
  const linkUrl = str(s.link_url) || cards.map((c) => str(c.link_url)).find(Boolean) || null;
  const platforms = Array.isArray(r.publisher_platform) ? r.publisher_platform : [];
  const displayFormat = str(s.display_format) || null;

  const ad = {
    ad_archive_id: String(r.ad_archive_id),
    collation_id: r.collation_id ? String(r.collation_id) : null,
    collation_count: Number.isFinite(r.collation_count) ? r.collation_count : null,
    page_id: r.page_id ? String(r.page_id) : s.page_id ? String(s.page_id) : null,
    page_name: str(r.page_name) || str(s.page_name),
    is_active: r.is_active === true ? 1 : r.is_active === false ? 0 : null,
    start_date: Number.isFinite(r.start_date) ? r.start_date : null,
    end_date: Number.isFinite(r.end_date) ? r.end_date : null,
    display_format: displayFormat,
    platforms,
    body,
    title,
    link_url: linkUrl,
    link_domain: hostOf(linkUrl) || str(s.caption)?.toLowerCase() || null,
    caption: str(s.caption),
    link_description: str(s.link_description),
    cta_text: str(s.cta_text),
    cta_type: str(s.cta_type),
    cards: cards.map((c, i) => ({
      i,
      title: str(c.title),
      body: bodyText(c.body),
      link_url: str(c.link_url),
      cta_text: str(c.cta_text),
      cta_type: str(c.cta_type),
      has_video: !!(c.video_hd_url || c.video_sd_url),
    })),
    contains_ai_media: r.contains_digital_created_media === true ? 1 : r.contains_digital_created_media === false ? 0 : null,
    lang: guessLang([body, title].filter(Boolean).join(" ")),
    templated: isTemplated(topBody) || isTemplated(topTitle) || String(s.display_format || "").toUpperCase() === "DPA",
    country: ctx.country || null,
    query: ctx.query || null,
  };

  const page = ad.page_id
    ? {
        page_id: ad.page_id,
        page_name: ad.page_name,
        like_count: Number.isFinite(s.page_like_count) ? s.page_like_count : null,
        categories: Array.isArray(s.page_categories) ? s.page_categories : [],
        profile_uri: str(s.page_profile_uri),
      }
    : null;

  const media = [];
  const push = (role, idx, url, extra = {}) => {
    if (url) media.push({ role, idx, url, ...extra });
  };
  (s.videos || []).forEach((v, i) => {
    push("video", i, v.video_hd_url || v.video_sd_url, { alt: v.video_sd_url && v.video_hd_url ? v.video_sd_url : null });
    push("video_preview", i, v.video_preview_image_url);
  });
  (s.images || []).forEach((im, i) => push("image", i, im.original_image_url || im.resized_image_url || im.watermarked_resized_image_url));
  cards.forEach((c, i) => {
    if (c.video_hd_url || c.video_sd_url) {
      push("card_video", i, c.video_hd_url || c.video_sd_url, { alt: c.video_hd_url && c.video_sd_url ? c.video_sd_url : null });
      push("card_preview", i, c.video_preview_image_url);
    } else {
      push("card_image", i, c.original_image_url || c.resized_image_url || c.watermarked_resized_image_url);
    }
  });
  (s.extra_images || []).forEach((im, i) => push("extra_image", i, im.original_image_url || im.resized_image_url));
  // extra_videos sometimes carry *_handle keys holding the URL (research/05 §3).
  (s.extra_videos || []).forEach((v, i) => push("extra_video", i, v.video_hd_url || v.video_hd_handle || v.video_sd_url || v.video_sd_handle));

  // Keep the raw snapshot (minus the volatile avatar URL) + the top-level fields Meta
  // only exposes beside it, so nothing has to be re-crawled later.
  const snapshot = { ...s };
  delete snapshot.page_profile_picture_url;
  snapshot._top = {
    impressions_with_index: r.impressions_with_index ?? null,
    categories: r.categories ?? null,
    total_active_time: r.total_active_time ?? null,
    targeted_or_reached_countries: r.targeted_or_reached_countries ?? null,
    gated_type: r.gated_type ?? null,
    reach_estimate: r.reach_estimate ?? null,
    spend: r.spend ?? null,
  };

  return { ad, page, media, snapshot };
}

/** Primary format bucket used by scoring + UI filters. */
export function formatBucket(ad) {
  const f = String(ad.display_format || "").toUpperCase();
  if (ad.templated || f === "DPA" || f === "DCO") return "catalog";
  if (f === "CAROUSEL" || (ad.cards && ad.cards.length > 1)) return "carousel";
  if (f === "VIDEO") return "video";
  if (f === "IMAGE") return "image";
  return f ? f.toLowerCase() : "unknown";
}
