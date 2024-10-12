'use strict';

const fs = require('fs');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const app = express();
const port = 8000;

// docker run -d --gpus all -p 9000:9000 -e ASR_MODEL=base -e ASR_ENGINE=openai_whisper onerahmet/openai-whisper-asr-webservice:latest-gpu
const STT_HOST = 'http://172.22.1.82:9000'; // https://github.com/ahmetoner/whisper-asr-webservice

// https://docs.openinterpreter.com/getting-started/setup
const OI_HOST = 'http://127.0.0.1:9888'; // Open Interpreter Proxy

// 保存音频流到文件
function saveAudioStream(req, res, next) {
  const audioFileStream = fs.createWriteStream('audio_stream_1.wav');
  req.pipe(audioFileStream);
  audioFileStream.on('finish', () => {
    audioFileStream.close(() => {
      console.log('Audio stream has been saved to audio_stream_1.wav');
      next();
    });
  });
}

// 模拟创建WAV头部信息
function createWavHeader(data) {
  if (!data) {
    console.error('Error: No audio data to create WAV header');
    return null;
  }
  const dataSize = data.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, data]);
}

// 模拟HTTP请求到ASR API
async function missionApiCall(data) {
  try {
    // 使用 fetch API 发送 POST 请求
    const response = await axios.post(
      `${OI_HOST}/talk`,
      { data },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    // 解析响应体为 JSON
    const result = await response.data;
    return result.response; // 假设响应体中有一个 "response" 字段
  } catch (error) {
    console.error('There was a problem with your fetch operation:', error.message);
    return error.message
  }
}

// 模拟HTTP请求到ASR API
async function asrApiCall(audioData, language) {
  const formData = new FormData();
  formData.append('audio_file', audioData, {
    filename: 'temp.wav',
    contentType: 'audio/wav',
  });

  const response = await axios.post(
    `${STT_HOST}/asr?encode=true&task=translate&language=${language}&word_timestamps=false&output=txt`,
    formData,
    { headers: { ...formData.getHeaders() } }
  );
  return response.data;
}

// 使用示例
app.post('/v2/watcher/talk/audio_stream', (req, res) => {
  saveAudioStream(req, res, async () => {
    const audioData = fs.readFileSync('audio_stream_1.wav');
    const wavHeader = createWavHeader(audioData);
    if (wavHeader) {
      try {
        const asrResponse = await asrApiCall(wavHeader, 'en');
        console.log(asrResponse);
        const rees = await missionApiCall(asrResponse);
        console.log(rees);
        const jsonResponse = {
          code: 200,
          msg: '',
          data: {
            mode: 0,
            duration: 1000,
            screen_text: rees || asrResponse,
            stt_result: '',
            task_summary: {},
          },
        };
        const audioSignal = generateAudioSignal();
        const boundary = Buffer.from('\n---sensecraftboundary---\n', 'utf8');
        const responseBuffer = Buffer.concat([
          Buffer.from(JSON.stringify(jsonResponse), 'utf8'),
          boundary,
          audioSignal,
        ]);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(responseBuffer);
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
    } else {
      res.status(500).send('Failed to create WAV header');
    }
  });
});

// 模拟生成音频信号
function generateAudioSignal() {
  const sampleRate = 16000;
  const toneDuration = 0.2;
  const silenceDuration = 0.1;
  const frequency = 440;
  const amplitude = 20000;
  const toneSamples = sampleRate * toneDuration;
  const silenceSamples = sampleRate * silenceDuration;
  const totalDuration = 30;
  const numTones = Math.floor(totalDuration / (toneDuration + silenceDuration));
  const numSamples = numTones * (toneSamples + silenceSamples) - silenceSamples;
  const buffer = Buffer.alloc(numSamples * 2);

  function hanningWindow(index, totalSamples) {
    return 0.5 * (1 - Math.cos((2 * Math.PI * index) / (totalSamples - 1)));
  }

  for (let t = 0; t < numTones; t++) {
    for (let i = 0; i < toneSamples; i++) {
      const sampleIndex = t * (toneSamples + silenceSamples) + i;
      const window = hanningWindow(i, toneSamples);
      const sample =
        amplitude *
        window *
        Math.sin(2 * Math.PI * frequency * (i / sampleRate));
      buffer.writeInt16LE(sample, sampleIndex * 2);
    }
  }
  return buffer;
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
