// creative-lab :: vision-QA packs (what Claude/the owner looks at) + verdict recording.
// research/04 §6.4: feed side-by-side composites — reference left, candidate right — and for video the
// contact sheet + a strip of the whole clip (zoom strips catch morphs that scdet misses).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { all, get, run } from "../db.mjs";
import { config, ensureDir, nowIso, j, pj, LabError, writeJson } from "../util.mjs";
import { assertValid } from "../schema.mjs";
import { jobDir, batchDir } from "../batch.mjs";
import { getProduct } from "../products/sync.mjs";
import { selectCandidate } from "../generate.mjs";

const mg = () => config().tools?.magick || "magick";

function montage(files, labels, out, { tile = null, size = 520 } = {}) {
  const args = ["montage"];
  files.forEach((f, i) => args.push("-label", labels[i] || path.basename(f), f));
  args.push("-tile", tile || `${files.length}x1`, "-geometry", `${size}x${size}+8+8`, "-background", "#1b1b1b", "-fill", "#eeeeee", "-pointsize", "18", out);
  const r = spawnSync(mg(), args, { encoding: "utf8", windowsHide: true, timeout: 120000 });
  if (r.status !== 0) throw new Error(`montage failed: ${(r.stderr || "").slice(0, 300)}`);
  return out;
}

function stripOfVideo(file, out, { fps = 2, cols = 6, w = 300 } = {}) {
  const r = spawnSync(config().tools?.ffmpeg || "ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", file, "-vf", `fps=${fps},scale=${w}:-2,tile=${cols}x2`, "-frames:v", "1", out], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  return r.status === 0 && fs.existsSync(out) ? out : null;
}

export function buildVisionPack(batchId, { stage } = {}) {
  const tasks = all(`SELECT * FROM tasks WHERE batch_id=? ${stage ? "AND stage=?" : ""} AND outputs IS NOT NULL ORDER BY job_id, shot_id, route, placement, candidate`, ...(stage ? [batchId, stage] : [batchId]));
  const ops = all("SELECT * FROM ops WHERE batch_id=? AND state='done' AND kind IN ('composite','pasteback')", batchId);
  const qaDir = ensureDir(path.join(batchDir(batchId), "qa"));
  const items = [];
  for (const t of tasks) {
    const outs = pj(t.outputs, []);
    if (!outs.length) continue;
    const job = get("SELECT product_slug FROM jobs WHERE id=?", t.job_id);
    const prod = getProduct(job.product_slug);
    const refs = (prod?.refs || []).filter((r) => r.approved && r.path && fs.existsSync(r.path)).slice(0, 2);
    const isVideo = /\.(mp4|mov|webm)$/i.test(outs[0]);
    const sheet = path.join(qaDir, `${t.id}.compare.jpg`);
    try {
      if (isVideo) {
        const strip = stripOfVideo(outs[0], path.join(qaDir, `${t.id}.strip.jpg`));
        const parts = [...refs.map((r) => r.path), ...(strip ? [strip] : [])];
        if (parts.length) montage(parts, [...refs.map((_, i) => `REFERENCE ${i + 1}`), "OUTPUT 2 fps (t →)"], sheet, { tile: `${parts.length}x1`, size: 640 });
      } else {
        montage([...refs.map((r) => r.path), outs[0]], [...refs.map((_, i) => `REFERENCE ${i + 1}`), `OUTPUT ${t.route} c${t.candidate}`], sheet);
      }
    } catch (e) {
      items.push({ task_id: t.id, error: e.message });
      continue;
    }
    const det = get("SELECT verdict, json FROM qa WHERE target_kind='task' AND target_id=? AND kind='deterministic' ORDER BY id DESC", t.id);
    const tmpl = { task_id: t.id, verdict: "review", select: false, same_product: t.route === "plate_still" || t.route === "broll" ? null : true, attributes: {}, invented_elements: [], anatomy_defects: [], mouth_moving: false, text_in_plate: false, morph_or_drift: false, composition_ok: true, style_match: 3, aesthetic: 3, notes: null, fix: null, reviewer: "claude", confidence: 0.7 };
    writeJson(path.join(qaDir, `${t.id}.qa.json`), tmpl);
    items.push({ task_id: t.id, route: t.route, model: t.model, placement: t.placement, candidate: t.candidate, selected: !!t.selected, compare: sheet.replace(/\\/g, "/"), output: outs[0], deterministic: det ? { verdict: det.verdict, failing: pj(det.json, []).filter((c) => c.level !== "PASS") } : null, prompt: (pj(t.request, {}).input?.prompt || "").slice(0, 300), template: path.join(qaDir, `${t.id}.qa.json`).replace(/\\/g, "/") });
  }
  for (const o of ops) {
    const m = pj(o.meta, {});
    items.push({ op_id: o.id, kind: o.kind, output: o.output, pixel_lock: m.pixel_lock || null });
  }
  const md = [`# Vision QA — batch ${batchId}${stage ? ` (stage ${stage})` : ""}`, "", "For each item: read the compare sheet (references left, output right), fill the template JSON, then `node cli.mjs qa set --file <template>`.", "FAIL on: different product (shape/colour/hardware/logo), invented boxes/text/logos/extra items, warped hands, moving mouths, mid-clip morphs. Plates: FAIL on any readable text or product-like object.", ""];
  for (const it of items) {
    if (it.task_id && it.compare) {
      md.push(`## ${it.task_id}  ${it.selected ? "★ selected" : ""}`, `- ${it.route} · ${it.model} · ${it.placement || "-"} · c${it.candidate}`, `- deterministic: ${it.deterministic?.verdict || "?"}${it.deterministic?.failing?.length ? ` (${it.deterministic.failing.map((c) => `${c.id} ${c.msg}`).join("; ")})` : ""}`, `- compare: \`${it.compare}\``, `- prompt: ${it.prompt}`, `- verdict file: \`${it.template}\``, "");
    } else if (it.op_id) md.push(`## local ${it.kind} ${it.op_id}`, `- output: \`${it.output}\``, `- pixel-lock: ${JSON.stringify(it.pixel_lock)}`, "");
    else md.push(`## ${it.task_id} — ERROR ${it.error}`, "");
  }
  fs.writeFileSync(path.join(qaDir, "VISION-QA.md"), md.join("\n"), "utf8");
  return { batch: batchId, items: items.length, file: path.join(qaDir, "VISION-QA.md").replace(/\\/g, "/") };
}

export function recordVisionQa(v) {
  assertValid("qa-vision", v);
  const t = get("SELECT * FROM tasks WHERE id=?", v.task_id);
  if (!t) throw new LabError("NOT_FOUND", `task ${v.task_id}`);
  const fail = v.verdict === "fail" || v.same_product === false || (v.invented_elements || []).length > 0 || (v.anatomy_defects || []).length > 0 || v.mouth_moving || v.text_in_plate || v.morph_or_drift || ["mismatch"].includes(v.attributes?.silhouette) || ["mismatch"].includes(v.attributes?.colour) || ["misspelled", "added"].includes(v.attributes?.logo);
  const verdict = fail ? "FAIL" : v.verdict === "review" ? "REVIEW" : "PASS";
  const score = Math.round(((v.style_match || 3) + (v.aesthetic || 3)) * 10);
  run("INSERT INTO qa(target_kind, target_id, kind, verdict, score, json, created_at) VALUES('task',?,?,?,?,?,?)", v.task_id, "vision", verdict, score, j(v), nowIso());
  if (verdict === "FAIL") {
    run("UPDATE tasks SET state='qa_fail', updated_at=? WHERE id=?", nowIso(), v.task_id);
    if (t.selected) {
      const alt = all("SELECT id FROM tasks WHERE job_id=? AND shot_id=? AND route=? AND COALESCE(placement,'')=COALESCE(?,'') AND id!=? AND state IN ('qa_pass','qa_warn','success')", t.job_id, t.shot_id, t.route, t.placement, t.id)[0];
      if (alt) selectCandidate(alt.id);
    }
  } else if (v.select) selectCandidate(v.task_id);
  return { task: v.task_id, verdict, score, attempts: t.attempts };
}
