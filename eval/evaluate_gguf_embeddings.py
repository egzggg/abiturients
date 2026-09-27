"""Evaluate Qwen3 GGUF embeddings served locally by llama.cpp."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from tqdm import tqdm

from eval.evaluate_embeddings import load_golden_dataset, load_squad_dataset, retrieval_metrics
from eval.evaluate_gte_embedding import TASK, WEB_TASK, rank_rows


ROOT = Path(__file__).resolve().parent.parent
MODELS = {
    "4b": ("Qwen/Qwen3-Embedding-4B-GGUF", "Qwen3-Embedding-4B-Q8_0.gguf", "qwen3-embedding-4b-q8"),
    "8b": ("Qwen/Qwen3-Embedding-8B-GGUF", "Qwen3-Embedding-8B-Q4_K_M.gguf", "qwen3-embedding-8b-q4"),
}


def encode(texts: list[str], session: requests.Session, base_url: str, alias: str, batch_size: int) -> np.ndarray:
    vectors: list[np.ndarray] = []
    for start in tqdm(range(0, len(texts), batch_size), desc="  embeddings", leave=False):
        batch = texts[start:start + batch_size]
        response = session.post(
            f"{base_url}/v1/embeddings",
            json={"model": alias, "input": batch, "encoding_format": "float"},
            timeout=600,
        )
        if not response.ok:
            raise RuntimeError(f"Embedding request failed at item {start}: HTTP {response.status_code}: {response.text[:500]}")
        data = sorted(response.json()["data"], key=lambda row: row["index"])
        if len(data) != len(batch):
            raise RuntimeError(f"Server returned {len(data)} embeddings for {len(batch)} texts at item {start}")
        vectors.extend(np.asarray(row["embedding"], dtype=np.float32) for row in data)
    matrix = np.stack(vectors)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if not np.isfinite(matrix).all() or (norms == 0).any():
        raise RuntimeError("Server returned invalid embeddings")
    return matrix / norms


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=MODELS, required=True)
    parser.add_argument("--dataset", choices=("golden", "squad"), required=True)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--base-url", default="http://127.0.0.1:8081")
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("batch size must be positive")
    model_id, filename, alias = MODELS[args.model]
    model_path = ROOT / ".venv" / "models" / f"qwen3-embedding-{args.model}-gguf" / filename
    if not model_path.is_file():
        parser.error(f"Model file missing: {model_path}")
    base_url = args.base_url.rstrip("/")
    session = requests.Session()
    try:
        response = session.get(f"{base_url}/v1/models", timeout=15)
        response.raise_for_status()
        available = {row["id"] for row in response.json()["data"]}
    except (requests.RequestException, KeyError, ValueError) as error:
        parser.error(f"Cannot reach llama.cpp server at {base_url}: {error}")
    if alias not in available:
        parser.error(f"Expected llama.cpp model alias {alias!r}; server has {sorted(available)}")

    dataset = load_squad_dataset() if args.dataset == "squad" else load_golden_dataset()
    output = ROOT / "eval" / "results" / f"qwen3_embedding_{args.model}_gguf_{args.dataset}_comparison.json"
    start = time.perf_counter()
    documents = encode([text for _, text in dataset.documents], session, base_url, alias, args.batch_size)
    report = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "model": model_id,
        "model_file": filename,
        "backend": "llama.cpp GGUF via local /v1/embeddings",
        "dataset": dataset.name,
        "query_count": len(dataset.queries),
        "document_count": len(dataset.documents),
        "dimension": int(documents.shape[1]),
        "batch_size": args.batch_size,
        "document_embedding_seconds": round(time.perf_counter() - start, 3),
        "variants": {},
    }
    prompts = {"default_query_prompt": f"Instruct: {WEB_TASK}\nQuery: "}
    if args.dataset == "golden":
        prompts["applicant_task_prompt"] = f"Instruct: {TASK}\nQuery: "
    for name, prompt in prompts.items():
        start = time.perf_counter()
        queries = encode([prompt + case.text for case in dataset.queries], session, base_url, alias, args.batch_size)
        metrics = retrieval_metrics(dataset.documents, queries, documents, dataset.queries, [1, 4, 5, 10], 128)
        result = {"query_embedding_seconds": round(time.perf_counter() - start, 3), "metrics": metrics}
        if args.dataset == "golden":
            result["rows"] = rank_rows(dataset, queries, documents)
        report["variants"][name] = result
        print(f"{name}: {metrics}", flush=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved: {output}", flush=True)


if __name__ == "__main__":
    main()
