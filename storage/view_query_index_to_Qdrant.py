"""Print a bounded preview of the canonical-query Qdrant collection."""

from qdrant_client import QdrantClient

from config import get_settings


MAX_POINTS = 200


def main() -> None:
    settings = get_settings()
    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    points, _ = client.scroll(
        collection_name=settings.query_collection,
        limit=MAX_POINTS,
        with_payload=True,
        with_vectors=False,
    )
    for point in points:
        payload = point.payload or {}
        print("-" * 80)
        print(f"ID: {point.id}")
        for key in ("cqs_id", "source", "query", "chunk_id", "match_score"):
            print(f"  {key}: {payload.get(key)}")
    print(f"PREVIEWED: {len(points)}")


if __name__ == "__main__":
    main()
