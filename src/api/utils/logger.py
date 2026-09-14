from __future__ import annotations

import copy
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


class ColorFormatter(logging.Formatter):
    """
    Console-only color formatter (ANSI).
    - Timestamp: blue
    - Level: persistent per-level color
    - Auto-disables if NO_COLOR is set or output is not a TTY
    """

    _RESET = "\x1b[0m"
    _DIM = "\x1b[2m"
    _BLUE = "\x1b[34m"

    _LEVEL_COLORS: dict[int, str] = {
        logging.DEBUG: "\x1b[36m",  # cyan
        logging.INFO: "\x1b[32m",  # green
        logging.WARNING: "\x1b[33m",  # yellow
        logging.ERROR: "\x1b[31m",  # red
        logging.CRITICAL: "\x1b[35m",  # magenta
    }

    def __init__(self, *args, enable_color: bool = True, **kwargs):
        super().__init__(*args, **kwargs)
        self.enable_color = enable_color

    def format(self, record: logging.LogRecord) -> str:
        if not self.enable_color:
            return super().format(record)

        r = copy.copy(record)
        level_color = self._LEVEL_COLORS.get(getattr(r, "levelno", logging.INFO), "\x1b[37m")  # white fallback

        # These fields are used by the format string below.
        if getattr(r, "asctime", None):
            r.asctime = f"{self._BLUE}{r.asctime}{self._RESET}"
        r.levelname = f"{level_color}{r.levelname}{self._RESET}"
        r.name = f"{self._DIM}{r.name}{self._RESET}"
        r.request_id = f"{self._DIM}{getattr(r, 'request_id', '-')}{self._RESET}"
        return super().format(r)


def _should_enable_color(stream) -> bool:
    if os.getenv("NO_COLOR"):
        return False
    try:
        return bool(getattr(stream, "isatty", lambda: False)())
    except Exception:
        return False


def _parse_level(level: str) -> int:
    lvl = (level or "INFO").upper()
    return logging.getLevelNamesMapping().get(lvl, logging.INFO)


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

    logger = logging.getLogger("uvicorn")
    if getattr(logger, "_configured", False):
        return logger

    level = os.getenv("LOG_LEVEL", level)
    numeric_level = _parse_level(level)

    logger.setLevel(numeric_level)
    logger.propagate = False

    Path(log_dir).mkdir(parents=True, exist_ok=True)
    file_path = Path(log_dir) / log_file

    fmt = (
        "%(asctime)s %(levelname)-8s %(name)s "
        "pid=%(process)d request_id=%(request_id)s src=%(filename)s:%(lineno)d "
        "%(message)s"
    )
    datefmt = "%Y-%m-%d %H:%M:%S"
    file_formatter = logging.Formatter(fmt=fmt, datefmt=datefmt)
    console_formatter = ColorFormatter(
        fmt=fmt,
        datefmt=datefmt,
        enable_color=_should_enable_color(sys.stdout),
    )

    request_filter = RequestIdFilter()

    # File handler (rotating)
    fh = RotatingFileHandler(
        filename=str(file_path),
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=10,
        encoding="utf-8",
    )
    fh.setLevel(numeric_level)
    fh.setFormatter(file_formatter)
    fh.addFilter(request_filter)

    # # Console handler
    # ch = logging.StreamHandler(sys.stdout)
    # ch.setLevel(numeric_level)
    # ch.setFormatter(console_formatter)
    # ch.addFilter(request_filter)

    logger.addHandler(fh)
    # logger.addHandler(ch)

    logger._configured = True  # type: ignore[attr-defined]
    # logger.info("Logger configured (file=%s level=%s)", file_path, level)
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



