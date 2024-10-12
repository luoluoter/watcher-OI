module.exports = {
  // docker run -d --gpus all -p 9000:9000 -e ASR_MODEL=base -e ASR_ENGINE=openai_whisper onerahmet/openai-whisper-asr-webservice:latest-gpu
  STT_HOST: 'http://127.0.0.1:9000', // https://github.com/ahmetoner/whisper-asr-webservice

  // https://docs.openinterpreter.com/getting-started/setup
  OI_HOST: 'http://127.0.0.1:9888', // Open Interpreter Proxy
};
