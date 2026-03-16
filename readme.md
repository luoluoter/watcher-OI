# Give OpenClaw Ears and a Voice

This project is a voice bridge:

- Watcher captures and plays audio
- Voice requests are routed to OpenClaw
- OpenClaw replies are repackaged into Watcher-ready binary output

In plain words: this is a voice entry point for OpenClaw.  
It gives your lobster ears and a voice first.  
Eyes can come next, because Watcher already has a camera.

## Minimum Runnable Path

`Watcher -> watcher-OI -> OpenClaw(watcher) -> watcher-OI -> Watcher`

## What It Feels Like When Working

1. You speak to Watcher
2. Watcher uploads audio to the bridge
3. OpenClaw generates a reply
4. Watcher plays speech and shows text

End-to-end loop: `speak -> understand -> reply -> play`.

## Hardware First (Watcher)

Official getting started:

- https://wiki.seeedstudio.com/getting_started_with_watcher/

You need:

1. Watcher is online
2. Watcher can reach bridge host (for example `http://192.168.1.20:8000`)
3. SenseCraft Private AI Service URL points to this bridge

Pitfalls:

- Point Private AI URL to `watcher-OI`, not directly to OpenClaw
- Use stable LAN IP/DNS instead of temporary hotspot addresses

## Software Setup (OpenClaw + watcher-OI)

### A. OpenClaw side

Watcher support in OpenClaw is currently a development-stage integration.
It has already been validated end to end with this bridge, but it is not yet
published as an official installable plugin release.

This setup does not use stock OpenClaw. It relies on a modified OpenClaw
branch with Watcher-related changes:

- https://github.com/luoluoter/openclaw/tree/chore/watcher-snapshot-20260306

Enable watcher channel:

```yaml
channels:
  watcher:
    enabled: true
    webhookPath: /v2/watcher/talk/audio_stream
    webhookToken: <shared-token>
    bigmodelApiKey: <your-bigmodel-key>
```

Pass criteria:

- OpenClaw logs show watcher webhook route registered

### B. watcher-OI side

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

Pass criteria:

- Startup log includes `Server running on port 8000`

If Watcher can already reach this bridge host directly, you can stop here.
`frpc` is only needed for public tunneling, port forwarding, or other relay
network setups.

Pitfall:

- `WATCHER_AUTH_TOKEN` must match OpenClaw `webhookToken`

## 5-Min Bring-Up Checklist

1. Bridge process is alive (`404` on `/` is expected):

```bash
curl -i http://127.0.0.1:8000/
```

Pass criteria:

- Not a connection error (404 is acceptable)

2. Bridge host can reach OpenClaw:

```bash
curl -i http://<openclaw-host>:<gateway-port>/health
```

Pass criteria:

- 200 (or your environment's health status code)

3. Send one real voice request from Watcher

Pass criteria:

- Bridge logs show `upstream status=...`
- Device receives voice playback and visible text

## Success Log Example

```text
[k9a2nd] -> POST /v2/watcher/talk/audio_stream
[k9a2nd] -> upstream http://openclaw:3000/v2/watcher/talk/audio_stream
[k9a2nd] upstream status=200 bytes=48236
[k9a2nd] <- 200 POST /v2/watcher/talk/audio_stream duration=1520ms
```

## Why This Bridge Exists

OpenClaw watcher returns JSON (text + base64 audio).  
Watcher devices prefer packed binary payloads (JSON + boundary + WAV).  
This project translates between both sides so integration is simpler.

## Compatibility Scope (This README)

This README targets OpenClaw `extensions/watcher` responses with:

- `data.reply_text`
- `data.reply_wav_base64`
- optional `data.stt_result`

## What You Have Now, What Comes Next

- Now: ears + voice
- Next: eyes (camera understanding flow)

## Quick Troubleshooting

- `401`: shared token mismatch
- `502`: bridge cannot reach OpenClaw
- text but no audio: check OpenClaw TTS config and bridge logs
