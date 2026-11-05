// creative-lab :: batches — compile (product × style) jobs, persist, preflight, report.

import fs from "node:fs";
import path from "node:path";
import { all, get, run, tx, upsert } from "./db.mjs";
import { labPath, ensureDir, nowIso, j, pj, writeJson, LabError, config, dataPath } from "./util.mjs";
import { compileJob } from "./compiler/compile.mjs";
import { preflightBatch } from "./preflight.mjs";

export const batchDir = (id) => dataPath("batches", id);
export const jobDir = (batchId, jobId) => dataPath("batches", batchId, "jobs", jobId);

function newBatchId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const n = all("SELECT id FROM batches WHERE id LIKE ?", `b${d}-%`).length + 1;
  return `b${d}-${String(n).padStart(2, "0")}`;
}

/**
 * items: [{ product: slug, styles: [id | {id, take}], placements?, lang? }]
 * settings: { draft?: bool, lang?: "ar-DZ"|"fr", placements?: [...] }
 */
export async function createBatch({ name, items, settings = {} }) {
  if (!items?.length) throw new LabError("ARGS", "a batch needs at least one item {product, styles}");
  const id = settings.id || newBatchId();
  if (get("SELECT id FROM batches WHERE id=?", id)) throw new LabError("EXISTS", `batch ${id} exists`);
  const specs = [];
  const errors = [];
  items.forEach((it, i) => {
    const jobId = `${id}-j${String(i + 1).padStart(2, "0")}`;
    try {
      specs.push(compileJob({ batchId: id, jobId, idx: i, slug: it.product, styles: it.styles, placements: it.placements || settings.placements, lang: it.lang || settings.lang, draft: !!settings.draft }));
    } catch (e) {
      errors.push({ item: i, product: it.product, styles: it.styles, error: e.message });
    }
  });
  if (errors.length) throw new LabError("COMPILE", `compile failed:\n${errors.map((e) => `  #${e.item} ${e.product} × ${JSON.stringify(e.styles)}: ${e.error}`).join("\n")}`);
  const now = nowIso();
  const est = specs.reduce((a, s) => ({ c: a.c + s.cost.credits, u: a.u + s.cost.usd }), { c: 0, u: 0 });
  tx(() => {
    upsert("batches", "id", { id, name: name || id, status: "compiled", settings: j({ ...settings, items }), created_at: now, updated_at: now, est_credits: Number(est.c.toFixed(2)), est_usd: Number(est.u.toFixed(3)), spent_credits: 0, notes: null });
    for (const s of specs) {
      upsert("jobs", "id", { id: s.job_id, batch_id: id, idx: s.idx, product_slug: s.product.slug, style_ids: j(s.style.blended_from), spec: j(s), preflight: null, status: "compiled", est_credits: s.cost.credits, est_usd: s.cost.usd, created_at: now, updated_at: now });
      for (const t of s.tasks) {
        upsert("tasks", "id", { id: t.id, job_id: s.job_id, batch_id: id, shot_id: t.shot_id, candidate: t.candidate, provider: "kie", model: t.model, request: j({ model: t.model, input: t.input }), provider_task_id: null, state: "planned", attempts: 0, result_urls: null, outputs: null, est_credits: t.est.credits, credits: null, error: null, created_at: now, updated_at: now, stage: t.stage, route: t.route, placement: t.placement, selected: t.candidate === 0 ? 1 : 0, depends: j(t.depends_on) });
      }
      for (const o of s.ops) upsert("ops", "id", { id: o.id, job_id: s.job_id, batch_id: id, kind: o.kind, shot_id: o.shot_id, placement: o.placement, inputs: j(o.inputs), depends: j(o.depends_on), state: "planned", output: null, meta: null, error: null, updated_at: now });
      const dir = ensureDir(jobDir(id, s.job_id));
      writeJson(path.join(dir, "spec.json"), s);
      for (const [pl, e] of Object.entries(s.edl)) writeJson(path.join(dir, `edl-${pl.replace(":", "x")}.draft.json`), e);
    }
  });
  writeJson(path.join(batchDir(id), "batch.json"), { id, name: name || id, created_at: now, settings, items });
  return runPreflight(id);
}

export async function runPreflight(id) {
  const b = get("SELECT * FROM batches WHERE id=?", id);
  if (!b) throw new LabError("NOT_FOUND", `batch ${id}`);
  const jobs = all("SELECT * FROM jobs WHERE batch_id=? ORDER BY idx", id);
  const specs = jobs.map((r) => pj(r.spec));
  const pf = await preflightBatch(specs);
  tx(() => {
    for (const jr of pf.jobs) run("UPDATE jobs SET preflight=?, status=?, updated_at=? WHERE id=?", j(jr), jr.verdict === "BLOCK" ? "blocked" : "ready", nowIso(), jr.job_id);
    run("UPDATE batches SET status=?, notes=?, updated_at=? WHERE id=?", pf.verdict === "BLOCK" ? "blocked" : "ready", j({ preflight: { verdict: pf.verdict, batch: pf.batch } }), nowIso(), id);
  });
  writeJson(path.join(batchDir(id), "preflight.json"), pf);
  return getBatch(id);
}

export function listBatches() {
  return all("SELECT b.*, (SELECT COUNT(*) FROM jobs WHERE batch_id=b.id) AS jobs FROM batches b ORDER BY created_at DESC").map((b) => ({ id: b.id, name: b.name, status: b.status, created_at: b.created_at, est_credits: b.est_credits, est_usd: b.est_usd, spent_credits: b.spent_credits, jobs: b.jobs }));
}

export function getBatch(id) {
  const b = get("SELECT * FROM batches WHERE id=?", id);
  if (!b) return null;
  const notes = pj(b.notes, {});
  const jobs = all("SELECT * FROM jobs WHERE batch_id=? ORDER BY idx", id).map((r) => {
    const tasks = all("SELECT * FROM tasks WHERE job_id=? ORDER BY stage, shot_id, placement, candidate", r.id).map((t) => ({ id: t.id, stage: t.stage, shot_id: t.shot_id, route: t.route, placement: t.placement, candidate: t.candidate, selected: !!t.selected, model: t.model, state: t.state, request: pj(t.request), provider_task_id: t.provider_task_id, outputs: pj(t.outputs, []), est_credits: t.est_credits, credits: t.credits, error: t.error, qa: all("SELECT kind, verdict, score, json, created_at FROM qa WHERE target_kind='task' AND target_id=? ORDER BY id DESC", t.id).map((q) => ({ ...q, json: pj(q.json) })) }));
    const ops = all("SELECT * FROM ops WHERE job_id=? ORDER BY id", r.id).map((o) => ({ ...o, inputs: pj(o.inputs), depends: pj(o.depends), meta: pj(o.meta) }));
    const assets = all("SELECT * FROM assets WHERE job_id=? ORDER BY placement", r.id).map((a) => ({ ...a, lineage: pj(a.lineage) }));
    return { id: r.id, idx: r.idx, product_slug: r.product_slug, style_ids: pj(r.style_ids, []), status: r.status, est_credits: r.est_credits, est_usd: r.est_usd, spec: pj(r.spec), preflight: pj(r.preflight), tasks, ops, assets };
  });
  return { id: b.id, name: b.name, status: b.status, settings: pj(b.settings, {}), created_at: b.created_at, est_credits: b.est_credits, est_usd: b.est_usd, spent_credits: b.spent_credits, preflight: notes.preflight || null, jobs };
}

/** Human-readable preflight report (CLI). */
export function preflightReport(batch) {
  const L = [];
  L.push(`Batch ${batch.id} "${batch.name}" — ${batch.status.toUpperCase()} · est ${batch.est_credits} credits ≈ $${batch.est_usd} · ${batch.jobs.length} jobs`);
  for (const c of batch.preflight?.batch || []) L.push(`  ${c.level.padEnd(5)} ${c.id}: ${c.msg}`);
  for (const jb of batch.jobs) {
    const pf = jb.preflight || { verdict: "?", checks: [] };
    L.push(`\n[${pf.verdict}] ${jb.id}  ${jb.product_slug} × ${jb.style_ids.join(" + ")}  ~$${jb.est_usd}  (${jb.tasks.length} tasks, ${jb.spec.shoot_requests.length} shoot)`);
    for (const c of pf.checks) if (c.level !== "PASS" || process.env.LAB_VERBOSE) L.push(`    ${c.level.padEnd(5)} ${c.id}: ${c.msg}`);
  }
  return L.join("\n");
}

export function deleteBatch(id) {
  tx(() => {
    run("DELETE FROM tasks WHERE batch_id=?", id);
    run("DELETE FROM ops WHERE batch_id=?", id);
    run("DELETE FROM assets WHERE job_id IN (SELECT id FROM jobs WHERE batch_id=?)", id);
    run("DELETE FROM qa WHERE target_id LIKE ?", `${id}-%`);
    run("DELETE FROM jobs WHERE batch_id=?", id);
    run("DELETE FROM batches WHERE id=?", id);
  });
  fs.rmSync(batchDir(id), { recursive: true, force: true });
  return { deleted: id };
}

export { config };
