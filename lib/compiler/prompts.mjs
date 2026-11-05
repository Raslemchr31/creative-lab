// creative-lab :: prompt compiler — fill-in skeletons from research/04 §2.0 / §2.5 / §3.
// Hard rules (FR4): prompts never contain the brand, price, currency, offer, gift or a described box.
// Positive-only models (FLUX, Runway) never see the words logo/box/packaging/brand/text at all.

const CAMERA = {
  static: "a locked-off camera; only the light moves slightly",
  push_in: "the camera pushes in slowly and smoothly",
  pull_out: "the camera pulls back slowly and smoothly",
  orbit: "the camera orbits slowly to the left in a small arc of about twenty degrees",
  turntable: "the camera arcs slowly around the product in a small, steady arc",
  pan: "the camera pans slowly from left to right",
  tilt: "the camera tilts up slowly",
  handheld: "a subtle handheld drift",
  whip: "a single smooth sideways glide",
  zoom_punch: "a gentle, smooth push-in",
  dolly: "a slow dolly forward",
  top_down: "a locked-off top-down camera",
  macro_slide: "a slow macro slide across the surface detail",
};

export const cameraPhrase = (c) => CAMERA[c] || CAMERA.push_in;

const SURFACES = ["a pale travertine plinth", "a cream linen-covered table", "a warm oak shelf", "a white marble slab", "a light concrete ledge"];

/** Positive-only scene description for a clean plate (FLUX Klein / Nano Banana 2.1). */
export function platePrompt({ scene, composition, aspect = "9:16", spaceTop = true }) {
  const surface = composition || "an empty " + SURFACES[0].replace(/^a /, "") + " in the lower-centre third where an object will be placed later";
  const parts = [
    `Photorealistic commercial still-life backdrop for a fashion accessory campaign, ${aspect === "9:16" ? "vertical 9:16" : aspect === "4:5" ? "portrait 4:5" : "square"} frame.`,
    scene ? `${scene.replace(/\.$/, "")}.` : "Minimal warm studio set with a seamless cream wall.",
    `${surface.charAt(0).toUpperCase()}${surface.slice(1).replace(/\.$/, "")}.`,
    "Soft key light from the upper left at 45 degrees, gentle fill, natural soft shadows, eye-level camera, 50mm look, shallow depth of field.",
    "Every surface is plain and unprinted; the set is uncluttered and calm, premium and minimal, true-to-life colour.",
  ];
  if (spaceTop) parts.push("The upper third of the frame is open, smooth wall reserved for an overlay.");
  return parts.join(" ");
}

/** Lock clause per piece from the product spec (research/04 §2.0 LOCK(N)). */
export function lockClause(desc, { imageRef = "the reference image" } = {}) {
  const hw = (desc.pieces || [])
    .map((p) => (p.hardware ? `${p.en}: ${p.hardware}` : null))
    .filter(Boolean)
    .join("; ");
  return `Keep the ${desc.text} from ${imageRef} exactly as photographed: same silhouette and proportions, same colour${desc.colour?.en ? ` (${desc.colour.en})` : ""}, material and texture, stitching, handle and strap shape${hw ? `, hardware (${hw})` : ", hardware colour and count"}, and the size and position of any small logo plate. Do not redraw, restyle, recolour, resize, add to, or remove anything from it.`;
}

const CLEAN = "No text, letters, numbers, watermarks, price tags, labels, boxes, shopping bags or packaging anywhere in the image.";
const NO_TALK = "Nobody speaks; mouths stay closed. No dialogue, no on-screen text.";

/** L2 harmonise (Nano Banana Pro): relight around the real product, product untouched (it is pasted back anyway). */
export function harmonizePrompt(desc) {
  return `Using the provided image, change only the lighting, contact shadow and soft reflections around the ${desc.text} so it sits naturally on the surface in the scene. Keep the ${desc.text} itself exactly the same: same silhouette, colour, material, stitching and hardware. Keep the background composition, framing and empty upper area unchanged. ${CLEAN}`;
}

/** L3 edit (GPT Image 2.5 Sunburst / Nano Banana): product held or worn. */
export function editPrompt({ desc, scene, action, shot, talent }) {
  const who = talent === "hands_only" ? "Only hands and forearms are visible" : "The person is framed from the neck down; no face is visible";
  return [
    `Image 1 is the reference product: ${desc.text}.`,
    `Create a photorealistic ${shot === "on_model" ? "fashion lifestyle" : "product"} photograph: ${action || "a woman carries the bag on her shoulder"}${scene ? `, ${scene.replace(/\.$/, "")}` : ""}.`,
    `${who}. Natural daylight, true-to-life colour, premium and minimal.`,
    lockClause(desc, { imageRef: "image 1" }),
    CLEAN,
  ].join(" ");
}

/** L3 compose (Nano Banana Pro, several real references in one scene — pack pieces or colourways). */
export function composePrompt({ pieces, scene, composition }) {
  const list = pieces.map((p, i) => `image ${i + 1} is the ${p}`).join(", ");
  return [
    `The attached images are real product photos: ${list}.`,
    `Arrange all of them together ${composition || "side by side, evenly spaced, all fully visible"}${scene ? ` ${scene.replace(/\.$/, "")}` : " on a pale travertine plinth against a seamless cream wall"}.`,
    "Keep every product exactly as photographed: same silhouette, colour, material, stitching and hardware; do not merge, restyle or recolour them, and add no other objects.",
    "Soft studio key light from the upper left, natural contact shadows, eye-level camera, true-to-life colour, premium and minimal. The upper third stays open, smooth wall.",
    CLEAN,
  ].join(" ");
}

/**
 * L4 image-to-video prompt, model-aware. The start frame is real (L0) or an L1 composite of the real cut-out.
 */
export function i2vPrompt({ model, desc, camera = "push_in", motion, dur = 5, surface = "the surface" }) {
  const cam = cameraPhrase(camera);
  const extra = motion ? ` ${motion.replace(/\.$/, "")}.` : " Soft light glides gently across the material.";
  if (model.startsWith("kling")) {
    return `@product rests on ${surface} exactly as in the first frame. 0–${dur} s: ${cam}, keeping @product centred.${extra} @product keeps its exact shape, colour, stitching, hardware and logo throughout; it is the only object. Lighting and white balance stay constant. Clean photorealistic product film, one continuous take. No subtitles. No background music.`;
  }
  if (model.startsWith("bytedance/seedance")) {
    return `Product film: ${desc.text} on ${surface}. ${cam.charAt(0).toUpperCase() + cam.slice(1)}.${extra} Soft studio key light, sharp focus on the product. The product keeps exactly the shape, colour, stitching, hardware and logo of the first frame in every frame; it is the only object in the scene. One continuous shot. No subtitles, no on-screen text, no added logo or watermark, no packaging, no people, no background music.`;
  }
  if (model.startsWith("veo")) {
    return `Using the provided first frame: ${cam}.${extra} The ${desc.text} stays completely still and unchanged for the whole shot; only the camera moves. Lighting and white balance stay constant. One single continuous shot. ${NO_TALK}`;
  }
  if (model.startsWith("wan")) {
    return `E-commerce product showcase of the ${desc.text} in the reference image on ${surface}. Shot 1 (00:00–00:0${Math.min(9, dur)}): ${cam}, keeping the product centred.${extra} The product's shape, colour, stitching, hardware and logo stay highly consistent without deformation; keep everything else unchanged. No dialogue. No background music. No subtitles, no watermark, no extra brand names, no packaging or box, no extra objects, no colour change, no shot cuts.`;
  }
  return `${cam}.${extra} The product stays exactly as in the first frame. One continuous shot. ${NO_TALK}`;
}

/** L5 lifestyle motion (person carries the product). */
export function r2vPrompt({ model, desc, action }) {
  const act = action || "a woman walks slowly toward the camera carrying the bag on her shoulder, hand relaxed on the strap, the bag swinging gently";
  const base = `Neck-down tracking shot: ${act}. The ${desc.text} stays identical to the reference in every frame: shape, colour, stitching and hardware. Natural daylight, one continuous shot. ${NO_TALK}`;
  return model.startsWith("kling") ? base.replace(`The ${desc.text}`, "@product") + " No background music." : base;
}

/** Product-free b-roll (Wan). */
export function brollPrompt({ scene, camera = "push_in" }) {
  return `${scene || "Warm minimal boutique interior with soft daylight"}. ${cameraPhrase(camera)}. No people, no products, no text, no signage. One continuous shot. No dialogue. No background music.`;
}

/** FR4 linter for a compiled prompt. Returns violations (empty = ok). */
export function promptViolations(prompt, { positiveOnly = false, productFree = false } = {}) {
  const v = [];
  // FR1: a plate / b-roll prompt must not ask for the product, or the model invents one (L6).
  if (productFree && /\b(bags?|handbags?|totes?|pack|pieces?|sneakers?|shoes?|sandals?|slides?|pouch(es)?|clutch(es)?|purse|backpack)\b/i.test(prompt)) v.push("product noun in a product-free plate prompt");
  if (/\bSIRINE\b|سيرين|\bDZD\b|دج|\b\d[\d,.\s]*\s?(DA|DZD)\b/i.test(prompt)) v.push("brand or price in prompt");
  if (/\b(gift|offer|discount|promo|sale)\b|هدية|عرض/i.test(prompt)) v.push("offer/gift words in prompt");
  if (positiveOnly && /\b(logo|box|boxes|packaging|brand|text|letters?)\b/i.test(prompt)) v.push("negation words on a positive-only model");
  return v;
}
