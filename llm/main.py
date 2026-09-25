"""CLI for running the complete RAG pipeline once."""

import argparse
import json

from llm.giga_generator import generate_rag_answer
from top_chunks.retriever import TopChunksRetriever


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("question", nargs="+", help="question to answer")
    args = parser.parse_args()
    question = " ".join(args.question)

    chunks = TopChunksRetriever().get_top_chunks(question)
    print("TOP CHUNKS:")
    print(json.dumps(chunks, ensure_ascii=False, indent=2))
    print("\nANSWER:")
    print(generate_rag_answer(query=question, chunks=chunks))


if __name__ == "__main__":
    main()
