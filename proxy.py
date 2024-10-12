from common import LLM_API, LLM_MODEL
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

# Interpreter 库已经正确安装和配置
from interpreter import interpreter

app = FastAPI()

# interprete configs
interpreter.llm.model = LLM_MODEL
interpreter.llm.api_base = LLM_API
interpreter.offline = True  # Disables online features like Open Procedures
interpreter.auto_run = True
interpreter.loop = False
interpreter.verbose = True
interpreter.llm.context_window = 1600
interpreter.llm.max_tokens = 100
interpreter.llm.max_output = 100

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
        # use interpreter deal with text
        result = interpreter.chat(data.decode("utf-8"))
        print(result)
        if not result:
            raise HTTPException(
                status_code=500, detail="Interpreter did not return a result"
            )
        response_text = result[0].get("content")
        print(response_text)
        return {"response": response_text}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9888)
