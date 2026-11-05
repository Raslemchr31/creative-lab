// creative-lab :: deterministic QA gates (research/04 §6.2 Q6/Q7 + sanity checks) — no model, no human.

import fs from "node:fs";
import { probe, runTool, aspectLabel } from "../probe.mjs";
import { alphaStats } from "../compose.mjs";
import { config } from "../util.mjs";

const ff = () => config().tools?.ffmpeg || "ffmpeg";
const mg = () => config().tools?.magick || "magick";

/** Count scene cuts (scdet t=10), black segments and freezes on a clip. */
export function temporalScan(file, { scdet = 10 } = {}) {
  const r = runTool(ff(), ["-hide_banner", "-nostats", "-i", file, "-vf", `scdet=t=${scdet},blackdetect=d=0.15:pix_th=0.10,freezedetect=n=-58dB:d=0.5`, "-an", "-f", "null", "-"], { timeoutMs: 300000 });
  const log = `${r.stderr}`;
  const cuts = [...log.matchAll(/lavfi\.scd\.time:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  const blacks = [...log.matchAll(/black_start:([0-9.]+)\s+black_end:([0-9.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const freezes = [...log.matchAll(/freeze_start:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  return { cuts, blacks, freezes };
}

export function imageStd(file) {
  const r = runTool(mg(), [file, "-colorspace", "Gray", "-format", "%[fx:standard_deviation]", "info:"], { timeoutMs: 60000 });
  return Number(r.stdout.trim());
}

/**
 * Gate one downloaded output. `expect` = { kind: image|video|cutout, aspect, duration, camera }
 * Returns { verdict: PASS|WARN|FAIL, checks: [{id, level, msg}] }.
 */
export function gateOutput(file, expect = {}) {
  const checks = [];
  const add = (id, level, msg) => checks.push({ id, level, msg });
  if (!fs.existsSync(file)) {
    add("Q0_exists", "FAIL", `missing ${file}`);
    return { verdict: "FAIL", checks };
  }
  let p;
  try {
    p = probe(file);
  } catch (e) {
    add("Q7_decode", "FAIL", `cannot decode: ${e.message}`);
    return { verdict: "FAIL", checks };
  }
  const label = aspectLabel(p.display_w, p.display_h);
  if (expect.kind === "video") {
    add("Q7_kind", p.kind === "video" ? "PASS" : "FAIL", `${p.kind} ${p.display_w}×${p.display_h} ${p.codec} ${p.fps} fps ${p.duration?.toFixed?.(2)} s`);
    if (expect.aspect) add("Q7_aspect", label === expect.aspect ? "PASS" : "WARN", `aspect ${label} (expected ${expect.aspect}; Remotion fits it)`);
    if (expect.duration) add("Q7_duration", Math.abs((p.duration || 0) - expect.duration) <= 0.6 ? "PASS" : "WARN", `${p.duration?.toFixed?.(2)} s vs requested ${expect.duration} s`);
    if ((p.display_h || 0) < 700) add("Q7_resolution", "WARN", `low resolution ${p.display_w}×${p.display_h}`);
    const t = temporalScan(file);
    add("Q6_cuts", t.cuts.length === 0 ? "PASS" : "FAIL", t.cuts.length ? `${t.cuts.length} unplanned cut(s) at ${t.cuts.map((x) => x.toFixed(2)).join(", ")} s — single-shot generations must have none (FR3)` : "no scene cuts");
    add("Q6_black", t.blacks.length === 0 ? "PASS" : "FAIL", t.blacks.length ? `black frames ${JSON.stringify(t.blacks)}` : "no black frames");
    if (expect.camera !== "static") add("Q6_freeze", t.freezes.length === 0 ? "PASS" : "WARN", t.freezes.length ? `frozen at ${t.freezes.join(", ")} s` : "no freezes");
    add("Q9_model_audio", p.audio ? "WARN" : "PASS", p.audio ? "clip carries model audio — it is stripped at assembly" : "silent clip");
  } else {
    add("Q7_kind", p.kind === "image" ? "PASS" : "FAIL", `${p.kind} ${p.display_w}×${p.display_h}`);
    if (expect.aspect) add("Q7_aspect", label === expect.aspect ? "PASS" : expect.aspectLoose ? "WARN" : "WARN", `aspect ${label} (expected ${expect.aspect})`);
    if (Math.min(p.display_w || 0, p.display_h || 0) < 700) add("Q7_resolution", "WARN", `short side ${Math.min(p.display_w, p.display_h)} px`);
    const sd = imageStd(file);
    add("Q4_not_blank", sd > 0.02 ? "PASS" : "FAIL", `luma std ${sd.toFixed(3)}`);
    if (expect.kind === "cutout") {
      const a = alphaStats(file);
      const ok = a.coverage !== null && a.coverage > 0.05 && a.coverage < 0.97;
      add("Q1_cutout_alpha", ok ? "PASS" : "FAIL", `opaque coverage ${a.coverage} (needs a real transparent background)`);
    }
  }
  const verdict = checks.some((c) => c.level === "FAIL") ? "FAIL" : checks.some((c) => c.level === "WARN") ? "WARN" : "PASS";
  return { verdict, checks, probe: p };
}
