// creative-lab :: public web Ad Library collector (system Chrome via playwright-core).
//
// Why the web UI and not /ads_archive: the official Ad Library API returns commercial
// ads only for EU delivery (DSA) + political/issue ads. Algerian commercial ads are
// visible in the public web Ad Library, so we read exactly what the page itself loads:
// the embedded first page + the AdLibrarySearchPaginationQuery responses as we scroll.
// Logged-out, headless, paced like a human; stops at the first block signal.

import { createRequire } from "node:module";
import { config, jitter, sleep, logLine } from "../util.mjs";
import { buildLibraryUrl, findConnectionsInText, connectionsFromGraphql, resultsFromConnection, detectBlock, graphqlErrorSignal } from "./parse.mjs";

const CONSENT_SELECTORS = [
  'button:has-text("Decline optional cookies")',
  'button:has-text("Allow all cookies")',
  'button:has-text("Refuser les cookies optionnels")',
  'button:has-text("Autoriser tous les cookies")',
  '[data-cookiebanner="accept_button"]',
];

const require = createRequire(import.meta.url);

export class AdLibSession {
  constructor(opts = {}) {
    this.opts = { ...config().spy, ...opts };
    this.browser = null;
    this.context = null;
    this.blocked = null;
  }

  static async open(opts) {
    const s = new AdLibSession(opts);
    await s._launch();
    return s;
  }

  async _launch() {
    const { chromium } = require("playwright-core");
    this.browser = await chromium.launch({ channel: this.opts.chrome_channel || "chrome", headless: this.opts.headless !== false });
    const ver = this.browser.version();
    this.context = await this.browser.newContext({
      locale: this.opts.locale || "en-US",
      viewport: this.opts.viewport || { width: 1280, height: 1800 },
      // Headless Chrome advertises "HeadlessChrome"; present the normal desktop UA.
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`,
    });
  }

  async close() {
    try {
      await this.context?.close();
    } catch {}
    try {
      await this.browser?.close();
    } catch {}
  }

  /**
   * Collect ads for one search (keyword or page).
   * @returns {Promise<{url, reported_total, results, blocked, has_next, scrolls, graphql_pages, error}>}
   */
  async search(params, { maxResults, onProgress } = {}) {
    if (this.blocked) return { url: null, results: [], blocked: this.blocked, error: "session blocked earlier" };
    maxResults ??= this.opts.default_max_results || 150;
    const url = buildLibraryUrl(params);
    const byId = new Map();
    let reportedTotal = null;
    let hasNext = null;
    let gqlPages = 0;
    let lastGrowthAt = Date.now();
    const add = (conn) => {
      const { results, count, hasNext: hn } = resultsFromConnection(conn);
      if (count !== null) reportedTotal = count;
      if (hn !== null) hasNext = hn;
      let added = 0;
      for (const r of results) {
        if (!byId.has(r.ad_archive_id)) {
          byId.set(r.ad_archive_id, r);
          added++;
        }
      }
      if (added) lastGrowthAt = Date.now();
      return added;
    };

    const page = await this.context.newPage();
    let signal = null; // rate_limited | refused (GraphQL errors inside HTTP-200 bodies)
    const onResponse = async (res) => {
      try {
        if (!res.url().includes("/api/graphql")) return;
        const post = res.request().postData() || "";
        if (!post.includes("AdLibrary")) return;
        const text = await res.text();
        const sig = graphqlErrorSignal(text);
        if (sig) {
          signal = sig;
          logLine("spy", { event: "graphql_error", url, ...sig });
          return;
        }
        if (!text.includes("search_results_connection")) return;
        gqlPages++;
        for (const c of connectionsFromGraphql(text)) add(c);
      } catch {
        /* response body unavailable (navigation) — ignore */
      }
    };
    page.on("response", onResponse);

    let error = null;
    let scrolls = 0;
    try {
      // A 403 on the document is normal for the Ad Library (JS challenge page still renders the app).
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      for (const sel of CONSENT_SELECTORS) {
        const b = page.locator(sel).first();
        if (await b.isVisible({ timeout: 300 }).catch(() => false)) {
          await b.click().catch(() => {});
          await page.waitForTimeout(800);
          break;
        }
      }
      // Poll up to first_wait_max_ms for the embedded first page (or a block flag).
      const deadline = Date.now() + (this.opts.first_wait_max_ms ?? 25000);
      let html = "";
      let reasons = [];
      await page.waitForTimeout(this.opts.first_wait_ms ?? 2500);
      for (;;) {
        html = await page.content();
        reasons = detectBlock(html, page.url());
        const conns = findConnectionsInText(html);
        if (reasons.length || conns.length || Date.now() > deadline) {
          for (const c of conns) add(c);
          break;
        }
        await page.waitForTimeout(1500);
      }
      if (reasons.length) {
        this.blocked = reasons;
        logLine("spy", { event: "blocked", url, reasons, status: resp?.status() });
        return { url, reported_total: null, results: [], blocked: reasons, has_next: null, scrolls: 0, graphql_pages: 0, error: `blocked: ${reasons.join(",")}` };
      }
      onProgress?.({ phase: "first_page", n: byId.size, reportedTotal });

      let stall = 0;
      const maxScrolls = this.opts.max_scrolls ?? 60;
      while (byId.size < maxResults && scrolls < maxScrolls) {
        if (hasNext === false || signal) break;
        const before = byId.size;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        scrolls++;
        // Wait for growth or the pause window, whichever first.
        const pause = jitter(this.opts.scroll_pause_ms || [2600, 4800]);
        const t0 = Date.now();
        while (Date.now() - t0 < pause && byId.size === before) await sleep(250);
        if (byId.size === before) {
          await sleep(600);
          stall = byId.size === before ? stall + 1 : 0;
        } else {
          stall = 0;
          await sleep(jitter([700, 1400]));
        }
        onProgress?.({ phase: "scroll", n: byId.size, scrolls, reportedTotal });
        if (stall >= (this.opts.stall_scrolls ?? 4)) break;
      }
      // A mid-run captcha shows up as an HTML flag after scrolling.
      const tail = detectBlock(await page.content(), page.url());
      if (tail.length) {
        this.blocked = tail;
        error = `blocked mid-run: ${tail.join(",")}`;
      } else if (signal) {
        // Rate limit / refusal: keep what we have, stop this session (caller cools down).
        this.blocked = [`${signal.kind}:${signal.code}`];
        error = `graphql ${signal.kind} (${signal.code}) after ${byId.size} results`;
      }
    } catch (e) {
      error = e.message;
    } finally {
      page.off("response", onResponse);
      await page.close().catch(() => {});
    }
    const results = [...byId.values()].slice(0, maxResults);
    logLine("spy", { event: "search", url, n: results.length, reportedTotal, scrolls, gqlPages, error, idleMs: Date.now() - lastGrowthAt });
    return { url, reported_total: reportedTotal, results, blocked: this.blocked, has_next: hasNext, scrolls, graphql_pages: gqlPages, error };
  }
}
