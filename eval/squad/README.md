# SQuAD 1.1 evaluation data

This directory contains only the public SQuAD 1.1 development split for evaluation.

- `dev-v1.1.json` — 10,570 questions from 48 Wikipedia articles and 2,067 paragraphs.
- The Kaggle archive also contained `train-v1.1.json`; it is intentionally not part of this evaluation directory.
- The JSON is kept in the original SQuAD structure. Each question's answer text and character offset are in `answers.text` and `answers.answer_start`.

## Source and license

Downloaded from the public Kaggle dataset [`stanfordu/stanford-question-answering-dataset`](https://www.kaggle.com/datasets/stanfordu/stanford-question-answering-dataset) on 2026-09-25. The dataset is distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) according to the [official SQuAD site](https://rajpurkar.github.io/SQuAD-explorer/). Preserve attribution and the license when redistributing it.

SHA-256 of `dev-v1.1.json`:

```text
95aa6a52d5d6a735563366753ca50492a658031da74f301ac5238b03966972c9
```

## Use in the embedding benchmark

Use each SQuAD paragraph as a retrieval document and its questions as queries. A retrieved paragraph is relevant when it contains one of the annotated answer spans. Compare embedding models with retrieval metrics such as Recall@k and MRR. For the downstream answer check, keep the LLM and prompt fixed across embedding models and compare generated answers with the annotated spans using Exact Match and token F1.

SQuAD 1.1 contains answerable questions only. It does not measure whether the system abstains when the context lacks an answer; use SQuAD 2.0 for that evaluation.
