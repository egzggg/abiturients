import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { DatasetStats, Report } from "./types";
export const PROJECT_ROOT = path.resolve(
  process.env.EVAL_PROJECT_ROOT ?? path.join(process.cwd(), "../.."),
);
export const RESULTS_DIR = path.join(PROJECT_ROOT, "eval/results");
const resultSchema = z.object({
  query_count: z.number().positive(),
  document_count: z.number().positive(),
  embedding_dimension: z.number(),
  document_embedding_seconds: z.number().nonnegative(),
  query_embedding_seconds: z.number().nonnegative(),
  ranking_seconds: z.number().nonnegative(),
  metrics: z.record(z.string(), z.number().min(0).max(1)),
});
const reportSchema = z.object({
  created_at_utc: z.string().datetime({ offset: true }),
  elapsed_seconds: z.number(),
  datasets: z.array(z.string()),
  models: z.array(
    z.object({
      model: z.string(),
      backend: z.string(),
      device: z.string(),
      datasets: z.object({
        abitura_golden: resultSchema.optional(),
        squad_dev: resultSchema.optional(),
      }),
    }),
  ),
});
export async function readReport(file: string): Promise<Report> {
  if (!/^[a-zA-Z0-9_.-]+\.json$/.test(file) || file.includes(".."))
    throw new Error("Invalid report filename");
  const data = reportSchema.parse(
    JSON.parse(await fs.readFile(path.join(RESULTS_DIR, file), "utf8")),
  );
  return { ...data, file };
}
export async function readReports(): Promise<Report[]> {
  const files = await fs.readdir(RESULTS_DIR).catch(() => [] as string[]);
  const results = await Promise.allSettled(
    files.filter((f) => f.endsWith(".json")).map(readReport),
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    .sort(
      (a, b) => Date.parse(b.created_at_utc) - Date.parse(a.created_at_utc),
    );
}
export async function datasetStats(): Promise<DatasetStats[]> {
  const golden: DatasetStats = {
    key: "abitura_golden",
    cli: "golden",
    name: "Abitura Golden",
    language: "RU",
    queries: 0,
    documents: 0,
    available: false,
  };
  const squad: DatasetStats = {
    key: "squad_dev",
    cli: "squad",
    name: "SQuAD 1.1",
    language: "EN",
    queries: 0,
    documents: 0,
    available: false,
  };
  try {
    const lines = (
      await fs.readFile(path.join(PROJECT_ROOT, "eval/golden.jsonl"), "utf8")
    )
      .split("\n")
      .filter((l) => l.trim());
    golden.queries = lines
      .map((l) => JSON.parse(l))
      .filter(
        (q) => q.answerable !== false && q.relevant_chunks?.length,
      ).length;
    const files = await fs.readdir(path.join(PROJECT_ROOT, "chunks"));
    const chunks = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(
          async (f) =>
            JSON.parse(
              await fs.readFile(path.join(PROJECT_ROOT, "chunks", f), "utf8"),
            ) as { section?: string; content?: string }[],
        ),
    );
    golden.documents = chunks
      .flat()
      .filter((c) => `${c.section ?? ""}\n${c.content ?? ""}`.trim()).length;
    golden.available = true;
  } catch {
    /* Missing datasets are represented in the UI. */
  }
  try {
    const data = JSON.parse(
      await fs.readFile(
        path.join(PROJECT_ROOT, "eval/squad/dev-v1.1.json"),
        "utf8",
      ),
    ) as {
      data: {
        paragraphs: { context: string; qas: { is_impossible?: boolean }[] }[];
      }[];
    };
    const paragraphs = data.data
      .flatMap((a) => a.paragraphs)
      .filter((p) => p.context.trim());
    squad.documents = new Set(paragraphs.map((p) => p.context.trim())).size;
    squad.queries = paragraphs
      .flatMap((p) => p.qas)
      .filter((q) => !q.is_impossible).length;
    squad.available = true;
  } catch {
    /* Missing datasets are represented in the UI. */
  }
  return [golden, squad];
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && new URL(origin).host !== host)
    throw new Error("Requests must come from the dashboard origin");
}
