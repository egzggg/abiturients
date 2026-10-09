import { AnswerActionError, generateAnswer } from "@/lib/answers";
import { sameOrigin } from "@/lib/server";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return Response.json({ error: "Некорректный ID вопроса." }, { status: 400 });
    return Response.json(await generateAnswer(Number(id)));
  } catch (error) {
    return Response.json({ error: error instanceof AnswerActionError ? error.message : "Не удалось запустить генерацию." }, { status: error instanceof AnswerActionError ? error.status : 400 });
  }
}
