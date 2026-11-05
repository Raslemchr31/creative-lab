# Kie.ai API: technical reference for the creative-lab Node client

> **Researched:** 2026-11-01, against the live docs (`https://docs.kie.ai`, 252 English pages pulled as raw `.md`, each with an embedded OpenAPI 3.0.1 block), the live pricing data behind `https://kie.ai/pricing`, and three **unauthenticated** probe requests (no API key used, no paid call made).
> **Companion file:** `kie-models.json`: 195 image/video/audio model entries, machine-generated from the same OpenAPI blocks (no hand-typed schemas).
> **Rule used throughout:** if a fact is not on a page I fetched, it is marked **UNVERIFIED** or **NOT DOCUMENTED**. Nothing here comes from training memory unless flagged.

---

## 0. Read this first: what changed vs. the "classic" Kie API

1. **Everything is now one task API.** Even the model families that used to have their own routes (4o Image, Flux Kontext, Veo 3.1, Runway, Suno) are now documented on `POST /api/v1/jobs/createTask` + `GET /api/v1/jobs/recordInfo`. Their pages carry the banner *"This is the new version of the API documentation; for the old version … see `/old-model/...`"*. The old per-family routes (e.g. `POST /api/v1/gpt4o-image/generate`) still have docs under `https://docs.kie.ai/old-model/...` but are no longer in the docs index. **Build only against `createTask`/`recordInfo`.**
2. **Errors come back as HTTP 200.** `/api/v1/*` and the upload host return `HTTP 200` with the real status in the JSON `code` field. I confirmed this live (§2.4). The exception is an **unknown path**, which returns a real HTTP 404 with a Spring-Boot error body.
3. **Retention:** generated media is kept **14 days**. Uploaded input files are kept **24 hours**. `download-url` links last **20 minutes**. Task logs are kept **2 months**.
4. **Gone or discontinued:** **Midjourney** (docs 404, `kie.ai/midjourney-api` 404, not on the pricing page), **Sora 2** (no docs page, not on the pricing page; `kie.ai/sora-2` now redirects to an OpenAI chat/GPT-Image landing page, although `sora-2-*` ids still appear in a live model-path list, §12), **Runway Aleph** (its page says *"Discontinued. Runway Aleph is no longer available on Kie AI."*), and **ElevenLabs audio-isolation** (same banner). Suno V4–V5_5 are marked *Discontinued*; use `V6`, `V6_MINI` or `V6_WILD`.
5. **The catalog is much newer than my training data.** Examples: Nano Banana 2 / 2.1 / Pro, GPT Image 2 / 2.5, Seedream 5.0, Kling 3.0 / 3.0 Omni / 4.0, Seedance 2.0 / 2.5, Wan 3.0, Veo 3.1 (Quality/Fast/Lite), HappyHorse, MiniMax H3, Vidu Q4, Gemini 3.8 TTS. Every id below was read from a live page.

---

## 1. Sources and method

| What | URL | Notes |
|---|---|---|
| Docs index | `https://docs.kie.ai/llms.txt` | 287 English + 280 Chinese links. Every page has a raw `.md` twin (append `.md`). |
| Getting started (auth, retention, limits) | https://docs.kie.ai/getting-started | |
| Market quickstart | https://docs.kie.ai/market/quickstart | |
| Get Task Details | https://docs.kie.ai/market/common/get-task-detail | |
| Webhook verification | https://docs.kie.ai/common-api/webhook-verification | |
| File Upload API | https://docs.kie.ai/file-upload-api/quickstart (+ `/upload-file-base-64`, `/upload-file-stream`, `/upload-file-url`) | |
| Credits / download URL | https://docs.kie.ai/common-api/get-account-credits , https://docs.kie.ai/common-api/download-url | |
| Pricing | https://kie.ai/pricing | The table is fed by a public endpoint, `POST https://api.kie.ai/client/v1/model-pricing/page` with body `{"pageNum":1,"pageSize":100,"modelDescription":"","interfaceType":""}`. `pageSize` is capped at 100 (`{"code":422,"msg":"分页参数不能超过100"}`). There are 605 rows (130 image, 354 video, 31 music, 90 chat), and the data's `fetchedAt` is 2026-10-31. |
| Live model-path list | `GET https://api.kie.ai/api/v1/playground/model-paths` (public, used by the pricing page) | 277 ids. Used only for cross-checking (§12). |

Docs are hosted on Apidog (`x-run-in-apidog` links in every spec, project 1184766). One downloaded page (Kling 3.0) came back truncated on the first pull and was re-fetched. The live site's network was flaky at times, but I confirmed every page I used parsed as complete YAML.

---

## 2. Base URLs, auth and the response envelope

### 2.1 Hosts

| Purpose | Base URL | Source |
|---|---|---|
| All generation, task query, credits, download-url | `https://api.kie.ai` | every spec's `servers:` block, plus https://docs.kie.ai/common-api/quickstart |
| File upload (base64 / stream / URL) | `https://kieai.redpandaai.co` | https://docs.kie.ai/file-upload-api/quickstart |
| Uploaded-file URLs (returned) | `https://tempfile.redpandaai.co/...` | upload response examples |
| Generated-file URLs (returned) | `https://tempfile.aiquickdraw.com/...`, also `https://file.aiquickdraw.com/...` | recordInfo and callback examples |

> **Docs conflict:** the three upload specs declare `servers: https://api.kie.ai`, but their prose and the quickstart say `https://kieai.redpandaai.co`. **Live check:** `POST https://api.kie.ai/api/file-url-upload` returns a real **HTTP 404**, while `POST https://kieai.redpandaai.co/api/file-url-upload` returns the 401 envelope. **Use `kieai.redpandaai.co` for uploads.**

### 2.2 Auth

```http
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json
```
(https://docs.kie.ai/getting-started §4. Stream upload uses `multipart/form-data` instead.) Keys are created at `https://kie.ai/api-key`. Per-key **hourly / daily / total usage caps** and an **IP whitelist** can be configured in the dashboard (Getting Started §3). There are no scopes and no key types in the API.

### 2.3 Envelope

Every `/api/v1/*` response is `{ "code": <int>, "msg": <string>, "data": <any> }`. The docs say (Get Task Details, Getting Started §4): *"The HTTP status is 200 even when the request fails, so always check this field: 200 means success; any other value means the request failed and msg describes the reason."*

Upload responses add a boolean: `{ "success": <bool>, "code": <int>, "msg": <string>, "data": {...} }`.

### 2.4 Live unauthenticated probes (2026-11-01, no key sent)

| Request | HTTP | Body (verbatim) |
|---|---|---|
| `GET https://api.kie.ai/api/v1/chat/credit` | 200 | `{"code":401,"msg":"Unauthorized – Authentication failed. Please check that your Authorization and Content-Type headers are correctly set."}` |
| `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=test123` | 200 | same as above |
| `POST https://api.kie.ai/api/v1/jobs/createTask` | 200 | same as above |
| `POST https://api.kie.ai/api/v1/common/download-url` | 200 | same as above |
| `POST https://kieai.redpandaai.co/api/file-url-upload` | 200 | `{"success":false,"code":401,"msg":"Authentication failed: Missing Authorization header or invalid API_KEY format"}` |
| `POST https://api.kie.ai/api/file-url-upload` (wrong host) | **404** | `{"timestamp":1793547789335,"status":404,"error":"Not Found","message":"No message available","path":"/api/file-url-upload"}` |

Observed details: `Content-Type: application/json;charset=utf-8`, `X-Robots-Tag: noindex, nofollow`, served via Cloudflare. **The 401 body has no `data` key**, and the dash in the message is an en-dash (U+2013). **No rate-limit headers** (`X-RateLimit-*`, `Retry-After`) were present on these responses, and none are documented.

---

## 3. Generic task lifecycle (all image / video / audio models)

Source: https://docs.kie.ai/market/quickstart , https://docs.kie.ai/market/common/get-task-detail , https://docs.kie.ai/getting-started §7.

```
POST /api/v1/jobs/createTask      ->  {code:200, data:{taskId}}      (200 = task CREATED, not done)
GET  /api/v1/jobs/recordInfo?taskId=…  -> state: waiting | queuing | generating | success | fail
     success -> data.resultJson (JSON *string*) -> JSON.parse -> resultUrls[]
     fail    -> data.failCode (numeric string) + data.failMsg
optional: callBackUrl receives the same data object on success AND on fail
```

### 3.1 Create task

`POST https://api.kie.ai/api/v1/jobs/createTask`. The body is always `{ "model": "<id>", "callBackUrl"?: "<https url>", "input": { …model-specific… } }`.

Verbatim example (Nano Banana Pro, https://docs.kie.ai/market/google/pro-image-to-image):
```json
{
  "model": "nano-banana-pro",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "prompt": "Comic poster: cool banana hero in shades leaps from sci-fi pad. …",
    "image_input": [],
    "aspect_ratio": "1:1",
    "resolution": "1K",
    "output_format": "png"
  }
}
```
Response (verbatim):
```json
{"code":200,"msg":"success","data":{"taskId":"task_nano-banana-pro_1765178625768"}}
```
The `taskId` format is opaque and varies by family. Examples in the docs: `task_nano-banana-pro_1765178625768`, `5659c84dcf183f0805e9cfdf746af2cf`, `veo_task_abcdef123456`, `ee603959-debb-48d1-98c4-a6d1c717eba6`. **Treat it as an opaque string.**

Create-time `code` enum (most market specs): `200, 401, 402, 404, 422, 429, 433, 455, 500, 501, 505`. Some families add `400`, `409` (Suno; meaning not documented), or `451` (Veo/Runway; "download failed").

### 3.2 Query task: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}`

Verbatim success example (https://docs.kie.ai/market/common/get-task-detail):
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_12345678",
    "model": "grok-imagine/text-to-image",
    "state": "success",
    "param": "{\"model\":\"grok-imagine/text-to-image\",\"callBackUrl\":\"https://your-domain.com/api/callback\",\"input\":\"{\\\"prompt\\\":\\\"Cinematic portrait...\\\",\\\"aspect_ratio\\\":\\\"3:2\\\"}\"}",
    "resultJson": "{\"resultUrls\":[\"https://example.com/generated-content.jpg\"]}",
    "failCode": "",
    "failMsg": "",
    "costTime": 15,
    "completeTime": 1698765432000,
    "createTime": 1698765400000,
    "updateTime": 1698765432000,
    "progress": 45,
    "creditsConsumed": 50
  }
}
```

Field semantics (from the schema text on that page):

| field | type | meaning |
|---|---|---|
| `state` | enum `waiting` \| `queuing` \| `generating` \| `success` \| `fail` | `waiting` = queued, `queuing` = in processing queue, `generating` = running |
| `param` | string | Original request as JSON. **Its `input` is itself a JSON string. "Parse it twice."** |
| `resultJson` | string | Present on success. Images/video/audio: `{"resultUrls":[...]}`. Seedance 2.x with `return_last_frame`: `{"resultUrls":[],"lastFrameUrl":[]}`. Text output: `{"resultObject":{...}}`. OmniHuman subject detection: `{"resultObject":{"mask_urls":[...]}}` (**those URLs expire in 1 hour**). OmniHuman human identification: `{"resultObject":{"subject_status":0|1}}`. **May be null or `""` on failure.** |
| `response` | object | "Parsed form of resultJson. Present only when state is success." (new; in the schema but **absent** from the doc's own example, so don't depend on it) |
| `failCode` | string | Numeric string, e.g. `"500"`. On success it may be `null` or `""`. |
| `failMsg` | string | Failure reason |
| `costTime` | int (s) | Processing seconds, present on success and on fail |
| `createTime` / `completeTime` / `updateTime` | int (ms epoch) | Callback schema note: *"Use completeTime as the completion time; updateTime may equal createTime."* |
| `creditsConsumed` | number | Actual credits deducted. The callback schema says *"0 for failed tasks"*. |
| `progress` | int | Appears **only in the example**, not the schema. Treat as optional. |

recordInfo errors (same page): `{"code":401,"msg":"Unauthorized"}`; `{"code":422,"msg":"recordInfo is null","data":null}` (missing taskId, unknown task, or another account's task); `{"code":429,"msg":"Rate limit exceeded"}`; `{"code":500,"msg":"Server Error - An unexpected error occurred while processing the request","data":null}`.

Polling guidance from the docs: *"Start with 2-3 second intervals, increase gradually"*; *"Some video tasks take longer than 10 minutes. Keep polling until state is success or fail."*; *"Use callbacks for production."* The code list also defines `408` as *"Timeout - No result has been returned for over 10 minutes."*

### 3.3 Where the result URLs live (per family; all verified on the pages cited)

| Family | Where |
|---|---|
| All `market/*` models (default) | `JSON.parse(data.resultJson).resultUrls[]` |
| Veo 3.1 `veo-3-1` at 1080p/4k | The generate page says *"For 1080p and 4k, the video URL is in `resultJson.data.result_urls` (the 720p version is in `data.origin_urls`)"*. **This conflicts** with the Veo callback page (`data.info.resultUrls` / `data.info.originUrls`). Parse defensively (§11). |
| Veo `veo/get-1080p-video` | The page says the result is at `resultJson.resultUrls[0]`, **or** comes back immediately as `data.resultUrl` in the createTask response if a 1080p version already exists. |
| Seedance 2.x `return_last_frame:true` | `resultJson.lastFrameUrl[]` (JPEG) |
| Suno (`ai-music-api/*`) | The callback carries `data.data[].audio_url` etc. (§5.5). The recordInfo `resultJson` shape for Suno is **NOT DOCUMENTED**. |

---

## 4. Callbacks (`callBackUrl`)

### 4.1 Unified market callback (all `market/*` pages, Runway, Flux-style pages migrated to the market schema)

Sent on **success and on failure** (*"Sent when the task succeeds or fails"*). `code` is `200` on success or `501` on failure (*"501: failure; see data.failCode and data.failMsg"*). Verbatim success example (https://docs.kie.ai/market/google/pro-image-to-image):
```json
{
  "code": 200,
  "msg": "Playground task completed successfully.",
  "data": {
    "taskId": "5659c84dcf183f0805e9cfdf746af2cf",
    "model": "nano-banana-pro",
    "state": "success",
    "param": "{\"input\":\"{\\\"image_input\\\":[],\\\"aspect_ratio\\\":\\\"1:1\\\",\\\"output_format\\\":\\\"png\\\",\\\"prompt\\\":\\\"Comic poster: …\\\",\\\"resolution\\\":\\\"1K\\\"}\",\"callBackUrl\": \"https://your-domain.com/api/callback\",\"model\":\"nano-banana-pro\"}",
    "resultJson": "{\"resultUrls\":[\"https://tempfile.aiquickdraw.com/workers/images/image_b700b7f77f13b79cd2ee5bf1d39a104f.png\"]}",
    "completeTime": 1786428982000,
    "createTime": 1786428952000,
    "costTime": 29,
    "creditsConsumed": 8,
    "updateTime": 1786428982000
  }
}
```
Verbatim failure example (same page):
```json
{
  "code": 501,
  "msg": "Playground task failed.",
  "data": {
    "taskId": "5659c84dcf183f0805e9cfdf746af2cf",
    "model": "nano-banana-pro",
    "state": "fail",
    "param": "{…same as above…}",
    "failCode": "500",
    "failMsg": "<error detail>",
    "completeTime": 1786428982000,
    "createTime": 1786428952000,
    "costTime": 29,
    "creditsConsumed": 0,
    "updateTime": 1786428982000
  }
}
```

### 4.2 Delivery rules (https://docs.kie.ai/common-api/webhook-verification)
- A callback is sent on success **and** on failure. *"check `data.state` (or `code`) before reading results."*
- *"Callbacks may come from different IP addresses"*. **Don't IP-allowlist.** Verify the signature instead.
- *"Respond with an HTTP 2xx status after receiving the callback."*
- The family callback pages (4o Image, Veo) state **"Timeout Setting: 15 seconds"**, so ack fast and process asynchronously.
- **Retry policy and ordering guarantees are NOT DOCUMENTED.** Make the handler idempotent on `taskId`.
- *"The signature … does not cover the request body … for the authoritative result, query Get Task Details with the taskId."* **Recommended: treat the callback as a wake-up signal and always re-read `recordInfo`.**

### 4.3 HMAC signature (enable it in `https://kie.ai/settings` to get a `webhookHmacKey`)
Headers: `X-Webhook-Timestamp` (unix **seconds**) and `X-Webhook-Signature`.
```
signature = base64( HMAC-SHA256( taskId + "." + X-Webhook-Timestamp , webhookHmacKey ) )
```
`taskId` comes from `body.data.taskId`. **Suno callbacks use `body.data.task_id`.** Compare with `crypto.timingSafeEqual`. Verbatim header example: `X-Webhook-Timestamp: 1769670760`, `X-Webhook-Signature: KxDlpbbq0GDOKqm0+FuJpJWTzY8baHSjhEt4kwElqQI=`. The docs define **no timestamp-skew window**, so pick your own (e.g. ±5 min) to block replays.

### 4.4 Family-specific callback bodies still documented (legacy shapes, which differ from 4.1)

| Family (page) | Success body (verbatim keys) |
|---|---|
| 4o Image (https://docs.kie.ai/4o-image-api/generate-4-o-image-callbacks) | `{"code":200,"msg":"Gpt4o-image generated successfully.","data":{"taskId":"task12345","info":{"result_urls":["https://example.com/result/image1.png"]}}}`. Failure codes `400` (content policy / >26214400-byte image / undownloadable), `451` (download failed), `500`. |
| Flux Kontext (spec callback) | `{"code":200,"msg":"Image generated successfully.","data":{"taskId":"task12345","info":{"resultImageUrl":"https://example.com/result.jpg"}}}`. Failure codes `400`, `500`, `501`. |
| Veo 3.1 generate (https://docs.kie.ai/veo3-api/generate-veo-3-video-callbacks) | `{"code":200,"msg":"Video generated successfully.","data":{"taskId":"veo_task_abcdef123456","promptJson":"{…}","info":{"resultUrls":["http://example.com/video1.mp4"],"originUrls":["http://example.com/original_video1.mp4"],"resolution":"1080p","seeds":[21753],"media_ids":["e5895558-…"],"has_audio_list":[true]},"creditsConsumed":60}}`. Failure: `{"code":400,"msg":"Your prompt was flagged by Website as violating content policies.","data":{"taskId":"veo_task_abcdef123456"}}`. Codes `200/400/500/501`. |
| Veo 4K (spec callback) | `data.task_id`, `data.result_urls[]`, `data.media_ids[]`, `data.image_urls[]` (snake_case), codes `200/400/500` |
| Suno | see §5.5 (`callbackType` = `text` \| `first` \| `complete`) |

Since these pages now route through `createTask`, **which shape actually arrives for those families is ambiguous in the docs.** The client should accept either shape and fall back to `recordInfo`.

---

## 5. Model-specific API families (all now via `createTask`)

### 5.1 OpenAI 4o Image (`model: "4o-image-api"`): https://docs.kie.ai/4o-image-api/generate-4-o-image
`input`: `prompt` (string; required unless `files_url` is given), `files_url` (string[], **up to 5**; jfif/pjpeg/jpeg/pjp/jpg/png/webp), `size` (**required**, enum `1:1` | `3:2` | `2:3`), `file_url` (deprecated). Verbatim request: `{"model":"4o-image-api","callBackUrl":"https://your-domain.com/api/callback","input":{"prompt":"A beautiful sunset over the mountains","size":"1:1"}}`. **No 9:16 / 4:5.** Price: 6 cr = **$0.03/image**. Legacy route (old docs only): `POST /api/v1/gpt4o-image/generate` with camelCase `filesUrl` (https://docs.kie.ai/old-model/4o-image-api/generate-4-o-image).

### 5.2 Flux Kontext (`model: "flux1-kontext"`): https://docs.kie.ai/flux-kontext-api/generate-or-edit-image
`input`: `prompt` (required; **"Only English language is supported"**), `model` (`flux-kontext-pro` default | `flux-kontext-max`), `enable_translation` (bool, default true per text), `input_image` (string, **1** image → edit mode), `aspect_ratio` (`21:9`,`16:9`,`4:3`,`1:1`,`3:4`,`9:16`), `output_format` (`jpeg` default | `png`), `prompt_upsampling` (default false), `safety_tolerance` (0–6 generation / 0–2 edit, default 2), `upload_cn` (bool), `watermark` (string). Verbatim request: `{"model":"flux1-kontext","callBackUrl":"https://your-domain.com/api/callback","input":{"prompt":"A serene mountain landscape at sunset with a lake reflecting the orange sky","enable_translation":true,"aspect_ratio":"16:9","output_format":"jpeg","prompt_upsampling":false}}`. Price: Pro **$0.025**, Max **$0.05** per image.

### 5.3 Google Veo 3.1 (4 endpoints, all on `createTask`)

| Action | `model` | `input` (verified) | Page |
|---|---|---|---|
| Generate | `veo-3-1` | `prompt` (req); `model` = `veo3_fast` (default) \| `veo3_lite` \| `veo3` (Quality); `generation_type` = `TEXT_2_VIDEO` \| `FIRST_AND_LAST_FRAMES_2_VIDEO` (1 image = first frame, 2 = first + last) \| `REFERENCE_2_VIDEO` (1–3 images, **fast/lite only, 8 s only**); `image_urls` (string[]); `aspect_ratio` = `16:9` (default) \| `9:16` \| `Auto`; `resolution` = `720p` (default) \| `1080p` \| `4k`; `duration` = `4` \| `6` \| `8` (default 8); `enable_translation` (bool); `watermark` (string); `enable_fallback` (**deprecated, remove**) | https://docs.kie.ai/veo3-api/generate-veo-3-video |
| Get 1080p | `veo/get-1080p-video` | `taskId` (req, **camelCase**), `index` (typed string, example `0`) | https://docs.kie.ai/veo3-api/get-veo-3-1080-p-video |
| Get 4K | `veo/get-4k-video` | `task_id` (req, **snake_case**), `index` (int, default 0) | https://docs.kie.ai/veo3-api/get-veo-3-4k-video |
| Extend | `veo/extend` | `task_id` (req), `prompt` (req), `model` = `fast` (default) \| `quality` \| `lite`, `seeds` (10000–99999), `watermark` | https://docs.kie.ai/veo3-api/extend-video |

Verbatim generate example: `{"model":"veo-3-1","callBackUrl":"http://your-callback-url.com/complete","input":{"prompt":"A dog playing in a park","image_urls":["http://example.com/image1.jpg","http://example.com/image2.jpg"],"watermark":"MyBrand","aspect_ratio":"16:9","enable_translation":true,"generation_type":"REFERENCE_2_VIDEO"}}`

Notes from the pages:
- All videos ship with background audio by default.
- *"Choosing 1080p or 4k at generation costs the 720p price plus the 1080P / 4K upgrade price."*
- 1080p upgrade takes about 1–3 min. 4K takes about 5–10 min. Repeat 4K calls return `422` with `"4k is processing. It should be ready in 5-10 minutes…"` or `"The video has been generated successfully"` + `data.resultUrls`.
- The extend result is a 720p continuation clip. The callback additionally includes `info.fullResultUrls` (source + continuation stitched).

### 5.4 Runway (`createTask`)

| Action | `model` | `input` | Page |
|---|---|---|---|
| Generate | `runway` | `prompt` (req, ≤1800 chars), `image_url` (optional → i2v; aspect then follows the image), `duration` (req, `5` \| `10`), `quality` (req, `720p` \| `1080p`; **10 s cannot be 1080p**), `aspect_ratio` (`16:9`,`4:3`,`1:1`,`3:4`,`9:16`; required for text-only), `watermark` | https://docs.kie.ai/runway-api/generate-ai-video |
| Extend | `runway/extend-ai-video` | `task_id`, `prompt`, `quality` (all req), `watermark`. About +5 s, same aspect. | https://docs.kie.ai/runway-api/extend-ai-video |
| Aleph v2v | `runway/gen4-aleph` | **DISCONTINUED** (page banner) | https://docs.kie.ai/runway-api/generate-aleph-video |

Verbatim: `{"model":"runway","callBackUrl":"https://api.example.com/callback","input":{"prompt":"A fluffy orange cat dancing energetically in a colorful room with disco lights","image_url":"https://example.com/cat-image.jpg","duration":5,"quality":"720p","aspect_ratio":"9:16","watermark":"kie.ai"}}`. Runway callbacks use the unified shape (§4.1).

### 5.5 Suno (`model: "ai-music-api/<action>"`, all on `createTask`)
Pages carry *"Document updated … old version: https://docs.kie.ai/old-model/suno-api/…"*. The Market quickstart still says *"some model families (such as Suno) use their own endpoints"*, which contradicts the Suno pages. **Go with the pages** (`createTask`).

Actions (model id → page): `generate` (suno-api/generate-music), `extend`, `upload-and-cover-audio`, `upload-and-extend-audio`, `add-instrumental`, `add-vocals`, `timeStamped-lyrics`, `boost-music-style`, `cover-generate`, `replace-section`, `generate-persona`, `mashup`, `suno-recovery-audio`, `convert-to-wav-format`, `create-music-video`, `generate-lyrics`, `validation-phrase` / `create-voice` / `regenerate-phrase` / `check-voice` (custom-voice flow), `separate-vocals`, `generate-midi-from-audio`, `sounds`. All are documented under `https://docs.kie.ai/suno-api/<page>`.

`generate` input (verified): `custom_mode` (bool, **req**), `instrumental` (bool, **req**), `model` (**req**; enum lists V4…V5_5, but the text says *"Use V6, V6_MINI or V6_WILD"*, older ones are *Discontinued*), `prompt`, `style` (≤1000), `title` (≤80, required in custom mode), `lyrics` (≤5000), `negative_tags`, `vocal_gender` (`m` | `f`), `style_weight` / `weirdness_constraint` / `audio_weight` (0–1), `variety` (0–4), `duration` (10–360 s, custom mode, V6 family), `persona_id`, `persona_model`, and `image_urls` (≤5) / `audio_urls` / `video_urls` (≤1) as references in non-custom mode. Verbatim: `{"model":"ai-music-api/generate","input":{"custom_mode":false,"instrumental":false,"model":"V6","prompt":"An upbeat acoustic song about a summer road trip"}}`.

Suno callback (verbatim example, generate-music page): `{"code":200,"msg":"All generated successfully.","data":{"callbackType":"complete","task_id":"2fac****9f72","data":[{"id":"e231…","audio_url":"https://example.cn/****.mp3","stream_audio_url":"https://example.cn/****","image_url":"https://example.cn/****.jpeg","prompt":"[Verse] Night city lights shining bright","model_name":"chirp-v3-5","title":"Iron Man","tags":"electrifying, rock","createTime":1791200596437,"duration":198.44}, {…second track…}]}}`. `callbackType` is `text` (lyrics ready), `first` (first track), or `complete`. **Expect up to 3 callbacks per task, and 2 tracks per request.**

### 5.6 Gemini Omni preset endpoints (synchronous, not tasks)
- `POST https://api.kie.ai/api/v1/omni/audio/create` with body `{audio_id (req, enum of preset voices e.g. "achernar"), name (req, ≤210), voice_description, example_dialogue (≤120)}`. Returns `{"code":200,"msg":"success","data":{"audioId":"a8f1c2d3e4f5...","name":"gentle female voice"}}`. Page: https://docs.kie.ai/market/gemini-omni-audio
- `POST https://api.kie.ai/api/v1/omni/character/create` with body `{descriptions (req), image_urls (1–2: [0] portrait, [1] full body, ≤20 MB), audio_ids, character_name}`. Returns `{"code":200,"msg":"success","data":{"characterId":"b09dbf56...","characterName":"cute character","imageUrl":"…","bodyImageUrl":"…"}}`. **Docs conflict:** the schema field is `descriptions`, the example sends `description`. Page: https://docs.kie.ai/market/gemini-omni-character
- The returned `audioId` / `characterId` feed `gemini-omni-video` / `google/gemini-omni-flash-1-1` (`audio_ids`, `character_ids`).

### 5.7 Grok Imagine Image 2.0 two-step segment editing
`grok-imagine-image-2-0/segment-map` (input = **one of** `{task_id}` or `{image_url}`; free, 0 cr) returns `resultObject.segments[].index`. Then `grok-imagine-image-2-0/segment-edit` takes `{prompt, task_id, mask_indexs:[…]}`. **Naming trap:** the page `/market/grok-imagine-image-2-0/image-edit` documents model `…/segment-edit`, and the page `/…/image-to-image` documents model `…/image-edit`. Always use the `model` id, not the URL slug.

### 5.8 Removed / not offered (verified 2026-11-01)

| Family | Evidence |
|---|---|
| Midjourney | `https://docs.kie.ai/mj-api/generate-mj-image.md` → 404. `https://kie.ai/midjourney-api` → 404. Not in llms.txt, the pricing data, or model-paths. |
| Sora 2 / Sora 2 Pro | Not in llms.txt. `https://docs.kie.ai/market/sora2/sora-2-image-to-video.md` → 404. Not in pricing. `https://kie.ai/sora-2` serves an "OpenAI API – GPT 6.1 Terra, GPT Image & Codex" page. **But** `sora-2-*` ids are still in the live model-paths list (§12). Undocumented means unsupported. |
| Runway Aleph (`runway/gen4-aleph`) | Page banner "Discontinued". |
| ElevenLabs audio isolation (`elevenlabs/audio-isolation`) | Page banner *"Discontinued. elevenlabs/audio-isolation is no longer available on Kie AI."* |
| Suno V4 / V4_5 / V4_5PLUS / V4_5ALL / V5 / V5_5 | Marked "(Discontinued)" in the generate-music field text. |

---

## 6. File Upload API (host `https://kieai.redpandaai.co`)

Source: https://docs.kie.ai/file-upload-api/quickstart and the three method pages. **Uploads are free.** **Uploaded files are deleted 24 hours after upload.**

| Method | Path | Body | Limits (as documented) |
|---|---|---|---|
| Base64 | `POST /api/file-base64-upload` | JSON `{ "base64Data": "<pure base64 or data URL>" (req), "uploadPath": "images/base64" (req, no leading/trailing slash), "fileName": "x.png" (opt) }` | Recommended ≤10 MB (quickstart). Page: "Large files (>10MB) should use the File Stream Upload API". +33% size. MIME from the data-URL prefix or the fileName extension. |
| Stream | `POST /api/file-stream-upload` | `multipart/form-data`: `file` (binary, req), `uploadPath` (req), `fileName` (opt) | Recommended for >10 MB. **No hard maximum documented.** |
| URL | `POST /api/file-url-upload` | JSON `{ "fileUrl": "https://…" (req), "uploadPath" (req), "fileName" (opt; but the schema `required` list also names it: docs conflict) }` | **30 s download timeout**, recommended ≤100 MB, http/https only |

`fileName` behavior: random if omitted. **Same name overwrites the old file, and caching may delay the overwrite.** Use unique names.

Success response (verbatim, stream page):
```json
{
  "success": true,
  "code": 200,
  "msg": "File uploaded successfully",
  "data": {
    "fileName": "uploaded-image.png",
    "filePath": "images/user-uploads/uploaded-image.png",
    "downloadUrl": "https://tempfile.redpandaai.co/xxx/images/user-uploads/uploaded-image.png",
    "fileSize": 154832,
    "mimeType": "image/png",
    "uploadedAt": "2025-01-01T12:00:00.000Z"
  }
}
```
(The quickstart's example also has `data.success: true` and a `downloadUrl` shaped like `https://tempfile.redpandaai.co/kieai/12345/images/my-image.jpg`.) **Pass `data.downloadUrl` into model `input` fields.** Upload error codes (body, HTTP 200): `400` (e.g. `{"success":false,"code":400,"msg":"Missing required parameter: uploadPath"}`), `401` (`{"success":false,"code":401,"msg":"Authentication failed: Invalid API Key"}` per docs; the live message differs, §2.4), `405`, `500` (`{"success":false,"code":500,"msg":"Internal server error"}`).

Per-model input limits are separate and stricter. Examples: Nano Banana Pro image ≤30 MB jpeg/png/webp; Flux-2 ≤10 MB; Kling 3.0 Omni ≤50 MB, ≥300 px, aspect 0.4–2.5; Kling 2.x images jpeg/png ≤10 MB; Hailuo jpeg/png/webp ≤10 MB; Runway and GPT Image 2 state no limit. Check `input_schema.*.notes` in `kie-models.json`. Models also accept **any public URL**, so uploading is only needed when you have no public hosting.

---

## 7. Download URL for generated files

`POST https://api.kie.ai/api/v1/common/download-url` with body `{"url":"<a kie.ai-generated file URL, e.g. resultUrls[0]>"}`. Response (verbatim): `{"code":200,"msg":"success","data":"https://tempfile.1f6cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxbd98"}`. Source: https://docs.kie.ai/common-api/download-url
- **The link is valid for 20 minutes.**
- Only works on files from **task results** (`resultUrls`, `audio_url`, …). *"URLs from the File Upload API are not supported."* External URLs return `422`.
- Code enum: `200, 401, 402, 404, 422, 429, 455, 500, 505`.
- Whether you *need* this endpoint is not stated: `resultUrls` are themselves fetchable during the 14-day window per the docs' download examples. Practical rule: **download `resultUrls[0]` straight away. If that fails (403/expired), call `download-url` and fetch within 20 min.**

---

## 8. Credits, pricing, limits, retention, errors

### 8.1 Credits
`GET https://api.kie.ai/api/v1/chat/credit` returns `{"code":200,"msg":"success","data":100.5}`. `data` is a **number (may have decimals)**. Codes: `200, 401, 404, 429, 455, 500`. Source: https://docs.kie.ai/common-api/get-account-credits

### 8.2 Pricing model
- **One credit balance for all models.** The pricing page header says *"Pay as you go with credits (**1 credit ≈ $0.005**). Each model is billed per image, per second, per video or per million tokens, and **failed tasks are never charged**."* The callback schema agrees: `creditsConsumed` is *"0 for failed tasks"*.
- `creditsConsumed` in recordInfo/callback is the **actual** charge. Reconcile against it, not the price table.
- Docs: *"Prices may change, so always refer to the pricing page"*. **Snapshot date for every price in this file: 2026-11-01** (pricing data `fetchedAt` 2026-10-31T02:10Z).
- Credit packages, the minimum top-up, and whether credits expire are **NOT DOCUMENTED** in the docs I read.

### 8.3 Rate limits and concurrency (https://docs.kie.ai/getting-started §8)
- *"Up to **20 new generation requests per 10 seconds**"*, which *"typically allows **100+ concurrent running tasks**"*. *"Limits are applied **per account**."*
- Exceeding the limit returns `code 429`. *"Rejected requests will not enter the queue."* (So a 429 is safe to retry.)
- Optional per-key hourly/daily/total caps (dashboard). The code lists define **`433` "Request Limit - Sub-key Usage Exceeds Limit"** (Kling/Seedance pages). That this is the code those caps trigger is my inference; the docs don't link the two explicitly.
- **No documented limit** on recordInfo polling, uploads, or the credit endpoint, and **no rate-limit headers** (live check). Client recommendation: a token bucket of 20 creates / 10 s per account, plus polling backoff of 3 s rising to 15–30 s.

### 8.4 Retention windows

| Object | Kept for | Source |
|---|---|---|
| Generated media (result URLs) | **14 days**, then auto-deleted | getting-started §6; get-task-detail |
| Task log records (text / metadata, `kie.ai/logs`) | **2 months** | getting-started §6 |
| Uploaded files (File Upload API) | **24 hours** | file-upload quickstart + all 3 upload pages |
| `download-url` links | **20 minutes** | common-api download-url |
| OmniHuman 1.5 subject-detection mask URLs | **1 hour** | get-task-detail |
| Seedance 2.5 draft task id (for `bytedance/seedance-2-5-draft`) | **7 days** | seedance-2-5 / -draft pages |

> Older Kie material quoted different upload retention. **24 h is what every current page says.** Copy each result to our own storage (R2/S3/disk) as soon as the task succeeds.

### 8.5 Error / status codes (union of documented lists)

| code | meaning (doc wording) | where | client action |
|---|---|---|---|
| 200 | Success | all | — |
| 400 | Bad request; content-policy flag; undownloadable input | uploads, 4o/Veo/Flux callbacks | fix input; don't retry blindly |
| 401 | Unauthorized: missing/invalid key | all | fatal, check key/headers |
| 402 | **Insufficient Credits** | create, download-url | fatal for batch; alert + stop |
| 404 | Not Found | all | fatal |
| 405 | Method Not Allowed | uploads | bug |
| 408 | *"Timeout - No result has been returned for over 10 minutes."* | code lists | treat as failure; re-query once |
| 409 | listed in Suno's enum; **meaning not documented** | Suno | treat as non-retryable conflict |
| 422 | Validation error / `recordInfo is null` / Veo 4K "processing" | all | fix params; for Veo 4K, wait 30 s+ and retry |
| 429 | Rate limited (not queued) | all | backoff + retry |
| 433 | Request Limit: Sub-key usage exceeds limit | market | stop; raise the key cap |
| 451 | Download failed (could not fetch input URL) | Veo/Runway/4o | re-host input (upload API) and retry |
| 455 | Service Unavailable: maintenance | all | backoff + retry later |
| 500 | Server error | all | retry with backoff (≤3) |
| 501 | Generation failed (also the callback failure code) | market | inspect `failCode`/`failMsg`; may retry once |
| 505 | Feature disabled | market | fatal for that model |
| 550 | listed in the old 4o enum only; undocumented | legacy | treat as 5xx |

Task-level failures arrive as `state:"fail"` + `failCode` (numeric **string**) + `failMsg`. The `failCode` vocabulary is not enumerated beyond the examples (`"400"`, `"500"`).

---

## 9. Model catalog (generated from `kie-models.json`)

Columns: **ref imgs** = max image inputs (from `maxItems` / field text; 0 = text-only; "unbounded/undocumented" = array with no limit stated). **9:16 / 4:5** = whether the request's aspect-ratio enum contains it ("?" = no AR field, output follows the input image). **price** = cheapest–dearest listed tier at kie.ai/pricing on 2026-11-01 (exact tiers are in the JSON). **Text rendering:** no Kie doc page makes any claim about in-image text quality (the only hint is Google's example prompt for Nano Banana Pro/2/2.1, *"banana holds page of long multilingual text with auto translation"*). See §10(b) for my unverified view.

### 9.1 Image models (67)

| model id | task | ref imgs | 9:16 | 4:5 | aspect ratios | resolutions | price (kie.ai/pricing) | doc |
|---|---|---|---|---|---|---|---|---|
| `qwen/image-edit` | i2i | 1 | Y | – | square square_hd portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9 | — | $0.025 /megapixel (5 cr) | [doc](https://docs.kie.ai/market/qwen/image-edit) |
| `qwen/image-to-image` | i2i | 1 | ? | ? | — (follows input / none) | — | $0.02 /image (4 cr) | [doc](https://docs.kie.ai/market/qwen/image-to-image) |
| `qwen/text-to-image` | t2i | 0 | Y | – | square square_hd portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9 | — | $0.02 /megapixel (4 cr) | [doc](https://docs.kie.ai/market/qwen/text-to-image) |
| `qwen2-1/image-to-image` | i2i | 10 | Y | – | auto 1:1 4:3 3:4 3:2 2:3 16:9 9:16 21:9 …(+1) | 1K/2K | $0.02–0.04 /image (4–8 cr) | [doc](https://docs.kie.ai/market/qwen2-1/image-to-image) |
| `qwen2-1/text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 3:2 2:3 16:9 9:16 21:9 9:21 | 1K/2K | $0.02–0.04 /image (4–8 cr) | [doc](https://docs.kie.ai/market/qwen2-1/text-to-image) |
| `qwen2/image-edit` | i2i | 3 | Y | – | 1:1 2:3 3:2 3:4 4:3 9:16 16:9 21:9 | — | $0.028 /image (5.6 cr) | [doc](https://docs.kie.ai/market/qwen2/image-edit) |
| `qwen2/text-to-image` | t2i | 0 | Y | – | 1:1 3:4 4:3 9:16 16:9 | — | $0.028 /image (5.6 cr) | [doc](https://docs.kie.ai/market/qwen2/text-to-image) |
| `qwen3/image-to-image` | i2i | 3 | Y | – | 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 | 1K/2K | $0.024 /image (4.8 cr) + input surcharge | [doc](https://docs.kie.ai/market/qwen3/image-to-image) |
| `qwen3/pro-image-to-image` | i2i | 3 | Y | – | 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 | 1K/2K | $0.032–0.06 /image (6.4–12 cr) + input surcharge | [doc](https://docs.kie.ai/market/qwen3-pro/image-to-image) |
| `qwen3/pro-text-to-image` | t2i | 0 | Y | – | 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 | 1K/2K | $0.032–0.06 /image (6.4–12 cr) | [doc](https://docs.kie.ai/market/qwen3-pro/text-to-image) |
| `qwen3/text-to-image` | t2i | 0 | Y | – | 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 | 1K/2K | $0.024 /image (4.8 cr) | [doc](https://docs.kie.ai/market/qwen3/text-to-image) |
| `z-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 16:9 9:16 | — | $0.004 /image (0.8 cr) | [doc](https://docs.kie.ai/market/z-image/z-image) |
| `wan/2-7-image` | t2i+i2i | 9 | Y | – | 1:1 16:9 4:3 21:9 3:4 9:16 8:1 1:8 | 1K/2K | $0.024 /image (4.8 cr) | [doc](https://docs.kie.ai/market/wan/2-7-image) |
| `wan/2-7-image-pro` | t2i+i2i | 9 | Y | – | 1:1 16:9 4:3 21:9 3:4 9:16 8:1 1:8 | 1K/2K/4K | $0.06 /image (12 cr) | [doc](https://docs.kie.ai/market/wan/2-7-image-pro) |
| `bytedance/seedream` | t2i | 0 | Y | – | square square_hd portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9 | — | $0.0175 /image (3.5 cr) | [doc](https://docs.kie.ai/market/seedream/seedream) |
| `bytedance/seedream-v4-edit` | i2i | 10 | Y | – | square square_hd portrait_4_3 portrait_3_2 portrait_16_9 landscape_4_3 landscape_3_2 landscape_16_9 landscape_21_9 | 1K/2K/4K | $0.025 /image (5 cr) | [doc](https://docs.kie.ai/market/seedream/seedream-v4-edit) |
| `bytedance/seedream-v4-text-to-image` | t2i | 0 | Y | – | square square_hd portrait_4_3 portrait_3_2 portrait_16_9 landscape_4_3 landscape_3_2 landscape_16_9 landscape_21_9 | 1K/2K/4K | $0.025 /image (5 cr) | [doc](https://docs.kie.ai/market/seedream/seedream-v4-text-to-image) |
| `seedream/4.5-edit` | i2i | 14 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | basic/high | $0.0325 /image (6.5 cr) | [doc](https://docs.kie.ai/market/seedream/4-5-edit) |
| `seedream/4.5-text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | basic/high | $0.0325 /image (6.5 cr) | [doc](https://docs.kie.ai/market/seedream/4-5-text-to-image) |
| `seedream/5-flash-image-to-image` | i2i | 10 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | 1K/1.5K/2K | $0.0162 /image (3.24 cr) | [doc](https://docs.kie.ai/market/seedream/5-flash-image-to-image) |
| `seedream/5-flash-layer-decomposition` | layer-decompose | 1 | – | – | auto 1K 1.5K 2K | auto/1K/1.5K/2K | $0.0162 /image (3.24 cr) | [doc](https://docs.kie.ai/market/seedream/5-flash-layer-decomposition) |
| `seedream/5-flash-text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | 1K/1.5K/2K | $0.0162 /image (3.24 cr) | [doc](https://docs.kie.ai/market/seedream/5-flash-text-to-image) |
| `seedream/5-lite-image-to-image` | i2i | 14 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | basic/high/ultra | $0.0275 /image (5.5 cr) | [doc](https://docs.kie.ai/market/seedream-5-lite-image-to-image) |
| `seedream/5-lite-text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | basic/high/ultra | $0.0275 /image (5.5 cr) | [doc](https://docs.kie.ai/market/seedream/5-lite-text-to-image) |
| `seedream/5-pro-image-to-image` | i2i | 10 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | basic/high | $0.035–0.07 /image (7–14 cr) + input surcharge | [doc](https://docs.kie.ai/market/seedream/5-pro-image-to-image) |
| `seedream/5-pro-layer-decomposition` | layer-decompose | 1 | – | – | auto 1K 1.5K 2K | — | $0.035–0.07 /image (7–14 cr) | [doc](https://docs.kie.ai/market/seedream/5-pro-layer-decomposition) |
| `seedream/5-pro-text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 16:9 9:16 2:3 3:2 21:9 | basic/high | $0.035–0.07 /image (7–14 cr) | [doc](https://docs.kie.ai/market/seedream/5-pro-text-to-image) |
| `flux-2/flex-image-to-image` | i2i | 8 | Y | – | 1:1 4:3 3:4 16:9 9:16 3:2 2:3 auto | 1K/2K | $0.07–0.12 /image (14–24 cr) | [doc](https://docs.kie.ai/market/flux2/flex-image-to-image) |
| `flux-2/flex-text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 16:9 9:16 3:2 2:3 | 1K/2K | $0.07–0.12 /image (14–24 cr) | [doc](https://docs.kie.ai/market/flux2/flex-text-to-image) |
| `flux-2/pro-image-to-image` | i2i | 8 | Y | – | 1:1 4:3 3:4 16:9 9:16 3:2 2:3 auto | 1K/2K | $0.025–0.035 /image (5–7 cr) | [doc](https://docs.kie.ai/market/flux2/pro-image-to-image) |
| `flux-2/pro-text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 16:9 9:16 3:2 2:3 | 1K/2K | $0.025–0.035 /image (5–7 cr) | [doc](https://docs.kie.ai/market/flux2/pro-text-to-image) |
| `flux-3/klein-edit-image` | i2i | 10 | Y | – | 1:1 4:3 3:4 3:2 2:3 16:9 9:16 21:9 9:21 …(+1) | 1K/2K/4K | $0.008–0.0325 /image (1.6–6.5 cr) | [doc](https://docs.kie.ai/market/flux3/klein-edit-image) |
| `flux-3/klein-text-to-image` | t2i | 0 | Y | – | 1:1 4:3 3:4 3:2 2:3 16:9 9:16 21:9 9:21 | 1K/2K/4K | $0.008–0.0325 /image (1.6–6.5 cr) | [doc](https://docs.kie.ai/market/flux3/klein-text-to-image) |
| `flux1-kontext` | t2i+i2i | 1 | Y | – | 21:9 16:9 4:3 1:1 3:4 9:16 | — | $0.025–0.05 /image (5–10 cr) | [doc](https://docs.kie.ai/flux-kontext-api/generate-or-edit-image) |
| `google/imagen4` | t2i | 0 | Y | – | 1:1 16:9 9:16 3:4 4:3 auto | — | $0.04 /request (8 cr) | [doc](https://docs.kie.ai/market/google/imagen4) |
| `google/imagen4-fast` | t2i | 0 | Y | – | 1:1 16:9 9:16 3:4 4:3 auto | — | $0.02 /request (4 cr) | [doc](https://docs.kie.ai/market/google/imagen4-fast) |
| `google/imagen4-ultra` | t2i | 0 | Y | – | 1:1 16:9 9:16 3:4 4:3 auto | — | $0.06 /image (12 cr) | [doc](https://docs.kie.ai/market/google/imagen4-ultra) |
| `google/nano-banana` | t2i | 0 | Y | Y | 1:1 9:16 16:9 3:4 4:3 3:2 2:3 5:4 4:5 …(+2) | — | $0.02 /image (4 cr) | [doc](https://docs.kie.ai/market/google/nano-banana) |
| `google/nano-banana-edit` | i2i | 10 | Y | Y | 1:1 9:16 16:9 3:4 4:3 3:2 2:3 5:4 4:5 …(+2) | — | $0.02 /image (4 cr) | [doc](https://docs.kie.ai/market/google/nano-banana-edit) |
| `nano-banana-2` | t2i+i2i | 10 | Y | Y | 1:1 2:3 3:2 1:4 4:1 3:4 4:3 4:5 5:4 …(+6) | 1K/2K/4K | $0.04–0.09 /image (8–18 cr) | [doc](https://docs.kie.ai/market/google/nanobanana2) |
| `nano-banana-2-1` | t2i+i2i | 10 | Y | Y | 1:1 2:3 3:2 1:4 4:1 3:4 4:3 4:5 5:4 …(+6) | 1K/2K/4K | $0.02–0.045 /image (4–9 cr) | [doc](https://docs.kie.ai/market/google/nanobanana-2-1) |
| `nano-banana-2-lite` | t2i+i2i | 10 | Y | Y | 1:1 1:4 1:8 2:3 3:2 3:4 4:1 4:3 4:5 …(+6) | — | $0.02 /image (4 cr) | [doc](https://docs.kie.ai/market/google/nano-banana-2-lite) |
| `nano-banana-pro` | t2i+i2i | 8 | Y | Y | 1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 …(+2) | 1K/2K/4K | $0.09–0.12 /image (18–24 cr) | [doc](https://docs.kie.ai/market/google/pro-image-to-image) |
| `ideogram/character` | i2i | 1 | Y | – | square square_hd portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9 | — | $0.06–0.12 /image (12–24 cr) | [doc](https://docs.kie.ai/market/ideogram/character) |
| `ideogram/character-edit` | inpaint | 1 | ? | ? | — (follows input / none) | — | $0.06–0.12 /image (12–24 cr) | [doc](https://docs.kie.ai/market/ideogram/character-edit) |
| `ideogram/character-remix` | i2i | 5 | Y | – | square square_hd portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9 | — | $0.06–0.12 /image (12–24 cr) | [doc](https://docs.kie.ai/market/ideogram/character-remix) |
| `ideogram/v3-edit` | inpaint | 1 | ? | ? | — (follows input / none) | — | $0.0175–0.05 /image (3.5–10 cr) | [doc](https://docs.kie.ai/market/ideogram/v3-edit) |
| `ideogram/v3-remix` | i2i | 1 | Y | – | square square_hd portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9 | — | $0.0175–0.05 /image (3.5–10 cr) | [doc](https://docs.kie.ai/market/ideogram/v3-remix) |
| `ideogram/v3-text-to-image` | t2i | 0 | Y | – | square square_hd portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9 | — | $0.0175–0.05 /image (3.5–10 cr) | [doc](https://docs.kie.ai/market/ideogram/v3-text-to-image) |
| `4o-image-api` | t2i+i2i | 5 | – | – | 1:1 3:2 2:3 | — | $0.03 /image (6 cr) | [doc](https://docs.kie.ai/4o-image-api/generate-4-o-image) |
| `gpt-image-2-5-flare-image-to-image` | i2i | 16 | Y | – | auto 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 …(+4) | 1K/2K/4K | $0.03–0.08 /image (6–16 cr) | [doc](https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-image-to-image) |
| `gpt-image-2-5-flare-text-to-image` | t2i | 0 | Y | – | auto 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 …(+4) | 1K/2K/4K | $0.03–0.08 /image (6–16 cr) | [doc](https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image) |
| `gpt-image-2-5-sunburst-image-to-image` | i2i | 16 | Y | – | auto 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 …(+4) | 1K/2K/4K | $0.03–0.08 /image (6–16 cr) | [doc](https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-image-to-image) |
| `gpt-image-2-5-sunburst-text-to-image` | t2i | 0 | Y | – | auto 1:1 3:2 2:3 4:3 3:4 16:9 9:16 21:9 …(+4) | 1K/2K/4K | $0.03–0.08 /image (6–16 cr) | [doc](https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-text-to-image) |
| `gpt-image-2-image-to-image` | i2i | 16 | Y | Y | auto 1:1 3:2 2:3 4:3 3:4 5:4 4:5 16:9 …(+7) | 1K/2K/4K | $0.03–0.08 /image (6–16 cr) | [doc](https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image) |
| `gpt-image-2-text-to-image` | t2i | 0 | Y | Y | auto 1:1 3:2 2:3 4:3 3:4 5:4 4:5 16:9 …(+7) | 1K/2K/4K | $0.03–0.08 /image (6–16 cr) | [doc](https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image) |
| `gpt-image/1.5-image-to-image` | i2i | 16 | – | – | 1:1 2:3 3:2 | medium/high | $0.02–0.11 /image (4–22 cr) | [doc](https://docs.kie.ai/market/gpt-image/1-5-image-to-image) |
| `gpt-image/1.5-text-to-image` | t2i | 0 | – | – | 1:1 2:3 3:2 | medium/high | $0.02–0.11 /image (4–22 cr) | [doc](https://docs.kie.ai/market/gpt-image/1-5-text-to-image) |
| `recraft/crisp-upscale` | upscale | 1 | ? | ? | — (follows input / none) | — | $0.0025 /image (0.5 cr) | [doc](https://docs.kie.ai/market/recraft/crisp-upscale) |
| `recraft/remove-background` | bg-remove | 1 | ? | ? | — (follows input / none) | — | $0.005 /image (1 cr) | [doc](https://docs.kie.ai/market/recraft/remove-background) |
| `topaz/image-upscale` | upscale | 1 | ? | ? | — (follows input / none) | — | $0.05–0.1 /image (10–20 cr) | [doc](https://docs.kie.ai/market/topaz/image-upscale) |
| `grok-imagine-image-2-0/image-edit` | i2i | 5 | Y | – | 1:1 2:3 3:2 16:9 9:16 auto | — | $0.02 /image (4 cr) | [doc](https://docs.kie.ai/market/grok-imagine-image-2-0/image-to-image) |
| `grok-imagine-image-2-0/segment-edit` | i2i | — | ? | ? | — (follows input / none) | — | $0.02 /image (4 cr) | [doc](https://docs.kie.ai/market/grok-imagine-image-2-0/image-edit) |
| `grok-imagine-image-2-0/segment-map` | segment | 1 | ? | ? | — (follows input / none) | — | $0 /image (0 cr) | [doc](https://docs.kie.ai/market/grok-imagine-image-2-0/segment-map) |
| `grok-imagine-image-2-0/text-to-image` | t2i | 0 | Y | – | 1:1 2:3 3:2 16:9 9:16 | — | $0.02 /image (4 cr) | [doc](https://docs.kie.ai/market/grok-imagine-image-2-0/text-to-image) |
| `grok-imagine/image-to-image` | i2i | 5 | ? | ? | — (follows input / none) | — | $0.02 /generation (4 cr) | [doc](https://docs.kie.ai/market/grok-imagine/image-to-image) |
| `grok-imagine/text-to-image` | t2i | 0 | Y | – | 2:3 3:2 1:1 16:9 9:16 | — | $0.02–0.025 /2 images (4–5 cr) | [doc](https://docs.kie.ai/market/grok-imagine/text-to-image) |

### 9.2 Video models (96)

| model id | task | ref imgs | 9:16 | 4:5 | aspect ratios | resolutions | duration s | price (kie.ai/pricing) | doc |
|---|---|---|---|---|---|---|---|---|---|
| `wan/2-2-a14b-image-to-video-turbo` | i2v | 1 | ? | ? | — (follows input / none) | 480p/720p | — | $0.04–0.08 /second (8–16 cr) | [doc](https://docs.kie.ai/market/wan/2-2-a14b-image-to-video-turbo) |
| `wan/2-2-a14b-speech-to-video-turbo` | avatar | 1 | ? | ? | — (follows input / none) | 480p/580p/720p | — | $0.06–0.12 /second (12–24 cr) | [doc](https://docs.kie.ai/market/wan/2-2-a14b-speech-to-video-turbo) |
| `wan/2-2-a14b-text-to-video-turbo` | t2v | 0 | Y | – | 16:9 9:16 | 480p/720p | — | $0.04–0.08 /second (8–16 cr) | [doc](https://docs.kie.ai/market/wan/2-2-a14b-text-to-video-turbo) |
| `wan/2-2-animate-move` | motion-control | 1 | ? | ? | — (follows input / none) | 720p | — | $0.0625 /second (12.5 cr) | [doc](https://docs.kie.ai/market/wan/2-2-animate-move) |
| `wan/2-2-animate-replace` | v2v | 1 | ? | ? | — (follows input / none) | 480p/580p/720p | — | $0.03–0.0625 /second (6–12.5 cr) | [doc](https://docs.kie.ai/market/wan/2-2-animate-replace) |
| `wan/2-5-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 5/10 | $0.3–1 /video (60–200 cr) | [doc](https://docs.kie.ai/market/wan/2-5-image-to-video) |
| `wan/2-5-text-to-video` | t2v | 0 | Y | – | 16:9 9:16 1:1 | 720p/1080p | 5/10 | $0.3–1 /video (60–200 cr) | [doc](https://docs.kie.ai/market/wan/2-5-text-to-video) |
| `wan/2-6-flash-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 5/10/15 | $0.1–0.9 /video (20–180 cr) | [doc](https://docs.kie.ai/market/wan/2-6-flash-image-to-video) |
| `wan/2-6-flash-video-to-video` | v2v | — | ? | ? | — (follows input / none) | 720p/1080p | 5/10 | $0.1–0.6 /video (20–120 cr) | [doc](https://docs.kie.ai/market/wan/2-6-flash-video-to-video) |
| `wan/2-6-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 5/10/15 | $0.35–1.575 /video (70–315 cr) | [doc](https://docs.kie.ai/market/wan/2-6-image-to-video) |
| `wan/2-6-text-to-video` | t2v | 0 | ? | ? | — (follows input / none) | 720p/1080p | 5/10/15 | $0.35–1.575 /video (70–315 cr) | [doc](https://docs.kie.ai/market/wan/2-6-text-to-video) |
| `wan/2-6-video-to-video` | v2v | — | ? | ? | — (follows input / none) | 720p/1080p | 5/10 | $0.35–1.05 /video (70–210 cr) | [doc](https://docs.kie.ai/market/wan/2-6-video-to-video) |
| `wan/2-7-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 2–15 | $0.08–0.12 /second (16–24 cr) | [doc](https://docs.kie.ai/market/wan/2-7-image-to-video) |
| `wan/2-7-r2v` | r2v | 5 | Y | – | 16:9 9:16 1:1 4:3 3:4 | 720p/1080p | 2–10 | $0.08–0.12 /second (16–24 cr) | [doc](https://docs.kie.ai/market/wan/2-7-r2v) |
| `wan/2-7-text-to-video` | t2v | 0 | Y | – | 16:9 9:16 1:1 4:3 3:4 | 720p/1080p | 2–15 | $0.08–0.12 /second (16–24 cr) | [doc](https://docs.kie.ai/market/wan/2-7-text-to-video) |
| `wan/2-7-videoedit` | v2v | 1 | Y | – | 16:9 9:16 1:1 4:3 3:4 | 720p/1080p | 0–10 | $0.08–0.12 /second (16–24 cr) | [doc](https://docs.kie.ai/market/wan/2-7-videoedit) |
| `wan/3-0-video` | t2v+i2v+r2v | 10 | Y | – | adaptive 16:9 4:3 1:1 3:4 9:16 | 480P/720P/1080P | 2–30 (or -1 auto) | $0.04–0.16 /second (8–32 cr) | [doc](https://docs.kie.ai/market/wan/3-0-video) |
| `wan/3-0-video-prime` | t2v+i2v+r2v | 10 | Y | – | adaptive 16:9 4:3 1:1 3:4 9:16 | 480P/720P/1080P | 2–30 (or -1 auto) | $0.0612–0.252 /second (12.2–50.4 cr) | [doc](https://docs.kie.ai/market/wan/3-0-video-prime) |
| `omnihuman-1-5` | avatar | 1 | ? | ? | — (follows input / none) | 720/1080 | — | $0.135 /second (27 cr) | [doc](https://docs.kie.ai/market/omnihuman-1-5) |
| `omnihuman-1-5/human-identification` | detect | 1 | ? | ? | — (follows input / none) | — | — | not on pricing page | [doc](https://docs.kie.ai/market/omnihuman-1-5/human-identification) |
| `omnihuman-1-5/subject-detection` | detect | 1 | ? | ? | — (follows input / none) | — | — | not on pricing page | [doc](https://docs.kie.ai/market/omnihuman-1-5/subject-detection) |
| `omnihuman-2-0` | avatar | 1 | ? | ? | — (follows input / none) | — | — | $0.07 /second (14 cr) | [doc](https://docs.kie.ai/market/omnihuman-2-0) |
| `bytedance/seedance-2` | t2v+i2v+r2v | 9 | Y | – | 1:1 4:3 3:4 16:9 9:16 21:9 adaptive | 480p/720p/1080p/4k | 4–15 (or -1 auto) | $0.095–1.04 /second (19–208 cr) (cheaper w/ video input) | [doc](https://docs.kie.ai/market/bytedance/seedance-2) |
| `bytedance/seedance-2-5` | t2v+i2v+r2v | 30 | Y | – | 1:1 4:3 3:4 16:9 9:16 21:9 adaptive | 480p/720p/1080p | 4–30 (or -1 auto) | $0.14–0.79 /second (28–158 cr) (cheaper w/ video input) | [doc](https://docs.kie.ai/market/bytedance/seedance-2-5) |
| `bytedance/seedance-2-5-draft` | draft-upscale | — | ? | ? | — (follows input / none) | 1080p | — | not on pricing page | [doc](https://docs.kie.ai/market/bytedance/seedance-2-5-draft) |
| `bytedance/seedance-2-fast` | t2v+i2v+r2v | 9 | Y | – | 1:1 4:3 3:4 16:9 9:16 21:9 adaptive | 480p/720p | 4–15 (or -1 auto) | $0.059–0.124 /second (11.7–24.8 cr) (cheaper w/ video input) | [doc](https://docs.kie.ai/market/bytedance/seedance-2-fast) |
| `bytedance/seedance-2-mini` | t2v+i2v+r2v | 9 | Y | – | 1:1 4:3 3:4 16:9 9:16 21:9 adaptive | 480p/720p | 4–15 (or -1 auto) | $0.019–0.041 /second (3.8–8.2 cr) (cheaper w/ video input) | [doc](https://docs.kie.ai/market/bytedance/seedance-2-mini) |
| `bytedance/v1-lite-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 480p/720p/1080p | 5/10 | $0.01–0.05 /second (2–10 cr) | [doc](https://docs.kie.ai/market/bytedance/v1-lite-image-to-video) |
| `bytedance/v1-lite-text-to-video` | t2v | 0 | Y | – | 16:9 4:3 1:1 3:4 9:16 9:21 | 480p/720p/1080p | 5/10 | $0.01–0.05 /second (2–10 cr) | [doc](https://docs.kie.ai/market/bytedance/v1-lite-text-to-video) |
| `bytedance/v1-pro-fast-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 5/10 | $0.08–0.36 /video (16–72 cr) | [doc](https://docs.kie.ai/market/bytedance/v1-pro-fast-image-to-video) |
| `bytedance/v1-pro-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 480p/720p/1080p | 5/10 | $0.014–0.07 /second (2.8–14 cr) | [doc](https://docs.kie.ai/market/bytedance/v1-pro-image-to-video) |
| `bytedance/v1-pro-text-to-video` | t2v | 0 | Y | – | 21:9 16:9 4:3 1:1 3:4 9:16 | 480p/720p/1080p | 5/10 | $0.014–0.07 /second (2.8–14 cr) | [doc](https://docs.kie.ai/market/bytedance/v1-pro-text-to-video) |
| `gemini-omni-character` | character-preset (sync) | 2 | ? | ? | — (follows input / none) | — | — | not on pricing page | [doc](https://docs.kie.ai/market/gemini-omni-character) |
| `gemini-omni-video` | t2v+r2v | 7 | Y | – | 16:9 9:16 | 720p/1080p/4k | 4/6/8/10 | $0.315–1.05 /video (63–210 cr) (cheaper w/ video input) | [doc](https://docs.kie.ai/market/gemini-omni-video) |
| `google/gemini-omni-flash-1-1` | t2v+i2v+r2v | 7 | Y | – | 16:9 9:16 | 360p/720p/1080p/4k | 4/6/8/10 | $0.315–1.05 /video (63–210 cr) (cheaper w/ video input) | [doc](https://docs.kie.ai/market/google/gemini-omni-flash-1-1) |
| `veo-3-1` | t2v+i2v+r2v | 3 | Y | – | 16:9 9:16 Auto | 720p/1080p/4k | 4/6/8 | $0.15–1.85 /video (30–370 cr) | [doc](https://docs.kie.ai/veo3-api/generate-veo-3-video) |
| `veo/extend` | extend | — | ? | ? | — (follows input / none) | — | — | $0.15–1.25 /video (30–250 cr) | [doc](https://docs.kie.ai/veo3-api/extend-video) |
| `veo/get-1080p-video` | upscale | — | ? | ? | — (follows input / none) | — | — | $0.025 /video (5 cr) | [doc](https://docs.kie.ai/veo3-api/get-veo-3-1080-p-video) |
| `veo/get-4k-video` | upscale | — | ? | ? | — (follows input / none) | — | — | $0.6 /video (120 cr) | [doc](https://docs.kie.ai/veo3-api/get-veo-3-4k-video) |
| `happyhorse-1-1/image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 3–15 | $0.1125–0.145 /second (22.5–29 cr) | [doc](https://docs.kie.ai/market/happyhorse-1-1/image-to-video) |
| `happyhorse-1-1/reference-to-video` | r2v | 9 | Y | Y | 16:9 9:16 3:4 4:3 4:5 5:4 1:1 9:21 21:9 | 720p/1080p | 3–15 | $0.1125–0.145 /second (22.5–29 cr) | [doc](https://docs.kie.ai/market/happyhorse-1-1/reference-to-video) |
| `happyhorse-1-1/text-to-video` | t2v | 0 | Y | Y | 16:9 9:16 1:1 4:3 3:4 4:5 5:4 9:21 21:9 | 720p/1080p | 3–15 | $0.1125–0.145 /second (22.5–29 cr) | [doc](https://docs.kie.ai/market/happyhorse-1-1/text-to-video) |
| `happyhorse/image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 3–15 | $0.14–0.24 /second (28–48 cr) | [doc](https://docs.kie.ai/market/happyhorse/image-to-video) |
| `happyhorse/reference-to-video` | r2v | 9 | Y | – | 16:9 9:16 1:1 4:3 3:4 | 720p/1080p | 3–15 | $0.14–0.24 /second (28–48 cr) | [doc](https://docs.kie.ai/market/happyhorse/reference-to-video) |
| `happyhorse/text-to-video` | t2v | 0 | Y | – | 16:9 9:16 1:1 4:3 3:4 | 720p/1080p | 3–15 | $0.14–0.24 /second (28–48 cr) | [doc](https://docs.kie.ai/market/happyhorse/text-to-video) |
| `happyhorse/video-edit` | v2v | 5 | ? | ? | — (follows input / none) | 720p/1080p | — | $0.14–0.24 /second (28–48 cr) | [doc](https://docs.kie.ai/market/happyhorse/video-edit) |
| `kling-2.6/image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | — | 5/10 | $0.275–1.1 /video (55–220 cr) | [doc](https://docs.kie.ai/market/kling/image-to-video) |
| `kling-2.6/motion-control` | motion-control | 1 | ? | ? | — (follows input / none) | 720p/1080p | — | $0.055–0.09 /second (11–18 cr) | [doc](https://docs.kie.ai/market/kling/motion-control) |
| `kling-2.6/text-to-video` | t2v | 0 | Y | – | 1:1 16:9 9:16 | — | 5/10 | $0.275–1.1 /video (55–220 cr) | [doc](https://docs.kie.ai/market/kling/text-to-video) |
| `kling-3.0-omni/image-to-video` | i2v | 1 | Y | – | 16:9 9:16 1:1 auto | 720p/1080p/4k | 3–15 | $0.07–0.335 /second (14–67 cr) | [doc](https://docs.kie.ai/market/kling/v3-omni-image-to-video) |
| `kling-3.0-omni/reference-to-video` | r2v | 7 | Y | – | 16:9 9:16 1:1 | 720p/1080p/4k | 3–15 | $0.07–0.335 /second (14–67 cr) | [doc](https://docs.kie.ai/market/kling/v3-omni-reference-to-video) |
| `kling-3.0-omni/text-to-video` | t2v | 0 | Y | – | 16:9 9:16 1:1 | 720p/1080p/4k | 3–15 | $0.07–0.335 /second (14–67 cr) | [doc](https://docs.kie.ai/market/kling/v3-omni-text-to-video) |
| `kling-3.0-omni/transformation` | v2v | 4 | Y | – | 16:9 9:16 1:1 auto | 720p/1080p/4k | see notes | $0.1–0.335 /second (20–67 cr) | [doc](https://docs.kie.ai/market/kling/v3-omni-transformation) |
| `kling-3.0/motion-control` | motion-control | 1 | ? | ? | — (follows input / none) | 720p/1080p | — | $0.1–0.135 /second (20–27 cr) | [doc](https://docs.kie.ai/market/kling/motion-control-v3) |
| `kling-3.0/video` | t2v+i2v | 2 | Y | – | 16:9 9:16 1:1 | std/pro/4K | 3–15 | $0.07–0.335 /second (14–67 cr) | [doc](https://docs.kie.ai/market/kling/kling-3-0) |
| `kling-4.0/keyframe-to-video` | i2v | 8 | Y | – | auto 16:9 9:16 1:1 21:9 | 720p/1080p | 3–30 | $0.1425–0.2125 /second (28.5–42.5 cr) | [doc](https://docs.kie.ai/market/kling/v4-keyframe-to-video) |
| `kling-4.0/reference-to-video` | r2v | 10 | Y | – | auto 16:9 9:16 1:1 21:9 | 720p/1080p | 3–30 | $0.1425–0.2125 /second (28.5–42.5 cr) (cheaper w/ video input) | [doc](https://docs.kie.ai/market/kling/v4-reference-to-video) |
| `kling/ai-avatar-pro` | avatar | 1 | ? | ? | — (follows input / none) | — | — | $0.08 /second (16 cr) | [doc](https://docs.kie.ai/market/kling/ai-avatar-pro) |
| `kling/ai-avatar-standard` | avatar | 1 | ? | ? | — (follows input / none) | — | — | $0.04 /second (8 cr) | [doc](https://docs.kie.ai/market/kling/ai-avatar-standard) |
| `kling/v2-1-master-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | — | 5/10 | $0.8–1.6 /video (160–320 cr) | [doc](https://docs.kie.ai/market/kling/v2-1-master-image-to-video) |
| `kling/v2-1-master-text-to-video` | t2v | 0 | Y | – | 16:9 9:16 1:1 | — | 5/10 | $0.8–1.6 /video (160–320 cr) | [doc](https://docs.kie.ai/market/kling/v2-1-master-text-to-video) |
| `kling/v2-1-pro` | i2v | 1 | ? | ? | — (follows input / none) | — | 5/10 | $0.25–0.5 /video (50–100 cr) | [doc](https://docs.kie.ai/market/kling/v2-1-pro) |
| `kling/v2-1-standard` | i2v | 1 | ? | ? | — (follows input / none) | — | 5/10 | $0.125–0.25 /video (25–50 cr) | [doc](https://docs.kie.ai/market/kling/v2-1-standard) |
| `kling/v2-5-turbo-image-to-video-pro` | i2v | 1 | ? | ? | — (follows input / none) | — | 5/10 | $0.21–0.42 /video (42–84 cr) | [doc](https://docs.kie.ai/market/kling/v25-turbo-image-to-video-pro) |
| `kling/v2-5-turbo-text-to-video-pro` | t2v | 0 | Y | – | 16:9 9:16 1:1 | — | 5/10 | $0.21–0.42 /video (42–84 cr) | [doc](https://docs.kie.ai/market/kling/v25-turbo-text-to-video-pro) |
| `kling/v3-turbo-image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 720p/1080p | 3–15 | $0.09–0.1125 /second (18–22.5 cr) | [doc](https://docs.kie.ai/market/kling/v3-turbo-image-to-video) |
| `kling/v3-turbo-text-to-video` | t2v | 0 | Y | – | 1:1 9:16 16:9 | 720p/1080p | 3–15 | $0.09–0.1125 /second (18–22.5 cr) | [doc](https://docs.kie.ai/market/kling/v3-turbo-text-to-video) |
| `infinitalk/from-audio` | avatar | 1 | ? | ? | — (follows input / none) | 480p/720p | — | $0.015–0.06 /second (3–12 cr) | [doc](https://docs.kie.ai/market/infinitalk/from-audio) |
| `minimax-h3/image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 768P/2K | 4–15 | $0.04–0.065 /second (8–13 cr) + input surcharge | [doc](https://docs.kie.ai/market/minimax-h3/image-to-video) |
| `minimax-h3/reference-to-video` | r2v | 9 | Y | – | adaptive 21:9 16:9 4:3 1:1 3:4 9:16 | 768P/2K | 4–15 | $0.04–0.065 /second (8–13 cr) + input surcharge | [doc](https://docs.kie.ai/market/minimax-h3/reference-to-video) |
| `minimax-h3/text-to-video` | t2v | 0 | Y | – | 21:9 16:9 4:3 1:1 3:4 9:16 | 768P/2K | 4–15 | $0.04–0.065 /second (8–13 cr) | [doc](https://docs.kie.ai/market/minimax-h3/text-to-video) |
| `hailuo/02-image-to-video-pro` | i2v | 1 | ? | ? | — (follows input / none) | — | — | $0.285 /video (57 cr) | [doc](https://docs.kie.ai/market/hailuo/02-image-to-video-pro) |
| `hailuo/02-image-to-video-standard` | i2v | 1 | ? | ? | — (follows input / none) | 512P/768P | 6/10 | $0.06–0.25 /video (12–50 cr) | [doc](https://docs.kie.ai/market/hailuo/02-image-to-video-standard) |
| `hailuo/02-text-to-video-pro` | t2v | 0 | ? | ? | — (follows input / none) | — | — | $0.285 /video (57 cr) | [doc](https://docs.kie.ai/market/hailuo/02-text-to-video-pro) |
| `hailuo/02-text-to-video-standard` | t2v | 0 | ? | ? | — (follows input / none) | — | 6/10 | $0.15–0.25 /video (30–50 cr) | [doc](https://docs.kie.ai/market/hailuo/02-text-to-video-standard) |
| `hailuo/2-3-image-to-video-pro` | i2v | 1 | ? | ? | — (follows input / none) | 768P/1080P | 6/10 | $0.225–0.45 /video (45–90 cr) | [doc](https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro) |
| `hailuo/2-3-image-to-video-standard` | i2v | 1 | ? | ? | — (follows input / none) | 768P/1080P | 6/10 | $0.15–0.25 /video (30–50 cr) | [doc](https://docs.kie.ai/market/hailuo/2-3-image-to-video-standard) |
| `pixverse-v6-max/image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 360p/540p/720p/1080p | 1–15 | $0.024–0.112 /second (4.8–22.4 cr) | [doc](https://docs.kie.ai/market/pixverse/v6-max-image-to-video) |
| `pixverse-v6-max/text-to-video` | t2v | 0 | Y | – | 16:9 4:3 1:1 3:4 9:16 2:3 3:2 21:9 | 360p/540p/720p/1080p | 1–15 | $0.024–0.112 /second (4.8–22.4 cr) | [doc](https://docs.kie.ai/market/pixverse/v6-max-text-to-video) |
| `pixverse-v6/extend` | extend | — | ? | ? | — (follows input / none) | 360p/540p/720p/1080p | 1–15 | $0.02–0.092 /second (4–18.4 cr) | [doc](https://docs.kie.ai/market/pixverse/extend) |
| `pixverse-v6/image-to-video` | i2v | 2 | ? | ? | — (follows input / none) | 360p/540p/720p/1080p | 1–15 | $0.02–0.092 /second (4–18.4 cr) | [doc](https://docs.kie.ai/market/pixverse/image-to-video) |
| `pixverse-v6/reference-to-video` | r2v | 7 | Y | – | 16:9 4:3 1:1 3:4 9:16 2:3 3:2 21:9 | 360p/540p/720p/1080p | 1–15 | $0.02–0.092 /second (4–18.4 cr) | [doc](https://docs.kie.ai/market/pixverse/reference-to-video) |
| `pixverse-v6/text-to-video` | t2v | 0 | Y | – | 16:9 4:3 1:1 3:4 9:16 2:3 3:2 21:9 | 360p/540p/720p/1080p | 1–15 | $0.02–0.092 /second (4–18.4 cr) | [doc](https://docs.kie.ai/market/pixverse/text-to-video) |
| `pixverse-v6/transition` | i2v | 1 | ? | ? | — (follows input / none) | 360p/540p/720p/1080p | 1–15 | $0.02–0.092 /second (4–18.4 cr) | [doc](https://docs.kie.ai/market/pixverse/transition) |
| `runway` | t2v+i2v | 1 | Y | – | 16:9 4:3 1:1 3:4 9:16 | — | 5/10 | $0.06–0.15 /video (12–30 cr) | [doc](https://docs.kie.ai/runway-api/generate-ai-video) |
| `runway/extend-ai-video` | extend | — | ? | ? | — (follows input / none) | — | — | $0.06–0.15 /video (12–30 cr) | [doc](https://docs.kie.ai/runway-api/extend-ai-video) |
| `runway/gen4-aleph` **DISCONTINUED** | v2v | 1 | Y | – | 16:9 9:16 4:3 3:4 1:1 21:9 | — | — | not on pricing page | [doc](https://docs.kie.ai/runway-api/generate-aleph-video) |
| `topaz/video-upscale` | upscale | — | ? | ? | — (follows input / none) | — | — | $0.04–0.07 /second (8–14 cr) | [doc](https://docs.kie.ai/market/topaz/video-upscale) |
| `vidu-q4/image-to-video` | i2v | 1 | ? | ? | — (follows input / none) | 540p/720p/1080p/2k/4k | 3–16 | $0.036–0.312 /second (7.2–62.4 cr) | [doc](https://docs.kie.ai/market/vidu-q4/image-to-video) |
| `vidu-q4/reference-to-video` | r2v | 15 | Y | – | 16:9 9:16 1:1 4:3 3:4 | 540p/720p/1080p/2k/4k | 3–16 | $0.036–0.312 /second (7.2–62.4 cr) | [doc](https://docs.kie.ai/market/vidu-q4/reference-to-video) |
| `volcengine/video-to-video-lip-sync` | lipsync | — | ? | ? | — (follows input / none) | — | — | $0.04 /second (8 cr) | [doc](https://docs.kie.ai/market/volcengine/video-to-video-lip-sync) |
| `grok-imagine-video-1-5-preview` | i2v | 1 | Y | – | 1:1 16:9 9:16 4:3 3:4 3:2 2:3 auto | 480p/720p/1080p | 1–15 | $0.012–0.0225 /second (2.4–4.5 cr) | [doc](https://docs.kie.ai/market/grok-imagine/1-5-preview) |
| `grok-imagine/extend` | extend | — | ? | ? | — (follows input / none) | — | 6/10 | $0.072–0.225 /video (14.4–45 cr) | [doc](https://docs.kie.ai/market/grok-imagine/extend) |
| `grok-imagine/image-to-video` | i2v | 7 | Y | – | 2:3 3:2 1:1 16:9 9:16 | 480p/720p/1080p | 6–30 | $0.012–0.04 /second (2.4–8 cr) | [doc](https://docs.kie.ai/market/grok-imagine/image-to-video) |
| `grok-imagine/text-to-video` | t2v | 0 | Y | – | 2:3 3:2 1:1 16:9 9:16 | 480p/720p/1080p | 6–30 | $0.012–0.04 /second (2.4–8 cr) | [doc](https://docs.kie.ai/market/grok-imagine/text-to-video) |
| `grok-imagine/upscale` | upscale | — | ? | ? | — (follows input / none) | 720p/1080p | — | $0.05–0.15 /upscale (10–30 cr) | [doc](https://docs.kie.ai/market/grok-imagine/upscale) |

### 9.3 Audio / music models (32)

| model id | task | key limits | price (kie.ai/pricing) | doc |
|---|---|---|---|---|
| `elevenlabs/audio-isolation` **DISCONTINUED** | audio-isolation | — | not on pricing page | [doc](https://docs.kie.ai/market/elevenlabs/audio-isolation) |
| `elevenlabs/text-to-dialogue-v3` | tts | voice: enum of 67 preset IDs; language_code enum incl. "ar" | $0.07 /1000 characters (14 cr) | [doc](https://docs.kie.ai/market/elevenlabs/text-to-dialogue-v3) |
| `elevenlabs/text-to-speech-multilingual-v2` | tts | text ≤5000 chars; voice: enum of 67 preset IDs | $0.06 /1000 characters (12 cr) | [doc](https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2) |
| `elevenlabs/text-to-speech-turbo-2-5` | tts | text ≤5000 chars; voice: enum of 67 preset IDs | $0.03 /1000 characters (6 cr) | [doc](https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5) |
| `gemini-omni-audio` | voice-preset (sync) | — | not on pricing page | [doc](https://docs.kie.ai/market/gemini-omni-audio) |
| `google/gemini-2-5-pro-tts` | tts | turn text ≤10000; 30 voices | $14 /million tokens (2800 cr) + input surcharge | [doc](https://docs.kie.ai/market/google/gemini-2-5-pro-tts) |
| `google/gemini-3-1-flash-tts` | tts | turn text ≤10000; 30 voices | $14 /million tokens (2800 cr) + input surcharge | [doc](https://docs.kie.ai/market/google/gemini-3-1-flash-tts) |
| `google/gemini-3-8-flash-lite-tts` | tts | turn text ≤10000; 70 voices | $4.2 /million tokens (840 cr) + input surcharge | [doc](https://docs.kie.ai/market/google/gemini-3-8-flash-lite-tts) |
| `google/gemini-3-8-flash-tts` | tts | turn text ≤10000; 70 voices | $6.3 /million tokens (1260 cr) + input surcharge | [doc](https://docs.kie.ai/market/google/gemini-3-8-flash-tts) |
| `ai-music-api/add-instrumental` | music | input.model ∈ V4_5PLUS/V5/V5_5/V6/V6_MINI/V6_WILD | $0.06 /request (12 cr) | [doc](https://docs.kie.ai/suno-api/add-instrumental) |
| `ai-music-api/add-vocals` | music | input.model ∈ V4_5PLUS/V5/V5_5/V6/V6_MINI/V6_WILD | $0.06 /request (12 cr) | [doc](https://docs.kie.ai/suno-api/add-vocals) |
| `ai-music-api/boost-music-style` | style-prompt | — | $0.002 /request (0.4 cr) | [doc](https://docs.kie.ai/suno-api/boost-music-style) |
| `ai-music-api/check-voice` | voice-clone | — | not on pricing page | [doc](https://docs.kie.ai/suno-api/suno-voice-check-voice) |
| `ai-music-api/convert-to-wav-format` | convert | — | $0.002 /request (0.4 cr) | [doc](https://docs.kie.ai/suno-api/convert-to-wav) |
| `ai-music-api/cover-generate` | cover-art | — | $0 /request (0 cr) | [doc](https://docs.kie.ai/suno-api/cover-suno) |
| `ai-music-api/create-music-video` | music-video | — | $0.01 /request (2 cr) | [doc](https://docs.kie.ai/suno-api/create-music-video) |
| `ai-music-api/create-voice` | voice-clone | — | not on pricing page | [doc](https://docs.kie.ai/suno-api/suno-voice-generate) |
| `ai-music-api/extend` | music-extend | input.model ∈ V4/V4_5/V4_5PLUS/V4_5ALL/V5/V5_5/V6/V6_WILD/V6_MINI | $0.06 /request (12 cr) | [doc](https://docs.kie.ai/suno-api/extend-music) |
| `ai-music-api/generate` | music | input.model ∈ V4/V4_5/V4_5PLUS/V4_5ALL/V5/V5_5/V6/V6_MINI/V6_WILD; duration 10–360 s | $0.06 /request (12 cr) | [doc](https://docs.kie.ai/suno-api/generate-music) |
| `ai-music-api/generate-lyrics` | lyrics | — | $0.002 /request (0.4 cr) | [doc](https://docs.kie.ai/suno-api/generate-lyrics) |
| `ai-music-api/generate-midi-from-audio` | midi | — | $0 /request (0 cr) | [doc](https://docs.kie.ai/suno-api/generate-midi) |
| `ai-music-api/generate-persona` | persona | — | $0 /request (0 cr) | [doc](https://docs.kie.ai/suno-api/generate-persona) |
| `ai-music-api/mashup` | music | input.model ∈ V4/V4_5/V4_5PLUS/V4_5ALL/V5/V5_5/V6/V6_WILD/V6_MINI; duration 10–360 s | $0.06 /request (12 cr) | [doc](https://docs.kie.ai/suno-api/generate-mashup) |
| `ai-music-api/regenerate-phrase` | voice-clone | — | not on pricing page | [doc](https://docs.kie.ai/suno-api/suno-voice-regenerate) |
| `ai-music-api/replace-section` | music-edit | input.model ∈ V4/V4_5/V4_5PLUS/V4_5ALL/V5/V5_5/V6/V6_MINI/V6_WILD | $0.025 /request (5 cr) | [doc](https://docs.kie.ai/suno-api/replace-section) |
| `ai-music-api/separate-vocals` | stem-split | — | $0.05–0.25 /request (10–50 cr) | [doc](https://docs.kie.ai/suno-api/separate-vocals) |
| `ai-music-api/sounds` | sfx | input.model ∈ V5/V5_5/V6/V6_WILD/V6_MINI | $0.0125 /request (2.5 cr) | [doc](https://docs.kie.ai/suno-api/generate-sounds) |
| `ai-music-api/suno-recovery-audio` (not in live model list) | recovery | — | not on pricing page | [doc](https://docs.kie.ai/suno-api/recovery-audio) |
| `ai-music-api/timeStamped-lyrics` | lyrics | — | $0.0025 /request (0.5 cr) | [doc](https://docs.kie.ai/suno-api/get-timestamped-lyrics) |
| `ai-music-api/upload-and-cover-audio` | music-cover | input.model ∈ V4/V4_5/V4_5PLUS/V4_5ALL/V5/V5_5/V6/V6_WILD/V6_MINI; duration 10–360 s | $0.06 /request (12 cr) | [doc](https://docs.kie.ai/suno-api/upload-and-cover-audio) |
| `ai-music-api/upload-and-extend-audio` | music-extend | input.model ∈ V4/V4_5/V4_5PLUS/V4_5ALL/V5/V5_5/V6/V6_WILD/V6_MINI | $0.06 /request (12 cr) | [doc](https://docs.kie.ai/suno-api/upload-and-extend-audio) |
| `ai-music-api/validation-phrase` | voice-clone | — | not on pricing page | [doc](https://docs.kie.ai/suno-api/suno-voice-validate) |

---

## 10. Recommendations for SIRINE (bags/shoes, COD, 9:16 Reels + 4:5 feed)

Prices are from kie.ai/pricing on 2026-11-01 (1 cr ≈ $0.005). **No Kie page claims product or identity fidelity for any model.** Every "fidelity" pick below is an informed bet that has to pass an A/B on 3 real SIRINE products (one structured bag, one croco texture, one shoe) before it goes into the pipeline. That is the same rule the ad-engine memory already applies: *"image→video from REAL photo only (text2video invents a bag)"*.

### (a) Product-faithful image editing from 1–4 reference photos
| Rank | Model id | Why (verified facts) | Price |
|---|---|---|---|
| 1 | `nano-banana-pro` | `image_input` up to **8** refs (jpeg/png/webp ≤30 MB). AR enum includes **4:5 and 9:16** natively. 1K/2K/4K. | **$0.09** (1K/2K), $0.12 (4K) |
| 2 (cheap twin) | `nano-banana-2-1` | 10 refs, same AR set (+1:4, 4:1, 1:8, 8:1), 1K/2K/4K | **$0.02** 1K / $0.03 2K / $0.045 4K |
| 3 (challenger) | `gpt-image-2-image-to-image` | `input_urls` up to **16**. 4:5 supported **at 1K and 4K only** ("2K does not support 5:4, 4:5…"). `background: transparent` only at 1K. | $0.03 / $0.05 / $0.08 (1K/2K/4K) |
| Pixel-lock option | `qwen2-1/image-to-image` + `mask_url` | Mask mode: *"white marks the area to change and black is kept unchanged"*, with exactly 1 input image. **Product pixels outside the mask are not regenerated**, which is the strongest fidelity guarantee in the catalog. Can't combine with transparent background. | $0.02 1K / $0.04 2K |
| Cut-out | `recraft/remove-background` | PNG/JPG/WEBP ≤5 MB, ≤16 MP, 256–4096 px. Then composite the real cut-out onto a generated scene (Remotion/ffmpeg). Zero product hallucination. | **$0.005** |

Avoid for the 4:5 feed: `seedream/4.5-edit` (14 refs, $0.0325, but AR enum has **no 4:5**), `flux-2/pro-image-to-image` (no 4:5), `flux1-kontext` (single input image, **English-only prompts**, no 4:5), and `4o-image-api` (only 1:1, 3:2, 2:3).

### (b) Best Arabic / Latin in-image text
- **The docs say nothing about text-rendering quality for any model.**
- My **UNVERIFIED** view, based on upstream model reputations from before my training cutoff: Latin headlines are most promising on `gpt-image-2-text-to-image` ($0.03 1K), `nano-banana-pro` ($0.09), and `ideogram/v3-text-to-image` (TURBO $0.0175 / BALANCED $0.035 / QUALITY $0.05; uses `image_size` presets such as `portrait_16_9`, with no 4:5).
- **Arabic / Darija:** don't depend on any generator for glyphs. Arabic is cursive and RTL, and models commonly break letter joins and word order. Generate the image **without text** and overlay Arabic copy in Remotion, which the repo's existing pipeline already does (Cairo font, RTL rules, Western digits per `config/languages.json`). If you must test, A/B `nano-banana-pro` vs `gpt-image-2` with a 3-word Arabic price line and check it by eye.

### (c) Product image-to-video, 5–10 s, 9:16
| Rank | Model id + settings | Verified facts | Cost for one clip |
|---|---|---|---|
| 1 | `kling-3.0-omni/image-to-video`, variant **"First and Last Frames"** (`image_urls:[first,last]`), `aspect_ratio:"auto"`, `audio:false` | Exactly 1 or 2 frames (JPG/PNG ≤50 MB, ≥300 px). Duration 3–15 s (int). 720p/1080p/4k. *"When customize_multi_shots is false, aspect_ratio must be auto and the video follows the aspect ratio of the first frame"*, so **feed a 9:16 frame**. Pinning both ends to real-product frames limits drift. | 720p no-audio $0.07/s → **5 s $0.35, 10 s $0.70**. 1080p $0.09/s → $0.45 / $0.90. |
| 2 (cheaper per clip) | `veo-3-1`, `generation_type:"FIRST_AND_LAST_FRAMES_2_VIDEO"`, `input.model:"veo3_fast"`, `aspect_ratio:"9:16"`, `duration:8` | 1–2 frames. Native 9:16. Durations only 4/6/8 (use `veo/extend` for more). Background audio is always on (strip it in post). | **$0.30** 720p / $0.325 1080p per video. Lite: $0.15 / $0.175. |
| 3 | `bytedance/seedance-2-fast`, `first_frame_url` (+ optional `last_frame_url`), `aspect_ratio:"9:16"`, `generate_audio:false` | 4–15 s, 480p/720p. First/last frame and reference modes are mutually exclusive. | 720p $0.124/s → 5 s $0.62 |
| alt | `kling-4.0/keyframe-to-video` (first + ≤8 middle + last keyframes) | 3–30 s, 720p/1080p. Output follows the first frame's AR. | 720p $0.1425/s → 5 s $0.71 |

### (d) Highest-quality hero video
- `veo-3-1` with `input.model:"veo3"`. The docs call it *"Veo 3.1 Quality — flagship model, highest fidelity"*. 9:16 is native. Use `FIRST_AND_LAST_FRAMES_2_VIDEO` with real product frames (note `REFERENCE_2_VIDEO` is **not** available on Quality). **$1.25 (720p) / $1.275 (1080p) / $1.85 (4K) per video.** The pricing rows list one price per video. They don't say whether the 4/6/8 s duration changes it: **UNVERIFIED**, so check `creditsConsumed` on the first run.
- A/B challengers: `kling-4.0/reference-to-video` (up to 10 ref images + `elements` with 2–4 views per subject, which suits a bag shot from several angles; 1080p $0.2125/s → 10 s **$2.13**), and `bytedance/seedance-2-5` (up to 30 ref images, 4–30 s; 1080p $0.79/s → 8 s $6.32, so expensive).

### (e) Cheap drafts
- **Images:** `flux-3/klein-edit-image` **$0.008** 1K (10 refs; AR enum has 9:16 but **no 4:5**), `nano-banana-2-1` **$0.02** 1K (has 4:5), `z-image` **$0.004** (text-to-image only, prompt ≤1000 chars).
- **Video:** `bytedance/seedance-2-mini` 480p **$0.019/s** (5 s ≈ $0.095), `grok-imagine/image-to-video` 480p $0.012/s but **min 6 s** (≈ $0.072), `veo-3-1` Lite 720p **$0.15/clip**, `pixverse-v6/image-to-video` 360p $0.02/s (1–15 s).

### (f) Arabic TTS
- **No Kie page mentions Arabic or Darija by name.** The only machine-readable Arabic signal is `"ar"` in the `language_code` enum of **`elevenlabs/text-to-dialogue-v3`** (**$0.07 / 1000 chars**, all dialogue text ≤5000 chars total, `stability` ∈ {0, 0.5, 1}). This is the best-documented Arabic path. Send a one-item `dialogue` array (the docs give no `minItems`; **UNVERIFIED** that one item is accepted).
- `elevenlabs/text-to-speech-multilingual-v2` (**$0.06 / 1000 chars**, text ≤5000, 67 preset voice IDs, preview at `https://static.aiquickdraw.com/elevenlabs/voice/<voice_id>.mp3`). Arabic is an *upstream ElevenLabs* capability (**UNVERIFIED on Kie**). **Don't send a non-empty `language_code`**: the docs say only Turbo v2.5 / Flash v2.5 support it and *"for other models, an error will be returned"*.
- `elevenlabs/text-to-speech-turbo-2-5` ($0.03 / 1000 chars) accepts a free-text `language_code` such as `"ar"`.
- Voices are a **fixed enum** (no custom voice IDs, no Arabic-named voices). Darija pronunciation is not addressed anywhere. A 25 s VO (about 300–400 chars) costs about **$0.02–0.03**. Budget for a human Darija VO if the TTS output sounds MSA or foreign.
- Voice-clone path: `google/gemini-3-8-flash-tts` `speakers[].replica` (10–30 s source recording + a spoken consent sentence). $0.35/M input tokens + $6.30/M audio tokens. Arabic is not documented.

### Suggested client design (follows from the facts above)
1. **One adapter, schema-driven.** Validate every `input` against `kie-models.json` (enums, `max_items`, `max_length`, required) **before** calling, so mistakes don't come back as 422s. Field names for the same concept differ per model (`image_input`, `image_urls`, `input_urls`, `files_url`, `input_image`, `image`, `image_url` (sometimes an array!), `first_frame_url`, `reference_image_urls`, `reference_image`), and so do the value vocabularies (`aspect_ratio` vs `ratio` vs `image_size` presets vs `size`; `"5"` string vs `5` int durations; `720p` vs `768P` vs `480P` casing).
2. **Check `code`, not HTTP status**, but also handle real HTTP 4xx/5xx and Cloudflare HTML.
3. **Token bucket:** 20 creates / 10 s per account. Retry 429/455/500 with backoff. Never retry 401/402/433/505.
4. **Persist `taskId` + request** before polling, because recordInfo is the source of truth for 2 months. Poll with backoff from 3 s up to 30 s, cap about 20 min for video, and treat `408` as failure.
5. **Callbacks:** HMAC-verify, ack 2xx within 15 s, de-duplicate on `taskId`, then re-read `recordInfo`.
6. **Copy results immediately** to our own storage (generated files last 14 days). **Re-upload inputs per job**, because uploads last 24 h and a cached upload URL goes stale.
7. **Log `creditsConsumed`** per task into the ad-engine ops log, and alert on `402` / low balance via `GET /api/v1/chat/credit`.

---

## 11. Docs inconsistencies and gotchas found (code defensively for each)

1. **Upload host:** the specs' `servers` say `api.kie.ai`, the prose says `kieai.redpandaai.co`. Live: only redpandaai works (§2.1).
2. **Suno routing:** the Market quickstart says Suno uses its own endpoints, but every Suno page documents `createTask` with `model:"ai-music-api/…"`.
3. **Veo 1080p/4k result location:** `resultJson.data.result_urls` (generate page) vs `data.info.resultUrls` (callback page). Read both, plus `resultJson.resultUrls`.
4. **Veo id casing:** `veo/get-1080p-video` takes `input.taskId` (camelCase; `index` typed string, example `0`). `veo/get-4k-video` and `veo/extend` take `input.task_id`.
5. **Legacy callback shapes** (4o `data.info.result_urls`, Flux `data.info.resultImageUrl`, Veo `data.info.resultUrls`, Suno `data.task_id` + `data.data[]`) are still documented alongside the unified shape (§4.1).
6. **recordInfo schema vs example:** `progress` and `updateTime` appear only in the example, and `response` only in the schema.
7. **Gemini Omni character:** the schema field is `descriptions`, the example uses `description`.
8. **URL upload:** `fileName` is described as optional but listed in the schema's `required` array.
9. **Upload 401 text** differs between the docs (`Authentication failed: Invalid API Key`) and live (`…Missing Authorization header or invalid API_KEY format`). Match on `code`, never on `msg`.
10. **Grok Image 2.0** page slugs don't match their model ids (§5.7).
11. **Kling 3.0** (`kling-3.0/video`): the response schema nests `code` inside `data` (a doc bug; the real envelope is the standard one).
12. **ElevenLabs:** `language_code` "errors on non-Turbo models", yet the multilingual-v2 example sends `"language_code":""`. Omit it or send an empty string.
13. **Seedance:** `return_last_frame` is marked deprecated on seedance-2 / 2-fast but is live on 2.5 and described in recordInfo. `asset://{assetId}` inputs are accepted, but **no endpoint to create assets is documented**.
14. **`nsfw_checker`** (many models): *"Defaults to false. When false, no additional content filtering is applied"*. Kie's extra filter is OFF by default, but upstream provider moderation still applies (e.g. Veo 400 *"flagged … content policies"*).
15. **Kling 3.0 Omni i2v:** `aspect_ratio` must be `"auto"` unless `customize_multi_shots:true`, so you control the output AR only through the first frame.
16. **Veo `REFERENCE_2_VIDEO`** works only with `veo3_fast` / `veo3_lite` and only at 8 s.
17. **Runway:** 10 s + 1080p is invalid.
18. **Hailuo 2.3:** 10 s is not supported at 1080P.
19. **Code 409** (Suno) has no documented meaning. **433** is documented as "Sub-key Usage Exceeds Limit".

---

## 12. Model ids that are live but undocumented (do NOT build on these)

`GET https://api.kie.ai/api/v1/playground/model-paths` (public; 277 ids) lists these non-chat ids that have **no docs page** and (mostly) no price row. They may be hidden, legacy, or in testing. Calling them is undefined behavior:

`sora-2-text-to-video`, `sora-2-image-to-video`, `sora-2-text-to-video-stable`, `sora-2-image-to-video-stable`, `sora-2-pro-text-to-video`, `sora-2-pro-image-to-video`, `sora-2-pro-storyboard`, `sora-2-characters`, `sora-2-characters-pro`, `sora2-remix`, `sora-watermark-remover`, `bytedance/seedance-1.5-pro`, `kling-o1/kling-hig-image-omni-flf-o1`, `kling-o1/kling-hig-video-reference-o1`, `kling-o1/kling-hig-video-edit-o1`, `kling-o1/kling-hig-image-reference-o1`, `kling/v1-tts`, `kling/v1-avatar-standard`, `kling/ai-avatar-v1-pro`, `nano-banana-upscale`, `infinitalk/from-text`, `elevenlabs/sound-effect-v2`, `elevenlabs/speech-to-text`, `bytedance/omni-human`, `openai/whisper-speech-to-text`, `kie/image-refiner`, `ideogram/v3-reframe`, `luma-dream-machine/modify`, `luma-dream-machine/ray-2-flash-reframe`, `ai-music-api/generate-voice`, `wantest/2-5-text-to-video`, `v3-api`, `gemini-omni-audio`, `gemini-omni-character` (the last two are documented, but as separate sync endpoints, §5.6).

The reverse case: `ai-music-api/suno-recovery-audio` is documented but **absent** from model-paths.

---

## 13. Official SDK / MCP / n8n

- The docs mention **only** the agent-skills installer: `npx skills add https://kie.ai`. It installs two skills, `kie-models` and `kie-chat-agents`, which read `KIE_API_KEY` from the environment (https://docs.kie.ai/ai-agent/install-kie-models , https://docs.kie.ai/ai-agent/overview). No repository URL is given. The probe of `https://kie.ai/.well-known/skills/index.json` returned 404.
- **No official Node/JS SDK, MCP server, or n8n node** is mentioned in any of the 252 English pages, and a web search found none. The only GitHub link in the docs is a third-party tool (`farion1231/cc-switch`) in the Claude-Code chat guide.
- Recommendation: write our own thin client (zero-dependency `fetch`, Node 22) against this reference. Don't take a third-party SDK.

---

## 14. Mock-server contract (what the test double must reproduce)

| Endpoint | Behavior to mimic |
|---|---|
| `POST /api/v1/jobs/createTask` | 200 → `{"code":200,"msg":"success","data":{"taskId":"<opaque>"}}`. Every error is **HTTP 200** with `code` 401 (body has **no** `data`), 402, 422 (`msg` text, `data:null`), 429, 433, 455, 500, 501, 505. |
| `GET /api/v1/jobs/recordInfo?taskId=` | `state` walks `waiting → queuing → generating → success \| fail`. `param` is a JSON string whose `input` is a JSON string. `resultJson` is a JSON **string** (`{"resultUrls":[…]}`), null/"" on fail. `failCode` is a numeric **string**. `creditsConsumed` is 0 on fail. An unknown id returns `{"code":422,"msg":"recordInfo is null","data":null}`. |
| Callback POST to `callBackUrl` | Unified body (§4.1), `code` 200/501, headers `X-Webhook-Timestamp` (s) + `X-Webhook-Signature` = base64(HMAC-SHA256(`taskId.timestamp`)). Send on success and fail. Also simulate a duplicate delivery, a 15 s receiver timeout, and the legacy shapes (§4.4) and Suno's 3-stage `callbackType`. |
| `GET /api/v1/chat/credit` | `{"code":200,"msg":"success","data":100.5}` |
| `POST /api/v1/common/download-url` | `{"code":200,"msg":"success","data":"https://tempfile…"}`. 422 for a non-Kie or uploaded-file URL. Link "expires" after 20 min. |
| Upload host `POST /api/file-{base64,stream,url}-upload` | `{"success":true,"code":200,"msg":"File uploaded successfully","data":{fileName,filePath,downloadUrl,fileSize,mimeType,uploadedAt}}`. Errors are `success:false` + 400/401/405/500 at HTTP 200. Files "expire" after 24 h. |
| Unknown path | **Real HTTP 404**, `{"timestamp":…,"status":404,"error":"Not Found","message":"No message available","path":"…"}` |
| Veo specials | `veo/get-1080p-video` may return `data.resultUrl` immediately. `veo/get-4k-video` repeat calls return 422 "4k is processing…" / "The video has been generated successfully" with `data.resultUrls`. |
| Rate limit | 21st create inside 10 s → `{"code":429,"msg":"Rate limit exceeded"}` (HTTP 200), with no `Retry-After` header. |

*End of reference. Machine-readable catalog: `kie-models.json` (195 entries; every `input_schema` was parsed from the OpenAPI block at its `doc_url`).*
