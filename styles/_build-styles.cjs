// Source of the 10 batch-001 style cards (distilled 2026-11-04 from the 25-ref DNA library).
// Run: node styles/_build-styles.cjs  → writes styles/<id>.json, then `node cli.mjs style set --file styles/<id>.json`.
const fs = require("fs");
const path = require("path");
const RAIL = { enabled: true, slots: ["price", "strike", "cod_delivery"], from_frame0: true };
const END = { enabled: true, dur: 2, slots: ["name", "price", "strike", "cta", "site"] };
const ref = (id, take, note) => ({ kind: "adlib", id, take, note: note ?? null });
const S = [
{
  id: "bundle-stack-build", name: "Bundle build — count the pieces",
  summary: "Full pack on a shelf at frame 0, then each piece gets its own beat with a checklist tick, then pull back to the whole set. Price + COD rail from frame 0.",
  why_it_wins: "Cosmos Bags (bundle_reveal) makes the viewer count pieces before any price: a growing pile reads as value for COD pack buyers. We keep the counting but show the FULL pack in frame 0 (owner rule) and add the price/COD rail competitors never show.",
  refs: [ref("1350521436517345", ["hook", "detail macros", "pull-out ending"], "hand-built version needs a shoot; we start from the finished pile")],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 13, archetype: "bundle_reveal", hook_type: "product_reveal", angle: "bundle_value", awareness: "product_aware",
  beats: [
    { id: "b1", role: "hook", dur: 2.5, shot: "bundle_layout", strategy: "ai_plate_harmonize", ref_roles: ["hero"], scene: "Dark walnut shelf against a plain white wall, soft daylight from the left, one potted plant cut off at the frame edge", composition: "an empty stretch of the shelf in the lower-centre third where objects will be placed later", camera: "push_in", overlays: [{ kind: "headline", slot: "hook_text", position: "upper_third" }] },
    { id: "b2", role: "detail", dur: 3, shot: "detail_macro", strategy: "ai_i2v", from_beat: "b1", camera: "macro_slide", motion: "The product stays rigid; only the camera moves", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b3", role: "detail", dur: 3, shot: "product_angle", strategy: "real_photo_motion", ref_roles: ["alt"], camera: "pan", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_2", position: "upper_third" }] },
    { id: "b4", role: "reveal", dur: 2.5, shot: "bundle_layout", strategy: "real_photo_motion", ref_roles: ["hero"], camera: "pull_out", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_3", position: "upper_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "benefit_list", hook_patterns: ["{bundle_items} بسعر واحد", "{name} — {bundle_items}", "{name} بـ {price} فقط"], primary_structure: "Line 1 pieces + price; lines 2-4 one benefit per piece; line 5 COD + 69 wilayas + inspect before paying.", tone: "warm, concrete, Darija" },
  audio: { music: "beat_instrumental", voiceover: "none", notes: "No SFX at cuts; the kick on the beat is the transition." },
  fit: { categories: ["packs"], requires: ["pack"] },
  dos: ["Every piece of the pack visible in frame 0", "One benefit per beat, tick lands while that piece is on screen"],
  donts: ["No hands or unboxing (needs a shoot)", "No watermark or competitor props"]
},
{
  id: "pack-offer-card", name: "Pack offer card (static)",
  summary: "Static card: the whole pack as a real cut-out on a calm AI plinth, headline naming the pieces, price tag and a COD/69-wilaya sticker.",
  why_it_wins: "Ranimo and Cosmos 'Pack 3' statics (feasibility 5/5) lead with the offer itself: item count + price in one glance. Cheap to make, easy to iterate by colour.",
  refs: [ref("1885836288810525", ["layout", "offer stack"]), ref("1372477411218357", ["price tag", "pack-count headline"])],
  format: "image", aspects: ["4:5", "9:16"], duration_s: null, archetype: "offer_stack", hook_type: "offer_first", angle: "bundle_value", awareness: "product_aware",
  beats: [
    { id: "s1", role: "offer", dur: null, shot: "bundle_layout", strategy: "ai_plate_harmonize", ref_roles: ["hero"], scene: "Pale travertine plinth against a warm beige wall, soft daylight, gentle contact shadow", composition: "an empty area of the plinth top in the middle third where objects will be placed later", camera: "static", overlays: [{ kind: "headline", slot: "hook_text", position: "top" }, { kind: "badge_sticker", slot: "cod_delivery", position: "upper_third" }, { kind: "price_tag", slot: "price", position: "lower_third", emphasis: "big" }] }
  ],
  rail: { enabled: false }, end_card: { enabled: false },
  copy: { framework: "offer_first", hook_patterns: ["{bundle_items}", "{name} بـ {price}"], primary_structure: "Offer line (pieces + price), COD + delivery, colours, CTA.", tone: "direct" },
  audio: { music: "none" },
  fit: { categories: ["packs"], requires: ["pack"] },
  dos: ["Price and COD readable at thumbnail size"], donts: ["No more than 4 text elements"]
},
{
  id: "price-ladder-video", name: "Price-led video (price in frame 0)",
  summary: "Opens on the full pack with the price punched in big, then two quick proof beats with ticks, then an offer card restating price + COD before the end card.",
  why_it_wins: "The 'Juste un sac' price-led winner (offer_stack, price_shock, feasibility 4/5): the number is the hook for price-sensitive COD buyers. Competitors rarely show price on screen; we do it from frame 0.",
  refs: [ref("1800016363898953", ["price-first hook", "offer card"])],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 11, archetype: "offer_stack", hook_type: "price_shock", angle: "value_price", awareness: "product_aware",
  beats: [
    { id: "b1", role: "hook", dur: 2.5, shot: "bundle_layout", strategy: "ai_plate_composite", ref_roles: ["hero"], scene: "Seamless warm-grey studio sweep, soft top light", composition: "an empty area of the sweep floor in the lower-centre third where objects will be placed later", camera: "zoom_punch", overlays: [{ kind: "headline", slot: "hook_text", position: "top" }, { kind: "price_tag", slot: "price", position: "upper_third", emphasis: "big" }] },
    { id: "b2", role: "proof", dur: 2.5, shot: "product_angle", strategy: "real_photo_motion", ref_roles: ["alt"], camera: "push_in", transition_in: "push", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b3", role: "proof", dur: 2.5, shot: "product_hero", strategy: "real_photo_motion", ref_roles: ["hero"], camera: "pan", transition_in: "push", overlays: [{ kind: "checklist", slot: "benefit_2", position: "upper_third" }] },
    { id: "b4", role: "offer", dur: 2, shot: "text_card", strategy: "graphic", camera: "static", transition_in: "slide", overlays: [{ kind: "price_tag", slot: "price", position: "center", emphasis: "big" }, { kind: "badge_sticker", slot: "cod", position: "lower_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "offer_first", hook_patterns: ["{name} بـ {price} فقط", "{price} بدل {strike}"], primary_structure: "Price + crossed price first, then what's in the pack, then COD + delivery.", tone: "punchy" },
  audio: { music: "beat_instrumental", voiceover: "none" },
  fit: { categories: ["packs", "sacs"], requires: ["compare_at"] },
  dos: ["Crossed price only when the store has a real compare-at price"], donts: ["No fake countdowns"]
},
{
  id: "colour-grid-swap", name: "Colour grid, pick your colour (video)",
  summary: "All colourways in one row at frame 0 with the colour names as pills, then the hero colour up close, then pull back to the row.",
  why_it_wins: "Maison and TOKYO colour-range winners make choosing a colour the hook (colour_pop). Frame 0 already answers 'which colours?', the first COD question in comments.",
  refs: [ref("995716683366949", ["grid hook", "colour swap"]), ref("1175846798043578", ["colour cut rhythm"]), ref("27387020140954805", ["split-screen colours in first 2 s"])],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 12, archetype: "colour_range", hook_type: "colour_pop", angle: "style_trend", awareness: "solution_aware",
  beats: [
    { id: "b1", role: "hook", dur: 2.5, shot: "colour_lineup", strategy: "ai_image_compose", ref_roles: ["family"], scene: "Identical cream plinths in a row against a soft sand wall, even studio light", composition: "All colourways at equal size, same angle", camera: "static", overlays: [{ kind: "headline", slot: "hook_text", position: "top" }, { kind: "pill_labels", slot: "colours", position: "lower_third" }] },
    { id: "b2", role: "reveal", dur: 3, shot: "product_hero", strategy: "real_photo_motion", ref_roles: ["hero"], camera: "push_in", transition_in: "zoom_through", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b3", role: "detail", dur: 2.5, shot: "product_angle", strategy: "real_photo_motion", ref_roles: ["alt"], camera: "pan", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_2", position: "upper_third" }] },
    { id: "b4", role: "cta", dur: 2, shot: "colour_lineup", strategy: "ai_i2v", from_beat: "b1", camera: "pull_out", motion: "Products stay rigid; only the camera moves", transition_in: "dissolve", overlays: [{ kind: "pill_labels", slot: "colours", position: "lower_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "minimal", hook_patterns: ["اختاري لونك: {colours}", "{colours}"], primary_structure: "Colours first, then price + COD, then 'write your colour in the order form'.", tone: "light" },
  audio: { music: "trending_pop", voiceover: "none", notes: "Royalty-free / licensed track only." },
  fit: { categories: ["packs", "sacs"], requires: ["multi_colour"] },
  dos: ["Only colours that are in stock"], donts: ["Never invent a colourway the store doesn't sell"]
},
{
  id: "colour-picker-static", name: "Same scene, every colour (static grid)",
  summary: "One static grid: every colourway in the identical cosy scene, colour names as pills, price tag. The image works as a colour picker.",
  why_it_wins: "The 6-card sofa carousel (752488534450702) and the per-colour card template (1194670162386450) keep the scene fixed so only the colour changes; feasibility 5/5 from real photos.",
  refs: [ref("752488534450702", ["fixed scene per colour"]), ref("1194670162386450", ["repeating template", "price on every card"])],
  format: "image", aspects: ["4:5", "9:16"], duration_s: null, archetype: "colour_range", hook_type: "colour_pop", angle: "versatility", awareness: "solution_aware",
  beats: [
    { id: "s1", role: "reveal", dur: null, shot: "colour_lineup", strategy: "ai_image_compose", ref_roles: ["family"], scene: "Cream boucle sofa with a sage-green cushion, soft window light, identical framing for each colour", composition: "2x2 grid, one colourway per cell, same angle and scale", camera: "static", overlays: [{ kind: "headline", slot: "hook_text", position: "top" }, { kind: "pill_labels", slot: "colours", position: "center" }, { kind: "price_tag", slot: "price", position: "lower_third" }] }
  ],
  rail: { enabled: false }, end_card: { enabled: false },
  copy: { framework: "minimal", hook_patterns: ["{name} — {colours}", "اختاري لونك"], primary_structure: "Colour list, price, COD, delivery.", tone: "light, one language" },
  audio: { music: "none" },
  fit: { categories: ["packs", "sacs"], requires: ["multi_colour"] },
  dos: ["Same scale per colour cell"], donts: ["No props wrong for the audience (bottles, wine glasses)"]
},
{
  id: "new-arrival-onmodel", name: "New arrival on model (static)",
  summary: "The store's real on-model photo kept whole (blurred side fill in 4:5), «جديد» sticker, short headline, price + COD rail at the bottom. Zero generated pixels.",
  why_it_wins: "921857247156649 (on_model_lifestyle, new_arrival, feasibility 4/5): a styled outfit photo + 'new' label sells the trend angle and shows scale on the body.",
  refs: [ref("921857247156649", ["new badge", "on-model framing"])],
  format: "image", aspects: ["4:5", "9:16"], duration_s: null, archetype: "on_model_lifestyle", hook_type: "new_arrival", angle: "style_trend", awareness: "unaware",
  beats: [
    { id: "s1", role: "hook", dur: null, shot: "on_model", strategy: "real_photo", ref_roles: ["on_model"], camera: "static", talent: "model_face", overlays: [{ kind: "badge_sticker", slot: "new_badge", position: "top" }, { kind: "headline", slot: "hook_text", position: "upper_third" }] }
  ],
  rail: RAIL, end_card: { enabled: false },
  copy: { framework: "minimal", hook_patterns: ["{name} الجديد وصل", "جديد: {name}"], primary_structure: "New + name, the look, price, COD.", tone: "trendy" },
  audio: { music: "none" },
  fit: { categories: ["packs", "sacs"], requires: ["on_model_photo"], notes: "Needs a real, consented on-model photo in the refs." },
  dos: ["Never cover the face with text"], donts: ["No AI-generated people"]
},
{
  id: "gift-reveal-pack", name: "Gift reveal (pack + free gift)",
  summary: "Frame 0 shows the full pack including the gift, then the gift gets its own beat with a «هدية» sticker, a macro proof beat, and an offer card.",
  why_it_wins: "The free-gift mechanic is the reason to order now. Owner rule: the gift is visible from frame 0, never hidden behind a box.",
  refs: [ref("1350521436517345", ["piece-by-piece emphasis"], "gift beat replaces the hand-built pile"), ref("930282729455144", ["offer that upgrades during the ad"])],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 12, archetype: "gift_angle", hook_type: "gift_hook", angle: "gift", awareness: "product_aware",
  beats: [
    { id: "b1", role: "hook", dur: 2.5, shot: "bundle_layout", strategy: "ai_plate_harmonize", ref_roles: ["hero"], scene: "Soft blush-pink tabletop against a warm white wall, gentle morning light", composition: "an empty area of the tabletop in the lower-centre third where objects will be placed later", camera: "push_in", overlays: [{ kind: "headline", slot: "hook_text", position: "upper_third" }] },
    { id: "b2", role: "reveal", dur: 3, shot: "gift_reveal", strategy: "real_photo_motion", ref_roles: ["gift", "alt"], camera: "push_in", transition_in: "dissolve", overlays: [{ kind: "badge_sticker", slot: "gift", position: "upper_third" }] },
    { id: "b3", role: "detail", dur: 3, shot: "detail_macro", strategy: "ai_i2v", from_beat: "b1", camera: "macro_slide", motion: "Products stay rigid; only the camera moves", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b4", role: "offer", dur: 2, shot: "text_card", strategy: "graphic", camera: "static", transition_in: "slide", overlays: [{ kind: "price_tag", slot: "price", position: "center", emphasis: "big" }, { kind: "badge_sticker", slot: "cod", position: "lower_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "offer_first", hook_patterns: ["{gift}", "{name} + هدية"], primary_structure: "Gift first, what's in the pack, price, COD.", tone: "generous" },
  audio: { music: "nasheed_vocal", voiceover: "none", notes: "Royalty-free only." },
  fit: { categories: ["packs"], requires: ["gift", "pack"] },
  dos: ["Gift must be the real gift item from the store"], donts: ["Never show a gift box we don't ship"]
},
{
  id: "detail-macro-quality", name: "Quality macros (texture + hardware)",
  summary: "Full pack hit with a zoom punch at frame 0, then real detail beats on texture and hardware, then an AI orbit on the real composite, end card.",
  why_it_wins: "Macro proof is how an affordable pack earns trust (Cosmos 15-22 s macro take; Olinasac's calm warm-light pacing). The motion-hit opener stops the scroll; the rest proves material.",
  refs: [ref("1350521436517345", ["macro slide beats"]), ref("850901013992608", ["calm warm-light pacing"], "its hand demos need a shoot")],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 12, archetype: "detail_closeup", hook_type: "motion_hit", angle: "quality_material", awareness: "solution_aware",
  beats: [
    { id: "b1", role: "hook", dur: 2, shot: "bundle_layout", strategy: "ai_plate_composite", ref_roles: ["hero"], scene: "Dark charcoal velvet surface, single warm raking key light, deep soft shadows", composition: "an empty area of the velvet in the lower-centre third where objects will be placed later", camera: "zoom_punch", overlays: [{ kind: "headline", slot: "hook_text", position: "upper_third" }] },
    { id: "b2", role: "detail", dur: 3, shot: "detail_macro", strategy: "real_photo_motion", ref_roles: ["detail", "alt"], camera: "macro_slide", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b3", role: "detail", dur: 2.5, shot: "product_angle", strategy: "real_photo_motion", ref_roles: ["alt"], camera: "tilt", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_2", position: "upper_third" }] },
    { id: "b4", role: "proof", dur: 3, shot: "product_angle", strategy: "ai_i2v", from_beat: "b1", camera: "orbit", motion: "Products stay rigid; only the light catches the texture as the camera moves", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_3", position: "upper_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "benefit_list", hook_patterns: ["شوفي التفاصيل: {name}", "{name} من قريب"], primary_structure: "Material/hardware details, price, COD, inspect before paying.", tone: "calm, premium" },
  audio: { music: "beat_instrumental", voiceover: "none", notes: "Dark swells only, nothing at the cuts." },
  fit: { categories: ["packs", "sacs"], requires: [] },
  dos: ["Macro only on real photo pixels"], donts: ["No AI-generated hardware or logos"]
},
{
  id: "whats-in-the-pack", name: "What's in the pack? (checklist reveal)",
  summary: "Frame 0: full pack on a saturated backdrop with the question «واش كاين في الباك؟»; each next beat ticks one item; an AI orbit on the real composite closes.",
  why_it_wins: "Checklist ticks that land as each feature is shown (820442184068022) plus the saturated studio backdrop that makes dark leather pop (821662394349347). The question is answered within 2 s, so it isn't bait.",
  refs: [ref("820442184068022", ["tick-as-shown checklist"]), ref("821662394349347", ["saturated backdrop"], "its packing demo needs a shoot")],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 11, archetype: "studio_showcase", hook_type: "curiosity_gap", angle: "matching_set", awareness: "problem_aware",
  beats: [
    { id: "b1", role: "hook", dur: 2, shot: "bundle_layout", strategy: "ai_plate_composite", ref_roles: ["hero"], scene: "Saturated cobalt-blue seamless backdrop, crisp even studio light", composition: "an empty area of the blue sweep floor in the lower-centre third where objects will be placed later", camera: "push_in", overlays: [{ kind: "headline", slot: "hook_text", position: "top" }] },
    { id: "b2", role: "reveal", dur: 2.5, shot: "product_hero", strategy: "real_photo_motion", ref_roles: ["hero"], camera: "push_in", transition_in: "hard_cut", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b3", role: "reveal", dur: 2.5, shot: "product_angle", strategy: "real_photo_motion", ref_roles: ["alt"], camera: "pan", transition_in: "hard_cut", overlays: [{ kind: "checklist", slot: "benefit_2", position: "upper_third" }] },
    { id: "b4", role: "proof", dur: 2.5, shot: "bundle_layout", strategy: "ai_i2v", from_beat: "b1", camera: "orbit", motion: "Products stay rigid on the blue sweep; only the camera moves", transition_in: "hard_cut", overlays: [{ kind: "checklist", slot: "benefit_3", position: "upper_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "question_hook", hook_patterns: ["واش كاين في الباك؟", "واش كاين في {name}؟"], primary_structure: "Answer the question with the item list, then price + COD.", tone: "playful" },
  audio: { music: "beat_instrumental", voiceover: "none" },
  fit: { categories: ["packs"], requires: ["pack"] },
  dos: ["Answer the question by 2 s"], donts: ["No 'read the description' bait"]
},
{
  id: "cod-trust-card", name: "Pay on delivery card (typographic static)",
  summary: "Typographic static: the product on a clean plate, the COD promise as the headline, an inspect-before-paying pill and the price. Trust over hype.",
  why_it_wins: "Competitors almost never put price + «الدفع عند الاستلام» on the creative itself; SIRINE's edge is trust for first-time COD buyers (convenience_cod).",
  refs: [ref("1885836288810525", ["offer-first text hierarchy"], "inverted: the COD promise is the headline")],
  format: "image", aspects: ["4:5", "9:16"], duration_s: null, archetype: "typographic", hook_type: "offer_first", angle: "convenience_cod", awareness: "most_aware",
  beats: [
    { id: "s1", role: "offer", dur: null, shot: "product_hero", strategy: "ai_plate_composite", ref_roles: ["hero"], scene: "Flat warm off-white paper texture with a faint soft shadow, minimal", composition: "an empty area of the paper in the lower half where an object will be placed later", camera: "static", overlays: [{ kind: "headline", slot: "hook_text", position: "top", emphasis: "big" }, { kind: "pill_labels", slot: "inspect", position: "upper_third" }, { kind: "price_tag", slot: "price", position: "lower_third" }] }
  ],
  rail: { enabled: false }, end_card: { enabled: false },
  copy: { framework: "offer_first", hook_patterns: ["{cod_delivery}", "{cod} · {price}"], primary_structure: "COD + inspect before paying, delivery reach, product, price.", tone: "reassuring" },
  audio: { music: "none" },
  fit: { categories: ["packs", "sacs"], requires: [] },
  dos: ["Type at thumbnail-readable size"], donts: ["No 'guaranteed' wording"]
},
// ── Premium tier (big-brand craft, 2026-11-05 DNA: Polène, Songmont, Longchamp) ──────────────────
{
  id: "premium-cloud-hero", name: "Premium · bag on a white cloud",
  summary: "Big-brand calm: the bag small and alone on a vast white quilted cushion, overcast soft light, slow overhead descent, lots of negative space; price + COD rail added in the edit.",
  why_it_wins: "Polène's Felted Edition makes a small bag precious through scale and silence: one hard, defined object in a soft, matte, empty world. Glossy or dark SIRINE bags pop hardest on matte white.",
  refs: [ref("1830102428185695", ["white quilted cushion set", "scale contrast", "overcast light"], "never the Polène bag, logo or models")],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 10, archetype: "studio_showcase", hook_type: "product_reveal", angle: "elegance_status", awareness: "solution_aware",
  beats: [
    { id: "b1", role: "hook", dur: 3.5, shot: "product_hero", strategy: "ai_plate_harmonize", ref_roles: ["hero"], scene: "A vast pillowy white quilted cushion with deep tufted dimples and small cream buttons filling the frame, soft even overcast daylight from above", composition: "an empty dimple in the centre of the cushion where an object will be placed later", camera: "top_down", overlays: [{ kind: "headline", slot: "hook_text", position: "top" }] },
    { id: "b2", role: "detail", dur: 3, shot: "detail_macro", strategy: "ai_i2v", from_beat: "b1", camera: "push_in", motion: "The product stays still; a soft highlight slides across its surface as the camera moves", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b3", role: "reveal", dur: 2.5, shot: "product_angle", strategy: "real_photo_motion", ref_roles: ["alt", "hero"], camera: "pull_out", transition_in: "dissolve", overlays: [] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "minimal", hook_patterns: ["{name}", "{name} — {colours}"], primary_structure: "One quiet line about the look, then price, COD, delivery. No exclamation marks.", tone: "calm, premium" },
  audio: { music: "beat_instrumental", voiceover: "none", notes: "Soft piano/ambient bed; nothing on the cuts." },
  fit: { categories: ["sacs", "packs"], requires: [] },
  dos: ["Product occupies about a third of the frame", "Matte white set, no props"], donts: ["No brand-like monograms on the set", "No busy text"]
},
{
  id: "premium-sunlit-sill", name: "Premium · bag alone in a real place",
  summary: "Film-photo still life: the bag alone on an old window sill against a colour-blocked plaster wall in open shade, warm grade and grain; slow push-in; 60% empty wall for the price + COD text.",
  why_it_wins: "Songmont 'Luna' (97 days, score 77.6): no person, no text, a real-looking place, complementary colour block so the bag is the only neutral. Reads as a magazine photo, not an ad.",
  refs: [ref("1378467954426288", ["window-sill still life", "colour block", "film grade"], "Songmont set + design are ip_flags")],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 8, archetype: "studio_showcase", hook_type: "colour_pop", angle: "style_trend", awareness: "unaware",
  beats: [
    { id: "b1", role: "hook", dur: 4, shot: "lifestyle_scene", strategy: "ai_plate_harmonize", ref_roles: ["hero"], scene: "An old ochre plaster wall with a weathered blue-green wooden window shutter and a deep stone sill, soft open-shade daylight, warm film grade with fine grain, Mediterranean medina feel", composition: "an empty stretch of the stone sill in the lower third where an object will be placed later", camera: "push_in", overlays: [{ kind: "headline", slot: "hook_text", position: "upper_third" }] },
    { id: "b2", role: "proof", dur: 3, shot: "product_angle", strategy: "ai_i2v", from_beat: "b1", camera: "pan", motion: "The product stays still; only a curtain edge and the light move slightly", transition_in: "dissolve", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "minimal", hook_patterns: ["{name}", "{name} — {colours}"], primary_structure: "Mood line, price, COD + delivery.", tone: "quiet, warm" },
  audio: { music: "beat_instrumental", voiceover: "none" },
  fit: { categories: ["sacs", "packs"], requires: [] },
  dos: ["Keep 60% of the frame as empty wall for text"], donts: ["No people", "No other objects on the sill"]
},
{
  id: "premium-hard-sun-gloss", name: "Premium · hard sun on gloss",
  summary: "Hard backlit sun against a white rendered wall, crisp cast shadow and a drifting lens flare; highlights roll across glossy material; colour switch at the midpoint. Best for patent/vernis bags.",
  why_it_wins: "Longchamp (2026 drop): monochrome set so the bag is the only colour, hard sun + flare reads expensive, and the gloss highlight rolling over the patent is the quality proof.",
  refs: [ref("1586642362654973", ["hard sun white wall", "gloss highlight", "colour switch"], "faces and Longchamp design not copied")],
  format: "video", aspects: ["9:16", "4:5"], duration_s: 9, archetype: "detail_closeup", hook_type: "motion_hit", angle: "quality_material", awareness: "solution_aware",
  beats: [
    { id: "b1", role: "hook", dur: 3, shot: "product_hero", strategy: "ai_plate_composite", ref_roles: ["hero"], scene: "A sunlit white rendered wall at noon with a crisp diagonal cast shadow, hard sun from behind camera-right, a soft lens flare at the frame edge", composition: "an empty patch of the wall in the centre where an object will be placed later", camera: "push_in", overlays: [{ kind: "headline", slot: "hook_text", position: "top" }] },
    { id: "b2", role: "detail", dur: 3, shot: "detail_macro", strategy: "ai_i2v", from_beat: "b1", camera: "macro_slide", motion: "The product stays still; the sun highlight rolls slowly across the glossy surface", transition_in: "hard_cut", overlays: [{ kind: "checklist", slot: "benefit_1", position: "upper_third" }] },
    { id: "b3", role: "reveal", dur: 2.5, shot: "colour_lineup", strategy: "ai_image_compose", ref_roles: ["family"], scene: "The same sunlit white wall and hard shadow", composition: "side by side on a white ledge, evenly spaced", camera: "static", transition_in: "hard_cut", overlays: [{ kind: "pill_labels", slot: "colours", position: "lower_third" }] }
  ],
  rail: RAIL, end_card: END,
  copy: { framework: "minimal", hook_patterns: ["{name}", "{colours}"], primary_structure: "Look line, colours, price, COD.", tone: "confident" },
  audio: { music: "beat_instrumental", voiceover: "none" },
  fit: { categories: ["sacs"], requires: ["multi_colour"] },
  dos: ["Keep AI motion ≤ 3 s — patent reflections warp in long clips"], donts: ["No faces"]
}
];
for (const s of S) {
  s.status = "draft";
  s.created_from = "2026-11-04 DNA library (25 refs)";
  fs.writeFileSync(path.join(__dirname, `${s.id}.json`), JSON.stringify(s, null, 2) + "\n");
}
console.log(`${S.length} style files written`);
