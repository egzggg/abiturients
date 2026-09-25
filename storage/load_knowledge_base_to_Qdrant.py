"""Load document chunks into Qdrant using stable, idempotent point IDs."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

from config import PROJECT_ROOT, Settings, get_settings
from embeddings.embedder import Embedder


BATCH_SIZE = 64
CHUNKS_DIR = PROJECT_ROOT / "chunks"


def _point_id(source: str, chunk_id: str) -> str:
    """Return the same Qdrant ID for the same logical chunk on every run."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"rag-abitura:{source}:{chunk_id}"))


def iter_chunks(chunks_dir: Path = CHUNKS_DIR) -> Iterator[dict]:
    for path in sorted(chunks_dir.glob("*.json")):
        with path.open(encoding="utf-8") as file:
            chunks = json.load(file)
        if not isinstance(chunks, list):
            raise ValueError(f"{path} must contain a JSON array")
        for chunk in chunks:
            if not isinstance(chunk, dict):
                raise ValueError(f"{path} contains a non-object chunk")
            yield chunk


def _make_point(chunk: dict, embedder: Any) -> PointStruct:
    chunk_id = str(chunk.get("id") or "").strip()
    content = str(chunk.get("content") or "").strip()
    if not chunk_id or not content:
        raise ValueError("Every chunk must have non-empty 'id' and 'content'")

    source = str(chunk.get("source") or "unknown")
    section = str(chunk.get("section") or "")
    text = f"{section}\n{content}" if section else content
    if hasattr(embedder, "embed_passage"):
        vector = embedder.embed_passage(text)
    else:
        vector = embedder.embedding(text)

    return PointStruct(
        id=_point_id(source, chunk_id),
        vector=vector.tolist() if hasattr(vector, "tolist") else list(vector),
        payload={
            "chunk_id": chunk_id,
            "source": source,
            "section": section,
            "content": content,
        },
    )


def load_knowledge_base(
    *,
    client: Any,
    embedder: Any,
    collection_name: str,
    chunks_dir: Path = CHUNKS_DIR,
    batch_size: int = BATCH_SIZE,
) -> int:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    batch: list[PointStruct] = []
    uploaded = 0
    for chunk in iter_chunks(chunks_dir):
        batch.append(_make_point(chunk, embedder))
        if len(batch) >= batch_size:
            client.upsert(collection_name=collection_name, points=batch)
            uploaded += len(batch)
            print(f"Uploaded {uploaded}")
            batch = []

    if batch:
        client.upsert(collection_name=collection_name, points=batch)
        uploaded += len(batch)
        print(f"Uploaded {uploaded}")
    return uploaded


def main(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    embedder = Embedder(settings.embedding_model)
    total = load_knowledge_base(
        client=client,
        embedder=embedder,
        collection_name=settings.knowledge_collection,
    )
    print(f"DONE\nTotal chunks: {total}")


if __name__ == "__main__":
    main()
