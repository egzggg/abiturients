from __future__ import annotations

from typing import Any

from qdrant_client import QdrantClient

from config import Settings, get_settings
from embeddings.embedder import Embedder


class TopChunksRetriever:
    """Retrieve and merge query-index and knowledge-base candidates."""

    def __init__(
        self,
        *,
        client: Any | None = None,
        embedder: Any | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.client = client or QdrantClient(
            host=self.settings.qdrant_host,
            port=self.settings.qdrant_port,
        )
        self.embedder = embedder or Embedder(self.settings.embedding_model)

    # SCORE NORMALIZATION
    def _normalize_score(self, chunk: dict) -> float:
        score = float(chunk.get("score") or 0.0)

        # CQ чуть усиливаем (как anchor retrieval)
        if chunk.get("retrieval_type") == "CQ":
            return score * self.settings.retrieval_cq_boost

        return score

    @staticmethod
    def _deduplication_key(chunk: dict) -> tuple:
        chunk_id = chunk.get("kb_chunk_id")
        if chunk_id:
            # Chunk IDs are only unique inside a source document.
            return ("id", chunk.get("source") or "", str(chunk_id))
        return (
            "content",
            chunk.get("source") or "",
            chunk.get("section") or "",
            chunk.get("content") or "",
        )

    def get_top_chunks(self, query: str) -> list[dict]:
        query = query.strip()
        if not query:
            return []

        if hasattr(self.embedder, "embed_query"):
            query_vector = self.embedder.embed_query(query)
        else:  # Backward-compatible custom embedders.
            query_vector = self.embedder.embedding(query)
        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()

        # 1. CQ SEARCH
        cq_results = self.client.query_points(
            collection_name=self.settings.query_collection,
            query=query_vector,
            limit=self.settings.retrieval_search_limit,
            with_payload=True,
            with_vectors=False,
        ).points

        cq_chunks = []

        for cq in cq_results:
            payload = cq.payload or {}
            matched = payload.get("matched_chunk_payload")

            if not matched or not matched.get("content"):
                continue

            cq_chunks.append(
                {
                    "retrieval_type": "CQ",
                    "score": float(cq.score),
                    "source": matched.get("source"),
                    "section": matched.get("section"),
                    "content": matched.get("content"),
                    "kb_chunk_id": matched.get("chunk_id") or f"CQ_{cq.id}",
                }
            )

        # 2. KB SEARCH

        kb_results = self.client.query_points(
            collection_name=self.settings.knowledge_collection,
            query=query_vector,
            limit=self.settings.retrieval_search_limit,
            with_payload=True,
            with_vectors=False,
        ).points

        kb_chunks = []

        for kb in kb_results:
            payload = kb.payload or {}

            if not payload.get("content"):
                continue

            kb_chunks.append(
                {
                    "retrieval_type": "KB_DIRECT",
                    "score": float(kb.score),
                    "source": payload.get("source"),
                    "section": payload.get("section"),
                    "content": payload.get("content"),
                    "kb_chunk_id": payload.get("chunk_id") or f"KB_{kb.id}",
                }
            )

        # 3. OPTIONAL FILTER (light, not aggressive)
        kb_chunks = [
            ch
            for ch in kb_chunks
            if ch.get("score", 0) >= self.settings.retrieval_min_kb_score
        ]

        # 4. MERGE + DEDUP
        seen = set()
        final = []

        for ch in cq_chunks + kb_chunks:

            key = self._deduplication_key(ch)

            if key in seen:
                continue

            seen.add(key)
            final.append(ch)

        # 
        # 5. SORT (NORMALIZED SCORE)
        # 
        final = sorted(final, key=self._normalize_score, reverse=True)

        return final[: self.settings.retrieval_result_limit]
