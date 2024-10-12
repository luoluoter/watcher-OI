'use strict';

const fs = require('fs');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const app = express();
const port = 8000;
const { OI_HOST, STT_HOST } = require('./common');
const {
  createWavHeader,
  generateAudioSignal,
  saveAudioStream,
} = require('./utils');

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
    console.error(
      'There was a problem with your fetch operation:',
      error.message
    );
    return error.message;
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
