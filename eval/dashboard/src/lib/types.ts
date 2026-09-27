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
    tag: "Compact",
    color: "#9e9af8",
  },
  {
    id: "BAAI/bge-m3",
    name: "BGE-M3",
    family: "BAAI",
    dimension: 1024,
    tag: "Multilingual",
    color: "#efa879",
  },
  {
    id: "Alibaba-NLP/gte-multilingual-base",
    name: "GTE Multilingual",
    family: "Alibaba NLP",
    dimension: 768,
    tag: "Multilingual",
    color: "#83b6f5",
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
export function modelLabel(id: string) {
  return (
    MODEL_CATALOG.find((m) => m.id === id)?.name ?? id.split("/").pop() ?? id
  );
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
