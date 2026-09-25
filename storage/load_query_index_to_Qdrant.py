"""Build the canonical-query index and link each query to its best KB chunk."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

from config import PROJECT_ROOT, Settings, get_settings
from embeddings.embedder import Embedder


BATCH_SIZE = 64
CQS_DIR = PROJECT_ROOT / "CQs"


def _point_id(source: str, cq_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"rag-abitura:cq:{source}:{cq_id}"))


def _iter_cqs(cqs_dir: Path):
    for path in sorted(cqs_dir.glob("*.json")):
        with path.open(encoding="utf-8") as file:
            items = json.load(file)
        if not isinstance(items, list):
            raise ValueError(f"{path} must contain a JSON array")
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"{path} contains a non-object CQ")
            yield item


def _search_best_chunks(client: Any, collection: str, vector: list, top_k: int = 3):
    return client.query_points(
        collection_name=collection,
        query=vector,
        limit=top_k,
        with_payload=True,
        with_vectors=False,
    ).points


def _make_point(
    item: dict,
    *,
    client: Any,
    embedder: Any,
    knowledge_collection: str,
) -> PointStruct:
    cq_id = str(item.get("cqs_id") or "").strip()
    query = str(item.get("query") or "").strip()
    source = str(item.get("source") or "unknown")
    variations = item.get("variations") or []
    if not cq_id or not query:
        raise ValueError("Every CQ must have non-empty 'cqs_id' and 'query'")
    if not isinstance(variations, list):
        raise ValueError(f"variations for {cq_id} must be a list")

    # Canonical questions and live user text belong to the same query space.
    text = " ".join([query, *(str(value) for value in variations)])
    vector = (
        embedder.embed_query(text)
        if hasattr(embedder, "embed_query")
        else embedder.embedding(text)
    )
    vector = vector.tolist() if hasattr(vector, "tolist") else list(vector)
    results = _search_best_chunks(client, knowledge_collection, vector)

    best = results[0] if results else None
    matched_payload = None
    if best is not None:
        best_payload = best.payload or {}
        matched_payload = {
            "chunk_id": best_payload.get("chunk_id"),
            "source": best_payload.get("source"),
            "section": best_payload.get("section"),
            "content": best_payload.get("content"),
        }

    payload = {
        "cqs_id": cq_id,
        "source": source,
        "query": query,
        "variations": variations,
        "chunk_id": str(best.id) if best is not None else None,
        "matched_chunk_payload": matched_payload,
        "match_score": float(best.score) if best is not None else 0.0,
        "candidates": [
            {"chunk_id": str(result.id), "score": float(result.score)}
            for result in results
        ],
    }
    return PointStruct(
        id=_point_id(source, cq_id),
        vector=vector,
        payload=payload,
    )


def load_query_index(
    *,
    client: Any,
    embedder: Any,
    query_collection: str,
    knowledge_collection: str,
    cqs_dir: Path = CQS_DIR,
    batch_size: int = BATCH_SIZE,
) -> int:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    batch: list[PointStruct] = []
    uploaded = 0
    for item in _iter_cqs(cqs_dir):
        batch.append(
            _make_point(
                item,
                client=client,
                embedder=embedder,
                knowledge_collection=knowledge_collection,
            )
        )
        if len(batch) >= batch_size:
            client.upsert(collection_name=query_collection, points=batch)
            uploaded += len(batch)
            print(f"Uploaded {uploaded}")
            batch = []

    if batch:
        client.upsert(collection_name=query_collection, points=batch)
        uploaded += len(batch)
        print(f"Uploaded {uploaded}")
    return uploaded


def main(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    embedder = Embedder(settings.embedding_model)
    total = load_query_index(
        client=client,
        embedder=embedder,
        query_collection=settings.query_collection,
        knowledge_collection=settings.knowledge_collection,
    )
    print(f"DONE\nTotal CQs: {total}")


if __name__ == "__main__":
    main()
