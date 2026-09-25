import re
from typing import Callable

from llm.llm_client import call_llm


def build_rerank_prompt(query: str, chunks: list[dict], top_k: int = 4) -> str:
    context_parts = []

    for i, ch in enumerate(chunks):
        context_parts.append(f"""
[{i}]
SOURCE: {ch.get("source")}
SECTION: {ch.get("section")}
CONTENT: {str(ch.get("content") or "")[:500]}
""")

    context = "".join(context_parts)

    return f"""
Ты rerank система.

Выбери не более {top_k} наиболее релевантных чанков.

Вопрос:
{query}

Чанки:
{context}

Верни индексы через запятую.
"""


def _parse_indexes(response: str, chunk_count: int) -> list[int]:
    indexes = []
    for match in re.findall(r"\d+", response):
        index = int(match)
        if 0 <= index < chunk_count and index not in indexes:
            indexes.append(index)
    return indexes


def rerank_chunks(
    query: str,
    chunks: list[dict],
    top_k: int = 4,
    *,
    llm: Callable[..., str] = call_llm,
) -> list[dict]:
    if top_k <= 0:
        return []
    if len(chunks) <= top_k:
        return list(chunks)

    prompt = build_rerank_prompt(query, chunks, top_k)

    try:
        response = llm(prompt, temperature=0.2)
        indexes = _parse_indexes(response, len(chunks))
    except Exception:
        indexes = []

    # A partial or malformed model response must not silently shrink context.
    indexes.extend(index for index in range(len(chunks)) if index not in indexes)
    return [chunks[index] for index in indexes[:top_k]]
