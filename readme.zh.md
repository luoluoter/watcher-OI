# OpenClaw Watcher Bridge

这个仓库现在只做一件事：

- 接设备音频：`POST /v2/watcher/talk/audio_stream`
- 把原始音频转发给上游 Watcher 服务
- 回设备标准包：`JSON + ---sensecraftboundary--- + WAV`

旧的本地 STT/Ollama/Python 链路已经移除。

## 拓扑

```text
Watcher 设备
  -> http://<bridge-ip>:8000/v2/watcher/talk/audio_stream
桥接服务（本仓库）
  -> http://<openclaw-host>:<gateway-port>/v2/watcher/talk/audio_stream
OpenClaw（extensions/watcher 通道）
  -> 返回文本 + 语音
桥接服务
  -> 转成设备可消费的二进制回包
```

## OpenClaw 对接（本项目的真实上游）

这个桥接项目就是给 OpenClaw 的 `extensions/watcher` 做前置协议转换：

- OpenClaw 接收同一路径：
  - `/v2/watcher/talk/audio_stream`
- OpenClaw watcher 返回 JSON 合约：
  - `data.reply_text`
  - `data.reply_wav_base64`
- 本桥接把这份 JSON 再封装成设备需要的二进制格式。

### 配置映射

1. 先配 OpenClaw 的 watcher 通道：

```yaml
channels:
  watcher:
    enabled: true
    webhookPath: /v2/watcher/talk/audio_stream
    webhookToken: <shared-token>
    bigmodelApiKey: <your-bigmodel-key>
```

2. 再配本桥接项目（`.env`）：

```dotenv
WATCHER_TARGET=http://<openclaw-host>:<gateway-port>
WATCHER_AUTH_TOKEN=<shared-token>
```

说明：
- `WATCHER_AUTH_TOKEN` 会以 `Authorization` 头传给 OpenClaw。
- OpenClaw watcher 支持从 Bearer/query/header 读取 token。
- 如果 OpenClaw 设 `dmPolicy=allowlist`，要把桥接传过去的 `sender` 加进 `channels.watcher.allowFrom`。

## Watcher 官方硬件文档

- Seeed Watcher 快速入门：
  - https://wiki.seeedstudio.com/getting_started_with_watcher/

## 运行流程（与 `main.js` 一致）

### Step 0: 启动与环境加载

- 服务启动时从 `WATCHER_ENV_FILE` 或 `.env` 读取配置。
- 进程环境变量优先级高于文件内同名变量。
- 监听端口固定 `8000`。

### Step 1: 初始化默认参数

- `WATCHER_TARGET` 默认：`http://172.22.1.82:18789`
- `WATCHER_SENDER` 默认：`test-device`
- `WATCHER_AUTH_TOKEN` 在代码里有默认回退值，生产环境建议强制覆盖
- `WATCHER_INBOUND_AUTH_TOKEN` 为空即关闭入站鉴权
- 超时默认 `60000` ms
- 请求体上限默认 `20971520` bytes
- 调试保存开关默认全开（`WATCHER_SAVE_REQ/RESP/AUDIO/UPSTREAM=1`）

### Step 2: 中间件日志

- 每个请求生成随机 `requestId`
- 记录请求头摘要、来源信息、耗时和响应大小
- 客户端提前断开会在 `res.close` 里记录

### Step 3: 处理 `POST /v2/watcher/talk/audio_stream`

1. 校验入站鉴权（如果配置了 token）
- 不匹配返回 `401` JSON

2. 读取原始请求体
- 超过 `WATCHER_MAX_REQUEST_BYTES` 返回 `400 Bad Request`

3. 构造上游 URL
- 保留原始路径和 query
- 如果没有 `sender`，自动补 `sender=<WATCHER_SENDER>`

4. 转发到上游（axios）
- 请求体按原始字节透传
- 上游 `Authorization` 始终用 `WATCHER_AUTH_TOKEN`（自动标准化 Bearer）
- 上游网络异常返回 `502 Bad Gateway`

5. 解析上游返回
- 场景 A：整体可解析为 JSON
  - 若匹配 watcher JSON 合约：读 `data.reply_text`、`data.reply_wav_base64`、`data.stt_result`
  - 否则按通用 JSON 文本兜底提取
- 场景 B：boundary 二进制
  - 拆成 `json + boundary + audio`

6. 标准化文本与音频
- 音频不是 WAV 时，按 PCM 包装为 WAV
- 上游没音频时，生成 500ms 静音 WAV 兜底
- 文本含中文时，`screen_text` 固定为：
  - `Current text is not supported for display.`

7. 组装最终回包
- `Content-Type: application/octet-stream`
- 响应体格式：
  - JSON
  - `---sensecraftboundary---`
  - WAV 二进制

### Step 4: 调试文件输出

开启后会落盘到 `debug-responses/`：
- `request_*.bin`
- `upstream_*.bin`
- `response_*.bin`
- `audio_*.wav`

## 硬件部署

1. 让设备与桥接机器网络互通。
- 同一局域网最省事。
- 跨网段时确保路由与防火墙放通 `8000`。

2. 给桥接机器稳定地址。
- 使用固定内网 IP 或内网 DNS。
- 避免 `localhost`/临时热点地址。

3. 在设备侧配置 AI 服务地址。
- 在 SenseCraft 或设备管理页设置：
  - `http://<bridge-ip>:8000`
- 请求路径保持 `/v2/watcher/talk/audio_stream`。

## 软件使用

```bash
npm install
cp .env.example .env
npm run start
```

最小 `.env`：

```dotenv
WATCHER_TARGET=http://<openclaw-host>:<gateway-port>
WATCHER_AUTH_TOKEN=<openclaw-watcher-webhookToken-or-bearer>
```

## 打通验证

1. 从桥接机验证上游可达：

```bash
curl -i http://<openclaw-host>:<gateway-port>/health
```

2. 验证桥接进程在跑（`/` 返回 `404` 属于当前代码正常行为）：

```bash
curl -i http://127.0.0.1:8000/
```

3. 主路由烟测：

```bash
curl -sS \
  -X POST "http://127.0.0.1:8000/v2/watcher/talk/audio_stream" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @sample.wav \
  -o response.bin
```

4. 把真实设备指向桥接地址，做语音联调。

## 打通后的效果

- 设备无需改协议即可持续发送音频
- 桥接每轮都有请求/上游状态日志
- 设备同时拿到 `screen_text` + 可播放语音
- 用户感知路径：说话 -> 短等待 -> 文本和声音返回

## 环境变量

实践里建议至少配置：
- `WATCHER_TARGET`
- `WATCHER_AUTH_TOKEN`

可选：
- `WATCHER_INBOUND_AUTH_TOKEN`
- `WATCHER_SENDER`
- `WATCHER_UPSTREAM_TIMEOUT_MS`
- `WATCHER_MAX_REQUEST_BYTES`
- `WATCHER_STANDARD_TEXT`
- `WATCHER_DEBUG_DIR`
- `WATCHER_SAVE_REQ`
- `WATCHER_SAVE_UPSTREAM`
- `WATCHER_SAVE_RESP`
- `WATCHER_SAVE_AUDIO`
- `WATCHER_ENV_FILE`

## 常见故障

- 桥接返回 `401`：
  - 入站 token 不匹配
- 桥接返回 `400`：
  - 请求体超限或读取中断
- 桥接返回 `502`：
  - 桥接访问不上游、上游超时或上游进程异常
- 设备有字但没声音：
  - 上游音频为空或格式不对，检查 `audio_*.wav`
- 响应很慢：
  - 网络 RTT 高或上游计算慢，结合请求 id 看链路耗时
