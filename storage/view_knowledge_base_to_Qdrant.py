"""Print a bounded preview of the knowledge-base Qdrant collection."""

from qdrant_client import QdrantClient

from config import get_settings


def pretty_payload(payload: dict) -> str:
    lines = []
    for key, value in payload.items():
        if isinstance(value, str) and len(value) > 120:
            value = value[:120] + "..."
        lines.append(f"  {key}: {value}")
    return "\n".join(lines)


def main() -> None:
    settings = get_settings()
    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    print(client.get_collection(settings.knowledge_collection))

    points, _ = client.scroll(
        collection_name=settings.knowledge_collection,
        limit=30,
        with_payload=True,
        with_vectors=False,
    )
    for point in points:
        print("=" * 80)
        print(f"ID: {point.id}")
        print(pretty_payload(point.payload or {}))
    print(f"PREVIEWED: {len(points)}")


if __name__ == "__main__":
    main()
