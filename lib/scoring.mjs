// creative-lab :: niche relevance + winner score (pure, explainable, fixture-tested).
//
// Public Ad Library data has no spend/ROAS for non-EU commercial ads, so "winning"
// is inferred from what an advertiser keeps paying for:
//   longevity    — days the ad has been running (advertisers kill losers within days)
//   duplication  — collation_count: ads sharing this exact creative+text (= being scaled
//                  across ad sets/campaigns)
//   page_scale   — how many active ads the page runs (serious, funded advertiser)
//   breadth      — placements it runs on
// composite = Σ weight·subscore, then a format factor (catalog/DPA ads are not
// replicable creative) and a niche-relevance gate (off-niche ads are hidden, not lost).

import { config } from "./util.mjs";
import { formatBucket } from "./collector/normalize.mjs";

/**
 * Arabic + Latin normalisation for term matching. Latin diacritics are KEPT on purpose:
 * stripping them turned Turkish "saç" (hair) and Vietnamese "sắc" into "sac" (bag) —
 * list accented and unaccented French variants in the niche file instead.
 */
export function normText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[ً-ٰٟۖ-ۭ]/g, "") // Arabic tashkeel
    .replace(/ـ/g, "") // tatweel
    .replace(/[آأإٱ]/g, "ا") // alef forms -> ا
    .replace(/ى/g, "ي") // alef maqsura -> ي
    .replace(/ة/g, "ه") // taa marbuta -> ه
    .replace(/\s+/g, " ");
}

/** Whole-word-ish containment: Latin terms need word boundaries; Arabic terms use substring on tokens. */
export function hasTerm(text, term) {
  const t = normText(term).trim();
  if (!t) return false;
  if (/[؀-ۿ]/.test(t) && /\s/.test(t)) {
    // Arabic phrase ("حقيبة المكياج"): match the normalised word sequence.
    const words = text.split(/[^؀-ۿ0-9a-z]+/).filter(Boolean).join(" ");
    return ` ${words} `.includes(` ${t.split(/\s+/).join(" ")} `);
  }
  if (/[؀-ۿ]/.test(t)) {
    // Arabic: allow common clitic prefixes (ال، و، ب، ل، ف) on a token.
    return text.split(/[^؀-ۿ0-9a-z]+/).some((tok) => tok === t || tok.replace(/^(وال|بال|لل|ال|و|ب|ل|ف)/, "") === t || (t.length >= 4 && tok.includes(t)));
  }
  const L = "a-z0-9à-öø-ÿœ"; // Latin letters incl. accented — "saç" must not match "sac"
  const re = new RegExp(`(^|[^${L}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|x)?($|[^${L}])`);
  return re.test(text);
}

const termsIn = (hay, terms) => (terms || []).filter((t) => hasTerm(hay, t));

/**
 * Relevance 0..1 + matched terms. Position-weighted: the HEAD (title, first ~160 chars
 * of copy, landing-page slug, page name) says what the ad sells; a bag mentioned in the
 * tail of a hair-comb ad ("comes with a pouch") must not make it a bag ad.
 */
export function relevance(ad, page, niche) {
  const cardsText = (ad.cards || []).map((c) => `${c.title || ""} ${c.body || ""}`).join(" ");
  const head = normText([ad.title, String(ad.body || "").slice(0, 160), ad.link_url, ad.link_description, cardsText.slice(0, 200)].join(" \n "));
  const tail = normText([String(ad.body || "").slice(160), ad.caption, cardsText.slice(200)].join(" \n "));
  const pageName = normText(ad.page_name);
  const allPos = Object.values(niche.positive_terms || {}).flat();

  const posHead = termsIn(head, allPos);
  const posTail = termsIn(tail, allPos).filter((t) => !posHead.includes(t));
  const posPage = termsIn(pageName, allPos);
  const negHead = termsIn(head + " \n " + pageName, niche.negative_terms);
  const negTail = termsIn(tail, niche.negative_terms).filter((t) => !negHead.includes(t));
  const cod = termsIn(head + " \n " + tail, niche.cod_terms);
  const cats = normText((page?.categories || []).join(" "));
  const fashionCat = (niche.fashion_categories || []).some((c) => cats.includes(normText(c)));

  let r = 0;
  if (posHead.length) r += 0.5 + Math.min(0.2, 0.08 * (posHead.length - 1));
  else if (posTail.length) r += 0.22;
  if (posPage.length) r += 0.15;
  if (cod.length) r += 0.1;
  if (fashionCat) r += 0.1;
  // Premium big-brand pages (segment set by `spy premium`): their copy is often wordless ("New in"),
  // so the page itself vouches for the category. Still killed by an off-niche word in the head.
  if (page?.segment === "premium") r = Math.max(r, posHead.length ? 1 : 0.6);
  if (negHead.length) r -= 0.6;
  if (negTail.length) r -= Math.min(0.4, 0.2 * negTail.length);
  return {
    value: Math.max(0, Math.min(1, Number(r.toFixed(3)))),
    positive: [...new Set([...posHead, ...posTail, ...posPage])],
    positive_head: posHead,
    cod,
    negative: [...negHead, ...negTail],
    fashion_category: fashionCat,
  };
}

/** Piecewise-linear interpolation over [[x,y],...] knots (clamped). */
export function knots(x, pts) {
  if (x === null || x === undefined || Number.isNaN(x)) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}

const DUP_KNOTS = [[1, 0], [2, 35], [3, 50], [5, 65], [10, 82], [20, 95], [40, 100]];
const PAGE_KNOTS = [[0, 0], [1, 10], [3, 30], [10, 55], [25, 75], [50, 90], [100, 100]];
const BREADTH_KNOTS = [[0, 0], [1, 25], [2, 55], [3, 70], [4, 85], [5, 100]];

export function daysActive(ad, nowSec = Math.floor(Date.now() / 1000)) {
  if (!ad.start_date) return null;
  const end = ad.is_active ? nowSec : ad.end_date || nowSec;
  return Math.max(0, (end - ad.start_date) / 86400);
}

const RELAUNCH_KNOTS = [[0, 0], [1, 45], [2, 65], [3, 80], [5, 100]];
const LOCAL_MARKETS = new Set(["DZ", "MA", "TN"]);

/**
 * Winner score for one ad (0–100). Signals that are unknown for an ad (no impression-sorted
 * pull yet, page too small for a survival percentile) are dropped and the remaining weights
 * renormalised — an ad is never punished for data we did not collect.
 * @param {object} ad normalized ad (platforms array, collation_count, start/end, is_active…)
 * @param {object} ctx { pageActiveAds, relaunchCount, pageSurvivalPct, impPct, nowSec, relevance, countries }
 */
export function winnerScore(ad, ctx = {}) {
  const cfg = config().scoring;
  const w = cfg.weights;
  const days = daysActive(ad, ctx.nowSec);
  const subs = {
    longevity: knots(days ?? 0, cfg.longevity_knots_days),
    impression: ctx.impPct === null || ctx.impPct === undefined ? null : 100 * ctx.impPct,
    duplication: knots(ad.collation_count || 1, DUP_KNOTS),
    relaunch: knots(ctx.relaunchCount || 0, RELAUNCH_KNOTS),
    page_survival: ctx.pageSurvivalPct === null || ctx.pageSurvivalPct === undefined ? null : 100 * ctx.pageSurvivalPct,
    page_scale: knots(ctx.pageActiveAds || 0, PAGE_KNOTS),
    breadth: knots((ad.platforms || []).length, BREADTH_KNOTS),
  };
  let num = 0;
  let den = 0;
  for (const [k, v] of Object.entries(subs)) {
    if (v === null || !w[k]) continue;
    num += w[k] * v;
    den += w[k];
  }
  let composite = den ? num / den : 0;

  const fmt = formatBucket(ad);
  const factors = [];
  if (fmt === "catalog") {
    // Catalog/DPA ads run "forever" with template copy — longevity says nothing about the creative.
    composite *= 0.3;
    factors.push("catalog_x0.3");
  }
  if (ad.is_active === 0) {
    composite *= 0.85;
    factors.push("inactive_x0.85");
  }
  const rel = ctx.relevance ?? null;
  const tier =
    days !== null && days >= 30 && ad.is_active !== 0
      ? "proven"
      : days !== null && days <= 14 && (ad.collation_count || 1) >= 3
        ? "rising"
        : days !== null && days >= 30
          ? "proven_ended"
          : "testing";

  const local = (ctx.countries || []).some((c) => LOCAL_MARKETS.has(c));
  const minDays = local ? cfg.winner_min_days_local ?? 21 : cfg.winner_min_days_other ?? 30;
  const winner = ad.is_active !== 0 && days !== null && days >= minDays && composite >= (cfg.winner_min_score ?? 55) && fmt !== "catalog";
  return {
    score: Number(composite.toFixed(1)),
    tier,
    winner,
    days_active: days === null ? null : Number(days.toFixed(1)),
    sub: Object.fromEntries(Object.entries(subs).map(([k, v]) => [k, v === null ? null : Number(v.toFixed(1))])),
    format: fmt,
    factors,
    relevance: rel,
    in_niche: rel === null ? null : rel >= cfg.min_relevance,
  };
}

/** Normalised copy fingerprint used to detect relaunches of the same ad by a page. */
export function copyKey(body) {
  return normText(body).replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 160);
}
