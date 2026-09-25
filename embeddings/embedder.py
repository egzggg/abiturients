from typing import Literal

import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel

from config import get_settings


class Embedder:
    def __init__(self, model_name: str | None = None):
        model_name = model_name or get_settings().embedding_model
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name)

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.model.eval()

    @staticmethod
    def mean_pooling(model_output, attention_mask):
        token_embeddings = model_output[0]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)

    def embedding(
        self,
        text: str,
        kind: Literal["query", "passage"] = "passage",
    ):
        text = text.strip()
        if not text:
            raise ValueError("text must not be empty")

        if not text.startswith(("passage:", "query:")):
            text = f"{kind}: {text}"

        encoded = self.tokenizer(
            text,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt"
        ).to(self.device)

        with torch.inference_mode():
            model_output = self.model(**encoded)

        emb = self.mean_pooling(model_output, encoded["attention_mask"])
        emb = F.normalize(emb, p=2, dim=1)

        return emb[0].cpu().numpy()

    def embed_query(self, text: str):
        return self.embedding(text, kind="query")

    def embed_passage(self, text: str):
        return self.embedding(text, kind="passage")
