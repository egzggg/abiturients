"""Dashboard question creation, grading and single-question generation."""
from __future__ import annotations

import argparse
import base64
from contextlib import closing, redirect_stdout
import json
import os
from pathlib import Path
import sqlite3
import sys

from sqlite_answers import FIELDS


class ActionError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def generation_config() -> dict:
    # Reuse the same .env loading and credentials as the existing CLI.
    import RAG_HP  # noqa: F401
    configured = os.getenv('YANDEX_MODELS', '')
    models = [value.strip() for value in configured.split(',') if value.strip()] if configured else [
        os.getenv('YANDEX_MODEL', 'gpt-oss-120b/latest'),
        'deepseek-v4-flash/latest', 'aliceai-llm', 'aliceai-llm-flash',
        'yandexgpt-5.1', 'yandexgpt-5-lite',
    ]
    return {
        'models': list(dict.fromkeys(models)),
        'configured': bool(os.getenv('YANDEX_API_KEY') and os.getenv('YANDEX_CLOUD_FOLDER')),
    }


def record(connection: sqlite3.Connection, answer_id: int) -> dict:
    connection.row_factory = sqlite3.Row
    row = connection.execute('SELECT ' + ', '.join(FIELDS) + ' FROM answers WHERE id = ?', (answer_id,)).fetchone()
    if row is None:
        raise ActionError('Вопрос не найден.', 404)
    return dict(row)


def create_question(db_path: Path, question: str, model: str) -> dict:
    from RAG_HP import initialize_sqlite_database
    question = question.strip()
    if not question or len(question) > 20000:
        raise ActionError('Введите вопрос длиной до 20 000 символов.')
    if model not in generation_config()['models']:
        raise ActionError('Выберите модель из списка Yandex API.')
    initialize_sqlite_database(db_path)
    with closing(sqlite3.connect(db_path, timeout=5)) as connection, connection:
        cursor = connection.execute('INSERT INTO answers (request, llm_model) VALUES (?, ?)', (question, model))
        return record(connection, cursor.lastrowid)


def update_grades(db_path: Path, answer_id: int, grades: dict) -> dict:
    allowed = {'manual_grade', 'llm_grade', 'llm_judge_model'}
    if not grades or not set(grades).issubset(allowed):
        raise ActionError('Некорректные поля оценки.')
    if any(not isinstance(value, str) or len(value) > 20000 for value in grades.values()):
        raise ActionError('Оценки должны быть текстом длиной до 20 000 символов.')
    if not db_path.is_file():
        raise ActionError('Вопрос не найден.', 404)
    with closing(sqlite3.connect(db_path, timeout=5)) as connection, connection:
        record(connection, answer_id)
        connection.execute(
            'UPDATE answers SET ' + ', '.join(f'{field} = ?' for field in grades) + ' WHERE id = ?',
            [*(value.strip() for value in grades.values()), answer_id],
        )
        return record(connection, answer_id)


def generate_answer(db_path: Path, answer_id: int) -> dict:
    from RAG_HP import DEFAULT_DATA_DIR, clean_response, create_rag_query_engine
    if not db_path.is_file():
        raise ActionError('Вопрос не найден.', 404)
    with closing(sqlite3.connect(db_path, timeout=5)) as connection:
        existing = record(connection, answer_id)
    if str(existing['answer'] or '').strip():
        raise ActionError('У этого вопроса уже есть ответ.', 409)
    if not str(existing['request'] or '').strip():
        raise ActionError('У записи нет вопроса.')
    config = generation_config()
    if existing['llm_model'] not in config['models']:
        raise ActionError('Модель этой записи недоступна через Yandex API.')
    if not config['configured']:
        raise ActionError('Задайте YANDEX_API_KEY и YANDEX_CLOUD_FOLDER на сервере.', 503)
    scope = os.getenv('HP_BOOK_SCOPE', 'романе «Гарри Поттер и философский камень»')
    engine = create_rag_query_engine(Path(os.getenv('EVAL_RAG_DATA_DIR', str(DEFAULT_DATA_DIR))), scope, existing['llm_model'])
    response = engine.query(existing['request']).response
    answer = clean_response(str(response))
    if not answer:
        raise ActionError('Модель вернула пустой ответ. Попробуйте ещё раз.', 502)
    with closing(sqlite3.connect(db_path, timeout=5)) as connection, connection:
        cursor = connection.execute(
            "UPDATE answers SET answer = ? WHERE id = ? AND TRIM(COALESCE(answer, '')) = ''",
            (answer, answer_id),
        )
        if not cursor.rowcount:
            raise ActionError('Ответ уже сохранён другим запросом.', 409)
        return record(connection, answer_id)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--db-path', type=Path, required=True)
    parser.add_argument('--action', choices=('config', 'create', 'grade', 'generate', 'import'), required=True)
    args = parser.parse_args()
    try:
        payload = json.load(sys.stdin)
        # Existing RAG functions log progress; keep stdout a single JSON response.
        with redirect_stdout(sys.stderr):
            if args.action == 'config':
                result = generation_config()
            elif args.action == 'create':
                result = create_question(args.db_path, payload['question'], payload['model'])
            elif args.action == 'grade':
                result = update_grades(args.db_path, payload['id'], payload['grades'])
            elif args.action == 'import':
                from question_clusters import import_questions
                try:
                    result = import_questions(args.db_path, base64.b64decode(payload['content'], validate=True), payload['filename'], payload['model'])
                except ValueError as error:
                    raise ActionError(str(error)) from error
            else:
                result = generate_answer(args.db_path, payload['id'])
        print(json.dumps({'data': result}, ensure_ascii=False))
    except ActionError as error:
        print(json.dumps({'error': str(error), 'status': error.status}, ensure_ascii=False))
    except Exception:
        # Provider exceptions can contain credentials or request data.
        message = 'Не удалось получить ответ. Проверьте настройки Yandex API и RAG на сервере; вопрос сохранён, запуск можно повторить.' if args.action == 'generate' else 'Не удалось сохранить данные. Проверьте доступность базы на сервере.'
        print(json.dumps({'error': message, 'status': 502 if args.action == 'generate' else 500}, ensure_ascii=False))


if __name__ == '__main__':
    main()
