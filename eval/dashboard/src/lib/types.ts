export const MODEL_CATALOG = [
  {
    id: "intfloat/multilingual-e5-large",
    name: "Multilingual E5 Large",
    family: "intfloat",
    dimension: 1024,
    tag: "Baseline",
    color: "#74e3bd",
  },
  {
    id: "intfloat/multilingual-e5-base",
    name: "Multilingual E5 Base",
    family: "intfloat",
    dimension: 768,
    tag: "Base",
    color: "#57c9a4",
  },
  {
    id: "intfloat/multilingual-e5-large-instruct",
    name: "Multilingual E5 Large Instruct",
    family: "intfloat",
    dimension: 1024,
    tag: "Instruct",
    color: "#72aee8",
  },
  {
    id: "intfloat/multilingual-e5-small",
    name: "Multilingual E5 Small",
    family: "intfloat",
    dimension: 384,
    tag: "ONNX",
    color: "#86d3b5",
  },
  {
    id: "Alibaba-NLP/gte-Qwen2-1.5B-instruct",
    name: "GTE Qwen2 1.5B",
    family: "Alibaba NLP",
    dimension: 1536,
    tag: "1.5B",
    color: "#9e9af8",
  },
  {
    id: "Alibaba-NLP/gte-multilingual-base",
    name: "GTE Multilingual Base",
    family: "Alibaba NLP",
    dimension: 768,
    tag: "ONNX",
    color: "#bbb0fb",
  },
  {
    id: "Qwen/Qwen3-Embedding-0.6B",
    name: "Qwen3 Embedding 0.6B",
    family: "Qwen",
    dimension: 1024,
    tag: "0.6B",
    color: "#d89160",
  },
  {
    id: "Qwen/Qwen3-Embedding-4B-GGUF",
    name: "Qwen3 Embedding 4B",
    family: "Qwen",
    dimension: 2560,
    tag: "4B",
    color: "#efa879",
  },
  {
    id: "Qwen/Qwen3-Embedding-8B-GGUF",
    name: "Qwen3 Embedding 8B",
    family: "Qwen",
    dimension: 4096,
    tag: "8B",
    color: "#83b6f5",
  },
  {
    id: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    name: "Multilingual MiniLM L12",
    family: "Sentence Transformers",
    dimension: 384,
    tag: "ONNX",
    color: "#e2ac70",
  },
  {
    id: "BAAI/bge-m3",
    name: "BGE M3",
    family: "BAAI",
    dimension: 1024,
    tag: "ONNX",
    color: "#e78c9f",
  },
] as const;
export type DatasetKey = "abitura_golden" | "squad_dev";
export type DatasetStats = {
  key: DatasetKey;
  cli: "golden" | "squad";
  name: string;
  language: string;
  queries: number;
  documents: number;
  available: boolean;
};
export type DatasetResult = {
  query_count: number;
  document_count: number;
  embedding_dimension: number;
  document_embedding_seconds: number;
  query_embedding_seconds: number;
  query_latency_p95_ms?: number;
  ranking_seconds: number;
  metrics: Record<string, number>;
};
export type ModelResult = {
  model: string;
  backend: string;
  device: string;
  datasets: Partial<Record<DatasetKey, DatasetResult>>;
};
export type Report = {
  file: string;
  created_at_utc: string;
  elapsed_seconds: number;
  datasets: string[];
  models: ModelResult[];
};
export type Job = {
  id: string;
  status: "running" | "cancelling" | "completed" | "failed" | "cancelled";
  models: string[];
  datasets: string[];
  device: string;
  batchSize: number;
  startedAt: string;
  endedAt?: string;
  outputFile: string;
  logs: string;
  error?: string;
};
export type ResultRow = {
  report: Report;
  model: ModelResult;
  result: DatasetResult;
};
export const baseModelId = (id: string) => id.split("#", 1)[0];
export const promptVariantId = (id: string) => id.split("#")[1] ?? "default_query_prompt";
export function promptLabel(variant: string) {
  switch (variant) {
    case "default_query_prompt": return "Стандартная инструкция";
    case "applicant_task_prompt": return "Инструкция для вопросов абитуриентов";
    case "web_task_prompt": return "Инструкция для веб-поиска";
    case "onnx_int8": return "ONNX int8";
    default: return variant.replaceAll("_", " ");
  }
}
export function modelLabel(id: string) {
  const model = baseModelId(id);
  const variant = id.includes("#") ? promptVariantId(id) : undefined;
  const label = MODEL_CATALOG.find((m) => m.id === model)?.name ?? model.split("/").pop() ?? model;
  return variant ? `${label} · ${promptLabel(variant)}` : label;
}
export function resultRows(
  reports: Report[],
  dataset: DatasetKey,
): ResultRow[] {
  return reports
    .flatMap((report) =>
      report.models.flatMap((model) => {
        const result = model.datasets[dataset];
        return result ? [{ report, model, result }] : [];
      }),
    )
    .sort(
      (a, b) =>
        Date.parse(b.report.created_at_utc) -
        Date.parse(a.report.created_at_utc),
    );
}
export function latestByModel(rows: ResultRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.model.model)) return false;
    seen.add(row.model.model);
    return true;
  });
}
