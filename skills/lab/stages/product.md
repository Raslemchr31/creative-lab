# Stage: products

- `node cli.mjs product sync` (Turso, falls back to the public feed; network) → `product list --in-stock`, `product show --slug X`.
- Refs: index 0 = hero, others alt; `kind` (packshot/scene/detail) is auto-classified. Packshots feed cut-outs; scene photos feed on-model beats.
- Add real photos: `product ref-add --slug X --file path --role detail|in_hand|gift|packaging`; reject a bad one: `product ref-approve --slug X --idx N --off`.
- `config/product-specs/<family>.json` = pieces (ar/fr/en), hardware counts, colourways, `display_name`, `benefits`. Written by Claude from the photos, **confirmed by the owner**. Store `details` win; spec `benefits` fill in when the store field is empty; a Latin-only Arabic gift name is replaced by the spec's gift piece.
- Store-data problems block or warn at preflight — fix them in the STORE, not around it: «منقوش/بنقشة» in cabas-amazigh and croco-trio details (P10 BLOCK), Latin-only Arabic names, AI-looking pack-classique photos.
- Never advertise out-of-stock (P1) or pack-sac/sabo refs (designed ads with text; sabo has health claims).
