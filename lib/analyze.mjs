// creative-lab :: evidence packs + DNA storage.
//
// An evidence pack is everything the analyst (Claude, reading images) needs to fill a
// Creative DNA without watching video: contact sheet, a 0–3 s hook strip, per-shot
// keyframes, audio structure + Arabic/French ASR (a LEAD, never a quote — whisper
// hallucinates on music), the ad copy, palette, and the winner signals. The DNA is then
// written as JSON and validated against schemas/creative-dna.schema.json.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { all, get, run, upsert } from "./db.mjs";
import { config, labPath, ensureDir, nowIso, j, pj, LabError, readJson, writeJson, dataPath } from "./util.mjs";
import { runTool, probe, aspectLabel } from "./probe.mjs";
import { assertValid } from "./schema.mjs";
import { mapLimit } from "./collector/media.mjs";

function spawnAsync(bin, args, { timeoutMs = 900000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e) });
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

/** Top-N palette (hex) of an image via ImageMagick histogram. */
export function palette(file, n = 5) {
  const r = runTool(config().tools.magick || "magick", [file, "-resize", "120x120!", "+dither", "-colors", String(n + 1), "-format", "%c", "histogram:info:-"], { timeoutMs: 60000 });
  if (r.code !== 0) return [];
  return r.stdout
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*(\d+):.*?(#[0-9A-Fa-f]{6})/))
    .filter(Boolean)
    .map((m) => ({ n: Number(m[1]), hex: m[2].toUpperCase() }))
    .sort((a, b) => b.n - a.n)
    .slice(0, n)
    .map((x) => x.hex);
}

function asrLang(ad) {
  if (ad.lang === "fr") return "fr";
  if (ad.lang === "en") return "en";
  return "ar";
}

/**
 * Fast ASR lead on the first `seconds` of a video: whisper.cpp small model on all cores.
 * (vkit's full sweep picks large-v3-turbo with default threads: 9+ min for a 40 s ad on
 * this box — too slow for batch evidence. Small/all-cores ≈ 1 min and is only a lead anyway.)
 */
export async function asrLead(file, outDir, { seconds = 25, lang = "ar", model, timeoutMs = 300000 } = {}) {
  const os = await import("node:os");
  const home = process.env.USERPROFILE || process.env.HOME || ".";
  const candidates = [model, process.env.LAB_WHISPER_MODEL, path.join(home, ".whisper/models/ggml-small.bin"), path.join(home, ".whisper/models/ggml-large-v3-turbo.bin")].filter(Boolean);
  const m = candidates.find((c) => fs.existsSync(c));
  if (!m) return { ok: false, reason: "no whisper model found" };
  const wav = path.join(outDir, "asr-lead.16k.wav");
  const ex = runTool(config().tools.ffmpeg || "ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", file, "-t", String(seconds), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
  if (ex.code !== 0 || !fs.existsSync(wav)) return { ok: false, reason: `audio extract failed: ${ex.stderr.slice(0, 200)}` };
  const prefix = path.join(outDir, "asr-lead");
  const r = await spawnAsync("whisper-cli", ["-m", m, "-f", wav, "-l", lang, "-t", String(Math.max(2, os.cpus().length)), "-oj", "-of", prefix, "-np"], { timeoutMs });
  const jp = `${prefix}.json`;
  if (!fs.existsSync(jp)) return { ok: false, reason: `whisper produced no output (code ${r.code})` };
  try {
    const jj = JSON.parse(fs.readFileSync(jp, "utf8"));
    const segments = (jj.transcription || []).map((t) => ({ start: (t.offsets?.from ?? 0) / 1000, end: (t.offsets?.to ?? 0) / 1000, text: (t.text || "").trim() })).filter((s) => s.text);
    return { ok: true, model: path.basename(m), lang, seconds, segments };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** Build (or rebuild with force) the evidence pack for one library ad. */
export async function buildEvidence(adId, { force = false, asr = true } = {}) {
  const ad = get("SELECT * FROM ads WHERE ad_archive_id=?", adId);
  if (!ad) throw new LabError("NOT_FOUND", `ad ${adId}`);
  const media = all("SELECT * FROM media WHERE owner_kind='ad' AND owner_id=? AND status='ok' ORDER BY role, idx", adId);
  if (!media.length) throw new LabError("NO_MEDIA", `ad ${adId} has no downloaded media — run: spy media --ids ${adId}`);
  const dir = ensureDir(dataPath("evidence", adId));
  const evFile = path.join(dir, "evidence.json");
  if (!force && fs.existsSync(evFile)) return readJson(evFile);

  const vkit = config().tools.vkit;
  const items = [];
  const videos = media.filter((m) => ["video", "card_video", "extra_video"].includes(m.role));
  const images = media.filter((m) => ["image", "card_image", "extra_image"].includes(m.role));

  for (const v of videos) {
    const out = ensureDir(path.join(dir, `${v.role}-${v.idx}`)).replace(/\\/g, "/");
    const sweep = await spawnAsync(process.execPath, [vkit, v.local_path, "--out", out], { timeoutMs: 240000 });
    const hook = await spawnAsync(process.execPath, [vkit, v.local_path, "--out", out, "--sub", "zoom", "--start", "0", "--dur", "3", "--fps", "4"], { timeoutMs: 120000 });
    const tx = asr ? await asrLead(v.local_path, out, { lang: asrLang(ad) }) : null;
    let analysis = null;
    try {
      analysis = readJson(path.join(out, "analysis.json"));
    } catch {}
    const files = fs.readdirSync(out);
    const sheet = files.find((f) => f.endsWith(".sheet.png"));
    const zoom = files.find((f) => f.includes(".zoom_"));
    const keyframes = files.filter((f) => /\.shot\d+_/.test(f)).sort();
    const p = analysis?.probe;
    items.push({
      kind: "video",
      role: v.role,
      idx: v.idx,
      file: v.local_path,
      duration: p?.duration ?? v.duration,
      aspect: p ? p.aspectLabel || aspectLabel(p.dispW, p.dispH) : null,
      shots: analysis?.shots?.length ?? null,
      lufs: analysis?.audio?.integratedLufs ?? null,
      has_audio: p?.hasAudio ?? null,
      transcript: (tx?.ok ? tx.segments : []).map((s) => ({ t: Number(s.start.toFixed(2)), text: s.text })),
      transcript_model: tx?.ok ? `${tx.model} (first ${tx.seconds}s)` : tx ? `failed: ${tx.reason}` : null,
      sheet: sheet ? `${out}/${sheet}` : null,
      hook_strip: zoom ? `${out}/${zoom}` : null,
      keyframes: keyframes.slice(0, 12).map((f) => `${out}/${f}`),
      vkit_ok: sweep.code === 0,
      vkit_error: sweep.code === 0 ? null : (sweep.err || sweep.out).slice(-400),
      hook_ok: hook.code === 0,
    });
  }

  if (images.length) {
    const evImgs = [];
    for (const im of images) {
      const dest = path.join(dir, `${im.role}-${im.idx}.jpg`).replace(/\\/g, "/");
      runTool(config().tools.magick || "magick", [im.local_path, "-resize", "1080x1080>", "-quality", "88", dest]);
      evImgs.push({ role: im.role, idx: im.idx, file: fs.existsSync(dest) ? dest : im.local_path, w: im.width, h: im.height, aspect: aspectLabel(im.width, im.height), palette: palette(im.local_path) });
    }
    let montage = null;
    if (evImgs.length > 1) {
      montage = path.join(dir, "cards-montage.jpg").replace(/\\/g, "/");
      const cols = Math.min(5, evImgs.length);
      runTool(config().tools.magick || "magick", ["montage", ...evImgs.map((x) => x.file), "-tile", `${cols}x`, "-geometry", "420x420+6+6", "-background", "#202020", montage]);
      if (!fs.existsSync(montage)) montage = null;
    }
    items.push({ kind: images.some((x) => x.role === "card_image") ? "carousel" : "image", images: evImgs, montage });
  }

  const sb = pj(ad.score_breakdown, {});
  const ev = {
    ad_archive_id: adId,
    built_at: nowIso(),
    page_name: ad.page_name,
    library_url: `https://www.facebook.com/ads/library/?id=${adId}`,
    signals: { score: ad.score, tier: sb.tier, days_active: sb.days_active, collation_count: ad.collation_count, platforms: pj(ad.platforms, []), format: sb.format, relevance: ad.relevance, page_active_ads: get("SELECT active_ads_seen n FROM pages WHERE page_id=?", ad.page_id)?.n ?? null },
    copy: { body: ad.body, title: ad.title, link_description: ad.link_description, cta_text: ad.cta_text, cta_type: ad.cta_type, link_url: ad.link_url, lang_guess: ad.lang, cards: pj(ad.cards, []) },
    items,
  };
  writeJson(evFile, ev);
  fs.writeFileSync(path.join(dir, "EVIDENCE.md"), evidenceMarkdown(ev), "utf8");
  return ev;
}

export function evidenceMarkdown(ev) {
  const L = [];
  L.push(`# Evidence — ad ${ev.ad_archive_id} · ${ev.page_name}`);
  L.push(`${ev.library_url}`);
  const s = ev.signals;
  L.push(`\n**Signals:** score ${s.score} · ${s.tier} · ${s.days_active} days active · ${s.collation_count ?? 1} ad(s) share this creative · page runs ~${s.page_active_ads ?? "?"} active ads · ${s.format} · ${(s.platforms || []).join("/")}`);
  L.push(`\n## Copy (verbatim)\n`);
  if (ev.copy.title) L.push(`**Title:** ${ev.copy.title}`);
  L.push("```\n" + (ev.copy.body || "(no body)") + "\n```");
  L.push(`CTA button: ${ev.copy.cta_type || "?"} (${ev.copy.cta_text || ""}) → ${ev.copy.link_url || "?"}`);
  L.push(`\n## Read in this order`);
  let n = 1;
  for (const it of ev.items) {
    if (it.kind === "video") {
      L.push(`\n### Video (${it.role} #${it.idx}) — ${it.duration?.toFixed?.(1)} s · ${it.aspect} · ${it.shots ?? "?"} shots · ${it.lufs ?? "?"} LUFS`);
      if (it.sheet) L.push(`${n++}. Contact sheet: \`${it.sheet}\``);
      if (it.hook_strip) L.push(`${n++}. Hook strip 0–3 s @4 fps (cell i → t = i × 0.25 s): \`${it.hook_strip}\``);
      if (it.keyframes?.length) L.push(`${n++}. Keyframes (one per shot, only if the sheet is ambiguous): ${it.keyframes.map((k) => `\`${path.basename(k)}\``).join(", ")}`);
      if (it.transcript?.length) {
        L.push(`\nASR (${it.transcript_model}) — a LEAD, not a quote; poetry / «اشتركوا في القناة» = music, not speech:`);
        for (const t of it.transcript.slice(0, 30)) L.push(`- [${t.t}s] ${t.text}`);
      } else L.push(`\nASR: none (${it.has_audio ? "no speech detected / disabled" : "no audio track"})`);
      if (!it.vkit_ok) L.push(`\n⚠ vkit error: ${it.vkit_error}`);
    } else {
      L.push(`\n### ${it.kind === "carousel" ? "Carousel cards" : "Image"}`);
      if (it.montage) L.push(`${n++}. Montage of all cards: \`${it.montage}\``);
      for (const im of it.images) L.push(`${n++}. ${im.role} #${im.idx} (${im.aspect}) palette ${im.palette.join(" ")}: \`${im.file}\``);
    }
  }
  L.push(`\n## Then\nWrite the DNA JSON (schema: creative-lab/schemas/creative-dna.schema.json, vocabulary: config/taxonomy.json) and save it with:\n\`node creative-lab/cli.mjs dna set --id ${ev.ad_archive_id} --file <dna.json>\``);
  return L.join("\n") + "\n";
}

/** Validate + store a DNA (ref ids are adlib ad ids, own asset ids or manual ids). */
export function saveDna(dna, { analyst = "claude", evidenceDir = null } = {}) {
  assertValid("creative-dna", dna);
  const id = dna.ref.id;
  if (dna.ref.kind === "adlib") {
    const ad = get("SELECT * FROM ads WHERE ad_archive_id=?", id);
    if (!ad) throw new LabError("NOT_FOUND", `DNA ref ${id} is not a library ad`);
    const sb = pj(ad.score_breakdown, {});
    dna.winning_signals = { days_active: sb.days_active ?? null, collation_count: ad.collation_count ?? null, score: ad.score ?? null, tier: sb.tier ?? null, ...(dna.winning_signals || {}) };
  }
  const prev = get("SELECT version, created_at FROM dna WHERE ref_id=?", id);
  upsert("dna", "ref_id", {
    ref_id: id,
    ref_kind: dna.ref.kind,
    json: j(dna),
    evidence_dir: evidenceDir || (dna.ref.kind === "adlib" ? dataPath("evidence", id) : null),
    analyst,
    version: (prev?.version || 0) + 1,
    created_at: prev?.created_at || nowIso(),
    updated_at: nowIso(),
  });
  if (dna.ref.kind === "adlib") run("UPDATE ads SET tags=? WHERE ad_archive_id=?", j([dna.archetype, dna.hook.type, dna.angle, dna.format]), id);
  return { ref_id: id, version: (prev?.version || 0) + 1 };
}

export function getDna(id) {
  const r = get("SELECT * FROM dna WHERE ref_id=?", id);
  return r ? { ...pj(r.json), _meta: { version: r.version, analyst: r.analyst, updated_at: r.updated_at, evidence_dir: r.evidence_dir } } : null;
}

export function listDna() {
  return all("SELECT ref_id, json, updated_at FROM dna ORDER BY updated_at DESC").map((r) => ({ id: r.ref_id, ...pj(r.json), _updated: r.updated_at }));
}

export async function buildEvidenceMany(ids, { concurrency = 2, force = false, asr = true, onProgress } = {}) {
  let done = 0;
  return mapLimit(ids, concurrency, async (id) => {
    try {
      const ev = await buildEvidence(id, { force, asr });
      onProgress?.({ done: ++done, total: ids.length, id, ok: true });
      return { id, ok: true, dir: dataPath("evidence", id), items: ev.items.length };
    } catch (e) {
      onProgress?.({ done: ++done, total: ids.length, id, ok: false, error: e.message });
      return { id, ok: false, error: e.message };
    }
  });
}

export const _test = { asrLang, probe };
