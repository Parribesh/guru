from __future__ import annotations

import logging
import os
import sys
import time
import uuid
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional

REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003 (shadow built-in name)
        record.request_id = REQUEST_ID.get("-")
        return True


def configure_logging(
    *,
    log_dir: str | Path = "logs",
    log_file: str = "backend.log",
    level: str = "INFO",
) -> logging.Logger:
    """
    Configure a rotating file logger under ./logs and a console logger.
    Idempotent: safe to call multiple times.
    """

    logger = logging.getLogger("backend")
    if getattr(logger, "_configured", False):
        return logger

    logger.setLevel(level)
    logger.propagate = False

    Path(log_dir).mkdir(parents=True, exist_ok=True)
    file_path = Path(log_dir) / log_file

    fmt = (
        "%(asctime)s %(levelname)s %(name)s "
        "pid=%(process)d request_id=%(request_id)s "
        "%(message)s"
    )
    datefmt = "%Y-%m-%d %H:%M:%S"
    formatter = logging.Formatter(fmt=fmt, datefmt=datefmt)

    request_filter = RequestIdFilter()

    # File handler (rotating)
    fh = RotatingFileHandler(
        filename=str(file_path),
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=10,
        encoding="utf-8",
    )
    fh.setLevel(level)
    fh.setFormatter(formatter)
    fh.addFilter(request_filter)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(level)
    ch.setFormatter(formatter)
    ch.addFilter(request_filter)

    logger.addHandler(fh)
    logger.addHandler(ch)

    logger._configured = True  # type: ignore[attr-defined]
    logger.info("Logger configured (file=%s level=%s)", file_path, level)
    return logger


def set_request_id(request_id: Optional[str] = None) -> str:
    rid = request_id or str(uuid.uuid4())
    REQUEST_ID.set(rid)
    return rid


def clear_request_id() -> None:
    REQUEST_ID.set("-")


class log_request:
    """
    Small helper to time operations:
      with log_request(logger, "ingest"):
          ...
    """

    def __init__(self, logger: logging.Logger, name: str):
        self.logger = logger
        self.name = name
        self.start = 0.0

    def __enter__(self):
        self.start = time.time()
        self.logger.debug("start %s", self.name)
        return self

    def __exit__(self, exc_type, exc, tb):
        dur_ms = int((time.time() - self.start) * 1000)
        if exc is None:
            self.logger.info("%s ok duration_ms=%s", self.name, dur_ms)
        else:
            self.logger.exception("%s failed duration_ms=%s", self.name, dur_ms)
        return False


