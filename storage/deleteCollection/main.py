"""Explicitly delete the application's Qdrant collections."""

import argparse

from qdrant_client import QdrantClient

from config import get_settings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm deletion of both application collections",
    )
    args = parser.parse_args()
    if not args.yes:
        parser.error("destructive operation requires --yes")

    settings = get_settings()
    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    for name in (settings.knowledge_collection, settings.query_collection):
        if client.collection_exists(name):
            client.delete_collection(name)
            print(f"Deleted {name}")
        else:
            print(f"Skipped missing collection {name}")


if __name__ == "__main__":
    main()
