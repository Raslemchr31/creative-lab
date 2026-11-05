# Stage: export → ad-engine

`node cli.mjs export run --batch B` copies APPROVED finals + copy (primary/headline/description, `url_tags` with `utm_content={{ad.id}}`) + lineage + manifest to `ad-engine/config/clients/sirine-01/creative/lab-<batch>/`.
Launch only through ad-engine `/ads launch` (compliance → dry-run diff → --confirm). Mark AI-made creatives honestly; keep Advantage+ generative enhancements OFF (opt-out lists all enhancement keys).
