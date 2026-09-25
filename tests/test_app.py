import unittest
from unittest.mock import patch

from app.main import run_rag


class FakeRetriever:
    def __init__(self):
        self.questions = []

    def get_top_chunks(self, question):
        self.questions.append(question)
        return [
            {"content": "low", "score": 0.1},
            {"content": "high", "score": 0.9},
        ]


class AppPipelineTests(unittest.TestCase):
    @patch("app.main.log_chunks")
    @patch("app.main.log_question")
    def test_pipeline_normalizes_question_and_injects_dependencies(
        self, log_question, log_chunks
    ):
        retriever = FakeRetriever()

        def answer_generator(*, query, chunks):
            self.assertEqual(query, "question")
            self.assertEqual([chunk["content"] for chunk in chunks], ["high", "low"])
            return "answer"

        result = run_rag(
            "  question  ",
            retriever=retriever,
            answer_generator=answer_generator,
        )

        self.assertEqual(result, "answer")
        self.assertEqual(retriever.questions, ["question"])
        log_question.assert_called_once_with("question")
        log_chunks.assert_called_once()

    @patch("app.main.log_question")
    def test_empty_question_skips_pipeline(self, log_question):
        self.assertEqual(run_rag("  "), "Пожалуйста, задайте непустой вопрос.")
        log_question.assert_not_called()


if __name__ == "__main__":
    unittest.main()
