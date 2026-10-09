"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnswerRecord, GenerationConfig } from "@/lib/types";

const inputClass = "w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-40";

export async function answerRequest<T>(url: string, method: "POST" | "PATCH", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить действие.");
  return result as T;
}

export function NewQuestionDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (record: AnswerRecord, generate: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState("");
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(""); setConfig(null);
    void fetch("/api/answers/config", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить модели.");
        if (controller.signal.aborted) return;
        setConfig(result);
        setModel((current) => result.models.includes(current) ? current : result.models[0] ?? "");
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось загрузить модели."); });
    return () => controller.abort();
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !question.trim() || !model) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const generate = submitter?.value !== "save";
    if (generate && !config?.configured) return;
    setSaving(true); setError("");
    try {
      const record = await answerRequest<AnswerRecord>("/api/answers", "POST", { question, model });
      setQuestion(""); onOpenChange(false); onCreated(record, generate);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить вопрос."); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle className="text-lg font-semibold">Добавить новый вопрос</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">Модель ответит через Yandex API на основе текста «Гарри Поттер и философский камень».</DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block space-y-2 text-xs text-muted-foreground" htmlFor="new-question">Вопрос
            <textarea id="new-question" required maxLength={20000} rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={saving} className={inputClass} placeholder="Введите вопрос по книге…" />
          </label>
          <div>
            <label htmlFor="new-question-model" className="mb-2 block text-xs text-muted-foreground">Модель</label>
            <Select value={model} onValueChange={setModel} disabled={saving || !config}>
              <SelectTrigger id="new-question-model" aria-label="Модель для нового вопроса"><SelectValue placeholder="Загрузка моделей…" /></SelectTrigger>
              <SelectContent>{config?.models.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {["Модель-судья", "Ручная оценка", "Оценка LLM"].map((label) => (
              <label key={label} className="block space-y-2 text-xs text-muted-foreground">{label}<input disabled value="" placeholder="После получения ответа" className={inputClass} /></label>
            ))}
          </div>
          {config && !config.configured && <p className="text-xs text-amber-300">Yandex API не настроен. Укажите YANDEX_API_KEY и YANDEX_CLOUD_FOLDER в серверном .env. Пока можно сохранить вопрос без ответа.</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="submit" value="save" variant="outline" disabled={saving || !config || !question.trim() || !model}>Сохранить вопрос</Button>
            <Button type="submit" value="generate" disabled={saving || !config?.configured || !question.trim() || !model}>{saving && <Loader2 className="animate-spin" />}Добавить и получить ответ</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GradeDialog({ record, onClose, onSaved }: {
  record: AnswerRecord;
  onClose: () => void;
  onSaved: (record: AnswerRecord) => void;
}) {
  const [manual, setManual] = useState(record.manual_grade ?? "");
  const [llm, setLlm] = useState(record.llm_grade ?? "");
  const [judge, setJudge] = useState(record.llm_judge_model ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changed = manual !== (record.manual_grade ?? "") || llm !== (record.llm_grade ?? "") || judge !== (record.llm_judge_model ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;
    const grades: { manual_grade?: string; llm_grade?: string; llm_judge_model?: string } = {};
    if (manual !== (record.manual_grade ?? "")) grades.manual_grade = manual;
    if (llm !== (record.llm_grade ?? "")) grades.llm_grade = llm;
    if (judge !== (record.llm_judge_model ?? "")) grades.llm_judge_model = judge;
    setSaving(true); setError("");
    try { onSaved(await answerRequest<AnswerRecord>(`/api/answers/${record.id}`, "PATCH", grades)); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить оценки."); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="text-lg font-semibold">Оценить ответ №{record.id}</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">Введите ручную оценку, оценку сторонней LLM и название модели-судьи.</DialogDescription>
        <div className="mt-5 space-y-3 rounded-lg border border-border p-4 text-sm">
          <p className="text-xs text-muted-foreground">{record.llm_model}</p>
          <p className="whitespace-pre-wrap break-words font-medium">{record.request}</p>
          <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{record.answer || "Ответ пока не получен."}</p>
        </div>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label htmlFor="manual-grade" className="block space-y-2 text-xs text-muted-foreground">Ручная оценка
            <textarea id="manual-grade" rows={3} maxLength={20000} value={manual} onChange={(event) => setManual(event.target.value)} disabled={saving} className={inputClass} />
          </label>
          <div>
            <label htmlFor="llm-grade" className="mb-2 block text-xs text-muted-foreground">LLM оценка</label>
            <textarea id="llm-grade" rows={3} maxLength={20000} value={llm} onChange={(event) => setLlm(event.target.value)} disabled={saving} className={inputClass} aria-describedby="llm-grade-hint" />
            <p id="llm-grade-hint" className="mt-2 text-xs text-muted-foreground">Используйте стороннюю LLM для оценки и введите ответ.</p>
          </div>
          <label htmlFor="llm-judge" className="block space-y-2 text-xs text-muted-foreground">LLM судья
            <input id="llm-judge" maxLength={500} value={judge} onChange={(event) => setJudge(event.target.value)} disabled={saving} className={inputClass} placeholder="Название модели, которая оценила ответ" />
          </label>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Отмена</Button>
            <Button type="submit" disabled={saving || !changed}>{saving && <Loader2 className="animate-spin" />}Сохранить оценки</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
