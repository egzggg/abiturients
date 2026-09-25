import unittest

from llm.giga_generator import (
    MAX_CHUNK_CHARS,
    build_rag_prompt,
    generate_rag_answer,
)


class GeneratorTests(unittest.TestCase):
    def test_empty_retrieval_skips_llm(self):
        def fail(*_args, **_kwargs):
            raise AssertionError("LLM must not be called")

        self.assertEqual(
            generate_rag_answer("question", [], llm=fail),
            "Информация отсутствует в документах.",
        )

    def test_generation_and_verification_use_injected_llm(self):
        calls = []

        def llm(prompt, **kwargs):
            calls.append((prompt, kwargs))
            return "draft" if len(calls) == 1 else "verified"

        result = generate_rag_answer(
            "question",
            [{"content": "fact", "score": 0.9}],
            llm=llm,
        )
        self.assertEqual(result, "verified")
        self.assertEqual([call[1]["temperature"] for call in calls], [0.0, 0.1])
        self.assertIn("draft", calls[1][0])

    def test_prompt_marks_and_bounds_untrusted_context(self):
        prompt = build_rag_prompt("question", [{"content": "x" * 10_000}])
        self.assertIn("недоверенные данные", prompt)
        self.assertNotIn("x" * (MAX_CHUNK_CHARS + 1), prompt)


if __name__ == "__main__":
    unittest.main()
