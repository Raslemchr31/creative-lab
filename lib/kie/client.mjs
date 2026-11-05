// creative-lab :: Kie.ai client (zero-dep fetch, Node 22). Built against research/03 §2–§8, §11.
//
// Contract facts it relies on (verified on docs.kie.ai + live no-key probes, 2026-11-01):
//  • API host https://api.kie.ai ; uploads ONLY on https://kieai.redpandaai.co
//  • Auth: Authorization: Bearer <key>
//  • Errors arrive as HTTP 200 with the real status in body.code (401 body has no `data`);
//    unknown paths are a real HTTP 404.
//  • createTask → data.taskId ; recordInfo → state waiting|queuing|generating|success|fail,
//    resultJson is a JSON *string* ({resultUrls:[…]}), failCode is a numeric *string*.
//  • 20 creates / 10 s per account; 429 is not queued (safe to retry). 402 = out of credits (stop).
//  • Generated files live 14 days, uploads 24 h, download-url links 20 min.
// The key is read by the caller and never logged.

import fs from "node:fs";
import path from "node:path";
import { sleep, logLine } from "../util.mjs";
import { validateInput, estimate } from "./registry.mjs";

const RETRYABLE = new Set([429, 455, 500, 408, 550]);
const FATAL = new Set([401, 402, 433, 505, 404, 405]);

export class KieError extends Error {
  constructor(code, msg, extra = {}) {
    super(`Kie ${code}: ${msg}`);
    this.code = code;
    this.kieMsg = msg;
    this.retryable = RETRYABLE.has(code);
    this.fatal = FATAL.has(code);
    Object.assign(this, extra);
  }
}

/** Sliding-window limiter: at most `limit` calls per `windowMs`. */
export class RateLimiter {
  constructor(limit = 20, windowMs = 10000, now = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.stamps = [];
  }
  async take() {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
      if (this.stamps.length < this.limit) {
        this.stamps.push(t);
        return;
      }
      await sleep(this.windowMs - (t - this.stamps[0]) + 25);
    }
  }
}

const parseMaybe = (s) => {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "object") return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** Pull every result URL out of a recordInfo `data` (defensive across families — research/03 §3.3, §11.3). */
export function extractResult(data) {
  const rj = parseMaybe(data?.resultJson) || parseMaybe(data?.response) || {};
  const urls = [
    ...(rj.resultUrls || []),
    ...(rj.result_urls || []),
    ...(rj.data?.result_urls || []),
    ...(rj.data?.resultUrls || []),
    ...(rj.info?.resultUrls || []),
    ...(data?.info?.resultUrls || []),
    ...(data?.info?.result_urls || []),
  ].filter((u) => typeof u === "string" && u);
  const origin = [...(rj.data?.origin_urls || []), ...(rj.originUrls || []), ...(data?.info?.originUrls || [])].filter(Boolean);
  const lastFrames = [...(rj.lastFrameUrl || [])].filter(Boolean);
  return { resultUrls: [...new Set(urls)], originUrls: origin, lastFrameUrls: lastFrames, resultObject: rj.resultObject ?? null };
}

export function normalizeTask(data) {
  const state = String(data?.state || "").toLowerCase();
  const r = extractResult(data);
  return {
    taskId: data?.taskId ?? null,
    model: data?.model ?? null,
    state, // waiting | queuing | generating | success | fail
    done: state === "success" || state === "fail",
    ok: state === "success",
    resultUrls: r.resultUrls,
    originUrls: r.originUrls,
    lastFrameUrls: r.lastFrameUrls,
    resultObject: r.resultObject,
    failCode: data?.failCode ? String(data.failCode) : null,
    failMsg: data?.failMsg || null,
    creditsConsumed: typeof data?.creditsConsumed === "number" ? data.creditsConsumed : null,
    costTime: data?.costTime ?? null,
    progress: data?.progress ?? null,
    createTime: data?.createTime ?? null,
    completeTime: data?.completeTime ?? null,
  };
}

export class KieClient {
  /**
   * @param {object} o { apiKey, baseUrl, uploadBaseUrl, fetchImpl, limiter, maxRetries, logName }
   */
  constructor(o = {}) {
    if (!o.apiKey) throw new KieError(401, "no API key configured (set KIE_API_KEY in creative-lab/.env)");
    this.apiKey = o.apiKey;
    this.baseUrl = (o.baseUrl || "https://api.kie.ai").replace(/\/+$/, "");
    this.uploadBaseUrl = (o.uploadBaseUrl || "https://kieai.redpandaai.co").replace(/\/+$/, "");
    this.fetch = o.fetchImpl || fetch;
    this.limiter = o.limiter || new RateLimiter(20, 10000);
    this.maxRetries = o.maxRetries ?? 4;
    this.retryBaseMs = o.retryBaseMs ?? 2000;
    this.logName = o.logName ?? "kie-calls";
  }

  _headers(json = true) {
    const h = { authorization: `Bearer ${this.apiKey}`, accept: "application/json" };
    if (json) h["content-type"] = "application/json";
    return h;
  }

  /** One HTTP exchange → parsed envelope; throws KieError on any non-200 `code`. Retries retryable codes. */
  async _call(method, url, { body, form, label } = {}) {
    let attempt = 0;
    for (;;) {
      attempt++;
      let status = 0;
      let text = "";
      try {
        const res = await this.fetch(url, {
          method,
          headers: form ? this._headers(false) : this._headers(true),
          body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
          signal: AbortSignal.timeout(120000),
        });
        status = res.status;
        text = await res.text();
      } catch (e) {
        if (attempt <= this.maxRetries) {
          await sleep(this.retryBaseMs * 2 ** (attempt - 1));
          continue;
        }
        throw new KieError(599, `network: ${e.message}`, { retryable: true });
      }
      let env = null;
      try {
        env = JSON.parse(text);
      } catch {
        /* Cloudflare HTML / plain text */
      }
      if (status === 404 && env && env.status === 404) throw new KieError(404, `unknown endpoint ${env.path || url}`);
      if (!env) {
        const err = new KieError(status >= 500 ? 500 : status || 599, `non-JSON response (HTTP ${status}): ${text.slice(0, 120)}`);
        if ((status >= 500 || status === 0) && attempt <= this.maxRetries) {
          await sleep(this.retryBaseMs * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
      const code = Number(env.code ?? (status === 200 ? 200 : status));
      if (code === 200 && env.success !== false) {
        logLine(this.logName, { label, method, path: new URL(url).pathname, code, attempt });
        return env;
      }
      const err = new KieError(code, env.msg || env.message || "error", { data: env.data ?? null });
      logLine(this.logName, { label, method, path: new URL(url).pathname, code, msg: err.kieMsg, attempt });
      if (err.retryable && attempt <= this.maxRetries) {
        await sleep(this.retryBaseMs * 2 ** (attempt - 1) + Math.random() * 500);
        continue;
      }
      throw err;
    }
  }

  /** Validate + create. Returns { taskId, estimate }. */
  async createTask(model, input, { callBackUrl, variant, skipValidation = false } = {}) {
    if (!skipValidation) {
      const errs = validateInput(model, input, { variant });
      if (errs.length) throw new KieError(422, `local validation failed:\n  - ${errs.join("\n  - ")}`, { local: true });
    }
    await this.limiter.take();
    const env = await this._call("POST", `${this.baseUrl}/api/v1/jobs/createTask`, { body: { model, ...(callBackUrl ? { callBackUrl } : {}), input }, label: `create ${model}` });
    const taskId = env.data?.taskId;
    if (!taskId) throw new KieError(500, `createTask returned no taskId: ${JSON.stringify(env).slice(0, 200)}`);
    return { taskId: String(taskId), estimate: estimate(model, input) };
  }

  async getTask(taskId) {
    const env = await this._call("GET", `${this.baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { label: "recordInfo" });
    return normalizeTask(env.data || {});
  }

  /** Poll until success/fail with backoff 3 s → maxIntervalMs. Throws on timeout (task keeps running server-side). */
  async waitTask(taskId, { timeoutMs = 1200000, firstMs = 3000, maxIntervalMs = 20000, onPoll } = {}) {
    const t0 = Date.now();
    let interval = firstMs;
    for (;;) {
      const t = await this.getTask(taskId);
      onPoll?.(t);
      if (t.done) return t;
      if (Date.now() - t0 > timeoutMs) throw new KieError(408, `task ${taskId} still ${t.state} after ${Math.round(timeoutMs / 1000)} s`, { taskId, lastState: t.state });
      await sleep(interval);
      interval = Math.min(maxIntervalMs, Math.round(interval * 1.5));
    }
  }

  async credits() {
    const env = await this._call("GET", `${this.baseUrl}/api/v1/chat/credit`, { label: "credit" });
    return Number(env.data);
  }

  /** Temporary (20 min) download link for a GENERATED file (not for uploads). */
  async downloadUrl(fileUrl) {
    const env = await this._call("POST", `${this.baseUrl}/api/v1/common/download-url`, { body: { url: fileUrl }, label: "download-url" });
    return String(env.data);
  }

  /** Upload a local file (base64 ≤ 8 MB, multipart stream above). Returns the public downloadUrl (lives 24 h). */
  async uploadFile(file, { uploadPath = "creative-lab", fileName } = {}) {
    const buf = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
    const name = fileName || (Buffer.isBuffer(file) ? `upload-${Date.now()}.bin` : `${Date.now()}-${path.basename(file)}`);
    let env;
    if (buf.length <= 8 * 1024 * 1024) {
      const ext = path.extname(name).toLowerCase().replace(".", "");
      const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mp3: "audio/mpeg", wav: "audio/wav" }[ext] || "application/octet-stream";
      env = await this._call("POST", `${this.uploadBaseUrl}/api/file-base64-upload`, { body: { base64Data: `data:${mime};base64,${buf.toString("base64")}`, uploadPath, fileName: name }, label: "upload-b64" });
    } else {
      const form = new FormData();
      form.append("file", new Blob([buf]), name);
      form.append("uploadPath", uploadPath);
      form.append("fileName", name);
      env = await this._call("POST", `${this.uploadBaseUrl}/api/file-stream-upload`, { form, label: "upload-stream" });
    }
    const url = env.data?.downloadUrl;
    if (!url) throw new KieError(500, `upload returned no downloadUrl: ${JSON.stringify(env).slice(0, 200)}`);
    return { url, fileName: env.data.fileName, size: env.data.fileSize, mime: env.data.mimeType };
  }

  async uploadFromUrl(fileUrl, { uploadPath = "creative-lab", fileName } = {}) {
    const env = await this._call("POST", `${this.uploadBaseUrl}/api/file-url-upload`, { body: { fileUrl, uploadPath, fileName: fileName || `${Date.now()}-${path.basename(new URL(fileUrl).pathname) || "file"}` }, label: "upload-url" });
    return { url: env.data?.downloadUrl, fileName: env.data?.fileName };
  }
}
