from functools import lru_cache

from gigachat import GigaChat
from gigachat.models import Chat, Messages, MessagesRole

from config import Settings, get_settings


@lru_cache(maxsize=2)
def _create_client(credentials: str, verify_ssl: bool, model: str) -> GigaChat:
    return GigaChat(
        credentials=credentials,
        verify_ssl_certs=verify_ssl,
        model=model,
    )


def get_client(settings: Settings | None = None) -> GigaChat:
    settings = settings or get_settings()
    return _create_client(
        settings.require_gigachat_credentials(),
        settings.gigachat_verify_ssl,
        settings.gigachat_model,
    )


def call_llm(
    prompt: str,
    temperature: float = 0.0,
    max_tokens: int = 700,
    *,
    settings: Settings | None = None,
) -> str:
    if not prompt.strip():
        raise ValueError("prompt must not be empty")
    if not 0.0 <= temperature <= 2.0:
        raise ValueError("temperature must be between 0 and 2")
    if max_tokens <= 0:
        raise ValueError("max_tokens must be positive")

    settings = settings or get_settings()
    client = get_client(settings)

    request = Chat(
        messages=[
            Messages(role=MessagesRole.USER, content=prompt)
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        model=settings.gigachat_model,
    )

    response = client.chat(request)
    if not response.choices or not response.choices[0].message.content:
        raise RuntimeError("GigaChat returned an empty response")
    return response.choices[0].message.content.strip()
