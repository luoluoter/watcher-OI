# OpenClaw Watcher Bridge

`watcher-OI` is now a single-purpose bridge service:

- Receives device audio at `POST /v2/watcher/talk/audio_stream`
- Forwards raw audio to upstream Watcher API
- Repackages upstream result to device format: `JSON + boundary + WAV`

Legacy STT/OI/Ollama/Python local pipeline has been removed from this repository.

## API Contract

- Device request: `POST /v2/watcher/talk/audio_stream`
- Request body: raw audio bytes (existing device behavior unchanged)
- Device response: `application/octet-stream`
  - Part 1: JSON payload
  - Part 2: WAV bytes separated by `---sensecraftboundary---`

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Create env file.

```bash
cp .env.example .env
```

3. Start service.

```bash
npm run start
```

Default listen port is `8000`.

## Environment Variables

Required for normal bridge use:

- `WATCHER_TARGET`: upstream base URL, for example `http://172.22.1.82:18789`
- `WATCHER_AUTH_TOKEN`: auth token used when this bridge calls upstream

Optional:

- `WATCHER_INBOUND_AUTH_TOKEN`: inbound auth token for device requests
- `WATCHER_SENDER`: fallback `sender` query value (default `test-device`)
- `WATCHER_UPSTREAM_TIMEOUT_MS`: upstream timeout in ms (default `60000`)
- `WATCHER_MAX_REQUEST_BYTES`: max inbound body size (default `20971520`)
- `WATCHER_DEBUG_DIR`: debug output directory (default `debug-responses`)
- `WATCHER_SAVE_REQ`: save inbound request binary (`1/0`)
- `WATCHER_SAVE_UPSTREAM`: save upstream raw response (`1/0`)
- `WATCHER_SAVE_RESP`: save final device response (`1/0`)
- `WATCHER_SAVE_AUDIO`: save extracted/final wav (`1/0`)
- `WATCHER_ENV_FILE`: load a non-default env file path

## Authorization

Inbound auth:

- If `WATCHER_INBOUND_AUTH_TOKEN` is empty, inbound auth is disabled.
- If configured, request header `Authorization` must match it.
- Mismatch returns `401`.

Upstream auth:

- Bridge always forwards `Authorization` using `WATCHER_AUTH_TOKEN` (supports raw token or `Bearer ...`).

## Upstream Integration

Current upstream contract expected by bridge:

- Request stays as raw audio bytes.
- Upstream can return either:
  - New JSON contract (`data.reply_text`, `data.reply_wav_base64`), or
  - Existing boundary binary format.
- Bridge normalizes both into device-required `JSON + boundary + WAV`.

## Debug Outputs

When enabled, files are written under `debug-responses/`:

- `request_*.bin`
- `upstream_*.bin`
- `response_*.bin`
- `audio_*.wav`

These files are ignored by git.

## Removed Legacy

The following legacy files and runtime path were removed intentionally:

- `common.js`
- `common.py`
- `proxy.py`
- `requirements.txt`

This repository no longer provides backward-compatible legacy startup steps.
