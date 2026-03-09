# 给 OpenClaw 的龙虾装上耳朵和嘴巴

这个项目是一个语音桥接入口：

- 用 Watcher 收音和播报
- 把语音请求送进 OpenClaw
- 把 OpenClaw 返回的结果转成 Watcher 能直接播放的格式

一句话：先让龙虾“听得见、说得出”。  
“看得见”这件事可以下一步做，因为 Watcher 本身有摄像头。

## 最小可运行路径

`Watcher -> watcher-OI -> OpenClaw(watcher) -> watcher-OI -> Watcher`

## 打通后是什么体验

1. 你对 Watcher 说话
2. Watcher 上传音频到桥接服务
3. OpenClaw 生成回复
4. Watcher 播放语音并显示文本

完整闭环：`说话 -> 理解 -> 回答 -> 播放`

## 硬件准备（Watcher）

官方入门文档：

- https://wiki.seeedstudio.com/getting_started_with_watcher/

你需要确认：

1. Watcher 已联网
2. Watcher 能访问桥接地址（例如 `http://192.168.1.20:8000`）
3. SenseCraft 私有 AI 地址配置为桥接地址

避坑：

- 私有 AI 地址应填 `watcher-OI` 地址，不是 OpenClaw 地址
- 桥接地址尽量用固定内网 IP，不用临时热点 IP

## 软件准备（OpenClaw + watcher-OI）

### A. OpenClaw 侧

OpenClaw 对 Watcher 的支持目前仍处于开发阶段。
这条链路已经和当前桥接服务完成端到端跑通验证，但暂时还没有作为正式可安装插件发布。

当前请先使用这个可工作的 OpenClaw 分支：

- https://github.com/luoluoter/openclaw/tree/chore/watcher-snapshot-20260306

确保 watcher 通道启用：

```yaml
channels:
  watcher:
    enabled: true
    webhookPath: /v2/watcher/talk/audio_stream
    webhookToken: <shared-token>
    bigmodelApiKey: <your-bigmodel-key>
```

通过标准：

- OpenClaw 启动日志里能看到 watcher webhook 已注册

### B. watcher-OI 侧

```bash
npm install
cp .env.example .env
```

最小 `.env`：

```dotenv
WATCHER_TARGET=http://<openclaw-host>:<gateway-port>
WATCHER_AUTH_TOKEN=<shared-token>
```

启动：

```bash
npm run start
```

通过标准：

- 启动日志出现 `Server running on port 8000`

避坑：

- `WATCHER_AUTH_TOKEN` 要和 OpenClaw 的 `webhookToken` 一致

## 5 分钟打通检查

1. 检查桥接进程存活（`/` 返回 404 也算正常）：

```bash
curl -i http://127.0.0.1:8000/
```

通过标准：

- 返回状态不是连接失败（404 可以）

2. 检查桥接到 OpenClaw 连通性：

```bash
curl -i http://<openclaw-host>:<gateway-port>/health
```

通过标准：

- 返回 200（或你环境里的健康状态码）

3. 用 Watcher 发一条真实语音

通过标准：

- 桥接日志里能看到 `upstream status=...`
- 设备端听到语音回复，并看到文字

## 日志样例（成功）

```text
[k9a2nd] -> POST /v2/watcher/talk/audio_stream
[k9a2nd] -> upstream http://openclaw:3000/v2/watcher/talk/audio_stream
[k9a2nd] upstream status=200 bytes=48236
[k9a2nd] <- 200 POST /v2/watcher/talk/audio_stream duration=1520ms
```

## 为什么需要这层桥接

OpenClaw watcher 返回 JSON（文本 + base64 音频），  
Watcher 设备更适合消费二进制拼包（JSON + boundary + WAV）。  
这个项目把两边协议对齐，减少改造成本。

## 兼容范围（当前文档）

当前 README 适配的上游契约是 OpenClaw `extensions/watcher` 返回：

- `data.reply_text`
- `data.reply_wav_base64`
- `data.stt_result`（可选）

## 现在有了什么，后面做什么

- 现在：耳朵 + 嘴巴（语音入口）
- 后续：眼睛（摄像头视觉链路）

## 常见问题

- `401`：共享 token 不一致
- `502`：桥接访问不到 OpenClaw
- 有字没声：优先检查 OpenClaw TTS 配置和桥接日志
