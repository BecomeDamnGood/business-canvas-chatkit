from __future__ import annotations

import json
import logging

from chatkit.server import StreamingResult
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

from .server import StarterChatServer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chatkit-backend")

app = FastAPI(title="ChatKit Starter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chatkit_server = StarterChatServer()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _looks_like_json(b: bytes) -> bool:
    s = b.strip()
    return s.startswith(b"{") or s.startswith(b"[")


@app.post("/chatkit")
async def chatkit_endpoint(request: Request) -> Response:
    payload = await request.body()

    if not payload or payload.strip() == b"":
        return JSONResponse(status_code=400, content={"error": "Invalid request body"})

    if _looks_like_json(payload):
        try:
            json.loads(payload.decode("utf-8"))
        except Exception:
            return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    try:
        result = await chatkit_server.process(payload, {"request": request})
    except Exception:
        logger.exception("ChatKit payload rejected")
        return JSONResponse(status_code=400, content={"error": "ChatKit payload rejected"})

    if isinstance(result, StreamingResult):
        return StreamingResponse(result, media_type="text/event-stream")
    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")
    return JSONResponse(result)
