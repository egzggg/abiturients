# Eval Studio

Локальная админ-панель для сравнения embedding-моделей RAG Abitura.
Стек: Next.js App Router, React, TypeScript, Tailwind CSS, локальные компоненты
shadcn/ui на Radix и Framer Motion.

## Запуск на macOS

Нужны Node.js 20.9 или новее и npm. Проверить версии можно в Terminal:

```bash
node --version
npm --version
```

Из корня репозитория выполните:

```bash
cd eval/dashboard
npm ci
npm run dev
```

Откройте http://127.0.0.1:3000. Остановить сервер можно сочетанием Ctrl+C в
терминале, где он запущен. Команда `npm run start` запускает production-сборку
после `npm run build`.

На Windows используйте PowerShell:

```powershell
cd eval/dashboard
npm.cmd ci
npm.cmd run dev
```

Скрипты `dev` и `start` слушают только локальный адрес `127.0.0.1`.

## Что доступно

- Обзор: выбор датасета результатов, метрики выбранной модели, график Hit/MRR по
  top-k, время кодирования запроса и таблица последних результатов всех моделей
  и вариантов промптов из сохранённых отчётов.
- Новый эксперимент: повторный запуск E5 Large на Golden/SQuAD. Отчёты E5 Instruct, Qwen3 0.6B, GTE, Qwen3 GGUF и ONNX int8 доступны для просмотра; модели с отдельными backend повторно запускают скриптами из `eval/`.
- Python evaluator запускается в корне репозитория. Вывод отображается в панели,
  завершённый JSON автоматически появляется в графиках и истории.
- Активный эксперимент можно остановить кнопкой «Остановить».
- История: сохранённые отчёты, переход к результату и скачивание оригинального JSON. В графике можно выбрать варианты промптов и ONNX int8.
- Датасеты: реальные числа вопросов и документов, доступность файлов и описание корпуса.
- Кнопка `?` объясняет метрики. Непротестированные модели отображаются без чисел.

Результаты берутся из `eval/results/*.json`; поддерживаются отчёты evaluator,
вариантные отчёты моделей и сводный ONNX int8 отчёт. Демо-метрик в приложении нет.
Каждый запуск создаёт `dashboard_<uuid>.json`. Обновление данных — каждые 4 секунды.
Статусы и логи активных заданий хранятся в памяти Next.js; постоянная история — JSON-отчёты.
Приложение рассчитано на один локальный Node.js-сервер и один активный evaluator.

## Python и модели

Для просмотра сохранённых отчётов Python не требуется. Для запуска эксперимента
на macOS/Linux панель использует `.venv/bin/python`, если он существует, иначе
ищет `python3`. На Windows используется `.venv/Scripts/python.exe` или `python`.

Чтобы подготовить окружение Python на macOS, из корня репозитория выполните:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Для моделей с backend SentenceTransformers дополнительно установите:

```bash
.venv/bin/python -m pip install sentence-transformers
```

Первый запуск модели может скачивать веса с Hugging Face. Датасеты и семантика
метрик совпадают с CLI `python -m eval.evaluate_embeddings`.

Обычно пути определяются автоматически. Если проект расположен нестандартно,
скопируйте `.env.local.example` в `.env.local` и задайте абсолютные пути, например:

```dotenv
EVAL_PROJECT_ROOT=/Users/you/path/to/RAG_abitura
EVAL_PYTHON=/Users/you/path/to/RAG_abitura/.venv/bin/python
```

## Проверка и сборка

```bash
cd eval/dashboard
npm run typecheck
npm run build
npm start
```

После запуска сервера `npm test` проверяет чтение/скачивание отчётов и валидацию API,
без запуска тяжёлой оценки.

Компоненты UI находятся в `src/components/ui/`, основной экран —
`src/components/dashboard.tsx`, чтение отчётов и запуск процессов — в `src/lib/`.
