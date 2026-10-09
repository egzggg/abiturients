import { AnswerActionError, answerGenerationConfig } from "@/lib/answers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await answerGenerationConfig()); }
  catch (error) { return Response.json({ error: "Не удалось загрузить модели Yandex API." }, { status: error instanceof AnswerActionError ? error.status : 500 }); }
}
