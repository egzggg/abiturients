"""Load chunks into the optional Redis cache."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import redis

from config import PROJECT_ROOT, get_settings
from embeddings.embedder import Embedder


CHUNKS_DIR = PROJECT_ROOT / "chunks"


def wait_for_redis(client: Any, attempts: int = 10) -> None:
    for _ in range(attempts):
        try:
            if client.ping():
                return
        except redis.RedisError:
            time.sleep(1)
    raise RuntimeError("Redis is not available")


def load_chunks(
    client: Any,
    embedder: Any,
    chunks_dir: Path = CHUNKS_DIR,
) -> int:
    total_loaded = 0
    for path in sorted(chunks_dir.glob("*.json")):
        with path.open(encoding="utf-8") as file:
            chunks = json.load(file)
        if not isinstance(chunks, list):
            raise ValueError(f"{path} must contain a JSON array")

        pipeline = client.pipeline()
        loaded = 0
        for original in chunks:
            chunk = dict(original)
            chunk_id = str(chunk.get("id") or "").strip()
            content = str(chunk.get("content") or "").strip()
            if not chunk_id or not content:
                raise ValueError(f"Invalid chunk in {path}")
            key = f"{path.name}:chunk:{chunk_id}"
            if client.exists(key):
                continue
            if not chunk.get("embedding"):
                vector = embedder.embed_passage(content)
                chunk["embedding"] = (
                    vector.tolist() if hasattr(vector, "tolist") else list(vector)
                )
            pipeline.set(key, json.dumps(chunk, ensure_ascii=False))
            loaded += 1
        if loaded:
            pipeline.execute()
        total_loaded += loaded
        print(f"{path.name}: added {loaded}")
    return total_loaded


def main() -> None:
    settings = get_settings()
    client = redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        decode_responses=True,
    )
    wait_for_redis(client)
    total = load_chunks(client, Embedder(settings.embedding_model))
    print(f"Total added: {total}")


if __name__ == "__main__":
    main()
