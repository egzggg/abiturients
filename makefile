PYTHON := $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)
QUESTION ?= Какие направления обучения доступны?

.PHONY: infra createCollections runLoadKB runLoadQueries runLoadQdr \
	runChunk runSearchChunksTest runApplication test

infra:
	docker compose up -d redis qdrant

createCollections:
	$(PYTHON) -m storage.createCollection.main

runLoadKB:
	$(PYTHON) -m storage.load_knowledge_base_to_Qdrant

runLoadQueries:
	$(PYTHON) -m storage.load_query_index_to_Qdrant

# Backward-compatible alias.
runLoadQdr: runLoadKB

runChunk:к
	$(PYTHON) -m top_chunks.main "$(QUESTION)"
runSearchChunksTest:
	$(PYTHON) -m llm.main "$(QUESTION)"

runApplication:
	$(PYTHON) -m app.main

test:
	$(PYTHON) -m unittest discover -s tests -v
