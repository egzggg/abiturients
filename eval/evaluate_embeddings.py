"""Evaluate embedding models on the Abitura golden set and SQuAD 1.1 dev."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import torch
import torch.nn.functional as F
from tqdm import tqdm
from transformers import AutoModel, AutoTokenizer


EVAL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = EVAL_DIR.parent


def resolve_model_source(model_name: str) -> str:
    """Prefer a cached snapshot so evaluation also works without Hub access."""
    local_path = Path(model_name).expanduser()
    if local_path.is_dir():
        return str(local_path.resolve())
    try:
        from huggingface_hub import snapshot_download

        return snapshot_download(repo_id=model_name, local_files_only=True)
    except Exception:
        # An uncached model can still be fetched by the backend when Hub access
        # is available; this fallback also preserves local-directory support.
        return model_name


@dataclass
class QueryCase:
    query_id: str
    text: str
    relevant_doc_ids: frozenset[str]


@dataclass
class RetrievalDataset:
    name: str
    documents: list[tuple[str, str]]
    queries: list[QueryCase]


def load_golden_dataset() -> RetrievalDataset:
    """Load local knowledge chunks and their hand-curated relevant chunk IDs."""
    docs: list[tuple[str, str]] = []
    doc_id_by_source_chunk: dict[tuple[str, str], str] = {}

    for path in sorted((PROJECT_ROOT / "chunks").glob("*.json")):
        with path.open(encoding="utf-8") as file:
            chunks = json.load(file)
        for chunk in chunks:
            source = str(chunk["source"])
            chunk_id = str(chunk["id"])
            doc_id = f"{source}::{chunk_id}"
            text = f"{chunk.get('section', '')}\n{chunk.get('content', '')}".strip()
            if not text:
                continue
            key = (source, chunk_id)
            if key in doc_id_by_source_chunk:
                raise ValueError(f"Duplicate chunk reference in corpus: {key}")
            doc_id_by_source_chunk[key] = doc_id
            docs.append((doc_id, text))

    cases: list[QueryCase] = []
    with (EVAL_DIR / "golden.jsonl").open(encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            refs = row.get("relevant_chunks", [])
            relevant_ids = frozenset(
                doc_id_by_source_chunk[(str(ref["source"]), str(ref["chunk_id"]))]
                for ref in refs
            )
            if row.get("answerable", True) and relevant_ids:
                cases.append(
                    QueryCase(str(row["id"]), str(row["question"]), relevant_ids)
                )
            elif row.get("answerable", True):
                raise ValueError(
                    f"Golden row {line_number} ({row.get('id')}) has no relevant chunks"
                )

    if not docs or not cases:
        raise ValueError("Golden evaluation data or knowledge chunks are empty")
    return RetrievalDataset("abitura_golden", docs, cases)


def load_squad_dataset() -> RetrievalDataset:
    """Use each unique SQuAD paragraph as a document and its QAs as queries."""
    with (EVAL_DIR / "squad" / "dev-v1.1.json").open(encoding="utf-8") as file:
        squad = json.load(file)

    docs: list[tuple[str, str]] = []
    id_by_context: dict[str, str] = {}
    pending_queries: list[tuple[str, str, str]] = []

    for article in squad["data"]:
        for paragraph in article["paragraphs"]:
            context = paragraph["context"].strip()
            if not context:
                continue
            doc_id = id_by_context.get(context)
            if doc_id is None:
                doc_id = "squad:" + hashlib.sha256(context.encode("utf-8")).hexdigest()[:20]
                id_by_context[context] = doc_id
                docs.append((doc_id, context))
            for qa in paragraph["qas"]:
                if qa.get("is_impossible", False):
                    continue
                pending_queries.append((str(qa["id"]), qa["question"], doc_id))

    cases = [
        QueryCase(query_id, text, frozenset({doc_id}))
        for query_id, text, doc_id in pending_queries
    ]
    if not docs or not cases:
        raise ValueError("SQuAD evaluation data is empty")
    return RetrievalDataset("squad_dev", docs, cases)


class E5Encoder:
    """Batched version of the repository's E5 mean-pooling implementation."""

    def __init__(self, model_name: str, device: torch.device):
        self.model_name = model_name
        self.device = device
        model_source = resolve_model_source(model_name)
        self.tokenizer = AutoTokenizer.from_pretrained(model_source)
        self.model = AutoModel.from_pretrained(model_source).to(device)
        self.model.eval()

    def encode(
        self,
        texts: list[str],
        role: str,
        batch_size: int,
        show_progress: bool,
    ) -> np.ndarray:
        if role not in {"query", "passage"}:
            raise ValueError(f"Unsupported E5 role: {role}")

        embeddings: list[np.ndarray] = []
        batches: Iterable[int] = range(0, len(texts), batch_size)
        if show_progress:
            batches = tqdm(batches, total=(len(texts) + batch_size - 1) // batch_size,
                           desc=f"  {role}s", leave=False)

        for start in batches:
            batch = []
            for text in texts[start : start + batch_size]:
                text = text.strip()
                if not text:
                    raise ValueError(f"Empty {role} text encountered")
                if not text.startswith(("passage:", "query:")):
                    text = f"{role}: {text}"
                batch.append(text)

            encoded = self.tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            ).to(self.device)
            with torch.inference_mode():
                output = self.model(**encoded)
                token_embeddings = output.last_hidden_state
                mask = encoded["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
                pooled = torch.sum(token_embeddings * mask, dim=1) / torch.clamp(
                    mask.sum(dim=1), min=1e-9
                )
                pooled = F.normalize(pooled, p=2, dim=1)
            embeddings.append(pooled.cpu().numpy().astype(np.float32, copy=False))

        return np.concatenate(embeddings, axis=0)


class SentenceTransformerEncoder:
    """Adapter for models distributed through sentence-transformers."""

    def __init__(
        self,
        model_name: str,
        device: torch.device,
        query_prefix: str,
        passage_prefix: str,
    ):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "This model uses the sentence-transformers backend. Install it with "
                "'.venv/bin/pip install sentence-transformers' and rerun."
            ) from exc

        self.model_name = model_name
        self.device = str(device)
        self.query_prefix = query_prefix
        self.passage_prefix = passage_prefix
        self.model = SentenceTransformer(
            resolve_model_source(model_name),
            device=self.device,
            trust_remote_code=True,
        )

    def encode(
        self,
        texts: list[str],
        role: str,
        batch_size: int,
        show_progress: bool,
    ) -> np.ndarray:
        prefix = self.query_prefix if role == "query" else self.passage_prefix
        values = [prefix + text.strip() for text in texts]
        result = self.model.encode(
            values,
            batch_size=batch_size,
            show_progress_bar=show_progress,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return np.asarray(result, dtype=np.float32)


def choose_device(requested: str) -> torch.device:
    if requested == "auto":
        # Match the production Embedder's CUDA/CPU choice.
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device = torch.device(requested)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available")
    return device


def make_encoder(
    model_name: str,
    backend: str,
    device: torch.device,
    query_prefix: str,
    passage_prefix: str,
):
    is_e5 = model_name.lower().startswith("intfloat/multilingual-e5-")
    if backend == "auto":
        backend = "e5" if is_e5 else "sentence-transformers"
    if backend == "e5":
        if not is_e5:
            raise ValueError(
                f"The E5 adapter is intended for intfloat/multilingual-e5-* models: {model_name}"
            )
        return E5Encoder(model_name, device), backend
    return (
        SentenceTransformerEncoder(
            model_name, device, query_prefix=query_prefix, passage_prefix=passage_prefix
        ),
        backend,
    )


def retrieval_metrics(
    documents: list[tuple[str, str]],
    query_embeddings: np.ndarray,
    document_embeddings: np.ndarray,
    cases: list[QueryCase],
    top_ks: list[int],
    query_batch_size: int,
) -> dict[str, float]:
    """Compute hit/recall/MRR for exact relevant-document IDs."""
    max_k = min(max(top_ks), len(document_embeddings))
    doc_index = {doc_id: index for index, (doc_id, _) in enumerate(documents)}
    # Use argpartition before sorting each short top-k slice.
    reciprocal_ranks = {k: 0.0 for k in top_ks}
    hit_counts = {k: 0 for k in top_ks}
    recall_sums = {k: 0.0 for k in top_ks}

    for start in range(0, len(cases), query_batch_size):
        end = min(start + query_batch_size, len(cases))
        scores = query_embeddings[start:end] @ document_embeddings.T
        candidates = np.argpartition(-scores, kth=max_k - 1, axis=1)[:, :max_k]
        candidate_scores = np.take_along_axis(scores, candidates, axis=1)
        order = np.argsort(-candidate_scores, axis=1)
        ranked = np.take_along_axis(candidates, order, axis=1)

        for offset, ranked_indices in enumerate(ranked):
            relevant_indices = {
                doc_index[doc_id] for doc_id in cases[start + offset].relevant_doc_ids
            }
            relevant_ranks = [
                rank + 1 for rank, doc_index_value in enumerate(ranked_indices)
                if int(doc_index_value) in relevant_indices
            ]
            for k in top_ks:
                within_k = [rank for rank in relevant_ranks if rank <= k]
                if within_k:
                    hit_counts[k] += 1
                    reciprocal_ranks[k] += 1.0 / within_k[0]
                recall_sums[k] += len(within_k) / len(relevant_indices)

    count = len(cases)
    metrics: dict[str, float] = {}
    for k in top_ks:
        metrics[f"hit_rate@{k}"] = hit_counts[k] / count
        metrics[f"recall@{k}"] = recall_sums[k] / count
        metrics[f"mrr@{k}"] = reciprocal_ranks[k] / count
    return metrics


def parse_top_ks(value: str) -> list[int]:
    try:
        ks = sorted({int(part.strip()) for part in value.split(",")})
    except ValueError as exc:
        raise argparse.ArgumentTypeError("top-k values must be comma-separated integers") from exc
    if not ks or ks[0] < 1:
        raise argparse.ArgumentTypeError("top-k values must be positive integers")
    return ks


def run_model(args, model_name: str, datasets: list[RetrievalDataset]) -> dict:
    device = choose_device(args.device)
    encoder, backend = make_encoder(
        model_name, args.backend, device, args.query_prefix, args.passage_prefix
    )
    print(f"\nМодель: {model_name} | backend={backend} | device={device}", flush=True)

    model_report: dict = {"model": model_name, "backend": backend, "device": str(device), "datasets": {}}
    for dataset in datasets:
        doc_texts = [text for _, text in dataset.documents]
        query_texts = [case.text for case in dataset.queries]
        print(
            f"  {dataset.name}: {len(query_texts):,} вопросов, "
            f"{len(doc_texts):,} документов",
            flush=True,
        )

        print("    кодирую документы...", flush=True)
        started = time.perf_counter()
        doc_embeddings = encoder.encode(
            doc_texts, "passage", args.batch_size, not args.no_progress
        )
        document_seconds = time.perf_counter() - started
        print("    кодирую вопросы...", flush=True)
        started = time.perf_counter()
        query_embeddings = encoder.encode(
            query_texts, "query", args.batch_size, not args.no_progress
        )
        query_seconds = time.perf_counter() - started

        started = time.perf_counter()
        metrics = retrieval_metrics(
            dataset.documents,
            query_embeddings,
            doc_embeddings,
            dataset.queries,
            args.top_k,
            args.score_batch_size,
        )
        search_seconds = time.perf_counter() - started

        print(
            f"  {dataset.name}: docs={document_seconds:.1f}s, "
            f"queries={query_seconds:.1f}s, ranking={search_seconds:.1f}s",
            flush=True,
        )
        for metric, value in metrics.items():
            print(f"    {metric}: {value:.4f} ({value * 100:.2f}%)", flush=True)

        model_report["datasets"][dataset.name] = {
            "query_count": len(query_texts),
            "document_count": len(doc_texts),
            "embedding_dimension": int(doc_embeddings.shape[1]),
            "document_embedding_seconds": round(document_seconds, 3),
            "query_embedding_seconds": round(query_seconds, 3),
            "ranking_seconds": round(search_seconds, 3),
            "metrics": metrics,
        }
        del doc_embeddings, query_embeddings

    del encoder
    if device.type == "cuda":
        torch.cuda.empty_cache()
    return model_report


def parse_args() -> argparse.Namespace:
    try:
        from config import get_settings

        default_model = get_settings().embedding_model
    except Exception:
        default_model = "intfloat/multilingual-e5-large"

    parser = argparse.ArgumentParser(
        description="Compare embedding models on the Abitura golden set and SQuAD 1.1 dev."
    )
    parser.add_argument(
        "--models",
        default=default_model,
        help="Comma-separated Hugging Face model IDs (default: configured embedding model).",
    )
    parser.add_argument(
        "--datasets",
        default="golden,squad",
        help="Comma-separated datasets: golden, squad, or both (default: golden,squad).",
    )
    parser.add_argument(
        "--backend",
        choices=("auto", "e5", "sentence-transformers"),
        default="auto",
        help="auto selects the E5-compatible implementation for multilingual-e5 and SentenceTransformers for other models.",
    )
    parser.add_argument("--device", default="auto", help="auto, cpu, or cuda (default: auto).")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--score-batch-size", type=int, default=128)
    parser.add_argument("--top-k", type=parse_top_ks, default=parse_top_ks("1,5,10"))
    parser.add_argument("--query-prefix", default="", help="Optional prefix for query texts in the sentence-transformers backend.")
    parser.add_argument("--passage-prefix", default="", help="Optional prefix for document texts in the sentence-transformers backend.")
    parser.add_argument("--output", type=Path, help="JSON report path (default: timestamped file in eval/results/).")
    parser.add_argument("--no-progress", action="store_true", help="Disable embedding progress bars.")
    args = parser.parse_args()
    if args.batch_size < 1 or args.score_batch_size < 1:
        parser.error("batch sizes must be positive")
    args.models = [item.strip() for item in args.models.split(",") if item.strip()]
    dataset_names = [item.strip().lower() for item in args.datasets.split(",") if item.strip()]
    if not args.models:
        parser.error("provide at least one model")
    if not dataset_names or any(name not in {"golden", "squad"} for name in dataset_names):
        parser.error("--datasets accepts golden and/or squad")
    args.dataset_names = list(dict.fromkeys(dataset_names))
    return args


def main() -> int:
    args = parse_args()
    dataset_loaders = {"golden": load_golden_dataset, "squad": load_squad_dataset}
    datasets = [dataset_loaders[name]() for name in args.dataset_names]
    print("Оценка качества поиска эмбеддеров", flush=True)
    for dataset in datasets:
        print(
            f"Датасет {dataset.name}: {len(dataset.queries):,} вопросов / "
            f"{len(dataset.documents):,} документов",
            flush=True,
        )

    started = time.perf_counter()
    model_reports = [run_model(args, model_name, datasets) for model_name in args.models]
    output_path = args.output
    if output_path is None:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = EVAL_DIR / "results" / f"embedding_eval_{stamp}.json"
    elif not output_path.is_absolute():
        output_path = PROJECT_ROOT / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "datasets": [dataset.name for dataset in datasets],
        "models": model_reports,
    }
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nJSON-отчёт сохранён: {output_path}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nОценка прервана пользователем.", file=sys.stderr)
        raise SystemExit(130)
