"""Print stored Redis chunks without dumping full embeddings."""

import json

import redis

from config import get_settings


def main() -> None:
    settings = get_settings()
    client = redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        decode_responses=True,
    )
    print("Redis connected:", client.ping())

    count = 0
    for key in client.scan_iter(match="*:chunk:*"):
        raw = client.get(key)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as error:
            print(f"Invalid JSON in {key}: {error}")
            continue

        embedding = data.get("embedding")
        if isinstance(embedding, list):
            data["embedding"] = f"{embedding[:5]}... (length: {len(embedding)})"
        print(f"KEY: {key}")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        count += 1
    print(f"Total: {count}")


if __name__ == "__main__":
    main()
