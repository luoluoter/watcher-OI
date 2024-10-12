import json
import requests
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from interpreter import interpreter

app = FastAPI()
model = "llama3.1:8b"
api_base = "http://172.22.1.82:11434"
# 假设 Interpreter 库已经正确安装和配置
interpreter.offline = True  # Disables online features like Open Procedures
interpreter.llm.model = f"ollama_chat/{model}"
interpreter.llm.api_base = "http://172.22.1.82:11434"
interpreter.auto_run = True
interpreter.loop = False
interpreter.verbose = True
interpreter.llm.context_window = 16000
interpreter.llm.max_tokens = 100
interpreter.llm.max_output = 1000


print(interpreter.system_message)

# (Tip: Do this before adding/removing languages, otherwise OI might retain the state of previous languages:)
interpreter.computer.terminate()

class RequestModel(BaseModel):
    text: str


@app.post("/talk")
async def talk(request: Request):
    try:
        data = await request.body()
        print(data)
        # 使用 interpreter 处理接收到的文本
        result = interpreter.chat(data.decode("utf-8"))
        print(result)
        if not result:
            raise HTTPException(
                status_code=500, detail="Interpreter did not return a result"
            )
        # 获取并返回结果
        response_text = result[0].get("content")
        print(response_text)
        return {"response": response_text}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))


messages = [
    {
        "role": "system",
        "content": "You are a helpful assistant. answer always simple and short.",
    }
]


@app.post("/chat")
async def talk(request: Request):
    try:
        data = await request.body()
        print(data)
        # 使用 interpreter 处理接收到的文本
        msg = {"role": "user", "type": "message", "content": data.decode("utf-8")}
        messages.append(msg)
        r = requests.post(
            api_base + "/api/chat",
            json={"model": model, "messages": messages, "stream": True},
        )
        #  [{'role': 'assistant', 'type': 'message', 'content': }]
        r.raise_for_status()
        output = ""

        for line in r.iter_lines():
            body = json.loads(line)
            # print(body)
            if "error" in body:
                raise Exception(body["error"])
            if body.get("done") is False:
                message = body.get("message", "")
                content = message.get("content", "")
                output += content
                # the response streams one token at a time, print that as we receive it
                # print(content, end="", flush=True)

            if body.get("done", False):
                message["content"] = output
                print(message)
                messages.append(message)
                return {"response": output}
        # 获取并返回结果
        return {"response": "i am done"}
    except Exception as e:
        print(e)
        return {"response": "thinking failed"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9888)
