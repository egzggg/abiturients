import json
import unittest
from pathlib import Path

from config import PROJECT_ROOT


class KnowledgeDataIntegrityTests(unittest.TestCase):
    def _validate_directory(self, folder, id_key, required_keys):
        seen = set()
        count = 0
        for path in sorted((PROJECT_ROOT / folder).glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertIsInstance(data, list, path)
            for index, item in enumerate(data):
                location = f"{path}:{index}"
                self.assertIsInstance(item, dict, location)
                self.assertTrue(required_keys <= item.keys(), location)
                self.assertTrue(str(item[id_key]).strip(), location)
                self.assertTrue(str(item["source"]).strip(), location)
                composite_id = (item["source"], item[id_key])
                self.assertNotIn(composite_id, seen, location)
                seen.add(composite_id)
                count += 1
        self.assertGreater(count, 0)

    def test_chunks_have_required_fields_and_source_scoped_unique_ids(self):
        self._validate_directory(
            "chunks",
            "id",
            {"id", "source", "section", "content"},
        )

    def test_cqs_have_required_fields_and_source_scoped_unique_ids(self):
        self._validate_directory(
            "CQs",
            "cqs_id",
            {"cqs_id", "source", "query", "variations"},
        )


if __name__ == "__main__":
    unittest.main()
