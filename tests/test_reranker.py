import unittest

from llm.reranker import _parse_indexes, rerank_chunks


class RerankerTests(unittest.TestCase):
    def setUp(self):
        self.chunks = [{"content": f"chunk-{index}"} for index in range(6)]

    def test_parser_accepts_explanatory_response_and_deduplicates(self):
        self.assertEqual(_parse_indexes("Индексы: 3, 3, 99 и 1", 6), [3, 1])

    def test_partial_response_is_filled_from_original_ranking(self):
        result = rerank_chunks(
            "question",
            self.chunks,
            top_k=4,
            llm=lambda *_args, **_kwargs: "3, 1",
        )
        self.assertEqual([chunk["content"] for chunk in result], [
            "chunk-3",
            "chunk-1",
            "chunk-0",
            "chunk-2",
        ])

    def test_llm_error_falls_back_to_original_ranking(self):
        def fail(*_args, **_kwargs):
            raise TimeoutError

        result = rerank_chunks("question", self.chunks, top_k=2, llm=fail)
        self.assertEqual(result, self.chunks[:2])


if __name__ == "__main__":
    unittest.main()
