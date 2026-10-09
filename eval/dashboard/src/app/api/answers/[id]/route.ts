import { z } from "zod";
import { AnswerActionError, saveGrades } from "@/lib/answers";
import { sameOrigin } from "@/lib/server";
export const runtime = "nodejs";
const schema = z.object({
  manual_grade: z.string().max(20000).optional(),
  llm_grade: z.string().max(20000).optional(),
  llm_judge_model: z.string().max(500).optional(),
}).strict().refine((input) => Object.keys(input).length > 0);
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return Response.json({ error: "Некорректный ID вопроса." }, { status: 400 });
    const input = schema.safeParse(await request.json());
    if (!input.success) return Response.json({ error: "Некорректные поля оценки." }, { status: 400 });
    return Response.json(await saveGrades(Number(id), input.data));
  } catch (error) {
    return Response.json({ error: error instanceof AnswerActionError ? error.message : "Не удалось сохранить оценку." }, { status: error instanceof AnswerActionError ? error.status : 400 });
  }
}
