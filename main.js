'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

function loadEnvFile(filePath) {
  if (!filePath) return;
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return;

  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (!key) continue;

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    console.log(`Loaded env from ${resolved}`);
  } catch (err) {
    console.error(`Failed to load env file ${resolved}:`, err.message);
  }
}

loadEnvFile(process.env.WATCHER_ENV_FILE || '.env');

const app = express();
const port = Number(process.env.WATCHER_PORT || process.env.PORT || 8000);

const TARGET_BASE =
  process.env.WATCHER_TARGET || 'http://172.22.1.82:18789';
const DEFAULT_SENDER = process.env.WATCHER_SENDER || 'test-device';
const AUTH_TOKEN =
  process.env.WATCHER_AUTH_TOKEN ||
  'da8656a4889fdd3977dcd5edf0aa305c739035890733548972b78521b3630440';
const INBOUND_AUTH_TOKEN = process.env.WATCHER_INBOUND_AUTH_TOKEN || '';
const UPSTREAM_TIMEOUT_MS = Number(process.env.WATCHER_UPSTREAM_TIMEOUT_MS || 60000);
const MAX_REQUEST_BYTES = Number(process.env.WATCHER_MAX_REQUEST_BYTES || 20 * 1024 * 1024);

const SAVE_RESPONSES_ENABLED = (() => {
  const raw = (process.env.WATCHER_SAVE_RESP || '1').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();
const SAVE_REQUESTS_ENABLED = (() => {
  const raw = (process.env.WATCHER_SAVE_REQ || '1').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();
const SAVE_AUDIO_ENABLED = (() => {
  const raw = (process.env.WATCHER_SAVE_AUDIO || '1').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();
const SAVE_UPSTREAM_ENABLED = (() => {
  const raw = (process.env.WATCHER_SAVE_UPSTREAM || '1').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();

const STANDARD_SCREEN_TEXT = process.env.WATCHER_STANDARD_TEXT || 'hello world';
const DEBUG_DIR = process.env.WATCHER_DEBUG_DIR || 'debug-responses';
const BOUNDARY = Buffer.from('\n---sensecraftboundary---\n', 'utf8');
const WAV_HEADER_BYTES = 44;
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_BITS_PER_SAMPLE = 16;

function ensureDebugDir(enabled) {
  if (!enabled) return null;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    return DEBUG_DIR;
  } catch (err) {
    console.error('Failed to create debug directory:', err.message);
    return null;
  }
}

function redactAuthHeader(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('bearer ')) {
    const token = trimmed.slice(7).trim();
    if (!token) return 'Bearer <redacted>';
    return `Bearer ${token.slice(0, 6)}...${token.slice(-4)}`;
  }
  return '<redacted>';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function normalizeAuthHeader(token) {
  if (!token) return '';
  const trimmed = String(token).trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().startsWith('bearer ')
    ? trimmed
    : `Bearer ${trimmed}`;
}

function buildTargetUrl(req) {
  const targetUrl = new URL(req.originalUrl, TARGET_BASE);
  if (!targetUrl.searchParams.get('sender')) {
    targetUrl.searchParams.set('sender', DEFAULT_SENDER);
  }
  return targetUrl.toString();
}

function wrapPcmToWav(
  pcmBuffer,
  sampleRate = DEFAULT_SAMPLE_RATE,
  numChannels = DEFAULT_CHANNELS,
  bitsPerSample = DEFAULT_BITS_PER_SAMPLE
) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function isWavBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  );
}

function parseWavDurationMs(wavBuffer) {
  try {
    if (!isWavBuffer(wavBuffer) || wavBuffer.length < WAV_HEADER_BYTES) {
      return 0;
    }
    const byteRate = wavBuffer.readUInt32LE(28);
    const dataSize = wavBuffer.readUInt32LE(40);
    if (!byteRate || !dataSize) return 0;
    return Math.round((dataSize / byteRate) * 1000);
  } catch (_err) {
    return 0;
  }
}

function splitCombinedResponse(rawBuffer) {
  const idx = rawBuffer.indexOf(BOUNDARY);
  if (idx === -1) {
    return {
      jsonBuffer: rawBuffer,
      audioBuffer: Buffer.alloc(0),
    };
  }
  return {
    jsonBuffer: rawBuffer.slice(0, idx),
    audioBuffer: rawBuffer.slice(idx + BOUNDARY.length),
  };
}

function tryParseJson(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (_err) {
    return null;
  }
}

function extractScreenText(upstreamJson) {
  if (!upstreamJson || typeof upstreamJson !== 'object') return STANDARD_SCREEN_TEXT;
  if (typeof upstreamJson.data?.screen_text === 'string' && upstreamJson.data.screen_text.trim()) {
    return upstreamJson.data.screen_text;
  }
  if (typeof upstreamJson.response === 'string' && upstreamJson.response.trim()) {
    return upstreamJson.response;
  }
  if (typeof upstreamJson.text === 'string' && upstreamJson.text.trim()) {
    return upstreamJson.text;
  }
  return STANDARD_SCREEN_TEXT;
}

function extractSttResult(upstreamJson) {
  if (!upstreamJson || typeof upstreamJson !== 'object') return '';
  if (typeof upstreamJson.data?.stt_result === 'string') {
    return upstreamJson.data.stt_result;
  }
  return '';
}

function containsChinese(text) {
  return typeof text === 'string' && /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(text);
}

function normalizeScreenTextForDevice(text) {
  if (containsChinese(text)) {
    return 'Current text is not supported for display.';
  }
  if (typeof text === 'string' && text.trim()) {
    return text;
  }
  return STANDARD_SCREEN_TEXT;
}

function decodeBase64Buffer(base64Value) {
  if (typeof base64Value !== 'string') return Buffer.alloc(0);
  const trimmed = base64Value.trim();
  if (!trimmed) return Buffer.alloc(0);
  const payload = trimmed.includes(',') ? trimmed.split(',').pop() : trimmed;
  try {
    return Buffer.from(payload, 'base64');
  } catch (_err) {
    return Buffer.alloc(0);
  }
}

function parseWatcherJsonContract(upstreamJson) {
  if (!upstreamJson || typeof upstreamJson !== 'object') return null;
  const data = upstreamJson.data;
  if (!data || typeof data !== 'object') return null;
  const looksLikeWatcherContract =
    Object.prototype.hasOwnProperty.call(data, 'reply_text') ||
    Object.prototype.hasOwnProperty.call(data, 'reply_wav_base64') ||
    Object.prototype.hasOwnProperty.call(data, 'stt_result');
  if (!looksLikeWatcherContract) return null;

  const replyText =
    typeof data.reply_text === 'string' && data.reply_text.trim()
      ? data.reply_text
      : STANDARD_SCREEN_TEXT;
  const sttResult =
    typeof data.stt_result === 'string' ? data.stt_result : '';
  const wavBuffer =
    typeof data.reply_wav_base64 === 'string' && data.reply_wav_base64.trim()
      ? decodeBase64Buffer(data.reply_wav_base64)
      : Buffer.alloc(0);

  return {
    screenText: replyText,
    sttResult,
    audioBuffer: wavBuffer,
  };
}

function collectRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body too large: ${total} > ${maxBytes}`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks, total)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Request aborted by client')));
  });
}

function saveFileIfNeeded(enabled, filePath, content, requestId, label) {
  if (!enabled || !filePath) return;
  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.error(`[${requestId}] ${label} save error:`, err.message);
    } else {
      console.log(`[${requestId}] ${label} saved to ${filePath}`);
    }
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).slice(2, 10);
  req.requestId = requestId;
  const authPreview = redactAuthHeader(req.headers.authorization);
  const contentLength = req.headers['content-length']
    ? Number(req.headers['content-length'])
    : undefined;

  console.log(
    `[${requestId}] -> ${req.method} ${req.originalUrl} from ${
      req.ip
    } content-type=${req.headers['content-type'] || 'unknown'} content-length=${
      contentLength ?? 'unknown'
    } auth=${authPreview || 'none'}`
  );
  console.log(`[${requestId}] request-authorization-raw=${req.headers.authorization || ''}`);
  console.log(`[${requestId}] request-headers=${JSON.stringify(req.headers)}`);
  console.log(
    `[${requestId}] request-meta ip=${req.ip} remote=${req.socket?.remoteAddress || ''} ` +
      `port=${req.socket?.remotePort || ''} http=${req.httpVersion} ` +
      `transfer-encoding=${req.headers['transfer-encoding'] || ''}`
  );

  req.on('error', (err) => {
    console.error(`[${requestId}] req error:`, err.message);
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const sentLength = res.getHeader('content-length');
    const sentBytes =
      typeof sentLength === 'string' ? Number(sentLength) : sentLength;
    console.log(
      `[${requestId}] <- ${res.statusCode} ${req.method} ${
        req.originalUrl
      } duration=${duration}ms response-bytes=${formatBytes(sentBytes)}`
    );
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      const duration = Date.now() - start;
      console.warn(
        `[${requestId}] !! connection closed early after ${duration}ms`
      );
    }
  });

  next();
});

app.post('/v2/watcher/talk/audio_stream', async (req, res) => {
  const requestId = req.requestId || 'unknown';
  const expectedInboundAuth = normalizeAuthHeader(INBOUND_AUTH_TOKEN);
  const incomingInboundAuth = normalizeAuthHeader(req.headers.authorization || '');
  if (expectedInboundAuth && incomingInboundAuth !== expectedInboundAuth) {
    console.warn(
      `[${requestId}] inbound auth mismatch expected=${redactAuthHeader(expectedInboundAuth)} actual=${redactAuthHeader(incomingInboundAuth)}`
    );
    res.status(401).json({ code: 401, msg: 'Unauthorized', data: {} });
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugDir = ensureDebugDir(
    SAVE_REQUESTS_ENABLED || SAVE_RESPONSES_ENABLED || SAVE_AUDIO_ENABLED || SAVE_UPSTREAM_ENABLED
  );

  let requestBuffer;
  try {
    requestBuffer = await collectRequestBody(req, MAX_REQUEST_BYTES);
  } catch (err) {
    console.error(`[${requestId}] read request error:`, err.message);
    res.status(400).send('Bad Request');
    return;
  }

  if (debugDir) {
    const requestPath = path.join(debugDir, `request_${timestamp}_${requestId}.bin`);
    saveFileIfNeeded(SAVE_REQUESTS_ENABLED, requestPath, requestBuffer, requestId, 'request');
  }
  console.log(
    `[${requestId}] request-bytes=${requestBuffer.length} first64=${requestBuffer
      .slice(0, 64)
      .toString('hex')}`
  );

  const upstreamUrl = buildTargetUrl(req);
  const headers = {
    'Content-Type': req.headers['content-type'] || 'application/octet-stream',
    'Content-Length': String(requestBuffer.length),
  };
  const forcedAuth = normalizeAuthHeader(AUTH_TOKEN);
  if (forcedAuth) {
    headers.Authorization = forcedAuth;
  }

  console.log(`[${requestId}] -> upstream ${upstreamUrl}`);
  console.log(`[${requestId}] upstream-authorization=${headers.Authorization || ''}`);

  let upstreamRaw;
  try {
    const upstreamResponse = await axios({
      method: 'post',
      url: upstreamUrl,
      data: requestBuffer,
      headers,
      timeout: UPSTREAM_TIMEOUT_MS,
      responseType: 'arraybuffer',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });

    upstreamRaw = Buffer.from(upstreamResponse.data || []);
    console.log(
      `[${requestId}] upstream status=${upstreamResponse.status} bytes=${upstreamRaw.length}`
    );
  } catch (err) {
    console.error(`[${requestId}] upstream call error:`, err.message);
    res.status(502).send('Bad Gateway');
    return;
  }

  if (debugDir) {
    const upstreamPath = path.join(debugDir, `upstream_${timestamp}_${requestId}.bin`);
    saveFileIfNeeded(SAVE_UPSTREAM_ENABLED, upstreamPath, upstreamRaw, requestId, 'upstream');
  }

  const upstreamWholeJson = tryParseJson(upstreamRaw);
  let screenText = STANDARD_SCREEN_TEXT;
  let sttResult = '';
  let upstreamAudioBuffer = Buffer.alloc(0);

  if (upstreamWholeJson) {
    const parsedWatcherContract = parseWatcherJsonContract(upstreamWholeJson);
    if (parsedWatcherContract) {
      screenText = parsedWatcherContract.screenText;
      sttResult = parsedWatcherContract.sttResult;
      upstreamAudioBuffer = parsedWatcherContract.audioBuffer;
      console.log(
        `[${requestId}] parsed upstream as watcher-json contract, wav-bytes=${upstreamAudioBuffer.length}`
      );
    } else {
      screenText = extractScreenText(upstreamWholeJson);
      sttResult = extractSttResult(upstreamWholeJson);
      upstreamAudioBuffer = Buffer.alloc(0);
      console.log(
        `[${requestId}] parsed upstream as plain-json contract`
      );
    }
  } else {
    const split = splitCombinedResponse(upstreamRaw);
    const upstreamJson = tryParseJson(split.jsonBuffer);
    screenText = extractScreenText(upstreamJson);
    sttResult = extractSttResult(upstreamJson);
    upstreamAudioBuffer = split.audioBuffer;
    console.log(
      `[${requestId}] parsed upstream as boundary-binary contract, audio-bytes=${upstreamAudioBuffer.length}`
    );
  }

  let wavPayload;
  if (upstreamAudioBuffer.length > 0 && isWavBuffer(upstreamAudioBuffer)) {
    wavPayload = upstreamAudioBuffer;
  } else if (upstreamAudioBuffer.length > 0) {
    wavPayload = wrapPcmToWav(upstreamAudioBuffer);
  } else {
    // 兜底：无音频时返回 500ms 静音 WAV，避免设备解析异常
    const silence = Buffer.alloc(
      (DEFAULT_SAMPLE_RATE * DEFAULT_CHANNELS * DEFAULT_BITS_PER_SAMPLE / 8) / 2
    );
    wavPayload = wrapPcmToWav(silence);
  }

  const durationMs = parseWavDurationMs(wavPayload) || 500;

  const finalJson = {
    code: 200,
    msg: '',
    data: {
      mode: 0,
      duration: durationMs,
      screen_text: normalizeScreenTextForDevice(screenText),
      stt_result: sttResult,
      task_summary: {},
    },
  };

  const finalBuffer = Buffer.concat([
    Buffer.from(JSON.stringify(finalJson), 'utf8'),
    BOUNDARY,
    wavPayload,
  ]);

  if (debugDir) {
    const responsePath = path.join(debugDir, `response_${timestamp}_${requestId}.bin`);
    saveFileIfNeeded(SAVE_RESPONSES_ENABLED, responsePath, finalBuffer, requestId, 'response');
    const audioPath = path.join(debugDir, `audio_${timestamp}_${requestId}.wav`);
    saveFileIfNeeded(SAVE_AUDIO_ENABLED, audioPath, wavPayload, requestId, 'audio');
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', finalBuffer.length);
  res.end(finalBuffer);
});

app.listen(port, () => {
  const inboundEnabled = Boolean(normalizeAuthHeader(INBOUND_AUTH_TOKEN));
  console.log(`Server running on port ${port}`);
  console.log(
    `Inbound auth ${inboundEnabled ? 'enabled' : 'disabled'} (WATCHER_INBOUND_AUTH_TOKEN)`
  );
});
