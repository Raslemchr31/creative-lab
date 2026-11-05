// creative-lab :: assembly — resolve EDL assets → Remotion public/ → render 9:16 + 4:5 → final QA → export.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { all, get, run, upsert } from "./db.mjs";
import { config, dataPath, ensureDir, nowIso, j, pj, LabError, writeJson, readJson, enginePath, sha256File } from "./util.mjs";
import { jobDir } from "./batch.mjs";
import { probe, runTool } from "./probe.mjs";
import { temporalScan } from "./qa/deterministic.mjs";

const remotionDir = () => config().tools.remotion_dir;

function selectedOutput(taskId) {
  const t = get("SELECT * FROM tasks WHERE id=?", taskId);
  if (!t) return null;
  const sib = all("SELECT * FROM tasks WHERE job_id=? AND shot_id=? AND route=? AND COALESCE(placement,'')=COALESCE(?,'') ORDER BY selected DESC, candidate", t.job_id, t.shot_id, t.route, t.placement);
  const pick = sib.find((s) => s.selected && ["qa_pass", "qa_warn", "success"].includes(s.state)) || sib.find((s) => ["qa_pass", "qa_warn", "success"].includes(s.state));
  return pick ? { task: pick, file: pj(pick.outputs, [])[0] || null } : null;
}

const opOutput = (id) => get("SELECT * FROM ops WHERE id=?", id);

/** Resolve one `$asset:shot:placement[:plate|:cutout]` → { file, lineage } or { missing }. */
function resolveAsset(spec, token) {
  const parts = token.replace(/^\$asset:/, "").split(":");
  const sub = ["plate", "cutout"].includes(parts[parts.length - 1]) ? parts.pop() : null;
  const placement = parts.slice(-2).join(":");
  const shotId = parts.slice(0, -2).join(":");
  const key = `${shotId}:${placement}`;
  let a = spec.assets[key];
  if (a?.from_shared) a = spec.assets[a.from_shared];
  if (!a) return { missing: `no asset planned for ${key}` };
  if (a.pending_shoot) return { missing: `shot ${shotId} needs real footage (shoot request)` };
  if (a.kind === "composite") {
    const op = opOutput(a.from);
    const meta = pj(op?.meta, {});
    if (!op || op.state !== "done") return { missing: `composite ${a.from} not built` };
    if (sub === "plate") return { file: meta.plate_file, lineage: { op: a.from, part: "plate" } };
    if (sub === "cutout") return { file: meta.cutout_file, lineage: { op: a.from, part: "cutout", pixel_lock: meta.pixel_lock } };
    return { file: op.output, lineage: { op: a.from } };
  }
  if (typeof a.from === "string" && get("SELECT id FROM ops WHERE id=?", a.from)) {
    const op = opOutput(a.from);
    if (op.state !== "done") return { missing: `op ${a.from} not done` };
    return { file: op.output, lineage: { op: a.from, meta: pj(op.meta) } };
  }
  const sel = selectedOutput(a.from);
  if (!sel?.file) return { missing: `task ${a.from} has no usable output yet` };
  return { file: sel.file, lineage: { task: sel.task.id, model: sel.task.model, credits: sel.task.credits } };
}

function stageIntoRemotion(file, batchId, jobId, name) {
  const rel = `lab/${batchId}/${jobId}/${name}${path.extname(file).toLowerCase()}`;
  const dest = path.join(remotionDir(), "public", rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (/\.(mp4|mov|webm)$/i.test(file)) {
    // Model audio is never used (owner rule + research/04 Q9): strip it while staging.
    const r = runTool(config().tools.ffmpeg || "ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", file, "-an", "-c:v", "copy", dest]);
    if (r.code !== 0) fs.copyFileSync(file, dest);
  } else fs.copyFileSync(file, dest);
  return rel;
}

/** Fill every $asset token of a draft EDL; returns { edl, missing[], lineage{} }. */
export function resolveEdl(spec, placement) {
  const edl = JSON.parse(JSON.stringify(spec.edl[placement]));
  const missing = [];
  const lineage = {};
  for (const seg of edl.segments) {
    for (const layer of seg.layers) {
      if (typeof layer.src !== "string" || !layer.src.startsWith("$asset:")) continue;
      const r = resolveAsset(spec, layer.src);
      if (r.missing) {
        missing.push(r.missing);
        layer.kind = "fill";
        layer.color = "#3a3a3a";
        delete layer.src;
        continue;
      }
      const name = `${seg.id}-${placement.replace(":", "x")}-${layer.kind}`;
      lineage[name] = r.lineage;
      layer.src = stageIntoRemotion(r.file, spec.batch_id, spec.job_id, name);
    }
  }
  return { edl, missing, lineage };
}

/** Final-render QA (research/04 Q7 + Q6 black + duration). */
export function finalQa(file, edl, still) {
  const checks = [];
  const add = (id, level, msg) => checks.push({ id, level, msg });
  const p = probe(file);
  add("Q7_dims", p.display_w === edl.width && p.display_h === edl.height ? "PASS" : "FAIL", `${p.display_w}×${p.display_h} (expected ${edl.width}×${edl.height})`);
  if (!still) {
    add("Q7_codec", p.codec === "h264" && p.pix_fmt === "yuv420p" ? "PASS" : "FAIL", `${p.codec} ${p.pix_fmt}`);
    const exp = edl.durationInFrames / edl.fps;
    add("Q7_duration", Math.abs((p.duration || 0) - exp) <= 0.12 ? "PASS" : "WARN", `${p.duration?.toFixed(2)} s vs ${exp.toFixed(2)} s`);
    add("Q7_fps", Math.abs((p.fps || 0) - edl.fps) < 0.01 ? "PASS" : "WARN", `${p.fps} fps`);
    const t = temporalScan(file, { scdet: 101 });
    add("Q6_black", t.blacks.length ? "WARN" : "PASS", t.blacks.length ? `black at ${JSON.stringify(t.blacks)}` : "no black frames");
    add("Q9_audio", edl.audio?.src ? (p.audio ? "PASS" : "WARN") : p.audio ? "WARN" : "PASS", edl.audio?.src ? "music bed present" : p.audio ? "unexpected audio stream" : "silent (add a licensed bed before launch)");
  }
  add("Q7_size", (p.size || 0) < (still ? 30 : 4096) * 1024 * 1024 ? "PASS" : "FAIL", `${((p.size || 0) / 1048576).toFixed(1)} MB`);
  return { verdict: checks.some((c) => c.level === "FAIL") ? "FAIL" : checks.some((c) => c.level === "WARN") ? "WARN" : "PASS", checks };
}

/** Assemble one job (all placements). Returns per-placement results. */
export function assembleJob(jobId, { placeholder = false, scale } = {}) {
  const jr = get("SELECT * FROM jobs WHERE id=?", jobId);
  if (!jr) throw new LabError("NOT_FOUND", `job ${jobId}`);
  const spec = pj(jr.spec);
  const dir = ensureDir(path.join(jobDir(spec.batch_id, jobId), "renders"));
  const renderer = path.join(remotionDir(), "tools", "render-lab.mjs");
  if (!fs.existsSync(renderer)) throw new LabError("RENDERER", `missing ${renderer}`);
  const out = [];
  for (const placement of spec.placements) {
    const { edl, missing, lineage } = resolveEdl(spec, placement);
    if (missing.length && !placeholder) {
      out.push({ placement, status: "missing_assets", missing });
      continue;
    }
    const pk = placement.replace(":", "x");
    const edlFile = path.join(jobDir(spec.batch_id, jobId), `edl-${pk}.json`).replace(/\\/g, "/");
    writeJson(edlFile, edl);
    const still = spec.style.format !== "video";
    const target = path.join(dir, `${jobId}-${pk}${still ? ".png" : ".mp4"}`).replace(/\\/g, "/");
    const args = [renderer, edlFile, target];
    if (still) args.push("--still");
    if (scale) args.push("--scale", String(scale));
    const t0 = Date.now();
    const r = spawnSync(process.execPath, args, { cwd: remotionDir(), encoding: "utf8", windowsHide: true, timeout: 1800000, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0 || !fs.existsSync(target)) {
      out.push({ placement, status: "render_failed", error: (r.stderr || r.stdout || "").slice(-800) });
      continue;
    }
    const qa = scale ? { verdict: "DRAFT", checks: [] } : finalQa(target, edl, still);
    const assetId = `${jobId}-${pk}`;
    upsert("assets", "id", { id: assetId, job_id: jobId, kind: still ? "final_image" : "final_video", placement, path: target, status: qa.verdict === "FAIL" ? "qa_fail" : "draft", lineage: j({ style: spec.style, product: spec.product.slug, lineage, edl: edlFile, placeholder_missing: missing, render_ms: Date.now() - t0 }), meta_ad_id: null, perf: null, created_at: nowIso(), updated_at: nowIso() });
    run("INSERT INTO qa(target_kind, target_id, kind, verdict, score, json, created_at) VALUES('asset',?,?,?,?,?,?)", assetId, "final", qa.verdict, null, j(qa.checks), nowIso());
    out.push({ placement, status: "rendered", file: target, qa: qa.verdict, failing: qa.checks.filter((c) => c.level !== "PASS"), render_s: Math.round((Date.now() - t0) / 1000), placeholders: missing });
  }
  const ok = out.every((o) => o.status === "rendered");
  run("UPDATE jobs SET status=?, updated_at=? WHERE id=?", ok ? "assembled" : "assembly_incomplete", nowIso(), jobId);
  return { job: jobId, results: out };
}

export function assembleBatch(batchId, opts = {}) {
  const jobs = all("SELECT id FROM jobs WHERE batch_id=? ORDER BY idx", batchId);
  const res = jobs.map((jr) => {
    try {
      return assembleJob(jr.id, opts);
    } catch (e) {
      return { job: jr.id, error: e.message };
    }
  });
  const allOk = res.every((r) => r.results?.every((x) => x.status === "rendered"));
  run("UPDATE batches SET status=?, updated_at=? WHERE id=?", allOk ? "assembled" : "assembling", nowIso(), batchId);
  return res;
}

/** Approve a final (human decision) — required before export. */
export function approveAsset(assetId, approved = true) {
  const a = get("SELECT * FROM assets WHERE id=?", assetId);
  if (!a) throw new LabError("NOT_FOUND", `asset ${assetId}`);
  if (approved && a.status === "qa_fail") throw new LabError("QA", `asset ${assetId} failed final QA — fix and re-render first`);
  run("UPDATE assets SET status=?, updated_at=? WHERE id=?", approved ? "approved" : "rejected", nowIso(), assetId);
  return { asset: assetId, status: approved ? "approved" : "rejected" };
}

/** Copy approved finals + copy + lineage into the ad-engine client folder for the gated launch flow. */
export function exportBatch(batchId, { client } = {}) {
  client ??= config().client;
  // Inside ad-engine → its client folder (gated launch flow); standalone clone → data/exports/.
  const engineClients = enginePath("config/clients");
  const dest = process.env.LAB_EXPORT_ROOT ? path.join(process.env.LAB_EXPORT_ROOT, `lab-${batchId}`) : fs.existsSync(engineClients) ? path.join(engineClients, client, "creative", `lab-${batchId}`) : dataPath("exports", `lab-${batchId}`);
  fs.mkdirSync(dest, { recursive: true });
  const rows = all("SELECT a.*, j.spec FROM assets a JOIN jobs j ON j.id=a.job_id WHERE j.batch_id=? AND a.status='approved'", batchId);
  if (!rows.length) throw new LabError("NOTHING", "no approved finals — approve with: node cli.mjs assemble approve --asset <id>");
  const manifest = [];
  const seenJobs = new Set();
  for (const r of rows) {
    const spec = pj(r.spec);
    const file = path.join(dest, path.basename(r.path));
    fs.copyFileSync(r.path, file);
    run("UPDATE assets SET status='exported', updated_at=? WHERE id=?", nowIso(), r.id);
    manifest.push({ asset: r.id, file: file.replace(/\\/g, "/"), sha256: sha256File(file), placement: r.placement, product: spec.product.slug, landing: spec.product.url, style: spec.style.id });
    if (!seenJobs.has(r.job_id)) {
      seenJobs.add(r.job_id);
      writeJson(path.join(dest, `${r.job_id}.copy.${spec.lang}.json`), { ...spec.copy, product: spec.product.slug, landing: spec.product.url, note: "Primary text per field already passed the compliance lexicon in preflight; still run compliance-check before campaign-builder." });
      writeJson(path.join(dest, `${r.job_id}.lineage.json`), { job: r.job_id, style: spec.style, product: spec.product, distinct_key: spec.distinct_key, tasks: all("SELECT id, model, credits, state FROM tasks WHERE job_id=?", r.job_id) });
    }
  }
  writeJson(path.join(dest, "manifest.json"), { batch: batchId, exported_at: nowIso(), client, items: manifest, next: "Launch only through ad-engine `/ads launch` (compliance-check → campaign-builder dry-run → --confirm). Use url_tags with utm_content={{ad.id}}." });
  return { dest: dest.replace(/\\/g, "/"), items: manifest.length };
}

export { readJson };
