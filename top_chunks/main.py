"""CLI for inspecting retrieved chunks."""

import argparse
import json

from top_chunks.retriever import TopChunksRetriever


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("question", nargs="+", help="question to retrieve chunks for")
    args = parser.parse_args()
    question = " ".join(args.question)

    chunks = TopChunksRetriever().get_top_chunks(question)
    print(json.dumps(chunks, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
