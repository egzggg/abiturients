import "server-only";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "./server";
import type { AnswerRecord, AnswersPage, GenerationConfig, QuestionCluster } from "./types";

const execute = promisify(execFile);
const globalState = globalThis as typeof globalThis & { __answerGeneration?: Set<number> };
const generating = (globalState.__answerGeneration ??= new Set<number>());
const clusterGlobal = globalThis as typeof globalThis & { __questionClusters?: { jobs: QuestionCluster[]; queue: Promise<void> } };
const clusters = (clusterGlobal.__questionClusters ??= { jobs: [], queue: Promise.resolve() });

function settings() {
  const venv = path.join(PROJECT_ROOT, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  const python = process.env.EVAL_PYTHON ?? (existsSync(venv) ? venv : process.platform === "win32" ? "python" : "python3");
  const database = process.env.EVAL_ANSWERS_DB ?? path.join(PROJECT_ROOT, "eval/domains/HPotter/answers.sqlite3");
  return { python, database };
}

export async function readAnswers(page: number, pageSize: number, search: string, sortBy: "id" | "llm_model" | "llm_judge_model", order: "asc" | "desc", model: string, judgeModel: string, manualGrade: string, llmGrade: string): Promise<AnswersPage> {
  const { python, database } = settings();
  const { stdout } = await execute(python, [
    path.join(PROJECT_ROOT, "eval/sqlite_answers.py"),
    "--db-path", database, "--page", String(page), "--page-size", String(pageSize), "--search", search, "--sort-by", sortBy, "--order", order,
    "--model", model, "--judge-model", judgeModel,
    "--manual-grade", manualGrade, "--llm-grade", llmGrade,
  ], { timeout: 10000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  return { ...JSON.parse(stdout), generatingIds: [...generating], clusters: clusters.jobs.slice(-10).reverse() } as AnswersPage;
}

export class AnswerActionError extends Error {
  constructor(message: string, public status: number = 400) { super(message); }
}

async function action<T>(name: "config" | "create" | "grade" | "generate" | "import", payload: unknown): Promise<T> {
  const { python, database } = settings();
  return new Promise((resolve, reject) => {
    const child = execFile(python, [path.join(PROJECT_ROOT, "eval/sqlite_answer_actions.py"), "--db-path", database, "--action", name],
      { timeout: name === "generate" ? 180000 : 10000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(new AnswerActionError(name === "generate" ? "Не удалось получить ответ за отведённое время. Вопрос сохранён; запуск можно повторить." : "Не удалось выполнить действие. Проверьте настройки сервера.", 502));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          if (result.error) reject(new AnswerActionError(result.error, result.status));
          else resolve(result.data as T);
        } catch { reject(new AnswerActionError("Сервер вернул некорректный результат.", 502)); }
      });
    child.stdin?.on("error", () => { /* Process errors are handled by the completion callback. */ });
    child.stdin?.end(JSON.stringify(payload));
  });
}

export async function startQuestionCluster(filename: string, model: string, content: Buffer): Promise<QuestionCluster> {
  const config = await answerGenerationConfig();
  if (!config.configured) throw new AnswerActionError("Задайте YANDEX_API_KEY и YANDEX_CLOUD_FOLDER на сервере.", 503);
  if (!config.models.includes(model)) throw new AnswerActionError("Выберите модель из списка Yandex API.");
  const ids = await action<number[]>("import", { filename, model, content: content.toString("base64") });
  const job: QuestionCluster = { id: randomUUID(), filename, model, total: ids.length, completed: 0, failed: 0, status: "queued", startedAt: new Date().toISOString() };
  clusters.jobs.push(job);
  for (const id of ids) generating.add(id);
  // Work belongs to the server and continues after the upload dialog or tab closes.
  clusters.queue = clusters.queue.then(async () => {
    job.status = "running";
    try {
      for (const id of ids) {
        job.processingId = id;
        try { await action<AnswerRecord>("generate", { id }); job.completed++; }
        catch (error) { job.failed++; job.error = error instanceof Error ? error.message : "Не удалось получить ответ."; }
        finally { generating.delete(id); }
      }
    } finally {
      job.processingId = undefined;
      job.status = job.failed ? "completed_with_errors" : "completed";
      for (const id of ids) generating.delete(id);
    }
  }).catch(() => { job.status = "completed_with_errors"; job.error = "Обработка прервана. Сохранённые вопросы можно обработать кнопкой «Получить ответ»."; });
  return { ...job };
}

export const answerGenerationConfig = () => action<GenerationConfig>("config", {});
export const createQuestion = (question: string, model: string) => action<AnswerRecord>("create", { question, model });
export const saveGrades = (id: number, grades: { manual_grade?: string; llm_grade?: string; llm_judge_model?: string }) => action<AnswerRecord>("grade", { id, grades });
export async function generateAnswer(id: number): Promise<AnswerRecord> {
  if (generating.has(id)) throw new AnswerActionError("Ответ на этот вопрос уже генерируется.", 409);
  generating.add(id);
  try { return await action<AnswerRecord>("generate", { id }); }
  finally { generating.delete(id); }
}
