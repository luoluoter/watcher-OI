# 给 OpenClaw 的龙虾装上耳朵和嘴巴

这个项目做的事情很直接：

- 用 Seeed Watcher 当“麦克风 + 播放器”
- 把语音请求送进 OpenClaw
- 再把 OpenClaw 的回复变回 Watcher 能直接播放的格式

一句话：这是一个语音入口桥接器。  
它让你的 OpenClaw（龙虾）先“听得见、说得出”。  
至于“看得见”（摄像头视觉能力），可以在下一步继续加，因为 Watcher 本身有摄像头。

## 你最终会看到什么效果

打通之后，日常体验是：

1. 你对着 Watcher 说话
2. Watcher 把音频发给这个桥接服务
3. 桥接服务转给 OpenClaw（watcher 通道）
4. OpenClaw 生成回复文本 + 语音
5. Watcher 播放声音，同时显示文字

也就是一个完整闭环：`说话 -> 理解 -> 回答 -> 播放`。

## 系统关系（很重要）

```text
Watcher 硬件
  -> watcher-OI（本项目，桥接层）
  -> OpenClaw（extensions/watcher）
  -> watcher-OI
  -> Watcher 播放回复
```

## 先准备硬件（Watcher）

官方快速入门：

- https://wiki.seeedstudio.com/getting_started_with_watcher/

你只需要确保三件事：

1. Watcher 能联网
2. Watcher 能访问桥接服务地址（例如 `http://192.168.1.20:8000`）
3. 在 SenseCraft 里把私有 AI 服务地址指向这个桥接地址

## 再准备软件（OpenClaw + 桥接）

## A. OpenClaw 侧（上游）

确保 OpenClaw 开了 watcher 通道，核心配置类似：

```yaml
channels:
  watcher:
    enabled: true
    webhookPath: /v2/watcher/talk/audio_stream
    webhookToken: <shared-token>
    bigmodelApiKey: <your-bigmodel-key>
```

## B. watcher-OI 侧（本项目）

```bash
npm install
cp .env.example .env
```

最小 `.env`（只改这两个就能跑起来）：

```dotenv
WATCHER_TARGET=http://<openclaw-host>:<gateway-port>
WATCHER_AUTH_TOKEN=<shared-token>
```

然后启动：

```bash
npm run start
```

默认监听端口是 `8000`。

## 5 分钟打通检查

1. 确认桥接服务已启动（访问 `/` 返回 404 也正常，说明进程活着）：

```bash
curl -i http://127.0.0.1:8000/
```

2. 确认桥接机能访问 OpenClaw：

```bash
curl -i http://<openclaw-host>:<gateway-port>/health
```

3. 让 Watcher 发起一次真实语音请求，观察桥接日志是否有请求和上游返回。

## 为什么要加这一层桥接

OpenClaw 的 watcher 通道返回的是清晰的 JSON（文本 + 音频 base64）。  
Watcher 设备侧更适合消费二进制拼包（JSON + boundary + WAV）。  
这个项目就是把两边“协议翻译”接起来，减少你在设备端和 OpenClaw 端的改动成本。

## 现在有了什么，还差什么

- 已有：耳朵（收音）+ 嘴巴（播报）
- 下一步：眼睛（摄像头视觉链路）

Watcher 已经有摄像头硬件基础，所以后续可以在这个入口之上继续扩展视觉能力。

## 常见问题（简版）

- `401`：通常是 token 不一致（桥接和 OpenClaw 的共享 token 没对齐）
- `502`：通常是桥接访问不到 OpenClaw
- 有文字没声音：检查 OpenClaw TTS 配置和桥接日志

