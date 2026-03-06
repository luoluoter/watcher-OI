# OpenClaw Watcher Bridge

`watcher-OI` 现在是一个单一职责的桥接服务：

- 接收设备请求：`POST /v2/watcher/talk/audio_stream`
- 将原始音频透传到上游 Watcher API
- 按设备协议回包：`JSON + boundary + WAV`

仓库已移除历史 STT/OI/Ollama/Python 本地链路。

## 接口约定

- 设备请求：`POST /v2/watcher/talk/audio_stream`
- 请求体：原始音频字节流（设备侧调用方式不变）
- 设备响应：`application/octet-stream`
  - 第一段：JSON
  - 第二段：WAV（二进制），使用 `---sensecraftboundary---` 分隔

## 快速开始

1. 安装依赖。

```bash
npm install
```

2. 创建环境变量文件。

```bash
cp .env.example .env
```

3. 启动服务。

```bash
npm run start
```

默认监听端口为 `8000`。

## 环境变量

桥接运行的核心配置：

- `WATCHER_TARGET`：上游服务地址，例如 `http://172.22.1.82:18789`
- `WATCHER_AUTH_TOKEN`：桥接请求上游时使用的鉴权 token

可选配置：

- `WATCHER_INBOUND_AUTH_TOKEN`：设备请求桥接时的入站鉴权 token
- `WATCHER_SENDER`：`sender` 缺省值（默认 `test-device`）
- `WATCHER_UPSTREAM_TIMEOUT_MS`：上游超时毫秒（默认 `60000`）
- `WATCHER_MAX_REQUEST_BYTES`：请求体大小上限（默认 `20971520`）
- `WATCHER_DEBUG_DIR`：调试文件目录（默认 `debug-responses`）
- `WATCHER_SAVE_REQ`：是否保存请求包（`1/0`）
- `WATCHER_SAVE_UPSTREAM`：是否保存上游原始响应（`1/0`）
- `WATCHER_SAVE_RESP`：是否保存最终回包（`1/0`）
- `WATCHER_SAVE_AUDIO`：是否保存最终音频 wav（`1/0`）
- `WATCHER_ENV_FILE`：指定非默认 `.env` 文件路径

## 鉴权说明

入站鉴权：

- `WATCHER_INBOUND_AUTH_TOKEN` 为空时，关闭入站鉴权。
- 配置后，设备请求头 `Authorization` 必须匹配。
- 不匹配直接返回 `401`。

上游鉴权：

- 桥接调用上游时，始终使用 `WATCHER_AUTH_TOKEN` 作为 `Authorization`（支持纯 token 或 `Bearer ...`）。

## 上游对接

当前桥接支持两种上游返回：

- 新版 JSON 合约（`data.reply_text`、`data.reply_wav_base64`）
- 旧版 boundary 二进制合约

桥接会统一转换为设备需要的 `JSON + boundary + WAV`。

## 调试文件

开启调试保存后，会在 `debug-responses/` 生成：

- `request_*.bin`
- `upstream_*.bin`
- `response_*.bin`
- `audio_*.wav`

这些调试产物已在 git 忽略列表中。

## 已移除 Legacy

以下旧链路文件已明确移除：

- `common.js`
- `common.py`
- `proxy.py`
- `requirements.txt`

本仓库不再保留旧方案的兼容启动方式。
