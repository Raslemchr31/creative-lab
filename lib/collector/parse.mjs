// creative-lab :: Ad Library payload parsing (pure functions, unit-tested on fixtures).
//
// The public web Ad Library delivers results two ways (verified live 2026-11-01):
//   1. FIRST page (~30 results) embedded in the initial HTML inside a JSON blob:
//        ..."ad_library_main":{"search_results_connection":{"count":1876,"edges":[...]}}
//      next to "xfb_ad_library_is_captcha_required":false
//   2. Every further page via POST /api/graphql/ with
//        fb_api_req_friendly_name=AdLibrarySearchPaginationQuery
//      whose body is one JSON object per line (optionally prefixed "for (;;);"):
//        {"data":{"ad_library_main":{"search_results_connection":{"edges":[...],"page_info":{...}}}}}
//   Each edge: edges[].node.collated_results[] = one ad (ad_archive_id, collation_count, snapshot{...}).

/**
 * Extract the balanced JSON value (object or array) that starts at text[start].
 * String-aware (handles escaped quotes); returns the substring or null.
 */
export function sliceBalanced(text, start) {
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Every `"search_results_connection":{...}` object found anywhere in an HTML/text blob. */
export function findConnectionsInText(text) {
  const out = [];
  const key = '"search_results_connection":';
  let from = 0;
  for (;;) {
    const at = text.indexOf(key, from);
    if (at < 0) break;
    const start = at + key.length;
    const raw = sliceBalanced(text, start);
    from = start + 1;
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* partial / escaped blob — ignore */
    }
  }
  return out;
}

/** Captcha / block signals present in the HTML. */
export function detectBlock(html, url = "") {
  const reasons = [];
  if (/"xfb_ad_library_is_captcha_required"\s*:\s*true/.test(html)) reasons.push("captcha_required");
  if (/\/(login|checkpoint)(\/|\.php|\?|$)/.test(url)) reasons.push(`redirected:${url}`);
  if (/You.{0,3}re Temporarily Blocked|Vous êtes temporairement bloqué|temporarily blocked/i.test(html)) reasons.push("temporarily_blocked");
  if (/id="login_form"|name="login_source"/.test(html) && !/ad_library_main/.test(html)) reasons.push("login_wall");
  return reasons;
}

/** Parse a GraphQL response body (possibly several JSON objects, one per line). */
export function parseGraphqlBody(text) {
  const objs = [];
  const cleaned = String(text).replace(/^for \(;;\);/, "");
  for (const line of cleaned.split(/\r?\n/)) {
    const t = line.trim().replace(/^for \(;;\);/, "");
    if (!t.startsWith("{")) continue;
    try {
      objs.push(JSON.parse(t));
    } catch {
      /* ignore non-JSON chunks */
    }
  }
  // Fallback: whole body is one pretty-printed object.
  if (!objs.length) {
    try {
      objs.push(JSON.parse(cleaned));
    } catch {
      /* not JSON */
    }
  }
  return objs;
}

/** Walk any object graph and collect every value stored under `key`. */
export function collectKey(obj, key, out = [], depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 40) return out;
  if (Array.isArray(obj)) {
    for (const v of obj) collectKey(v, key, out, depth + 1);
    return out;
  }
  for (const k of Object.keys(obj)) {
    if (k === key) out.push(obj[k]);
    collectKey(obj[k], key, out, depth + 1);
  }
  return out;
}

/**
 * GraphQL error signals hidden inside HTTP-200 bodies (research/05 §6.4):
 *   errors[].code 1675004 → rate_limited ; 1357054 / 1357004 / 1357001 → refused (session).
 * Returns null when the body carries no error.
 */
export function graphqlErrorSignal(text) {
  for (const o of parseGraphqlBody(text)) {
    const errs = [];
    if (Array.isArray(o?.errors)) errs.push(...o.errors);
    if (o?.error) errs.push({ code: o.error, message: o.errorSummary || o.errorDescription || "" });
    for (const e of errs) {
      const code = Number(e?.code ?? e?.error);
      const msg = String(e?.summary || e?.message || e?.description || "");
      if (code === 1675004 || /rate limit/i.test(msg)) return { kind: "rate_limited", code, msg };
      if ([1357054, 1357004, 1357001].includes(code)) return { kind: "refused", code, msg };
    }
  }
  return null;
}

/** Signed fbcdn URL expiry: hex `oe=` param = epoch seconds (≈4–5 days after issue). */
export function urlExpiry(u) {
  try {
    const oe = new URL(u).searchParams.get("oe");
    const t = oe ? parseInt(oe, 16) : NaN;
    return Number.isFinite(t) && t > 1.5e9 ? t : null;
  } catch {
    return null;
  }
}

export function connectionsFromGraphql(text) {
  const conns = [];
  for (const o of parseGraphqlBody(text)) conns.push(...collectKey(o, "search_results_connection"));
  return conns.filter((c) => c && typeof c === "object");
}

/** Flatten a connection into raw ad results + paging info. */
export function resultsFromConnection(conn) {
  const results = [];
  for (const e of conn?.edges || []) {
    for (const r of e?.node?.collated_results || []) if (r && r.ad_archive_id) results.push(r);
  }
  return {
    results,
    count: typeof conn?.count === "number" ? conn.count : null,
    hasNext: conn?.page_info ? !!conn.page_info.has_next_page : null,
    endCursor: conn?.page_info?.end_cursor ?? null,
  };
}

/** Build a web Ad Library URL from search params. */
export function buildLibraryUrl({
  q = "",
  country = "ALL",
  activeStatus = "active",
  adType = "all",
  mediaType = "all",
  searchType,
  pageId,
  exact = false,
  sort = null,
} = {}) {
  const u = new URL("https://www.facebook.com/ads/library/");
  // sort=impressions → the page sends sortData {mode: SORT_BY_TOTAL_IMPRESSIONS, direction: DESCENDING}
  // in every AdLibrarySearchPaginationQuery (verified live 2026-11-01). Default = relevance.
  u.searchParams.set("active_status", activeStatus);
  u.searchParams.set("ad_type", adType);
  u.searchParams.set("country", country);
  u.searchParams.set("is_targeted_country", "false");
  u.searchParams.set("media_type", mediaType);
  if (pageId) {
    u.searchParams.set("search_type", "page");
    u.searchParams.set("view_all_page_id", String(pageId));
  } else {
    u.searchParams.set("q", q);
    u.searchParams.set("search_type", searchType || (exact ? "keyword_exact_phrase" : "keyword_unordered"));
  }
  if (sort === "impressions") {
    u.searchParams.set("sort_data[direction]", "desc");
    u.searchParams.set("sort_data[mode]", "total_impressions");
  }
  return u.toString();
}
