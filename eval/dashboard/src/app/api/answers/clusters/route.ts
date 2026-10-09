import { AnswerActionError, startQuestionCluster } from "@/lib/answers";
import { sameOrigin } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 11 * 1024 * 1024) return Response.json({ error: "Файл должен быть размером до 10 МБ." }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    const model = form.get("model");
    if (!(file instanceof File) || typeof model !== "string" || !model || model.length > 500)
      return Response.json({ error: "Выберите файл вопросов и модель." }, { status: 400 });
    if (!/\.(json|xlsx|xls)$/i.test(file.name)) return Response.json({ error: "Поддерживаются только JSON, XLSX и XLS." }, { status: 400 });
    if (!file.size || file.size > 10 * 1024 * 1024) return Response.json({ error: "Загрузите непустой файл размером до 10 МБ." }, { status: 413 });
    return Response.json(await startQuestionCluster(file.name, model, Buffer.from(await file.arrayBuffer())), { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof AnswerActionError ? error.message : "Не удалось загрузить кластер вопросов." }, { status: error instanceof AnswerActionError ? error.status : 400 });
  }
}
