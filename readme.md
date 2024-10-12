# Watcher-OI

## Overview

This guide will walk you through setting up a service that enables hardware devices to interpret English commands and perform corresponding actions on a computer. This process includes installing Ollama, Docker, third-party open-source image services, and starting Node.js and Python scripts.

## Prerequisites

Before you begin, ensure you have the following:

1. Compatible hardware capable of running Ollama.
2. A computer with Docker, Python, and Node.js installed.
3. Familiarity with basic command-line operations.
4. A Watcher device. [What is a Watcher?](https://www.seeedstudio.com/watcher) (Not an advertisement!)

## Step 1: Install Ollama

Ollama is a key component that enables your hardware device to process commands. Follow these steps to install Ollama:

- Download the latest version of Ollama from the [official website](https://ollama.com/download).
- Install Ollama by following the on-screen instructions.
- Verify the installation by running `ollama --version` in the terminal.
- Install a local model by running the command `ollama run llama3.1`.

**Troubleshooting List:**

- Is the Ollama software compatible with your hardware device?
- Did you download the correct version for your operating system?
- Did you install a local model to provide for subsequent processes?
- Can you run the local model without issues?

## Step 2: Install Docker

Docker will be used to containerize third-party open-source image services. Follow these steps to install Docker:

- Visit the [Docker website](https://www.docker.com/products/docker-desktop).
- Download Docker Desktop/Docker Engine for your operating system.
- Install Docker and follow the setup instructions.
- Start Docker Desktop and ensure it is running.

**Troubleshooting List:**

- Does your computer meet Docker's system requirements?
- Have you successfully added your user to the Docker group?
- Can you start a hello world container without issues?

## Step 3: Install STT Service

You will need an STT (Speech-to-Text) service to handle voice commands. A popular choice is the [OpenAI Whisper ASR Webservice API](https://github.com/ahmetoner/whisper-asr-webservice).

Install it using the following command:

- `docker run -d --gpus all -p 9000:9000 -e ASR_MODEL=base -e ASR_ENGINE=openai_whisper onerahmet/openai-whisper-asr-webservice:latest-gpu`

**Troubleshooting List:**

- Does your computer support running this container?
- If your computer does not have a GPU, switch to `latest-cpu`, will it run smoothly?

## Step 4: Start Node.js Script

Node.js will handle communication between the hardware device and the computer. To start the Node.js script:

- Ensure that Node.js is installed on your system.
- Navigate to the directory of this repository.
- Run `npm install` in the terminal to install software dependencies.
- Run `npm run start` in the terminal.

**Troubleshooting List:**

- Is your Node.js correctly installed?
- Are there any missing dependencies required for the script to run?
- Does the script require the use of port 8000, and is there a conflict?

## Step 5: Start Python Script

The Python script will process English commands and trigger actions on the computer. Start it by:

- Ensuring that Python is installed on your system.
- Install [Open Interpreter](https://docs.openinterpreter.com/getting-started/introduction), which is used to handle voice commands issued by humans.
- Navigate to the root directory of this repository.
- Run `pip install -r requirements.txt` in the terminal to install environment dependencies.
- Run `python proxy.py` in the terminal.

**Troubleshooting List:**

- Is the Python interpreter installed and accessible from your terminal?
- Are there any required libraries missing for the script to run?
- Are the script's runtime logs printing normally?
- Does the script require the use of port 9888, and is there a conflict?

## Step 6: Configure Hardware Device

To make the Watcher hardware device send messages to the aforementioned services:

- Ensure that the Watcher is powered on.
- Download the App on your mobile phone. Search for `SenseCraft` in the app market.
- Follow the app's instructions to configure the device to connect to the internet.
- Then configure the Watcher AI Service of the device to Private, with the value set to `http://internal-network-address:8000`.

**Troubleshooting List:**

- Is the hardware device correctly connected and powered?
- Does the device have the necessary firmware to communicate with the computer?

## Step 7: Test the Setup

Once everything is configured, test the setup by issuing English commands to the hardware device and observing the computer's response. Demonstration is as follows:

![](./test.mp4)

**Troubleshooting List:**

- Does the hardware device correctly interpret the commands?
- Can the computer execute the corresponding actions?

## Conclusion

Following these steps should result in a functional service that allows hardware devices to interpret English commands and trigger actions on a computer. If you encounter any issues, refer to the documentation of each component or seek help from the respective community forums.
