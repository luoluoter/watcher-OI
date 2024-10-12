'use strict';

const fs = require('fs');

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

module.exports = {
  createWavHeader,
  generateAudioSignal,
  saveAudioStream,
};
