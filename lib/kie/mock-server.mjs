// creative-lab :: Kie.ai mock server — faithful test double of the contract in research/03 §14.
//
// Lets the whole pipeline (upload → createTask → poll → download → QA → assemble) run end
// to end with NO key and NO spend. Outputs are realistic: image tasks return the first
// reference image re-framed to the requested aspect on a studio-cream canvas; video tasks
// return a Ken-Burns clip of the start frame at the requested aspect/duration.
//
// Prompt directives for tests: [[mock:fail]] → state fail (failCode "500");
// [[mock:flag]] → fail "400" content policy; [[mock:slow]] → 3× latency.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { models, estimate } from "./registry.mjs";
import { localCutout } from "../compose.mjs";

const UNAUTH = { code: 401, msg: "Unauthorized – Authentication failed. Please check that your Authorization and Content-Type headers are correctly set." };

const DIMS = {
  "1:1": [1024, 1024], "4:5": [896, 1120], "5:4": [1120, 896], "9:16": [720, 1280], "16:9": [1280, 720],
  "3:4": [864, 1152], "4:3": [1152, 864], "2:3": [832, 1248], "3:2": [1248, 832], "21:9": [1536, 658], auto: [896, 1120], Auto: [720, 1280], adaptive: [720, 1280],
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json;charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

/** Minimal multipart/form-data parser (single file + text fields). */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) return {};
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const out = { fields: {}, file: null };
  let start = buf.indexOf(boundary);
  while (start >= 0) {
    const next = buf.indexOf(boundary, start + boundary.length);
    if (next < 0) break;
    const part = buf.subarray(start + boundary.length + 2, next - 2);
    const headEnd = part.indexOf("\r\n\r\n");
    if (headEnd > 0) {
      const head = part.subarray(0, headEnd).toString();
      const body = part.subarray(headEnd + 4);
      const name = /name="([^"]+)"/.exec(head)?.[1];
      const filename = /filename="([^"]*)"/.exec(head)?.[1];
      if (filename !== undefined) out.file = { name: filename, data: body };
      else if (name) out.fields[name] = body.toString();
    }
    start = next;
  }
  return out;
}

function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  if (r.status !== 0) throw new Error(`mock ffmpeg failed: ${(r.stderr || "").slice(0, 300)}`);
}

export async function startMockKie({ port = 0, apiKey = "test-key", credits = 5000, latency = { waiting: 150, queuing: 150, generating: 400 }, rateLimit = { limit: 20, windowMs: 10000 }, dir } = {}) {
  const workDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), "mock-kie-"));
  fs.mkdirSync(path.join(workDir, "files"), { recursive: true });
  fs.mkdirSync(path.join(workDir, "uploads"), { recursive: true });
  const state = { credits, tasks: new Map(), uploads: new Map(), creates: [], calls: [], seq: 0 };
  let base = "";

  const authed = (req) => (req.headers.authorization || "") === `Bearer ${apiKey}`;

  async function localFileFor(url) {
    // Resolve a URL the client passed in (mock upload, mock result, or http(s) to fetch).
    if (!url) return null;
    if (url.startsWith(base)) {
      const p = new URL(url).pathname;
      const f = path.join(workDir, p.replace(/^\/+/, ""));
      return fs.existsSync(f) ? f : null;
    }
    if (/^https?:\/\//.test(url)) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) return null;
        const f = path.join(workDir, "uploads", `fetched-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 10)}${path.extname(new URL(url).pathname) || ".jpg"}`);
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
        return f;
      } catch {
        return null;
      }
    }
    return null;
  }

  async function renderResult(task) {
    const entry = models().get(task.model) || { task: "t2i" };
    const inp = task.input || {};
    const isVideo = /v$|2v|video/.test(entry.task || "") || /video|veo|kling|seedance|hailuo|wan|runway/.test(task.model);
    const isAudio = /tts|music|audio/.test(entry.task || "");
    const refUrl = (inp.image_input || inp.image_urls || inp.input_urls || inp.reference_image_urls || [])[0] || inp.first_frame_url || inp.image_url || inp.image || inp.input_image || null;
    const ref = await localFileFor(Array.isArray(refUrl) ? refUrl[0] : refUrl);
    const ar = inp.aspect_ratio || inp.ratio || (isVideo ? "9:16" : "4:5");
    let [w, h] = DIMS[ar] || DIMS["4:5"];
    if (/^(auto|Auto|adaptive)$/.test(ar) && ref) {
      const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", ref], { encoding: "utf8", windowsHide: true });
      const [rw, rh] = (pr.stdout || "").trim().split(",").map(Number);
      if (rw && rh) { const k = 720 / Math.min(rw, rh); [w, h] = [Math.round((rw * k) / 2) * 2, Math.round((rh * k) / 2) * 2]; }
    }
    if (Number.isInteger(inp.width) && Number.isInteger(inp.height)) [w, h] = [Math.round(inp.width / 2) * 2, Math.round(inp.height / 2) * 2];
    if (/bg-remove/.test(entry.task || "") && ref) {
      const out = path.join(workDir, "files", `${task.taskId}.png`);
      localCutout(ref, out, { fuzz: 8 });
      return out;
    }
    if (isAudio) {
      const out = path.join(workDir, "files", `${task.taskId}.mp3`);
      ff(["-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:a", "libmp3lame", out]);
      return out;
    }
    if (isVideo) {
      const dur = Number(inp.duration ?? 5);
      const out = path.join(workDir, "files", `${task.taskId}.mp4`);
      if (ref) {
        const frames = Math.round(dur * 24);
        ff(["-loop", "1", "-i", ref, "-vf", `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='min(zoom+0.0012,1.12)':d=${frames}:s=${w}x${h}:fps=24`, "-t", String(dur), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", out]);
      } else {
        ff(["-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=24`, "-t", String(dur), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", out]);
      }
      return out;
    }
    const out = path.join(workDir, "files", `${task.taskId}.png`);
    if (ref) {
      ff(["-i", ref, "-vf", `scale=${Math.round(w * 0.82)}:${Math.round(h * 0.82)}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0xF4F1EA`, "-frames:v", "1", out]);
    } else {
      // Product-free plate: warm studio gradient with a floor band + grain (realistic enough for the gates).
      const r = spawnSync("magick", ["-size", `${w}x${h}`, "gradient:#F1ECE4-#C9BFB0", "(", "-size", `${w}x${Math.round(h * 0.28)}`, "gradient:#D8CFC2-#B8AD9C", ")", "-gravity", "south", "-composite", "-attenuate", "0.25", "+noise", "Gaussian", out], { encoding: "utf8", windowsHide: true, timeout: 60000 });
      if (r.status !== 0) throw new Error(`mock plate failed: ${(r.stderr || "").slice(0, 200)}`);
    }
    return out;
  }

  function stateOf(task) {
    const slow = String(task.input?.prompt || "").includes("[[mock:slow]]") ? 3 : 1;
    const t = Date.now() - task.createdAt;
    const a = latency.waiting * slow;
    const b = a + latency.queuing * slow;
    const c = b + latency.generating * slow;
    if (t < a) return "waiting";
    if (t < b) return "queuing";
    if (t < c) return "generating";
    const p = String(task.input?.prompt || "") + JSON.stringify(task.input?.dialogue || "");
    if (p.includes("[[mock:fail]]") || p.includes("[[mock:flag]]")) return "fail";
    return "success";
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base || "http://localhost");
    const p = url.pathname;
    state.calls.push({ method: req.method, path: p, t: Date.now() });
    try {
      // ── files (no auth, like the real CDN) ──
      if (req.method === "GET" && (p.startsWith("/files/") || p.startsWith("/uploads/"))) {
        const f = path.join(workDir, p.replace(/^\/+/, ""));
        if (!fs.existsSync(f)) return sendJson(res, { status: 404 }, 404);
        const ext = path.extname(f).toLowerCase();
        res.writeHead(200, { "content-type": { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mp3": "audio/mpeg" }[ext] || "application/octet-stream" });
        return fs.createReadStream(f).pipe(res);
      }
      // ── uploads (host kieai.redpandaai.co in production) ──
      if (req.method === "POST" && /^\/api\/file-(base64|stream|url)-upload$/.test(p)) {
        if (!authed(req)) return sendJson(res, { success: false, code: 401, msg: "Authentication failed: Missing Authorization header or invalid API_KEY format" });
        const raw = await readBody(req);
        let name;
        let data;
        let uploadPath;
        if (p.endsWith("base64-upload")) {
          const b = JSON.parse(raw.toString() || "{}");
          if (!b.uploadPath) return sendJson(res, { success: false, code: 400, msg: "Missing required parameter: uploadPath" });
          const m = /^data:([^;]+);base64,(.*)$/s.exec(b.base64Data || "");
          data = Buffer.from(m ? m[2] : b.base64Data || "", "base64");
          name = b.fileName || `b64-${state.seq++}.bin`;
          uploadPath = b.uploadPath;
        } else if (p.endsWith("stream-upload")) {
          const mp = parseMultipart(raw, req.headers["content-type"]);
          if (!mp.fields?.uploadPath) return sendJson(res, { success: false, code: 400, msg: "Missing required parameter: uploadPath" });
          data = mp.file?.data || Buffer.alloc(0);
          name = mp.fields.fileName || mp.file?.name || `stream-${state.seq++}.bin`;
          uploadPath = mp.fields.uploadPath;
        } else {
          const b = JSON.parse(raw.toString() || "{}");
          const f = await localFileFor(b.fileUrl);
          if (!f) return sendJson(res, { success: false, code: 400, msg: "Failed to download file from URL" });
          data = fs.readFileSync(f);
          name = b.fileName || path.basename(f);
          uploadPath = b.uploadPath || "url";
        }
        const safe = `${state.seq++}-${name.replace(/[^\w.-]+/g, "_")}`;
        fs.writeFileSync(path.join(workDir, "uploads", safe), data);
        state.uploads.set(safe, { at: Date.now(), size: data.length });
        return sendJson(res, { success: true, code: 200, msg: "File uploaded successfully", data: { fileName: name, filePath: `${uploadPath}/${name}`, downloadUrl: `${base}/uploads/${safe}`, fileSize: data.length, mimeType: "application/octet-stream", uploadedAt: new Date().toISOString() } });
      }
      if (!p.startsWith("/api/v1/")) {
        return sendJson(res, { timestamp: Date.now(), status: 404, error: "Not Found", message: "No message available", path: p }, 404);
      }
      if (!authed(req)) return sendJson(res, UNAUTH);

      if (req.method === "GET" && p === "/api/v1/chat/credit") return sendJson(res, { code: 200, msg: "success", data: Number(state.credits.toFixed(2)) });

      if (req.method === "POST" && p === "/api/v1/jobs/createTask") {
        const b = JSON.parse((await readBody(req)).toString() || "{}");
        const now = Date.now();
        state.creates = state.creates.filter((t) => now - t < rateLimit.windowMs);
        if (state.creates.length >= rateLimit.limit) return sendJson(res, { code: 429, msg: "Rate limit exceeded" });
        if (!b.model || !models().has(b.model)) return sendJson(res, { code: 422, msg: `model ${b.model} is not supported`, data: null });
        if (!b.input || typeof b.input !== "object") return sendJson(res, { code: 422, msg: "input is required", data: null });
        let cost = 0;
        try {
          cost = estimate(b.model, b.input).credits || 0;
        } catch {}
        if (state.credits < cost) return sendJson(res, { code: 402, msg: "Insufficient Credits", data: null });
        state.creates.push(now);
        const taskId = `task_${b.model.replace(/[^\w]+/g, "-")}_${now}${state.seq++}`;
        state.tasks.set(taskId, { taskId, model: b.model, input: b.input, callBackUrl: b.callBackUrl || null, createdAt: now, cost, charged: false, file: null });
        return sendJson(res, { code: 200, msg: "success", data: { taskId } });
      }

      if (req.method === "GET" && p === "/api/v1/jobs/recordInfo") {
        const task = state.tasks.get(url.searchParams.get("taskId") || "");
        if (!task) return sendJson(res, { code: 422, msg: "recordInfo is null", data: null });
        const st = stateOf(task);
        const data = {
          taskId: task.taskId,
          model: task.model,
          state: st,
          param: JSON.stringify({ model: task.model, callBackUrl: task.callBackUrl, input: JSON.stringify(task.input) }),
          resultJson: "",
          failCode: "",
          failMsg: "",
          costTime: Math.round((Date.now() - task.createdAt) / 1000),
          createTime: task.createdAt,
          updateTime: Date.now(),
          creditsConsumed: 0,
        };
        if (st === "success") {
          if (!task.file) task.file = await renderResult(task);
          if (!task.charged) {
            state.credits -= task.cost;
            task.charged = true;
          }
          data.resultJson = JSON.stringify({ resultUrls: [`${base}/files/${path.basename(task.file)}`] });
          data.completeTime = task.createdAt + latency.waiting + latency.queuing + latency.generating;
          data.creditsConsumed = task.cost;
        } else if (st === "fail") {
          const flagged = String(task.input?.prompt || "").includes("[[mock:flag]]");
          data.failCode = flagged ? "400" : "500";
          data.failMsg = flagged ? "Your prompt was flagged by Website as violating content policies." : "Internal error during generation";
          data.resultJson = null;
        } else data.progress = st === "generating" ? 45 : 0;
        return sendJson(res, { code: 200, msg: "success", data });
      }

      if (req.method === "POST" && p === "/api/v1/common/download-url") {
        const b = JSON.parse((await readBody(req)).toString() || "{}");
        if (!b.url || !String(b.url).startsWith(`${base}/files/`)) return sendJson(res, { code: 422, msg: "Only generated files are supported", data: null });
        return sendJson(res, { code: 200, msg: "success", data: `${b.url}?dl=${Date.now()}` });
      }
      return sendJson(res, { timestamp: Date.now(), status: 404, error: "Not Found", message: "No message available", path: p }, 404);
    } catch (e) {
      return sendJson(res, { code: 500, msg: `mock error: ${e.message}`, data: null });
    }
  });

  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    url: base,
    apiKey,
    state,
    workDir,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

// CLI: `node lib/kie/mock-server.mjs [port]` — handy for manual dry runs of the UI.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const m = await startMockKie({ port: Number(process.argv[2] || 4318), latency: { waiting: 1000, queuing: 1500, generating: 4000 } });
  console.log(`mock Kie on ${m.url} (key "${m.apiKey}") — workDir ${m.workDir}`);
}
