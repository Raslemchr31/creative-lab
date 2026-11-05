import type { CalculateMetadataFunction } from "remotion";
import { BRAND } from "../sirine/theme";
import type {
  Dir4,
  Emphasis,
  Fit,
  LabBox,
  LabEdl,
  LabSafe,
  LabSlotText,
  LabTheme,
  MotionType,
  TextPosition,
  TextStyle,
  TransitionKind,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Validate + normalise a Lab EDL v1. Every contract violation is collected and
// thrown as ONE error, so a compiler bug fails the render loudly (non-zero exit)
// instead of rendering a silently wrong ad. Optional fields get house defaults.
// ─────────────────────────────────────────────────────────────────────────────

const TRANSITIONS: TransitionKind[] = ["cut", "fade", "push", "slide", "zoom"];
const DIRS: Dir4[] = ["L", "R", "U", "D"];
const FITS: Fit[] = ["cover", "contain"];
const MOTIONS: MotionType[] = ["push_in", "pull_out", "pan_left", "pan_right", "none"];
const STYLES: TextStyle[] = ["headline", "kicker", "big", "pill", "badge", "price_tag", "checklist", "subtitle"];
const POSITIONS: TextPosition[] = ["top", "upper_third", "center", "lower_third"];
const EMPHASES: Emphasis[] = ["normal", "big", "highlight"];

/** Frames the end card's ground needs to fade in over the last picture. */
export const END_IN = 8;
const DEFAULT_TRANSITION_FRAMES = 8;

export type NMotion = { type: MotionType; amount: number };
export type NLayer =
  | { kind: "fill"; color: string }
  | { kind: "image"; src: string; fit: Fit; motion: NMotion; bg: string | null }
  | { kind: "video"; src: string; trimBefore: number; fit: Fit; bg: string | null; motion: NMotion }
  | { kind: "cutout"; src: string; box: LabBox; shadow: boolean; motion: NMotion };
export type NTransition = { kind: TransitionKind; frames: number; dir: Dir4 };
export type NText = {
  key: string;
  slot: string;
  text: string;
  style: TextStyle;
  position: TextPosition;
  atF: number;
  untilF: number;
  emphasis: Emphasis;
  items: string[];
};
/** What sits behind the text band — decides ink-on-light vs white-on-dark text. */
export type ToneSource =
  | { kind: "solid"; light: boolean }
  | { kind: "image"; src: string; fit: Fit; bgLight: boolean | null }
  | { kind: "dark" };
export type NSegment = {
  id: string;
  index: number;
  from: number;
  frames: number;
  /** mounted length: `frames` + the tail held under the next segment's transitionIn / the end card fade */
  life: number;
  tin: NTransition;
  /** the next segment's transitionIn, seen from this segment (start = local frame) */
  out: (NTransition & { start: number }) | null;
  layers: NLayer[];
  texts: NText[];
  tone: ToneSource;
};
export type NRail = { from: number; to: number; fadeAt: number | null; y: number; h: number; items: LabSlotText[] };
export type NEnd = { from: number; frames: number; lines: LabSlotText[] };
export type NAudio = { src: string; volume: number; fadeOutFrames: number };
export type NEdl = {
  id: string;
  W: number;
  H: number;
  fps: number;
  duration: number;
  lang: string;
  dir: "rtl" | "ltr";
  rtl: boolean;
  tall: boolean;
  /** type scale: 1 on 1080-wide 9:16, a touch smaller on shorter frames */
  k: number;
  theme: LabTheme;
  safe: LabSafe;
  /** vertical band texts may use: safe band minus the rail */
  band: { top: number; bottom: number };
  segments: NSegment[];
  rail: NRail | null;
  endCard: NEnd | null;
  audio: NAudio | null;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

class Issues {
  list: string[] = [];
  add(path: string, msg: string) {
    this.list.push(`${path}: ${msg}`);
  }
}

const numOr = (v: unknown, def: number, path: string, is: Issues, o: { min?: number; max?: number; int?: boolean } = {}): number => {
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    is.add(path, `expected a number, got ${JSON.stringify(v)}`);
    return def;
  }
  if (o.int && !Number.isInteger(v)) {
    is.add(path, `expected an integer, got ${v}`);
    return Math.round(v);
  }
  if (o.min !== undefined && v < o.min) {
    is.add(path, `must be ≥ ${o.min}, got ${v}`);
    return def;
  }
  if (o.max !== undefined && v > o.max) {
    is.add(path, `must be ≤ ${o.max}, got ${v}`);
    return def;
  }
  return v;
};

const numReq = (v: unknown, path: string, is: Issues, o: { min?: number; int?: boolean } = {}): number => {
  if (v === undefined || v === null) {
    is.add(path, "is required");
    return NaN;
  }
  return numOr(v, NaN, path, is, o);
};

const strOr = (v: unknown, def: string, path: string, is: Issues): string => {
  if (v === undefined || v === null) return def;
  if (typeof v !== "string") {
    is.add(path, `expected a string, got ${JSON.stringify(v)}`);
    return def;
  }
  return v;
};

const enumOr = <T extends string>(v: unknown, allowed: T[], def: T, path: string, is: Issues): T => {
  if (v === undefined || v === null) return def;
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    is.add(path, `${JSON.stringify(v)} is not one of ${allowed.join("|")}`);
    return def;
  }
  return v as T;
};

const srcReq = (v: unknown, path: string, is: Issues): string => {
  if (typeof v !== "string" || v.trim() === "") {
    is.add(path, "src is required (path relative to public/)");
    return "";
  }
  // staticFile() wants a public-relative path: strip a leading slash / "public/"
  return v.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/^public\//, "");
};

/** Relative luminance 0..1 of a CSS colour (#rgb, #rrggbb, #rrggbbaa, rgb[a]()). null if unknown. */
export const luminance = (css: string): number | null => {
  const s = css.trim();
  let r: number, g: number, b: number;
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else if (h.length === 6 || h.length === 8) {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    } else return null;
  } else {
    const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!m) return null;
    r = Number(m[1]);
    g = Number(m[2]);
    b = Number(m[3]);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
export const isLight = (css: string | null | undefined): boolean | null => {
  if (!css) return null;
  const l = luminance(css);
  return l === null ? null : l > 0.55;
};

/** Western digits everywhere (Maghreb rule): Arabic-Indic / Persian digits → 0-9. */
export const westernDigits = (s: string): string =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");

const DEFAULT_POSITION: Record<TextStyle, TextPosition> = {
  headline: "top",
  kicker: "top",
  big: "center",
  pill: "upper_third",
  badge: "upper_third",
  price_tag: "lower_third",
  checklist: "lower_third",
  subtitle: "lower_third",
};

const normMotion = (v: unknown, path: string, is: Issues): NMotion => {
  if (v === undefined || v === null) return { type: "none", amount: 0 };
  if (!isObj(v)) {
    is.add(path, "expected an object {type, amount}");
    return { type: "none", amount: 0 };
  }
  const type = enumOr(v.type, MOTIONS, "none", `${path}.type`, is);
  const def = type === "pan_left" || type === "pan_right" ? 0.08 : 0.06;
  return { type, amount: numOr(v.amount, def, `${path}.amount`, is, { min: 0, max: 1 }) };
};

const normSlots = (v: unknown, path: string, is: Issues): LabSlotText[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    is.add(path, "expected an array of {slot, text}");
    return [];
  }
  const out: LabSlotText[] = [];
  v.forEach((it, i) => {
    if (!isObj(it)) return is.add(`${path}[${i}]`, "expected {slot, text}");
    const text = westernDigits(strOr(it.text, "", `${path}[${i}].text`, is)).trim();
    const slot = strOr(it.slot, "", `${path}[${i}].slot`, is).trim();
    if (!slot) is.add(`${path}[${i}].slot`, "is required");
    if (text) out.push({ slot, text });
  });
  return out;
};

export const normalizeEdl = (raw: unknown): NEdl => {
  const is = new Issues();
  if (!isObj(raw)) throw new Error("Lab EDL invalid: props must be an object (the EDL JSON)");
  if (raw.version !== 1) is.add("version", `must be 1 (Lab EDL v1), got ${JSON.stringify(raw.version)}`);

  const id = strOr(raw.id, "lab", "id", is);
  const W = numReq(raw.width, "width", is, { min: 16, int: true });
  const H = numReq(raw.height, "height", is, { min: 16, int: true });
  const fps = numReq(raw.fps, "fps", is, { min: 1 });
  if (!Number.isFinite(W) || !Number.isFinite(H) || !Number.isFinite(fps)) {
    throw new Error(`Lab EDL invalid (${is.list.length} problem${is.list.length === 1 ? "" : "s"}):\n  - ${is.list.join("\n  - ")}`);
  }
  const tall = H / W > 1.5;
  const lang = strOr(raw.lang, "ar", "lang", is);
  const dir = enumOr(raw.dir, ["rtl", "ltr"], /^(ar|fa|ur|he)\b/i.test(lang) ? "rtl" : "ltr", "dir", is);
  const rtl = dir === "rtl";
  const k = (W / 1080) * (tall ? 1 : 0.92);

  // theme
  const th = isObj(raw.theme) ? raw.theme : {};
  const theme: LabTheme = {
    ink: strOr(th.ink, BRAND.ink, "theme.ink", is),
    paper: strOr(th.paper, BRAND.cream, "theme.paper", is),
    panel: strOr(th.panel, BRAND.panel, "theme.panel", is),
    accent: strOr(th.accent, BRAND.white, "theme.accent", is),
    smoke: strOr(th.smoke, BRAND.smoke, "theme.smoke", is),
  };

  // safe box — 9:16 Reels UI owns y<270 and y>1250; 4:5 keeps 60 px from every edge
  const sf = isObj(raw.safe) ? raw.safe : {};
  const sTop = numOr(sf.top, tall ? Math.round(H * (270 / 1920)) : 60, "safe.top", is, { min: 0 });
  let sBottom = numOr(sf.bottom, tall ? Math.round(H * (1250 / 1920)) : H - 60, "safe.bottom", is, { min: 0 });
  // `bottom` is a y coordinate (1250 on 1920). A small value can only be an inset from the bottom edge.
  if (sBottom <= H / 2) sBottom = H - sBottom;
  const side = numOr(sf.side, tall ? 65 : 60, "safe.side", is, { min: 0, max: W / 3 });
  if (sBottom <= sTop + 40) is.add("safe", `bottom (${sBottom}) must be well below top (${sTop})`);
  const safe: LabSafe = { top: sTop, bottom: Math.min(sBottom, H), side };

  // segments
  const segsRaw = raw.segments;
  if (!Array.isArray(segsRaw)) is.add("segments", "must be an array");
  const segs = (Array.isArray(segsRaw) ? segsRaw : []).map((s, i) => {
    const p = `segments[${i}]`;
    if (!isObj(s)) {
      is.add(p, "expected an object");
      return null;
    }
    const from = numOr(s.from, NaN, `${p}.from`, is, { min: 0, int: true });
    const frames = numOr(s.frames, NaN, `${p}.frames`, is, { min: 1, int: true });
    if (!Number.isFinite(from)) is.add(`${p}.from`, "is required");
    if (!Number.isFinite(frames)) is.add(`${p}.frames`, "is required");
    const ti = isObj(s.transitionIn) ? s.transitionIn : {};
    if (s.transitionIn !== undefined && s.transitionIn !== null && !isObj(s.transitionIn)) is.add(`${p}.transitionIn`, "expected an object");
    const kind = enumOr(ti.kind, TRANSITIONS, "cut", `${p}.transitionIn.kind`, is);
    let tFrames = kind === "cut" ? 0 : numOr(ti.frames, DEFAULT_TRANSITION_FRAMES, `${p}.transitionIn.frames`, is, { min: 0, int: true });
    if (Number.isFinite(frames)) tFrames = Math.min(tFrames, frames);
    const tin: NTransition = {
      kind: tFrames > 0 ? kind : "cut",
      frames: tFrames,
      dir: enumOr(ti.dir, DIRS, rtl ? "R" : "L", `${p}.transitionIn.dir`, is),
    };

    const layersRaw = s.layers;
    if (!Array.isArray(layersRaw)) is.add(`${p}.layers`, "must be an array (bottom → top)");
    const layers: NLayer[] = [];
    (Array.isArray(layersRaw) ? layersRaw : []).forEach((l, j) => {
      const lp = `${p}.layers[${j}]`;
      if (!isObj(l)) return is.add(lp, "expected an object");
      switch (l.kind) {
        case "fill":
          layers.push({ kind: "fill", color: strOr(l.color, theme.paper, `${lp}.color`, is) });
          return;
        case "image":
          layers.push({
            kind: "image",
            src: srcReq(l.src, `${lp}.src`, is),
            fit: enumOr(l.fit, FITS, "cover", `${lp}.fit`, is),
            motion: normMotion(l.motion, `${lp}.motion`, is),
            bg: l.bg === undefined || l.bg === null ? null : strOr(l.bg, "", `${lp}.bg`, is) || null,
          });
          return;
        case "video":
          layers.push({
            kind: "video",
            src: srcReq(l.src, `${lp}.src`, is),
            trimBefore: Math.round(numOr(l.trimStart, 0, `${lp}.trimStart`, is, { min: 0 }) * fps),
            fit: enumOr(l.fit, FITS, "cover", `${lp}.fit`, is),
            bg: l.bg === undefined || l.bg === null ? null : strOr(l.bg, "", `${lp}.bg`, is) || null,
            motion: normMotion(l.motion, `${lp}.motion`, is),
          });
          return;
        case "cutout": {
          const b = isObj(l.box) ? l.box : null;
          if (!b) is.add(`${lp}.box`, "is required: {x, y, w, h} as fractions of the frame");
          const box: LabBox = {
            x: numOr(b?.x, 0.1, `${lp}.box.x`, is, { min: -1, max: 2 }),
            y: numOr(b?.y, 0.3, `${lp}.box.y`, is, { min: -1, max: 2 }),
            w: numOr(b?.w, 0.8, `${lp}.box.w`, is, { min: 0.001, max: 3 }),
            h: numOr(b?.h, 0.4, `${lp}.box.h`, is, { min: 0.001, max: 3 }),
          };
          layers.push({
            kind: "cutout",
            src: srcReq(l.src, `${lp}.src`, is),
            box,
            shadow: l.shadow === true,
            motion: normMotion(l.motion, `${lp}.motion`, is),
          });
          return;
        }
        default:
          is.add(`${lp}.kind`, `${JSON.stringify(l.kind)} is not one of fill|image|video|cutout`);
      }
    });

    const textsRaw = s.texts;
    if (textsRaw !== undefined && textsRaw !== null && !Array.isArray(textsRaw)) is.add(`${p}.texts`, "must be an array");
    const texts: NText[] = [];
    (Array.isArray(textsRaw) ? textsRaw : []).forEach((t, j) => {
      const tp = `${p}.texts[${j}]`;
      if (!isObj(t)) return is.add(tp, "expected an object");
      const style = enumOr(t.style, STYLES, "headline", `${tp}.style`, is);
      if (t.style === undefined) is.add(`${tp}.style`, "is required");
      const text = westernDigits(strOr(t.text, "", `${tp}.text`, is)).trim();
      let items: string[] = [];
      if (t.items !== undefined && t.items !== null) {
        if (!Array.isArray(t.items)) is.add(`${tp}.items`, "must be an array of strings");
        else items = t.items.filter((x): x is string => typeof x === "string").map((x) => westernDigits(x).trim()).filter(Boolean);
      }
      if (style === "checklist" && items.length === 0) is.add(`${tp}.items`, "checklist needs at least one item");
      if (style !== "checklist" && !text) is.add(`${tp}.text`, "is empty");
      const fr = Number.isFinite(frames) ? frames : 1;
      const atF = Math.max(0, Math.round(numOr(t.at, 0, `${tp}.at`, is, { min: 0 }) * fps));
      const untilS = t.until === null || t.until === undefined ? null : numOr(t.until, NaN, `${tp}.until`, is, { min: 0 });
      const untilF = untilS === null || !Number.isFinite(untilS) ? fr : Math.min(fr, Math.round(untilS * fps));
      if (atF >= untilF) is.add(tp, `is never visible (at ${atF}f ≥ until ${untilF}f within a ${fr}-frame segment)`);
      texts.push({
        key: `${String(s.id ?? i)}-t${j}`,
        slot: strOr(t.slot, "", `${tp}.slot`, is),
        text,
        style,
        position: enumOr(t.position, POSITIONS, DEFAULT_POSITION[style], `${tp}.position`, is),
        atF,
        untilF,
        emphasis: enumOr(t.emphasis, EMPHASES, "normal", `${tp}.emphasis`, is),
        items,
      });
    });

    // what is behind the text band: the top-most layer that covers the whole frame
    let tone: ToneSource = { kind: "dark" };
    for (let j = layers.length - 1; j >= 0; j--) {
      const l = layers[j];
      if (l.kind === "cutout") continue;
      if (l.kind === "fill") tone = { kind: "solid", light: isLight(l.color) === true };
      else if (l.kind === "image") tone = { kind: "image", src: l.src, fit: l.fit, bgLight: isLight(l.bg) };
      else tone = { kind: "dark" };
      break;
    }

    return {
      id: strOr(s.id, `s${i}`, `${p}.id`, is),
      index: i,
      from,
      frames,
      life: frames,
      tin,
      out: null,
      layers,
      texts,
      tone,
    } as NSegment;
  });
  const segments = segs.filter((s): s is NSegment => s !== null && Number.isFinite(s.from) && Number.isFinite(s.frames));
  segments.sort((a, b) => a.from - b.from || a.index - b.index);

  // end card
  let endCard: NEnd | null = null;
  if (isObj(raw.endCard) && raw.endCard.enabled !== false) {
    const ec = raw.endCard;
    const frames = numOr(ec.frames, 60, "endCard.frames", is, { min: 1, int: true });
    const segEnd = segments.reduce((m, s) => Math.max(m, s.from + s.frames), 0);
    const from = numOr(ec.from, segEnd, "endCard.from", is, { min: 0, int: true });
    endCard = { from, frames, lines: normSlots(ec.lines, "endCard.lines", is) };
  } else if (raw.endCard !== undefined && raw.endCard !== null && !isObj(raw.endCard)) is.add("endCard", "expected an object or null");

  // duration
  const contentEnd = Math.max(
    1,
    segments.reduce((m, s) => Math.max(m, s.from + s.frames), 0),
    endCard ? endCard.from + endCard.frames : 0,
  );
  const duration = numOr(raw.durationInFrames, contentEnd, "durationInFrames", is, { min: 1, int: true });

  // tails: keep each segment mounted under the next segment's transitionIn (or the end card fade-in)
  segments.forEach((s, i) => {
    const next = segments[i + 1];
    const end = s.from + s.frames;
    if (next && next.tin.kind !== "cut" && next.from <= end && next.from >= s.from) {
      s.out = { ...next.tin, start: next.from - s.from };
      s.life = Math.max(s.frames, next.from + next.tin.frames - s.from);
    } else if (!next && endCard && endCard.from <= end && endCard.from >= s.from) {
      s.life = Math.max(s.frames, endCard.from + END_IN - s.from);
    }
    s.life = Math.max(1, Math.min(s.life, duration - s.from));
  });
  segments.forEach((s) => {
    if (s.from >= duration) is.add(`segments[${s.index}]`, `starts at ${s.from}, after durationInFrames ${duration}`);
  });

  // rail
  let rail: NRail | null = null;
  if (isObj(raw.rail) && raw.rail.enabled !== false) {
    const r = raw.rail;
    const h = numOr(r.h, Math.round((tall ? 86 : 80) * (W / 1080)), "rail.h", is, { min: 24 });
    const y = numOr(r.y, tall ? Math.round(H * (1157 / 1920)) : Math.round(H - 60 - h), "rail.y", is, { min: 0 });
    if (y + h > H) is.add("rail", `y + h (${y + h}) is below the frame (${H})`);
    const from = numOr(r.fromFrame, 0, "rail.fromFrame", is, { min: 0, int: true });
    const to = endCard ? Math.min(duration, endCard.from + END_IN) : duration;
    const items = normSlots(r.items, "rail.items", is);
    if (items.length === 0) is.add("rail.items", "an enabled rail needs at least one item");
    rail = { from, to, fadeAt: endCard ? endCard.from : null, y, h, items };
  } else if (raw.rail !== undefined && raw.rail !== null && !isObj(raw.rail)) is.add("rail", "expected an object or null");

  // audio
  let audio: NAudio | null = null;
  if (isObj(raw.audio) && raw.audio.src !== null && raw.audio.src !== undefined) {
    audio = {
      src: srcReq(raw.audio.src, "audio.src", is),
      volume: numOr(raw.audio.volume, 0.5, "audio.volume", is, { min: 0, max: 1 }),
      fadeOutFrames: numOr(raw.audio.fadeOutFrames, 20, "audio.fadeOutFrames", is, { min: 0, int: true }),
    };
  }

  // the text band: safe band, but never on (or under) the rail
  let bandBottom = safe.bottom;
  if (rail && rail.y < bandBottom && rail.y + rail.h > safe.top) bandBottom = rail.y - Math.round(14 * k);
  const band = { top: safe.top, bottom: Math.max(safe.top + 40, bandBottom) };

  if (is.list.length) {
    throw new Error(`Lab EDL "${id}" invalid (${is.list.length} problem${is.list.length === 1 ? "" : "s"}):\n  - ${is.list.join("\n  - ")}`);
  }
  return { id, W, H, fps, duration, lang, dir, rtl, tall, k, theme, safe, band, segments, rail, endCard, audio };
};

/** width/height/fps/duration come from the EDL itself. */
export const calculateLabMetadata: CalculateMetadataFunction<LabEdl> = ({ props }) => {
  const n = normalizeEdl(props);
  return { width: n.W, height: n.H, fps: n.fps, durationInFrames: n.duration };
};
