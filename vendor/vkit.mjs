#!/usr/bin/env node
// vkit.mjs — zero-dependency video analysis engine for the video-understanding skill.
// Spawns ffmpeg/ffprobe with argv ARRAYS so Windows paths never enter a filtergraph.
// Node >= 18. Usage: node vkit.mjs <video> [--out DIR] [--sub cmd] [options]

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, basename, join, extname } from 'node:path';

// ---------------------------------------------------------------- process ---

function run(bin, args) {
  return new Promise((res) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => res({ code: -1, out, err: String(e) }));
    p.on('close', (code) => res({ code, out, err }));
  });
}

const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';
const F = (n, d = 2) => (Number.isFinite(n) ? Number(n).toFixed(d) : '?');
const ts = (s) => {
  if (!Number.isFinite(s)) return '?';
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
};

// ------------------------------------------------------------------ probe ---

async function probe(file) {
  // NOTE: -show_entries must be used ALONE. Combining it with -show_streams
  // defeats the filter and dumps every disposition/tag key.
  const { out, code, err } = await run('ffprobe', [
    '-v', 'error', '-print_format', 'json',
    '-show_entries',
    'format=duration,size,bit_rate,format_name:' +
    'stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,' +
    'nb_frames,duration,sample_rate,channels,pix_fmt,bit_rate:' +
    'stream_side_data=rotation:stream_tags=rotate',
    file,
  ]);
  if (code !== 0) throw new Error(`ffprobe failed: ${err.trim() || code}`);
  const j = JSON.parse(out || '{}');
  const streams = j.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error('no video stream found');

  const rat = (s) => { const [n, d] = String(s || '0/1').split('/').map(Number); return d ? n / d : 0; };
  const duration = Number(j.format?.duration ?? v.duration ?? 0);
  const rFps = rat(v.r_frame_rate), aFps = rat(v.avg_frame_rate);

  // rotation lives in side_data (modern) or the legacy `rotate` tag
  let rotation = 0;
  const sd = (v.side_data_list || []).find((x) => x.rotation !== undefined);
  if (sd) rotation = Number(sd.rotation);
  else if (v.tags?.rotate) rotation = Number(v.tags.rotate);

  const swap = Math.abs(rotation % 180) === 90;
  const dispW = swap ? v.height : v.width;
  const dispH = swap ? v.width : v.height;

  const nbFrames = Number(v.nb_frames || 0);
  const expected = duration * (aFps || rFps);
  const vfr = aFps && rFps && Math.abs(aFps - rFps) / rFps > 0.02;
  const frameMismatch = nbFrames && expected && Math.abs(nbFrames - expected) / expected > 0.05;

  return {
    file, duration,
    storedW: v.width, storedH: v.height, dispW, dispH, rotation, swap,
    aspect: dispW / dispH,
    aspectLabel: aspectLabel(dispW, dispH),
    rFps, aFps, nbFrames, vfr, frameMismatch,
    vcodec: v.codec_name, pixFmt: v.pix_fmt,
    hasAudio: !!a,
    acodec: a?.codec_name, sampleRate: a?.sample_rate, channels: a?.channels,
    sizeBytes: Number(j.format?.size || 0),
    bitrate: Number(j.format?.bit_rate || 0),
  };
}

function aspectLabel(w, h) {
  const r = w / h;
  const cand = [[9 / 16, '9:16 vertical'], [4 / 5, '4:5 portrait'], [1, '1:1 square'],
                [16 / 9, '16:9 landscape'], [1.91, '1.91:1 landscape']];
  let best = cand[0];
  for (const c of cand) if (Math.abs(r - c[0]) < Math.abs(r - best[0])) best = c;
  return `${best[1]} (${r.toFixed(3)})`;
}

// ------------------------------------------------------------------ shots ---

async function shots(file, threshold) {
  const { err } = await run('ffmpeg', [
    '-hide_banner', '-v', 'info', '-i', file,
    '-vf', `scdet=t=${threshold}`, '-an', '-f', 'null', nullSink,
  ]);
  const re = /lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g;
  const cuts = [];
  let m;
  while ((m = re.exec(err))) cuts.push({ score: Number(m[1]), time: Number(m[2]) });
  return cuts;
}

function toShotTable(cuts, duration) {
  const bounds = [0, ...cuts.map((c) => c.time), duration];
  const rows = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i], end = bounds[i + 1];
    if (end - start < 0.04) continue;
    rows.push({ i: rows.length + 1, start, end, dur: end - start, score: cuts[i - 1]?.score ?? null });
  }
  return rows;
}

// ------------------------------------------------------- visual artifacts ---

function gridFor(count, aspect) {
  const cols = aspect < 1 ? 6 : 4;
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows, total: cols * rows };
}

function sheetCount(duration) {
  if (duration <= 10) return 24;
  if (duration <= 30) return 36;
  if (duration <= 90) return 48;
  if (duration <= 300) return 60;
  return 80;
}

async function contactSheet(file, p, outPath, count) {
  const { cols, rows, total } = gridFor(count, p.aspect);
  const rate = total / p.duration;
  const cw = p.aspect < 1 ? 200 : 300;
  const { code, err } = await run('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y', '-i', file,
    '-vf', `fps=${rate},scale=${cw}:-2,tile=${cols}x${rows}`,
    '-frames:v', '1', outPath,
  ]);
  if (code !== 0) throw new Error(`contact sheet failed: ${err.trim()}`);
  return { cols, rows, total, step: p.duration / total, cw };
}

async function zoomStrip(file, p, outPath, start, dur, fps) {
  const count = Math.max(1, Math.round(dur * fps));
  const cols = Math.min(6, count);
  const rows = Math.ceil(count / cols);
  const cw = p.aspect < 1 ? 220 : 320;
  const { code, err } = await run('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y',
    '-ss', String(start), '-t', String(dur), '-i', file,
    '-vf', `fps=${fps},scale=${cw}:-2,tile=${cols}x${rows}`,
    '-frames:v', '1', outPath,
  ]);
  if (code !== 0) throw new Error(`zoom strip failed: ${err.trim()}`);
  return { cols, rows, count, fps, start, dur };
}

async function grabFrame(file, t, outPath, width) {
  // -ss BEFORE -i = fast AND accurate seek in modern ffmpeg.
  const vf = width ? ['-vf', `scale=${width}:-2`] : [];
  const { code, err } = await run('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y', '-ss', String(t), '-i', file,
    ...vf, '-frames:v', '1', '-q:v', '3', outPath,
  ]);
  if (code !== 0) throw new Error(`frame grab @${t} failed: ${err.trim()}`);
  return outPath;
}

// --------------------------------------------------------- motion / stills ---

async function motionEvents(file) {
  const { err } = await run('ffmpeg', [
    '-hide_banner', '-v', 'info', '-i', file,
    '-vf', 'blackdetect=d=0.15:pix_th=0.10,freezedetect=n=-58dB:d=0.5',
    '-an', '-f', 'null', nullSink,
  ]);
  const black = [...err.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)]
    .map((m) => ({ start: +m[1], end: +m[2] }));
  const freeze = [...err.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => ({ start: +m[1] }));
  const freezeEnd = [...err.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => ({ end: +m[1] }));
  freeze.forEach((f, i) => (f.end = freezeEnd[i]?.end ?? null));
  return { black, freeze };
}

// ------------------------------------------------------------------ audio ---

async function audioStructure(file) {
  const { err } = await run('ffmpeg', [
    '-hide_banner', '-v', 'info', '-i', file,
    '-af', 'silencedetect=n=-32dB:d=0.35,ebur128=framelog=quiet',
    '-vn', '-f', 'null', nullSink,
  ]);
  const starts = [...err.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => +m[1]);
  const ends = [...err.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((m) => ({ end: +m[1], dur: +m[2] }));
  const silences = starts.map((s, i) => ({ start: s, end: ends[i]?.end ?? null, dur: ends[i]?.dur ?? null }));
  const grab = (label) => {
    const re = new RegExp(`${label}:\\s*(-?[\\d.]+)\\s*(LUFS|LU)`);
    const m = err.match(re);
    return m ? Number(m[1]) : null;
  };
  return { silences, integratedLufs: grab('I'), lra: grab('LRA') };
}

async function audioImages(file, outDir, stem) {
  const wave = join(outDir, `${stem}.wave.png`);
  const spec = join(outDir, `${stem}.spectrogram.png`);
  // format=rgb24 flattens the alpha channel so the trace is not white-on-transparent.
  const a = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', file,
    '-filter_complex', 'showwavespic=s=1400x300:colors=cyan:split_channels=1,format=rgb24',
    '-frames:v', '1', wave]);
  const b = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', file,
    '-lavfi', 'showspectrumpic=s=1400x420:legend=1', '-frames:v', '1', spec]);
  return { wave: a.code === 0 ? wave : null, spec: b.code === 0 ? spec : null };
}

// -------------------------------------------------------------------- ASR ---

const MODEL_DIR = process.env.WHISPER_MODEL_DIR ||
  join(process.env.USERPROFILE || process.env.HOME || '.', '.whisper', 'models');

function findModel(pref) {
  if (pref && existsSync(pref)) return pref;
  if (process.env.WHISPER_MODEL && existsSync(process.env.WHISPER_MODEL)) return process.env.WHISPER_MODEL;
  if (!existsSync(MODEL_DIR)) return null;
  const files = readdirSync(MODEL_DIR).filter((f) => /^ggml-.*\.bin$/.test(f));
  if (!files.length) return null;
  // prefer the largest / most capable model present
  const rank = (f) => (/large-v3-turbo/.test(f) ? 5 : /large/.test(f) ? 6 : /medium/.test(f) ? 4
    : /small/.test(f) ? 3 : /base/.test(f) ? 2 : 1);
  files.sort((a, b) => rank(b) - rank(a));
  return join(MODEL_DIR, files[0]);
}

async function asr(file, outDir, stem, lang, modelPath) {
  const model = findModel(modelPath);
  if (!model) return { ok: false, reason: `no whisper model in ${MODEL_DIR} (set WHISPER_MODEL)` };

  const wav = join(outDir, `${stem}.16k.wav`);
  const ex = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', file,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
  if (ex.code !== 0) return { ok: false, reason: `audio extract failed: ${ex.err.trim()}` };

  const prefix = join(outDir, `${stem}.transcript`);
  const args = ['-m', model, '-f', wav, '-oj', '-of', prefix, '-pp'];
  if (lang) args.push('-l', lang);
  const r = await run('whisper-cli', args);
  const jsonPath = `${prefix}.json`;
  if (!existsSync(jsonPath)) {
    return { ok: false, reason: `whisper-cli produced no output (${r.err.trim().split('\n').pop() || r.code})` };
  }
  let segments = [];
  try {
    const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
    segments = (j.transcription || []).map((t) => ({
      start: (t.offsets?.from ?? 0) / 1000,
      end: (t.offsets?.to ?? 0) / 1000,
      text: (t.text || '').trim(),
    })).filter((s) => s.text);
  } catch (e) { return { ok: false, reason: `bad transcript JSON: ${e.message}` }; }
  return { ok: true, model: basename(model), lang: lang || 'auto', segments, jsonPath };
}

// ----------------------------------------------------------------- report ---

function buildReport(p, sh, shotRows, sheet, sheetPath, audio, audioImgs, mo, keyframes, tx) {
  const L = [];
  const rel = (x) => (x ? basename(x) : null);
  L.push(`# Video analysis — ${basename(p.file)}`);
  L.push('');
  L.push('## L0 — Structure (measured, not inferred)');
  L.push('');
  L.push('| field | value |');
  L.push('|---|---|');
  L.push(`| duration | ${F(p.duration, 3)} s (${ts(p.duration)}) |`);
  L.push(`| stored resolution | ${p.storedW}x${p.storedH} |`);
  L.push(`| rotation metadata | ${p.rotation}° |`);
  L.push(`| **display resolution** | **${p.dispW}x${p.dispH}** |`);
  L.push(`| aspect | ${p.aspectLabel} |`);
  L.push(`| fps (r / avg) | ${F(p.rFps)} / ${F(p.aFps)} |`);
  L.push(`| frames | ${p.nbFrames || 'unknown'} |`);
  L.push(`| video codec | ${p.vcodec} (${p.pixFmt}) |`);
  L.push(`| audio | ${p.hasAudio ? `${p.acodec} ${p.sampleRate}Hz ${p.channels}ch` : 'NONE'} |`);
  L.push(`| size / bitrate | ${(p.sizeBytes / 1048576).toFixed(2)} MB / ${(p.bitrate / 1000).toFixed(0)} kbps |`);
  L.push('');

  const warn = [];
  if (p.swap) warn.push(`**Rotation ${p.rotation}°** — stored ${p.storedW}x${p.storedH} but displays as **${p.dispW}x${p.dispH}**. Judge framing/safe-zones against the DISPLAY size.`);
  if (p.vfr) warn.push(`**Variable frame rate** — r_frame_rate ${F(p.rFps)} != avg ${F(p.aFps)}. Frame-index math is unreliable; use timestamps.`);
  if (p.frameMismatch) warn.push(`**Frame count mismatch** — nb_frames ${p.nbFrames} vs duration*fps ${F(p.duration * (p.aFps || p.rFps), 0)}. Container may be misreporting.`);
  if (!p.hasAudio) warn.push('**No audio stream** — every audio claim must be reported as N/A, not guessed.');
  if (warn.length) { L.push('### ⚠ Traps'); L.push(''); warn.forEach((w) => L.push(`- ${w}`)); L.push(''); }

  L.push(`## Shots — ${shotRows.length} (scdet threshold ${sh.threshold})`);
  L.push('');
  L.push('| # | start | end | dur | cut score | keyframe |');
  L.push('|---|---|---|---|---|---|');
  for (const r of shotRows) {
    L.push(`| ${r.i} | ${ts(r.start)} | ${ts(r.end)} | ${F(r.dur)}s | ${r.score !== null ? F(r.score, 1) : '—'} | ${rel(keyframes[r.i - 1]) || '—'} |`);
  }
  L.push('');
  if (!shotRows.length || shotRows.length === 1) {
    L.push('_Single shot detected — either a genuine one-take, or the cuts are dissolves/fades that scdet under-detects. Lower the threshold and re-run before concluding._');
    L.push('');
  }

  L.push('## Visual artifacts');
  L.push('');
  L.push(`- **Contact sheet:** \`${rel(sheetPath)}\` — ${sheet.cols}x${sheet.rows} grid, ${sheet.total} cells, one every **${F(sheet.step)}s**.`);
  L.push(`  - Cell index \`i\` (0-based, left→right then top→bottom) is at **t = i x ${F(sheet.step)}s**.`);
  L.push(`  - Row \`r\`, col \`c\` (0-based): \`i = r*${sheet.cols} + c\`.`);
  if (mo.black.length) L.push(`- **Black frames:** ${mo.black.map((b) => `${ts(b.start)}→${ts(b.end)}`).join(', ')}`);
  if (mo.freeze.length) L.push(`- **Frozen/static segments:** ${mo.freeze.map((f) => `${ts(f.start)}${f.end ? `→${ts(f.end)}` : '→end'}`).join(', ')}`);
  L.push('');

  L.push('## A0 — Audio structure');
  L.push('');
  if (!p.hasAudio) {
    L.push('No audio stream.');
  } else {
    L.push(`- Integrated loudness: **${audio.integratedLufs ?? '?'} LUFS**, range ${audio.lra ?? '?'} LU`);
    const lu = audio.integratedLufs;
    if (lu !== null) {
      const read = lu > -12 ? 'hot / music-mastered or heavily compressed'
        : lu > -18 ? 'typical social-video loudness'
        : 'quiet — may be under-mixed for mobile playback';
      L.push(`  - Reading: ${read}.`);
    }
    L.push(`- Silence gaps (< -32dB, >= 0.35s): ${audio.silences.length ? audio.silences.map((s) => `${ts(s.start)}→${s.end !== null ? ts(s.end) : 'end'}`).join(', ') : 'none'}`);
    if (audioImgs.wave) L.push(`- **Waveform:** \`${rel(audioImgs.wave)}\` — x-axis is linear over the full ${F(p.duration)}s. Pixel x -> t = (x/1400) x ${F(p.duration)}s.`);
    if (audioImgs.spec) L.push(`- **Spectrogram:** \`${rel(audioImgs.spec)}\` — same x mapping. Speech = banded energy under ~4kHz; music = sustained full-band; percussion = vertical stripes.`);
    L.push('');
    L.push('> These show audio **structure** only, never words.');
  }
  L.push('');

  L.push('## A1 — Speech content');
  L.push('');
  if (!p.hasAudio) {
    L.push('N/A — no audio stream.');
  } else if (!tx) {
    L.push('Not run. Add `--asr` (optionally `--lang ar|fr|en`) to transcribe.');
  } else if (!tx.ok) {
    L.push(`**Unavailable** — ${tx.reason}`);
    L.push('');
    L.push('> Report speech content as **unknown**. Do not infer dialogue from visuals.');
  } else {
    L.push(`Model \`${tx.model}\`, language \`${tx.lang}\`, ${tx.segments.length} segments.`);
    L.push('');
    L.push('| start | end | text |');
    L.push('|---|---|---|');
    for (const s of tx.segments) {
      L.push(`| ${ts(s.start)} | ${ts(s.end)} | ${s.text.replace(/\|/g, '\\|')} |`);
    }
    L.push('');
    L.push('> ASR output is a **hypothesis**, not ground truth — dialect, music beds and noise all degrade it.');
    L.push('> Cross-check against burned-in captions in the frames; where they disagree, trust the frames.');
  }
  L.push('');

  L.push('## READ NEXT (in this order)');
  L.push('');
  L.push(`1. \`${rel(sheetPath)}\` — whole-video gist, on-screen text, setting, product, end card.`);
  if (p.hasAudio && audioImgs.wave) L.push(`2. \`${rel(audioImgs.wave)}\` — where speech/music/silence sit on the timeline.`);
  L.push(`${p.hasAudio && audioImgs.wave ? 3 : 2}. Then ZOOM only where the question actually lives:`);
  L.push('   ```');
  L.push(`   node vkit.mjs "${p.file}" --sub zoom --start 0 --dur 3 --fps 8`);
  L.push('   ```');
  L.push('');
  return L.join('\n');
}

// ------------------------------------------------------------------- main ---

function parseArgs(argv) {
  const o = { sub: 'all', threshold: 10, fps: 8, start: 0, dur: 3 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    else pos.push(a);
  }
  o.file = pos[0];
  ['threshold', 'fps', 'start', 'dur', 'count', 'at'].forEach((k) => { if (o[k] !== undefined && o[k] !== true) o[k] = Number(o[k]); });
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.file) {
    console.error('usage: node vkit.mjs <video> [--out DIR] [--sub all|probe|shots|sheet|zoom|audio|frame]');
    console.error('       --threshold 10   scdet sensitivity (8-14; LOWER = more cuts)');
    console.error('       --sub zoom --start 0 --dur 3 --fps 8');
    console.error('       --sub frame --at 7.53');
    console.error('       --sub asr [--lang ar|fr|en] [--model PATH]   (or --asr on a full sweep)');
    process.exit(2);
  }
  const file = resolve(o.file);
  if (!existsSync(file)) { console.error(`not found: ${file}`); process.exit(2); }

  const stem = basename(file, extname(file)).replace(/[^\w.-]+/g, '_');
  const outDir = resolve(o.out || join(process.cwd(), `${stem}.analysis`));
  mkdirSync(outDir, { recursive: true });

  const p = await probe(file);

  if (o.sub === 'probe') { console.log(JSON.stringify(p, null, 2)); return; }

  if (o.sub === 'frame') {
    const t = Number(o.at ?? 0);
    const out = join(outDir, `${stem}.t${F(t, 2).replace('.', '_')}.jpg`);
    await grabFrame(file, t, out, o.width ? Number(o.width) : null);
    console.log(`frame @ ${ts(t)} -> ${out}`);
    return;
  }

  if (o.sub === 'zoom') {
    const out = join(outDir, `${stem}.zoom_${F(o.start, 1).replace('.', '_')}-${F(o.start + o.dur, 1).replace('.', '_')}.png`);
    const z = await zoomStrip(file, p, out, o.start, o.dur, o.fps);
    console.log(`zoom ${ts(o.start)}→${ts(o.start + o.dur)} @ ${o.fps}fps — ${z.count} frames, ${z.cols}x${z.rows} grid`);
    console.log(`cell i (0-based) -> t = ${F(o.start)}s + i x ${F(1 / o.fps, 3)}s`);
    console.log(out);
    return;
  }

  if (o.sub === 'audio') {
    if (!p.hasAudio) { console.log('no audio stream'); return; }
    const a = await audioStructure(file);
    const img = await audioImages(file, outDir, stem);
    console.log(JSON.stringify({ ...a, ...img }, null, 2));
    return;
  }

  if (o.sub === 'asr') {
    if (!p.hasAudio) { console.log('no audio stream'); return; }
    const t = await asr(file, outDir, stem, o.lang && o.lang !== true ? o.lang : null, o.model);
    if (!t.ok) { console.error(`ASR unavailable: ${t.reason}`); process.exit(1); }
    console.log(`# Transcript — ${basename(file)}  (model ${t.model}, lang ${t.lang})\n`);
    for (const s of t.segments) console.log(`[${ts(s.start)} → ${ts(s.end)}] ${s.text}`);
    return;
  }

  // ---- full sweep (default) ----
  const cuts = await shots(file, o.threshold);
  const shotRows = toShotTable(cuts, p.duration);

  if (o.sub === 'shots') {
    console.log(JSON.stringify(shotRows.map((r) => ({ ...r, start: +F(r.start, 3), end: +F(r.end, 3) })), null, 2));
    return;
  }

  const sheetPath = join(outDir, `${stem}.sheet.png`);
  const sheet = await contactSheet(file, p, sheetPath, o.count || sheetCount(p.duration));
  if (o.sub === 'sheet') { console.log(sheetPath); return; }

  const mo = await motionEvents(file);
  const audio = p.hasAudio ? await audioStructure(file) : { silences: [], integratedLufs: null, lra: null };
  const audioImgs = p.hasAudio ? await audioImages(file, outDir, stem) : { wave: null, spec: null };
  const tx = (o.asr && p.hasAudio)
    ? await asr(file, outDir, stem, o.lang && o.lang !== true ? o.lang : null, o.model)
    : null;

  // one keyframe per shot, sampled 40% into the shot to dodge transition frames
  const keyframes = [];
  const cap = Math.min(shotRows.length, Number(o.maxkeyframes || 24));
  for (let i = 0; i < cap; i++) {
    const r = shotRows[i];
    const t = r.start + r.dur * 0.4;
    const out = join(outDir, `${stem}.shot${String(r.i).padStart(2, '0')}_${F(t, 2).replace('.', '_')}.jpg`);
    try { await grabFrame(file, t, out, p.aspect < 1 ? 540 : 720); keyframes.push(out); }
    catch { keyframes.push(null); }
  }

  const md = buildReport(p, { threshold: o.threshold }, shotRows, sheet, sheetPath, audio, audioImgs, mo, keyframes, tx);
  const mdPath = join(outDir, 'ANALYSIS.md');
  writeFileSync(mdPath, md, 'utf8');
  writeFileSync(join(outDir, 'analysis.json'),
    JSON.stringify({ probe: p, shots: shotRows, sheet, audio, motion: mo, transcript: tx }, null, 2), 'utf8');

  console.log(md);
  console.log(`\n---\nwritten: ${mdPath}`);
}

main().catch((e) => { console.error(`vkit error: ${e.message}`); process.exit(1); });
