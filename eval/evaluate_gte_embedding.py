"""Evaluate the selected GTE 1.5B embedding model on golden or SQuAD."""

from __future__ import annotations

import json
import argparse
import os
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HOME", str(ROOT / ".venv" / "hf-cache"))

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

from eval.evaluate_embeddings import load_golden_dataset, load_squad_dataset, retrieval_metrics


TASK = "Given a question from a prospective university applicant, retrieve passages that answer the question"
WEB_TASK = "Given a web search query, retrieve relevant passages that answer the query"


def rank_rows(dataset, query_vectors: np.ndarray, document_vectors: np.ndarray) -> list[dict]:
    scores = query_vectors @ document_vectors.T
    rows = []
    for case, case_scores in zip(dataset.queries, scores):
        order = np.argsort(-case_scores, kind="stable")
        rank = next(
            (index for index, doc_index in enumerate(order, 1)
             if dataset.documents[int(doc_index)][0] in case.relevant_doc_ids),
            None,
        )
        rows.append({
            "id": case.query_id,
            "question": case.text,
            "relevant_rank": rank,
            "top10": [dataset.documents[int(index)][0] for index in order[:10]],
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", choices=("golden", "squad"), default="golden")
    parser.add_argument("--batch-size", type=int)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    batch_size = args.batch_size or (16 if args.dataset == "squad" else 4)
    if batch_size < 1:
        parser.error("batch size must be positive")
    if args.threads < 1:
        parser.error("threads must be positive")
    torch.set_num_threads(args.threads)
    dataset = load_squad_dataset() if args.dataset == "squad" else load_golden_dataset()
    model_id = "Alibaba-NLP/gte-Qwen2-1.5B-instruct"
    model_dir = ROOT / ".venv" / "models" / "gte-qwen2-1.5b-instruct"
    output = ROOT / "eval" / "results" / f"gte_qwen2_1_5b_{args.dataset}_comparison.json"
    variants = {"default_query_prompt": {"prompt_name": "query"}}
    if args.dataset == "golden":
        variants["applicant_task_prompt"] = {"prompt": f"Instruct: {TASK}\nQuery: "}
    model = SentenceTransformer(str(model_dir), device="cpu", trust_remote_code=True)
    # Embedding inference never reuses a generation KV cache. The model's
    # older custom Qwen2 code expects a cache method removed in Transformers 4.57.
    model[0].auto_model.config.use_cache = False
    print(f"Loaded {model_dir}; prompts={model.prompts}", flush=True)
    start = time.perf_counter()
    documents = model.encode(
        [text for _, text in dataset.documents], batch_size=batch_size,
        convert_to_numpy=True, normalize_embeddings=True,
        show_progress_bar=True,
    ).astype(np.float32)
    doc_seconds = time.perf_counter() - start

    report = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "model": model_id,
        "backend": "sentence-transformers PyTorch FP32 CPU",
        "dataset": dataset.name,
        "query_count": len(dataset.queries),
        "document_count": len(dataset.documents),
        "dimension": int(documents.shape[1]),
        "batch_size": batch_size,
        "document_embedding_seconds": round(doc_seconds, 3),
        "variants": {},
    }
    for name, kwargs in variants.items():
        start = time.perf_counter()
        queries = model.encode(
            [case.text for case in dataset.queries], batch_size=batch_size,
            convert_to_numpy=True, normalize_embeddings=True,
            show_progress_bar=True, **kwargs,
        ).astype(np.float32)
        seconds = time.perf_counter() - start
        metrics = retrieval_metrics(
            dataset.documents, queries, documents, dataset.queries,
            [1, 4, 5, 10], 128,
        )
        report["variants"][name] = {
            "query_embedding_seconds": round(seconds, 3),
            "metrics": metrics,
        }
        if args.dataset == "golden":
            report["variants"][name]["rows"] = rank_rows(dataset, queries, documents)
        print(f"{name}: {metrics} ({seconds:.1f}s for queries)", flush=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved: {output}", flush=True)


if __name__ == "__main__":
    main()
