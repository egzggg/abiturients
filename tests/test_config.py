import os
import unittest
from unittest.mock import patch

from config import Settings


class SettingsTests(unittest.TestCase):
    def test_secure_defaults_and_project_relative_log_dir(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings.from_env()

        self.assertTrue(settings.gigachat_verify_ssl)
        self.assertEqual(settings.embedding_dimension, 1024)
        self.assertTrue(settings.log_dir.is_absolute())

    def test_invalid_boolean_fails_fast(self):
        with patch.dict(os.environ, {"GIGACHAT_VERIFY_SSL": "perhaps"}, clear=True):
            with self.assertRaisesRegex(ValueError, "boolean"):
                Settings.from_env()

    def test_credentials_are_required_only_when_used(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings.from_env()

        with self.assertRaisesRegex(RuntimeError, "GIGACHAT_CREDENTIALS"):
            settings.require_gigachat_credentials()
        with self.assertRaisesRegex(RuntimeError, "TELEGRAM_BOT_TOKEN"):
            settings.require_telegram_token()


if __name__ == "__main__":
    unittest.main()
