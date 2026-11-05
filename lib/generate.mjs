// creative-lab :: generation runner — staged, resumable, budget-capped, human-gated.
//
//   gen run --batch B --confirm B            (needs KIE_API_KEY in creative-lab/.env)
//   gen run --batch B --confirm B --mock     (full run against the local Kie mock — no key, no spend)
//   gen run --batch B --dry-run              (no network: resolved requests + cost written to disk)
//
// Stage A = cut-outs, plates, image edits/composes (cheap stills).  Local ops (fit/composite) run as
// soon as their inputs exist.  Stage B = harmonise / image-to-video (expensive) and starts only after
// stage A was reviewed (`--stage B` or `--through`).  A task that already has a provider task id is
// polled, never re-created, so an interrupted run resumes without double-spending.

import fs from "node:fs";
import path from "node:path";
import { all, get, run } from "./db.mjs";
import { config, loadEnv, labPath, ensureDir, nowIso, j, pj, LabError, sha256File, logLine, writeJson } from "./util.mjs";
import { KieClient, KieError } from "./kie/client.mjs";
import { startMockKie } from "./kie/mock-server.mjs";
import { estimate } from "./kie/registry.mjs";
import { downloadOne, mapLimit } from "./collector/media.mjs";
import { fitToAspect, compositeOnPlate, pasteBack, pixelLockCheck } from "./compose.mjs";
import { gateOutput } from "./qa/deterministic.mjs";
import { jobDir, batchDir } from "./batch.mjs";
import { getProduct } from "./products/sync.mjs";

const DONE = new Set(["success", "qa_pass", "qa_warn"]);
const usable = (t) => DONE.has(t.state);

function taskRow(id) {
  return get("SELECT * FROM tasks WHERE id=?", id);
}

/** The candidate actually used downstream: the selected sibling of `id` (same job/shot/route/placement). */
function selectedSibling(id) {
  const t = taskRow(id);
  if (!t) return null;
  const sib = all("SELECT * FROM tasks WHERE job_id=? AND shot_id=? AND route=? AND COALESCE(placement,'')=COALESCE(?, '') ORDER BY selected DESC, candidate", t.job_id, t.shot_id, t.route, t.placement);
  return sib.find((s) => s.selected && usable(s)) || sib.find((s) => usable(s) && !["qa_fail"].includes(s.state)) || t;
}

function opRow(id) {
  return get("SELECT * FROM ops WHERE id=?", id);
}

function depsReady(depIds) {
  for (const d of depIds) {
    const t = taskRow(d);
    if (t) {
      const s = selectedSibling(d);
      if (!s || !usable(s)) return false;
      continue;
    }
    const o = opRow(d);
    if (o && o.state !== "done") return false;
  }
  return true;
}

/** Local file of a $task/$local reference. */
function localFileOf(token) {
  const [kind, ...rest] = token.split(":");
  const id = rest.join(":");
  if (kind === "$task") {
    const t = selectedSibling(id);
    const outs = pj(t?.outputs, []);
    return outs[0] || null;
  }
  if (kind === "$local") return opRow(id)?.output || null;
  return null;
}

class Resolver {
  constructor(client, { dryRun }) {
    this.client = client;
    this.dryRun = dryRun;
  }
  async uploadCached(file) {
    if (this.dryRun) return `dry-upload://${path.basename(file)}`;
    const sha = sha256File(file);
    const ep = this.client.uploadBaseUrl;
    const hit = get("SELECT url, expires_at FROM upload_cache WHERE sha256=? AND endpoint=?", sha, ep);
    if (hit && hit.expires_at && new Date(hit.expires_at).getTime() - Date.now() > 2 * 3600e3) return hit.url;
    const up = await this.client.uploadFile(file, { uploadPath: "creative-lab", fileName: `${sha.slice(0, 12)}${path.extname(file)}` });
    run("INSERT INTO upload_cache(sha256, endpoint, url, uploaded_at, expires_at) VALUES(?,?,?,?,?) ON CONFLICT(sha256, endpoint) DO UPDATE SET url=excluded.url, uploaded_at=excluded.uploaded_at, expires_at=excluded.expires_at", sha, ep, up.url, nowIso(), new Date(Date.now() + 24 * 3600e3).toISOString());
    return up.url;
  }
  async token(v) {
    if (typeof v !== "string" || !v.startsWith("$")) return v;
    if (v.startsWith("$ref:")) {
      const [slug, idx] = v.slice(5).split("#");
      const p = getProduct(slug);
      const ref = p?.refs?.[Number(idx)];
      if (!ref) throw new LabError("REF", `missing reference ${v}`);
      // Public store URLs are fetchable by Kie directly; local-only photos are uploaded.
      if (ref.url && /^https?:\/\//.test(ref.url) && !this.client?.isMock) return ref.url;
      if (!ref.path) throw new LabError("REF", `reference ${v} has neither a public URL nor a local file`);
      return this.uploadCached(ref.path);
    }
    if (v.startsWith("$task:")) {
      const t = selectedSibling(v.slice(6));
      const urls = pj(t?.result_urls, []);
      const fresh = t?.updated_at && Date.now() - new Date(t.updated_at).getTime() < 12 * 864e5;
      if (urls[0] && fresh && !this.dryRun) return urls[0];
      const f = localFileOf(v);
      if (!f) {
        if (this.dryRun) return `dry-dep://${v.slice(1)}`;
        throw new LabError("DEP", `no output yet for ${v}`);
      }
      return this.uploadCached(f);
    }
    if (v.startsWith("$local:")) {
      const f = localFileOf(v);
      if (!f) {
        if (this.dryRun) return `dry-dep://${v.slice(1)}`;
        throw new LabError("DEP", `local op not done: ${v}`);
      }
      return this.uploadCached(f);
    }
    return v;
  }
  async deep(x) {
    if (Array.isArray(x)) return Promise.all(x.map((y) => this.deep(y)));
    if (x && typeof x === "object") {
      const out = {};
      for (const [k, v] of Object.entries(x)) out[k] = await this.deep(v);
      return out;
    }
    return this.token(x);
  }
}

/** Execute one local op (fit / composite / pasteback). Free, deterministic, re-runnable. */
export async function runOp(op) {
  const inputs = pj(op.inputs, {});
  const dir = ensureDir(path.join(jobDir(op.batch_id, op.job_id), "ops"));
  const out = path.join(dir, `${op.id}.png`).replace(/\\/g, "/");
  let meta = {};
  if (op.kind === "fit") {
    fitToAspect(inputs.src, out, { aspect: inputs.aspect, mode: inputs.mode });
  } else if (op.kind === "composite") {
    const plate = localFileOf(inputs.plate);
    const cutout = localFileOf(inputs.cutout);
    if (!plate || !cutout) throw new LabError("DEP", `composite ${op.id}: plate or cut-out missing`);
    const r = compositeOnPlate({ plate, cutout, out, box: inputs.box, shadow: inputs.shadow !== false });
    const lock = await pixelLockCheck({ output: out, cutout, placement: r.placement, workDir: path.join(dir, `${op.id}-lock`) });
    meta = { placement: r.placement, plate_size: r.plate, plate_file: plate, cutout_file: cutout, pixel_lock: lock };
  } else if (op.kind === "pasteback") {
    const base = localFileOf(inputs.base);
    const cutout = localFileOf(inputs.cutout);
    const comp = opRow(inputs.composite);
    const cm = pj(comp?.meta, {});
    if (!base || !cutout || !cm.placement) throw new LabError("DEP", `pasteback ${op.id}: inputs missing`);
    pasteBack({ base, cutout, placement: cm.placement, out, size: cm.plate_size });
    meta = { placement: cm.placement, pixel_lock: await pixelLockCheck({ output: out, cutout, placement: cm.placement, workDir: path.join(dir, `${op.id}-lock`) }) };
  } else throw new LabError("OP", `unknown op kind ${op.kind}`);
  run("UPDATE ops SET state='done', output=?, meta=?, error=NULL, updated_at=? WHERE id=?", out, j(meta), nowIso(), op.id);
  return { id: op.id, out, meta };
}

function expectFor(t) {
  const req = pj(t.request, {});
  const inp = req.input || {};
  if (t.route === "cutout") return { kind: "cutout" };
  if (["i2v", "r2v", "broll"].includes(t.route)) return { kind: "video", aspect: t.placement, duration: inp.duration, camera: null };
  return { kind: "image", aspect: t.route === "image_edit" ? null : t.placement };
}

async function downloadResults(t, urls, client) {
  const dir = ensureDir(path.join(jobDir(t.batch_id, t.job_id), "tasks", t.id));
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    let r = await downloadOne(urls[i], dir, `out-${i}`, { referer: "https://kie.ai/" });
    if (!r.ok && client && !client.isMock) {
      try {
        const tmp = await client.downloadUrl(urls[i]);
        r = await downloadOne(tmp, dir, `out-${i}`, { referer: "https://kie.ai/" });
      } catch {}
    }
    if (!r.ok) throw new LabError("DOWNLOAD", `${t.id}: ${r.error}`);
    files.push(r.path);
  }
  return files;
}

/**
 * Run (or resume) generation for a batch.
 * @param {object} o { batchId, confirm, stage: 'A'|'B'|'auto', through, dryRun, mock, maxCredits, onProgress }
 */
export async function runGeneration({ batchId, confirm, stage = "auto", through = false, dryRun = false, mock = false, maxCredits, onProgress = () => {} }) {
  const b = get("SELECT * FROM batches WHERE id=?", batchId);
  if (!b) throw new LabError("NOT_FOUND", `batch ${batchId}`);
  if (b.status === "blocked") throw new LabError("PREFLIGHT", `batch ${batchId} is BLOCKED by preflight — fix and re-run: node cli.mjs batch preflight --batch ${batchId}`);
  if (!dryRun && confirm !== batchId) throw new LabError("CONFIRM", `generation spends Kie credits — re-run with --confirm ${batchId} after reviewing: node cli.mjs batch preflight --batch ${batchId}`);
  const cfg = config().kie;
  const cap = Math.min(maxCredits ?? Infinity, cfg.max_credits_per_batch);

  let client = null;
  let mockSrv = null;
  if (!dryRun) {
    if (mock) {
      mockSrv = await startMockKie({ dir: path.join(batchDir(batchId), "mock-kie") });
      client = new KieClient({ apiKey: mockSrv.apiKey, baseUrl: mockSrv.url, uploadBaseUrl: mockSrv.url, retryBaseMs: 50 });
      client.isMock = true;
    } else {
      const env = loadEnv();
      if (!env.KIE_API_KEY) throw new LabError("NO_KEY", "KIE_API_KEY missing — put it in creative-lab/.env (see .env.example), or use --mock / --dry-run");
      client = new KieClient({ apiKey: env.KIE_API_KEY, baseUrl: env.KIE_BASE_URL || cfg.base_url, uploadBaseUrl: env.KIE_UPLOAD_BASE_URL || cfg.upload_base_url });
    }
  }
  const resolver = new Resolver(client, { dryRun });
  const summary = { batch: batchId, mode: dryRun ? "dry-run" : mock ? "mock" : "live", stages: [], ops: 0, created: 0, succeeded: 0, failed: 0, credits: 0, dry_requests: [] };

  try {
    if (client && !dryRun) {
      const bal = await client.credits();
      summary.balance_before = bal;
      onProgress({ event: "balance", credits: bal });
    }
    const stages = stage === "auto" ? ["A", "B"] : [stage];
    for (const st of stages) {
      if (st === "B" && stage === "auto" && !through && cfg.review_between_stages !== false) {
        const pendingA = all("SELECT COUNT(*) n FROM tasks WHERE batch_id=? AND stage='A' AND state NOT IN ('success','qa_pass','qa_warn','qa_fail','failed')", batchId)[0].n;
        const reviewed = all("SELECT COUNT(*) n FROM qa WHERE target_id LIKE ? AND kind='vision'", `${batchId}-%`)[0].n;
        if (pendingA === 0 && reviewed === 0) {
          summary.stopped = "stage A done — review stills (node cli.mjs qa pack --batch " + batchId + ") then run with --stage B (or --through)";
          break;
        }
      }
      await runLocalOps(batchId, summary, onProgress, dryRun);
      const tasks = all("SELECT * FROM tasks WHERE batch_id=? AND stage=? ORDER BY job_id, shot_id, candidate", batchId, st);
      const runnable = dryRun ? tasks.filter((t) => !usable(t)) : tasks.filter((t) => !usable(t) && t.state !== "qa_fail" && (t.attempts || 0) < cfg.max_attempts_per_shot && depsReady(pj(t.depends, [])));
      const blocked = tasks.filter((t) => !usable(t) && !runnable.includes(t));
      summary.stages.push({ stage: st, total: tasks.length, runnable: runnable.length, waiting_on_deps: blocked.length });
      const plannedCost = runnable.reduce((s, t) => s + (t.est_credits || 0), 0);
      const spent = get("SELECT spent_credits FROM batches WHERE id=?", batchId).spent_credits || 0;
      if (!dryRun && spent + plannedCost > cap) throw new LabError("BUDGET", `stage ${st} needs ~${plannedCost.toFixed(1)} credits; spent ${spent.toFixed(1)} of cap ${cap}. Raise --max-credits or config.kie.max_credits_per_batch deliberately.`);
      if (!dryRun && summary.balance_before !== undefined && plannedCost > summary.balance_before) throw new LabError("CREDITS", `account balance ${summary.balance_before} < planned ${plannedCost.toFixed(1)} credits — top up first`);
      run("UPDATE batches SET status='generating', updated_at=? WHERE id=?", nowIso(), batchId);
      await mapLimit(runnable, dryRun ? 8 : cfg.concurrency || 3, async (t) => executeTask(t, { client, resolver, dryRun, summary, onProgress }));
      await runLocalOps(batchId, summary, onProgress, dryRun);
    }
  } finally {
    if (mockSrv) await mockSrv.close();
  }
  const left = all("SELECT state, COUNT(*) n FROM tasks WHERE batch_id=? GROUP BY state", batchId);
  summary.task_states = Object.fromEntries(left.map((r) => [r.state, r.n]));
  const pending = left.filter((r) => !["success", "qa_pass", "qa_warn"].includes(r.state)).reduce((s, r) => s + r.n, 0);
  if (!dryRun) run("UPDATE batches SET status=?, updated_at=? WHERE id=?", pending ? "generating" : "generated", nowIso(), batchId);
  if (dryRun) writeJson(path.join(batchDir(batchId), "dry-run.json"), summary);
  logLine("generate", { batch: batchId, mode: summary.mode, created: summary.created, succeeded: summary.succeeded, failed: summary.failed, credits: summary.credits });
  return summary;
}

async function runLocalOps(batchId, summary, onProgress, dryRun) {
  for (let pass = 0; pass < 4; pass++) {
    const ops = all("SELECT * FROM ops WHERE batch_id=? AND state!='done'", batchId).filter((o) => depsReady(pj(o.depends, [])));
    if (!ops.length) return;
    for (const o of ops) {
      if (dryRun && o.kind !== "fit") continue;
      try {
        await runOp(o);
        summary.ops++;
        onProgress({ event: "op", id: o.id, kind: o.kind });
      } catch (e) {
        run("UPDATE ops SET state='failed', error=?, updated_at=? WHERE id=?", e.message, nowIso(), o.id);
        onProgress({ event: "op_failed", id: o.id, error: e.message });
      }
    }
    if (dryRun) return;
  }
}

async function executeTask(t, { client, resolver, dryRun, summary, onProgress }) {
  const req = pj(t.request, {});
  try {
    if (dryRun) {
      const input = await resolver.deep(req.input);
      const est = estimate(t.model, input);
      summary.dry_requests.push({ id: t.id, model: t.model, est, input });
      writeJson(path.join(jobDir(t.batch_id, t.job_id), "dry-run", `${t.id}.json`), { model: t.model, input, est });
      return;
    }
    let providerId = t.provider_task_id;
    if (!providerId) {
      const input = await resolver.deep(req.input);
      const created = await client.createTask(t.model, input);
      providerId = created.taskId;
      run("UPDATE tasks SET provider_task_id=?, state='submitted', attempts=attempts+1, request=?, updated_at=? WHERE id=?", providerId, j({ ...req, resolved_input: input }), nowIso(), t.id);
      summary.created++;
      onProgress({ event: "created", id: t.id, model: t.model, taskId: providerId });
    }
    const res = await client.waitTask(providerId, { timeoutMs: config().kie.poll.timeout_ms, firstMs: client.isMock ? 200 : config().kie.poll.first_ms, maxIntervalMs: client.isMock ? 500 : config().kie.poll.max_interval_ms, onPoll: (s) => run("UPDATE tasks SET state=?, updated_at=? WHERE id=?", s.state === "success" || s.state === "fail" ? "submitted" : s.state, nowIso(), t.id) });
    if (!res.ok) {
      run("UPDATE tasks SET state='failed', error=?, credits=?, provider_task_id=NULL, updated_at=? WHERE id=?", `${res.failCode || ""} ${res.failMsg || "failed"}`.trim(), res.creditsConsumed ?? 0, nowIso(), t.id);
      summary.failed++;
      onProgress({ event: "failed", id: t.id, error: res.failMsg });
      return;
    }
    const files = await downloadResults({ ...t }, res.resultUrls, client);
    const credits = res.creditsConsumed ?? t.est_credits ?? 0;
    run("UPDATE batches SET spent_credits = spent_credits + ? WHERE id=?", credits, t.batch_id);
    summary.credits += credits;
    const gate = gateOutput(files[0], expectFor(t));
    run("INSERT INTO qa(target_kind, target_id, kind, verdict, score, json, created_at) VALUES('task',?,?,?,?,?,?)", t.id, "deterministic", gate.verdict, null, j(gate.checks), nowIso());
    const state = gate.verdict === "FAIL" ? "qa_fail" : gate.verdict === "WARN" ? "qa_warn" : "qa_pass";
    run("UPDATE tasks SET state=?, result_urls=?, outputs=?, credits=?, error=NULL, updated_at=? WHERE id=?", state, j(res.resultUrls), j(files), credits, nowIso(), t.id);
    // If the selected candidate failed its gate, hand selection to the next usable sibling.
    if (state === "qa_fail") {
      const fresh = taskRow(t.id);
      if (fresh.selected) {
        const alt = all("SELECT id FROM tasks WHERE job_id=? AND shot_id=? AND route=? AND COALESCE(placement,'')=COALESCE(?,'') AND id!=? AND state IN ('qa_pass','qa_warn','success')", t.job_id, t.shot_id, t.route, t.placement, t.id)[0];
        if (alt) {
          run("UPDATE tasks SET selected=0 WHERE id=?", t.id);
          run("UPDATE tasks SET selected=1 WHERE id=?", alt.id);
        }
      }
    }
    summary.succeeded++;
    onProgress({ event: "done", id: t.id, state, files });
  } catch (e) {
    const fatal = e instanceof KieError && e.fatal;
    run("UPDATE tasks SET state=?, error=?, updated_at=? WHERE id=?", fatal ? "failed" : t.provider_task_id ? "submitted" : "planned", `${e.code || ""} ${e.message}`.trim(), nowIso(), t.id);
    summary.failed++;
    onProgress({ event: "error", id: t.id, error: e.message });
    if (fatal && [401, 402, 433].includes(e.code)) throw e; // stop the batch: key, credits or quota problem
  }
}

/** Mark one candidate as the one to use downstream (vision QA decides). */
export function selectCandidate(taskId) {
  const t = taskRow(taskId);
  if (!t) throw new LabError("NOT_FOUND", `task ${taskId}`);
  run("UPDATE tasks SET selected=0 WHERE job_id=? AND shot_id=? AND route=? AND COALESCE(placement,'')=COALESCE(?,'')", t.job_id, t.shot_id, t.route, t.placement);
  run("UPDATE tasks SET selected=1 WHERE id=?", taskId);
  // Downstream local ops built from the old selection must be rebuilt.
  run("UPDATE ops SET state='planned', output=NULL WHERE job_id=? AND depends LIKE ?", t.job_id, `%${t.job_id}-${t.shot_id}-${t.route}%`);
  return { selected: taskId };
}

export { fs };
