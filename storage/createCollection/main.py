"""Create the Qdrant collections required by the application."""

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from config import Settings, get_settings


def create_collections(client: QdrantClient, settings: Settings) -> None:
    for collection_name in (
        settings.knowledge_collection,
        settings.query_collection,
    ):
        if client.collection_exists(collection_name):
            info = client.get_collection(collection_name)
            vectors = info.config.params.vectors
            actual_size = getattr(vectors, "size", None)
            if actual_size != settings.embedding_dimension:
                raise RuntimeError(
                    f"Collection {collection_name!r} has vector size {actual_size}; "
                    f"expected {settings.embedding_dimension}. Recreate the collection."
                )
            print(f"[EXISTS] {collection_name}")
            continue
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=settings.embedding_dimension,
                distance=Distance.COSINE,
            ),
        )
        print(f"[CREATED] {collection_name}")


def main() -> None:
    settings = get_settings()
    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    create_collections(client, settings)
    print("\nALL COLLECTIONS")
    print(client.get_collections())


if __name__ == "__main__":
    main()
