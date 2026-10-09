"""Convert all input SQuAD JSON files into linked chunks and ground truth."""

import csv
import json
from pathlib import Path


def main() -> None:
    data_dir = Path(__file__).resolve().parent
    input_dir = data_dir / "inputDataset"
    output_dir = data_dir / "chanksGt"
    output_dir.mkdir(parents=True, exist_ok=True)
    chunks = []
    gt = []

    sources = sorted(
        path for path in input_dir.iterdir()
        if path.is_file() and path.suffix.lower() == ".json"
    )
    if not sources:
        raise FileNotFoundError(f"No JSON datasets found in {input_dir}")

    prefixes = set()
    for source in sources:
        # Keep existing train/dev IDs; use other filenames as namespaces too.
        prefix = source.stem.removesuffix("-v1.1")
        if prefix in prefixes:
            raise ValueError(f"Duplicate chunk ID prefix {prefix!r}: {source}")
        prefixes.add(prefix)
        with source.open(encoding="utf-8") as file:
            dataset = json.load(file)

        for article_index, article in enumerate(dataset["data"]):
            for paragraph_index, paragraph in enumerate(article["paragraphs"]):
                chunk_id = f"{prefix}:{article_index}:{paragraph_index}"
                chunks.append({
                    "chunk_id": chunk_id,
                    "title": article["title"],
                    "text": paragraph["context"],
                })

                for qa in paragraph["qas"]:
                    # Remove exact duplicates while preserving answer order.
                    answers = list(dict.fromkeys(
                        answer["text"] for answer in qa["answers"]
                    ))
                    gt.append({
                        "question_id": qa["id"],
                        "question": qa["question"],
                        "answers": answers,
                        "chunk_id": chunk_id,
                    })

    for filename, records in (("chunks.json", chunks), ("gt.json", gt)):
        destination = output_dir / filename
        with destination.open("w", encoding="utf-8") as file:
            json.dump(records, file, ensure_ascii=False, indent=2)
            file.write("\n")
        print(f"{filename}: {len(records)} records")

    for filename, records, fields in (
        ("chunks.csv", chunks, ["chunk_id", "title", "text"]),
        ("gt.csv", gt, ["question_id", "question", "answers", "chunk_id"]),
    ):
        destination = output_dir / filename
        with destination.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fields, delimiter="|")
            writer.writeheader()
            for record in records:
                row = record.copy()
                if "answers" in row:
                    row["answers"] = json.dumps(row["answers"], ensure_ascii=False)
                writer.writerow(row)
        print(f"{filename}: {len(records)} records")


if __name__ == "__main__":
    main()
