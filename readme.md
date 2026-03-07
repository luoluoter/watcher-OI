# OpenClaw Watcher Bridge

This repo does one thing:

- Accept Watcher device audio at `POST /v2/watcher/talk/audio_stream`
- Forward bytes to your upstream Watcher service
- Return device-compatible payload: `JSON + ---sensecraftboundary--- + WAV`

No local STT/Ollama/Python pipeline is included anymore.

## Topology

```text
Watcher Device
  -> http://<bridge-ip>:8000/v2/watcher/talk/audio_stream
Bridge (this repo)
  -> http://<openclaw-host>:<gateway-port>/v2/watcher/talk/audio_stream
OpenClaw (extensions/watcher channel)
  -> reply text + audio
Bridge
  -> normalized binary response back to device
```

## OpenClaw Integration (This Project's Real Upstream)

This bridge is intended to sit in front of OpenClaw `extensions/watcher`:

- OpenClaw receives the same inbound path:
  - `/v2/watcher/talk/audio_stream`
- OpenClaw watcher returns JSON contract:
  - `data.reply_text`
  - `data.reply_wav_base64`
- This bridge consumes that JSON and repackages it to device binary format.

### Config mapping

1. Configure OpenClaw watcher channel:

```yaml
channels:
  watcher:
    enabled: true
    webhookPath: /v2/watcher/talk/audio_stream
    webhookToken: <shared-token>
    bigmodelApiKey: <your-bigmodel-key>
```

2. Configure this bridge (`.env`):

```dotenv
WATCHER_TARGET=http://<openclaw-host>:<gateway-port>
WATCHER_AUTH_TOKEN=<shared-token>
```

Notes:
- `WATCHER_AUTH_TOKEN` is sent as `Authorization` to OpenClaw.
- OpenClaw watcher accepts token from bearer header/query/header fields.
- If OpenClaw uses `dmPolicy=allowlist`, ensure bridge sender (query `sender`) is in `channels.watcher.allowFrom`.

## Official Watcher Hardware Reference

- Seeed Watcher getting started:
  - https://wiki.seeedstudio.com/getting_started_with_watcher/

## Runtime Flow (Matches `main.js`)

### Step 0: Startup and env loading

- Service loads env from `WATCHER_ENV_FILE` or `.env`.
- Existing process env has higher priority than file values.
- Listen port is fixed at `8000`.

### Step 1: Initialize runtime defaults

- `WATCHER_TARGET` default: `http://172.22.1.82:18789`
- `WATCHER_SENDER` default: `test-device`
- `WATCHER_AUTH_TOKEN` has a built-in fallback value in code. Override in production.
- `WATCHER_INBOUND_AUTH_TOKEN` empty means inbound auth disabled.
- Timeout default: `60000` ms.
- Max request size default: `20971520` bytes.
- Debug save switches default to enabled (`WATCHER_SAVE_REQ/RESP/AUDIO/UPSTREAM=1`).

### Step 2: Middleware logging

- Every request gets a random `requestId`.
- Logs include request metadata, inbound auth preview, and response timing.
- Early disconnects are logged on `res.close`.

### Step 3: Handle `POST /v2/watcher/talk/audio_stream`

1. Validate inbound auth (if configured).
- Mismatch returns `401` JSON.

2. Read raw request body.
- Exceeds `WATCHER_MAX_REQUEST_BYTES` -> `400 Bad Request`.

3. Build upstream URL.
- Uses same path/query as inbound request.
- Adds `sender=<WATCHER_SENDER>` if missing.

4. Forward to upstream with axios.
- Body is forwarded as raw bytes.
- `Authorization` to upstream always uses `WATCHER_AUTH_TOKEN` (normalized as Bearer when needed).
- Upstream network errors -> `502 Bad Gateway`.

5. Parse upstream response.
- Case A: full JSON response.
  - If it matches watcher JSON contract, use `data.reply_text`, `data.reply_wav_base64`, `data.stt_result`.
  - Else fallback to generic text extraction.
- Case B: boundary binary response.
  - Split as `json + boundary + audio`.

6. Normalize audio and text.
- If audio bytes are not WAV, wrap PCM to WAV.
- If upstream has no audio, generate 500ms silent WAV fallback.
- If text contains Chinese chars, `screen_text` becomes:
  - `Current text is not supported for display.`

7. Return final device payload.
- `Content-Type: application/octet-stream`
- Body format:
  - JSON
  - `---sensecraftboundary---`
  - WAV binary

### Step 4: Debug artifact output

If enabled, files are written under `debug-responses/`:
- `request_*.bin`
- `upstream_*.bin`
- `response_*.bin`
- `audio_*.wav`

## Hardware Deployment

1. Put device and bridge host on reachable networks.
- Same LAN is easiest.
- If cross-network, open routing/firewall from device to bridge `:8000`.

2. Pick a stable bridge address.
- Use LAN IP (example: `192.168.1.20`) or internal DNS.
- Avoid localhost or temporary hotspot IPs.

3. Configure the device AI endpoint.
- Set private AI service URL to:
  - `http://<bridge-ip>:8000`
- Device path remains `/v2/watcher/talk/audio_stream`.

## Software Usage

```bash
npm install
cp .env.example .env
npm run start
```

Minimal `.env`:

```dotenv
WATCHER_TARGET=http://<openclaw-host>:<gateway-port>
WATCHER_AUTH_TOKEN=<openclaw-watcher-webhookToken-or-bearer>
```

## Bring-Up Verification

1. Verify upstream is reachable from bridge host:

```bash
curl -i http://<openclaw-host>:<gateway-port>/health
```

2. Verify bridge is running (expect `404` on `/` because no root route exists):

```bash
curl -i http://127.0.0.1:8000/
```

3. Smoke test main route:

```bash
curl -sS \
  -X POST "http://127.0.0.1:8000/v2/watcher/talk/audio_stream" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @sample.wav \
  -o response.bin
```

4. Point device to bridge and run voice interaction.

## What Success Looks Like

- Device sends audio continuously without protocol changes.
- Bridge logs request and upstream status for each turn.
- Device gets both `screen_text` and playable voice response.
- User-visible loop is: speak -> short wait -> text and audio reply.

## Environment Variables

Required in practice:
- `WATCHER_TARGET`
- `WATCHER_AUTH_TOKEN`

Optional:
- `WATCHER_INBOUND_AUTH_TOKEN`
- `WATCHER_SENDER`
- `WATCHER_UPSTREAM_TIMEOUT_MS`
- `WATCHER_MAX_REQUEST_BYTES`
- `WATCHER_STANDARD_TEXT`
- `WATCHER_DEBUG_DIR`
- `WATCHER_SAVE_REQ`
- `WATCHER_SAVE_UPSTREAM`
- `WATCHER_SAVE_RESP`
- `WATCHER_SAVE_AUDIO`
- `WATCHER_ENV_FILE`

## Common Failure Modes

- `401 Unauthorized`:
  - inbound token mismatch
- `400 Bad Request`:
  - request body too large or aborted while reading
- `502 Bad Gateway`:
  - upstream unreachable/timeout/error
- text visible but no sound:
  - inspect `audio_*.wav` and upstream audio payload format
