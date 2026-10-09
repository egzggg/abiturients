import { z } from "zod";
import { AnswerActionError, createQuestion, readAnswers } from "@/lib/answers";
import { sameOrigin } from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["id", "llm_model", "llm_judge_model"]).default("id"),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().max(500).default(""),
  model: z.string().max(500).default(""),
  judgeModel: z.string().max(500).default(""),
  manualGrade: z.enum(["all", "present", "missing"]).default("all"),
  llmGrade: z.enum(["all", "present", "missing"]).default("all"),
});
export async function GET(request: Request) {
  const input = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return Response.json({ error: "Некорректные параметры поиска, сортировки или страницы." }, { status: 400 });
  try {
    const { page, pageSize, search, sortBy, order, model, judgeModel, manualGrade, llmGrade } = input.data;
    return Response.json(await readAnswers(page, pageSize, search, sortBy, order, model, judgeModel, manualGrade, llmGrade));
  } catch (error) {
    console.error("SQLite answers read failed:", error);
    return Response.json({ error: "Не удалось прочитать базу ответов. Проверьте путь к базе и выполните python3 RAG_HP.py --mode init-db для миграции." }, { status: 500 });
  }
}

const createSchema = z.object({ question: z.string().trim().min(1).max(20000), model: z.string().min(1).max(500) }).strict();
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return Response.json({ error: "Введите вопрос и выберите модель. Поля оценки заполняются отдельно." }, { status: 400 });
    return Response.json(await createQuestion(input.data.question, input.data.model), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof AnswerActionError ? error.message : "Не удалось добавить вопрос." }, { status: error instanceof AnswerActionError ? error.status : 400 });
  }
}
