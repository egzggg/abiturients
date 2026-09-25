import unittest
from dataclasses import replace
from types import SimpleNamespace

from config import Settings
from top_chunks.retriever import TopChunksRetriever


class FakeEmbedder:
    def __init__(self):
        self.queries = []

    def embed_query(self, text):
        self.queries.append(text)
        return [0.1, 0.2]


class FakeClient:
    def __init__(self, cq_points, kb_points):
        self._results = [cq_points, kb_points]
        self.calls = []

    def query_points(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(points=self._results.pop(0))


def point(point_id, score, payload):
    return SimpleNamespace(id=point_id, score=score, payload=payload)


class RetrieverTests(unittest.TestCase):
    def test_merges_filters_and_deduplicates_candidates(self):
        settings = replace(
            Settings.from_env(),
            retrieval_min_kb_score=0.78,
            retrieval_result_limit=10,
        )
        cq = point(
            "cq-1",
            0.8,
            {"matched_chunk_payload": {
                "chunk_id": "shared",
                "source": "doc",
                "section": "s",
                "content": "answer",
            }},
        )
        duplicate_kb = point(
            "kb-1",
            0.95,
            {"chunk_id": "shared", "source": "doc", "content": "answer"},
        )
        low_score_kb = point(
            "kb-2",
            0.2,
            {"chunk_id": "low", "source": "doc", "content": "irrelevant"},
        )
        same_id_other_source = point(
            "kb-3",
            0.80,
            {"chunk_id": "shared", "source": "other-doc", "content": "other"},
        )
        client = FakeClient(
            [cq], [duplicate_kb, same_id_other_source, low_score_kb]
        )
        embedder = FakeEmbedder()
        retriever = TopChunksRetriever(
            client=client,
            embedder=embedder,
            settings=settings,
        )

        result = retriever.get_top_chunks("  admission  ")

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["retrieval_type"], "CQ")
        self.assertEqual(result[1]["source"], "other-doc")
        self.assertEqual(embedder.queries, ["admission"])
        self.assertTrue(all(call["with_vectors"] is False for call in client.calls))

    def test_empty_query_does_not_call_services(self):
        client = FakeClient([], [])
        retriever = TopChunksRetriever(
            client=client,
            embedder=FakeEmbedder(),
            settings=Settings.from_env(),
        )
        self.assertEqual(retriever.get_top_chunks("  "), [])
        self.assertEqual(client.calls, [])


if __name__ == "__main__":
    unittest.main()
