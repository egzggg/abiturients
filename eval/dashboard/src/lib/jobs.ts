import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PROJECT_ROOT, RESULTS_DIR } from "./server";
import type { Job } from "./types";
const inputSchema = z.object({
  models: z
    .array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/))
    .min(1)
    .max(4),
  datasets: z
    .array(z.enum(["golden", "squad"]))
    .min(1)
    .max(2),
  device: z.enum(["auto", "cpu", "cuda"]),
  batchSize: z.union([
    z.literal(4),
    z.literal(8),
    z.literal(16),
    z.literal(32),
  ]),
});
const globalState = globalThis as typeof globalThis & {
  __evalStudio?: {
    jobs: Map<string, Job>;
    children: Map<string, ChildProcess>;
  };
};
const state = (globalState.__evalStudio ??= {
  jobs: new Map(),
  children: new Map(),
});
export const allJobs = () =>
  [...state.jobs.values()].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
export async function startJob(input: unknown) {
  const params = inputSchema.parse(input);
  if (state.children.size > 0 || allJobs().some((j) => j.status === "running"))
    throw new Error("An experiment is already running");
  if (!existsSync(path.join(PROJECT_ROOT, "eval/evaluate_embeddings.py")))
    throw new Error(
      "Evaluator not found. Set EVAL_PROJECT_ROOT to the repository path.",
    );
  await mkdir(RESULTS_DIR, { recursive: true });
  // Recheck after the asynchronous filesystem call to keep starts exclusive.
  if (state.children.size > 0 || allJobs().some((j) => j.status === "running"))
    throw new Error("An experiment is already running");
  const id = randomUUID();
  const outputFile = `dashboard_${id}.json`;
  const job: Job = {
    id,
    status: "running",
    models: [...new Set(params.models)],
    datasets: [...new Set(params.datasets)],
    device: params.device,
    batchSize: params.batchSize,
    startedAt: new Date().toISOString(),
    outputFile,
    logs: "",
  };
  state.jobs.set(id, job);
  const venv = path.join(PROJECT_ROOT, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  const python =
    process.env.EVAL_PYTHON ?? (existsSync(venv) ? venv : process.platform === "win32" ? "python" : "python3");
  const child = spawn(
    python,
    [
      "-u",
      "-m",
      "eval.evaluate_embeddings",
      "--models",
      job.models.join(","),
      "--datasets",
      job.datasets.join(","),
      "--device",
      job.device,
      "--batch-size",
      String(job.batchSize),
      "--no-progress",
      "--output",
      path.join(RESULTS_DIR, outputFile),
    ],
    {
      cwd: PROJECT_ROOT,
      shell: false,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  state.children.set(id, child);
  const append = (data: Buffer) => {
    job.logs = (job.logs + data.toString()).slice(-50000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("error", (error) => {
    job.status = "failed";
    job.error = error.message;
    job.endedAt = new Date().toISOString();
    state.children.delete(id);
  });
  child.on("close", (code) => {
    if (job.status === "cancelling") job.status = "cancelled";
    if (job.status === "running") {
      job.status =
        code === 0 && existsSync(path.join(RESULTS_DIR, outputFile))
          ? "completed"
          : "failed";
      if (job.status === "failed")
        job.error = `Evaluator exited with code ${code}`;
    }
    job.endedAt = new Date().toISOString();
    state.children.delete(id);
  });
  return job;
}
export function cancelJob(id: string) {
  const job = state.jobs.get(id);
  if (!job) throw new Error("Experiment not found");
  if (job.status === "running") {
    const child = state.children.get(id);
    if (!child) throw new Error("Evaluator process is unavailable");
    job.status = "cancelling";
    child.kill("SIGINT");
    const timeout = setTimeout(() => {
      if (state.children.get(id) === child) child.kill("SIGTERM");
    }, 10000);
    timeout.unref();
  }
  return job;
}
