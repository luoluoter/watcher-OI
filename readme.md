# Give OpenClaw Ears and a Voice

This project is a practical bridge:

- Use Seeed Watcher as the speaking/listening device
- Route voice requests into OpenClaw
- Repackage OpenClaw replies into the binary format Watcher expects

In plain words: this is a voice entry point for OpenClaw.  
It gives your OpenClaw lobster ears and a voice first.  
Eyes can come next, since Watcher already has a camera.

## What It Feels Like When Working

1. You speak to Watcher
2. Watcher uploads audio to this bridge
3. The bridge forwards to OpenClaw watcher channel
4. OpenClaw returns reply text + speech audio
5. Watcher plays audio and shows text

End-to-end loop: `speak -> understand -> reply -> play`.

## System Layout

```text
Watcher Device
  -> watcher-OI (this bridge)
  -> OpenClaw (extensions/watcher)
  -> watcher-OI
  -> Watcher playback
```

## Hardware First (Watcher)

Official getting started:

- https://wiki.seeedstudio.com/getting_started_with_watcher/

You mainly need:

1. Watcher is online
2. Watcher can reach bridge host (example: `http://192.168.1.20:8000`)
3. SenseCraft Private AI Service URL points to this bridge

## Software Setup

## A. OpenClaw side (upstream)

Make sure watcher channel is enabled:

```yaml
channels:
  watcher:
    enabled: true
    webhookPath: /v2/watcher/talk/audio_stream
    webhookToken: <shared-token>
    bigmodelApiKey: <your-bigmodel-key>
```

## B. watcher-OI side (this repo)

```bash
npm install
cp .env.example .env
```

Minimum `.env`:

```dotenv
WATCHER_TARGET=http://<openclaw-host>:<gateway-port>
WATCHER_AUTH_TOKEN=<shared-token>
```

Start:

```bash
npm run start
```

Default port: `8000`.

## 5-Min Bring-Up Checklist

1. Bridge is alive (`404` on `/` is expected):

```bash
curl -i http://127.0.0.1:8000/
```

2. Bridge host can reach OpenClaw:

```bash
curl -i http://<openclaw-host>:<gateway-port>/health
```

3. Send one real voice request from Watcher and check bridge logs.

## Why This Bridge Exists

OpenClaw watcher returns clean JSON (text + base64 audio).  
Watcher devices expect a binary packed response (JSON + boundary + WAV).  
This project translates between the two so you can ship faster with fewer changes.

## What You Have Now, and What Comes Next

- Now: ears + voice
- Next: eyes (camera understanding path)

Watcher already has camera hardware, so visual extensions are a natural next phase.

## Quick Troubleshooting

- `401`: token mismatch between bridge and OpenClaw watcher token
- `502`: bridge cannot reach OpenClaw
- text but no audio: check TTS settings and bridge logs

