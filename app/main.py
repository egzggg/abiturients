import asyncio
import logging
from functools import lru_cache
from typing import Callable

from config import get_settings
from llm.giga_generator import generate_rag_answer
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from top_chunks.retriever import TopChunksRetriever
from utils.logger import log_chunks, log_question

logger = logging.getLogger(__name__)


# ---------------- RAG PIPELINE ----------------

@lru_cache(maxsize=1)
def get_retriever() -> TopChunksRetriever:
    """Load the embedding model once per process, not once per message."""
    return TopChunksRetriever()


def run_rag(
    question: str,
    *,
    retriever: TopChunksRetriever | None = None,
    answer_generator: Callable[..., str] = generate_rag_answer,
) -> str:
    question = question.strip()
    if not question:
        return "Пожалуйста, задайте непустой вопрос."

    log_question(question)
    retriever = retriever or get_retriever()
    chunks = retriever.get_top_chunks(question)
    chunks = sorted(
        chunks,
        key=lambda x: x.get("score", 0),
        reverse=True,
    )[:5]
    log_chunks(question, chunks)

    return answer_generator(query=question, chunks=chunks)


# ---------------- HANDLERS ----------------

async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    if update.message is None:
        return
    await update.message.reply_text(
        "Привет 👋 Я RAG-бот по поступлению. Задай вопрос."
    )


async def handle_message(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    if update.message is None or update.message.text is None:
        return
    user_text = update.message.text

    await update.message.reply_text("⏳ Думаю...")

    try:
        # Retrieval and LLM clients are synchronous; keep the bot event loop free.
        answer = await asyncio.to_thread(run_rag, user_text)

    except Exception:
        logger.exception("Failed to answer Telegram message")
        answer = "Не удалось обработать вопрос. Попробуйте ещё раз позже."

    await update.message.reply_text(answer)


# ---------------- MAIN ----------------

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    token = get_settings().require_telegram_token()

    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", start))

    app.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND,
            handle_message,
        )
    )

    print("Bot started...")

    app.run_polling()


if __name__ == "__main__":
    main()
