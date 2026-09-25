import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from storage.load_knowledge_base_to_Qdrant import _point_id, iter_chunks
from storage.load_query_index_to_Qdrant import _make_point as make_query_point


class QueryEmbedder:
    def __init__(self):
        self.text = None

    def embed_query(self, text):
        self.text = text
        return [0.1, 0.2]


class QueryClient:
    def query_points(self, **_kwargs):
        return SimpleNamespace(points=[])


class StorageTests(unittest.TestCase):
    def test_point_ids_are_stable_and_source_scoped(self):
        self.assertEqual(_point_id("a", "1"), _point_id("a", "1"))
        self.assertNotEqual(_point_id("a", "1"), _point_id("b", "1"))

    def test_chunk_files_are_read_in_deterministic_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "b.json").write_text(json.dumps([{"id": "b"}]))
            (root / "a.json").write_text(json.dumps([{"id": "a"}]))
            self.assertEqual([item["id"] for item in iter_chunks(root)], ["a", "b"])

    def test_canonical_questions_use_query_embedding_prefix(self):
        embedder = QueryEmbedder()
        point = make_query_point(
            {
                "cqs_id": "cq-1",
                "source": "doc",
                "query": "main question",
                "variations": ["variant"],
            },
            client=QueryClient(),
            embedder=embedder,
            knowledge_collection="kb",
        )
        self.assertEqual(embedder.text, "main question variant")
        self.assertEqual(point.payload["match_score"], 0.0)


if __name__ == "__main__":
    unittest.main()
