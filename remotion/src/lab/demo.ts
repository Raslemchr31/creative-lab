import type { LabEdl } from "./types";

// Built-in demo EDLs so Studio opens `lab-ad` / `lab-still` without --props.
// Asset-free on purpose (fills + text only): they can never break on a missing file.
// Real samples with photos / video / cut-out live in public/lab/sample/edl-*.json.

export const LAB_DEMO_9X16: LabEdl = {
  version: 1,
  id: "demo/9x16",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 150,
  lang: "ar",
  dir: "rtl",
  theme: { ink: "#0A0A0A", paper: "#F4F1EA", panel: "#101012", accent: "#FFFFFF", smoke: "#B9B4AB" },
  safe: { top: 270, bottom: 1250, side: 65 },
  segments: [
    {
      id: "d1",
      from: 0,
      frames: 60,
      layers: [{ kind: "fill", color: "#101012" }],
      texts: [
        { slot: "kicker", text: "جديد", style: "kicker", position: "top", at: 0 },
        { slot: "hook_text", text: "باك هوبو الجديد", style: "headline", position: "top", at: 0 },
        { slot: "benefit", text: "شنطة + سنيكرز بسعر واحد", style: "pill", position: "lower_third", at: 0.5 },
      ],
    },
    {
      id: "d2",
      from: 60,
      frames: 45,
      transitionIn: { kind: "fade", frames: 10 },
      layers: [{ kind: "fill", color: "#F4F1EA" }],
      texts: [{ slot: "proof", text: "واش كاين في الباك؟", style: "checklist", position: "center", at: 0.2, items: ["شنطة كروكو", "سنيكرز مريحة", "الدفع عند الاستلام"] }],
    },
  ],
  rail: {
    enabled: true,
    fromFrame: 0,
    y: 1157,
    h: 86,
    items: [
      { slot: "price", text: "4,200 دج" },
      { slot: "strike", text: "5,800 دج" },
      { slot: "cod_delivery", text: "الدفع عند الاستلام · 69 ولاية" },
    ],
  },
  endCard: {
    enabled: true,
    from: 105,
    frames: 45,
    lines: [
      { slot: "name", text: "باك هوبو" },
      { slot: "price", text: "4,200 دج" },
      { slot: "strike", text: "5,800 دج" },
      { slot: "cta", text: "اطلبي دروك" },
      { slot: "site", text: "sirinealgeria.store" },
    ],
  },
  audio: { src: null, volume: 0.5, fadeOutFrames: 20 },
};

export const LAB_DEMO_4X5: LabEdl = {
  version: 1,
  id: "demo/4x5",
  width: 1080,
  height: 1350,
  fps: 30,
  durationInFrames: 1,
  lang: "ar",
  dir: "rtl",
  safe: { top: 60, bottom: 1290, side: 60 },
  segments: [
    {
      id: "s1",
      from: 0,
      frames: 1,
      layers: [{ kind: "fill", color: "#F4F1EA" }],
      texts: [
        { slot: "hook_text", text: "باك هوبو الجديد", style: "headline", position: "top" },
        { slot: "badge", text: "جديد", style: "badge", position: "upper_third" },
        { slot: "price", text: "4,200 دج", style: "price_tag", position: "lower_third" },
      ],
    },
  ],
  rail: null,
  endCard: null,
  audio: null,
};
