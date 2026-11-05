// creative-lab :: media downloader (fbcdn signed URLs expire — download in the same run).

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import { config, ensureDir, sleep } from "../util.mjs";

const EXT = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function extFor(mime, url) {
  const m = String(mime || "").split(";")[0].trim().toLowerCase();
  if (EXT[m]) return EXT[m];
  const u = String(url).split("?")[0].toLowerCase();
  const e = path.extname(u);
  return [".mp4", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".mov"].includes(e) ? (e === ".jpeg" ? ".jpg" : e) : ".bin";
}

/**
 * Download one URL to `dir/<base><ext>` streaming + hashing. Retries transient errors.
 * Returns { ok, path, bytes, sha256, mime, status, error }.
 */
export async function downloadOne(url, dir, base, { referer = "https://www.facebook.com/", timeoutMs, maxBytes, tries = 3, fetchImpl = fetch } = {}) {
  const cfg = config().spy.media;
  timeoutMs ??= cfg.timeout_ms;
  maxBytes ??= cfg.max_bytes;
  ensureDir(dir);
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { headers: { "user-agent": UA, referer, accept: "*/*" }, signal: ac.signal, redirect: "follow" });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        // 403/410 on fbcdn = signature expired; retrying will not help.
        if ([401, 403, 404, 410].includes(res.status)) return { ok: false, status: res.status, error: lastErr, expired: res.status === 403 || res.status === 410 };
        throw new Error(lastErr);
      }
      const len = Number(res.headers.get("content-length") || 0);
      if (len && len > maxBytes) return { ok: false, status: res.status, error: `too large (${len} bytes)` };
      const mime = res.headers.get("content-type");
      const file = path.join(dir, base + extFor(mime, url));
      const hash = crypto.createHash("sha256");
      let bytes = 0;
      const src = Readable.fromWeb(res.body);
      src.on("data", (chunk) => {
        bytes += chunk.length;
        hash.update(chunk);
        if (bytes > maxBytes) src.destroy(new Error(`exceeded max bytes ${maxBytes}`));
      });
      await pipeline(src, fs.createWriteStream(file));
      clearTimeout(timer);
      if (bytes === 0) throw new Error("empty body");
      return { ok: true, path: file.replace(/\\/g, "/"), bytes, sha256: hash.digest("hex"), mime, status: res.status };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e.name === "AbortError" ? `timeout after ${timeoutMs}ms` : e.message;
      if (attempt < tries) await sleep(1500 * attempt);
    }
  }
  return { ok: false, error: lastErr };
}

/** Run async fn over items with bounded concurrency; preserves order of results. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
