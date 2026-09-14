"""
In-memory WebSocket subscribers per syllabus run_id.
When state changes (step complete, run started), broadcast to all subscribers.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket

# run_id -> set of WebSocket connections
_subscribers: dict[str, set[WebSocket]] = {}


def subscribe_syllabus_run(run_id: str, ws: WebSocket) -> None:
    """Add a WebSocket to the subscriber set for this run_id."""
    if run_id not in _subscribers:
        _subscribers[run_id] = set()
    _subscribers[run_id].add(ws)


def unsubscribe_syllabus_run(run_id: str, ws: WebSocket) -> None:
    """Remove a WebSocket from the subscriber set."""
    if run_id in _subscribers:
        _subscribers[run_id].discard(ws)
        if not _subscribers[run_id]:
            del _subscribers[run_id]


async def broadcast_syllabus_state(run_id: str, payload: dict[str, Any]) -> None:
    """
    Send payload to all WebSockets subscribed to this run_id.
    Payload should match SyllabusStepResponse: { stage, state, done }.
    """
    if run_id not in _subscribers:
        return
    dead: set[WebSocket] = set()
    for ws in list(_subscribers[run_id]):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.add(ws)
    for ws in dead:
        _subscribers[run_id].discard(ws)
    if run_id in _subscribers and not _subscribers[run_id]:
        del _subscribers[run_id]
