// ─────────────────────────────────────────────────────────────────────────────
// Lab EDL v1 — the input props of the Remotion compositions `lab-ad` (video) and
// `lab-still` (same component, one frame). Field names are a CONTRACT with
// ad-engine/creative-lab (ARCHITECTURE.md §4.2): another program writes these JSONs.
// Do not rename fields here without changing the compiler on the other side.
// ─────────────────────────────────────────────────────────────────────────────

export type TransitionKind = "cut" | "fade" | "push" | "slide" | "zoom";
/** Direction the incoming picture MOVES: "L" = travels leftwards (enters from the right). */
export type Dir4 = "L" | "R" | "U" | "D";
export type Fit = "cover" | "contain";
export type MotionType = "push_in" | "pull_out" | "pan_left" | "pan_right" | "none";
export type TextStyle = "headline" | "kicker" | "big" | "pill" | "badge" | "price_tag" | "checklist" | "subtitle";
export type TextPosition = "top" | "upper_third" | "center" | "lower_third";
export type Emphasis = "normal" | "big" | "highlight";

export type LabMotion = { type: MotionType; amount?: number };
/** Normalised to the frame: x/w are fractions of width, y/h fractions of height. */
export type LabBox = { x: number; y: number; w: number; h: number };

export type LabFillLayer = { kind: "fill"; color?: string };
export type LabImageLayer = { kind: "image"; src: string; fit?: Fit; motion?: LabMotion; bg?: string };
export type LabVideoLayer = { kind: "video"; src: string; trimStart?: number; fit?: Fit; bg?: string; motion?: LabMotion };
export type LabCutoutLayer = { kind: "cutout"; src: string; box: LabBox; shadow?: boolean; motion?: LabMotion };
/** Bottom → top. `src` is relative to remotion-studio/public/ (resolved with staticFile()). */
export type LabLayer = LabFillLayer | LabImageLayer | LabVideoLayer | LabCutoutLayer;

export type LabText = {
  slot?: string;
  text: string;
  style: TextStyle;
  position?: TextPosition;
  /** seconds, relative to the segment start */
  at?: number;
  /** seconds, relative to the segment start; null/absent = until the segment ends */
  until?: number | null;
  emphasis?: Emphasis;
  /** checklist only */
  items?: string[];
};

export type LabTransition = { kind: TransitionKind; frames?: number; dir?: Dir4 };

export type LabSegment = {
  id: string;
  from: number;
  frames: number;
  transitionIn?: LabTransition;
  layers: LabLayer[];
  texts?: LabText[];
};

export type LabSlotText = { slot: string; text: string };

export type LabRail = { enabled: boolean; fromFrame?: number; y?: number; h?: number; items: LabSlotText[] };
export type LabEndCard = { enabled: boolean; from?: number; frames?: number; lines: LabSlotText[] };
export type LabAudio = { src: string | null; volume?: number; fadeOutFrames?: number };

export type LabTheme = { ink: string; paper: string; panel: string; accent: string; smoke: string };
/** px. `bottom` is the y of the lower edge of the text band (1250 on 1080×1920). */
export type LabSafe = { top: number; bottom: number; side: number };

export type LabEdl = {
  version: 1;
  id: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  lang?: string;
  dir?: "rtl" | "ltr";
  theme?: Partial<LabTheme>;
  safe?: Partial<LabSafe>;
  segments: LabSegment[];
  rail?: LabRail | null;
  endCard?: LabEndCard | null;
  audio?: LabAudio | null;
};
