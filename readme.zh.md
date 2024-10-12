# Watcher-OI

## 概述

本指南将引导您设置一套服务，使硬件设备Watacher能够解释英语指令并通过Open Interpreter在计算机上执行相应操作。这个过程包括安装Ollama、Docker、第三方开源镜像服务，并启动Node.js和Python脚本。

## 先决条件

在开始之前，请确保您具备以下条件：

1. 能够运行Ollama的兼容硬件设备。
2. 已安装Docker，Python和Node.js的计算机。
3. 了解基本的命令行操作。
4. 拥有一台Watcher。[什么是Watcher](https://www.seeedstudio.com/watcher)（不是广告！！）

## 步骤1：安装Ollama

Ollama是使您的硬件设备处理指令的关键组件。按照以下步骤安装Ollama：

- 从[官方网站](https://ollama.com/download)下载Ollama的最新版本。
- 按照屏幕上的说明安装Ollama。
- 通过在终端运行 `ollama --version`来验证安装。
- 运行指令 ` ollama run llama3.1 `安装本地模型

**问题列表：**

- Ollama软件是否与您的硬件设备兼容？
- 您是否下载了适用于您的操作系统的正确版本？
- 是否安装一个本地模型来提供给后续的流程？
- 运行本地模型时，是否能正常运行？

## 步骤2：安装Docker

Docker将用于容器化第三方开源镜像服务。通过以下步骤安装Docker：

- 访问[Docker官网](https://www.docker.com/products/docker-desktop)。
- 为您的操作系统下载Docker Desktop/Docker Engine。
- 安装Docker并遵循设置说明。
- 启动Docker Desktop并确保其正在运行。

**问题列表：**

- 您的计算机是否满足Docker的系统要求？
- 您是否成功将用户添加到Docker组？
- 是否能正常启动hello world容器？

## 步骤3：安装STT服务

您将需要一个STT语音转文字服务来处理语音。一个受欢迎的选择是[OpenAI Whisper ASR Webservice API](https://github.com/ahmetoner/whisper-asr-webservice)。

使用以下命令安装它：

- `docker run -d --gpus all -p 9000:9000 -e ASR_MODEL=base -e ASR_ENGINE=openai_whisper onerahmet/openai-whisper-asr-webservice:latest-gpu`

**问题列表：**

- 您的电脑是否支持运行这个容器？
- 如果你的电脑没有gpu，版本改用 `latest-cpu`，运行是否会卡顿？

## 步骤4：启动Node.js脚本

Node.js将处理硬件设备与计算机之间的通信。要启动Node.js脚本：

- 确保系统安装了nodejs运行环境。
- 导航到本仓库的目录。
- 终端中执行 `npm install` 安装软件依赖。
- 在终端中运行 `npm run start`。

**问题列表：**

- 您的Node.js是否正确安装？
- 脚本是否缺少运行所需的依赖项？
- 脚本需要占用8000端口，是否有冲突？

## 步骤5：启动Python脚本

Python脚本将处理英语指令并触发计算机上的操作。通过以下方式启动它：

- 确保系统安装了python运行环境。
- 安装[Open Interpreter](https://docs.openinterpreter.com/getting-started/introduction)，用来处理人类发出的语音指令。
- 导航到本仓库的根目录。
- 终端里运行 `pip install -r requirements.txt` 安装环境依赖。
- 在终端中运行 `python proxy.py`。

**问题列表：**

- Python解释器是否已安装并可从您的终端访问？
- 脚本运行是否缺少所需的库？
- 脚本运行日志是否正常打印？
- 脚本需要占用9888，有没有端口冲突？

## 步骤6：配置硬件设备

要使硬件设备Watcher将消息发给上面的一系列服务：

- 确保Watcher有电。
- 手机下载App。应用市场搜索 `SenseCraft`
- 根据APP里的指引，配置设备联网。
- 再配置设备的Watcher AI Service到Private的，值为 `http://内网地址:8000`。

**问题列表：**

- 硬件设备是否正确连接并供电？
- 设备是否有必要的固件以与计算机通信？

## 步骤7：测试设置

一旦一切配置完毕，通过向硬件设备发出英语指令并观察计算机的响应来测试设置。演示如下：

![](./test.mp4)

**问题列表：**

- 硬件设备是否正确解释了指令？
- 计算机是否能够执行相应的操作？

## 结论

按照这些步骤操作，您应该拥有一个功能服务，允许硬件设备解释英语指令并在计算机上触发操作。如果遇到任何问题，请参阅各组件的文档或寻求相应社区论坛的帮助。
