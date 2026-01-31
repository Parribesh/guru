"""
Ollama models endpoint: list models from local Ollama API for user selection.
"""

import json
import urllib.request
from urllib.error import URLError

from fastapi import APIRouter, HTTPException

from api.config import OLLAMA_BASE_URL
from api.utils.logger import configure_logging

logger = configure_logging()
ollama_routes = APIRouter()


@ollama_routes.get("/ollama/models")
async def list_ollama_models() -> dict:
    """
    Fetch list of available Ollama models from local Ollama API.
    Returns { "models": [ { "name": "qwen:latest", ... }, ... ] }.
    """
    url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/tags"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except URLError as e:
        logger.warning("Ollama API unreachable: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Ollama is not reachable. Start Ollama (e.g. ollama serve) and ensure OLLAMA_BASE_URL is correct.",
        ) from e
    except Exception as e:
        logger.exception("Ollama list models error: %s", e)
        raise HTTPException(status_code=503, detail="Failed to list Ollama models") from e
    models = data.get("models") or []
    return {"models": [m if isinstance(m, dict) else {"name": str(m)} for m in models]}
