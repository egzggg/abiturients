# utils/logger.py

import json
from datetime import datetime, timezone
from pathlib import Path

from config import get_settings


def _append_jsonl(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(data, ensure_ascii=False) + "\n"
    with path.open("a", encoding="utf-8") as file:
        file.write(line)


def log_question(question: str) -> None:
    """
    Save user question.
    """

    data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "question": question
    }
    _append_jsonl(get_settings().log_dir / "questions.jsonl", data)


def log_chunks(question: str, chunks: list[dict]) -> None:
    """
    Save retrieved chunks.
    """

    data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "question": question,
        "chunks": chunks
    }
    _append_jsonl(get_settings().log_dir / "chunks.jsonl", data)
