# RAG Abitura

RAG-бот для ответов на вопросы абитуриентов по документам Волгатеха. Система
объединяет поиск по базе знаний и индексу эталонных вопросов, переранжирует
результаты через GigaChat и публикует ответы в Telegram.

## Структура данных

- `source/` — исходные Markdown-документы;
- `chunks/` — JSON-массивы чанков (`id`, `source`, `section`, `content`);
- `CQs/` — эталонные вопросы и их варианты;
- `storage/` — создание, загрузка и диагностика хранилищ;
- `top_chunks/` — объединённый retrieval из Qdrant;
- `llm/` — переранжирование, генерация и проверка ответа;
- `app/` — Telegram-приложение.

## Локальный запуск

Требуется Python 3.11+ и Docker.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Заполните в `.env` как минимум `TELEGRAM_BOT_TOKEN` и
`GIGACHAT_CREDENTIALS`. Реальные секреты нельзя коммитить. Проверка TLS для
GigaChat включена по умолчанию; отключайте её только в контролируемой среде.

Поднимите инфраструктуру и заполните Qdrant:

```bash
make infra
make createCollections
make runLoadKB
make runLoadQueries
```

Первый запуск загрузчиков скачивает модель
`intfloat/multilingual-e5-large` и может занять продолжительное время.
Повторные загрузки идемпотентны: точки получают стабильные идентификаторы и
обновляются, а не дублируются.

Запуск бота и тестов:

```bash
make runApplication
make test
```

Для разового CLI-запроса используйте
`make runSearchChunksTest QUESTION="Какие направления обучения доступны?"`.

## Оценка embedding-моделей

Запустите сравнение текущего эмбеддера на golden-наборе Волгатеха и SQuAD 1.1:

```bash
make evalEmbeddings
```

Метрики `hit_rate@k`, `recall@k` и `mrr@k` выводятся в терминал. Подробный JSON
с результатами и временем расчёта сохраняется в `eval/results/`. По умолчанию
используется `EMBEDDING_MODEL` из `.env` (или
`intfloat/multilingual-e5-large`). Можно ограничить прогон одним набором:

```bash
make evalEmbeddings EVAL_ARGS="--datasets golden"
```

Для одновременного сравнения E5, BGE-M3 и GTE установите дополнительный backend
и перечислите модели:

```bash
.venv/bin/pip install sentence-transformers
make evalEmbeddings EVAL_ARGS="--models intfloat/multilingual-e5-large,intfloat/multilingual-e5-base,BAAI/bge-m3,Alibaba-NLP/gte-multilingual-base"
```

E5 оценивается с теми же префиксами, усреднением токенов и нормализацией, что и
производственный `Embedder`. SQuAD измеряет поиск по англоязычным абзацам; для
выбора модели для бота отдельно смотрите результат `abitura_golden` на русском
корпусе.

## Конфигурация

Все параметры описаны в `.env.example`. Основные:

- `QDRANT_HOST`, `QDRANT_PORT` — адрес Qdrant;
- `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION` — модель и размерность коллекций;
- `RETRIEVAL_MIN_KB_SCORE` — минимальный score прямого поиска;
- `RETRIEVAL_CQ_BOOST` — вес результатов индекса эталонных вопросов;
- `LOG_DIR` — каталог JSONL-логов.

Если меняется embedding-модель или размерность, коллекции необходимо пересоздать
явной командой `python -m storage.deleteCollection.main --yes`, а затем снова
выполнить шаги создания и загрузки.

## Безопасность и эксплуатация

- Ошибки внешних сервисов пишутся в серверный лог, но не раскрываются
  пользователю Telegram.
- Текст найденных документов считается недоверенным контекстом; промпты требуют
  игнорировать инструкции внутри чанков.
- Вопросы и найденные чанки записываются в `logs/*.jsonl`. Учитывайте это при
  настройке срока хранения и доступа к пользовательским данным.
