"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GenerationConfig, QuestionCluster } from "@/lib/types";

export function QuestionClusterDialog({ open, onOpenChange, onUploaded }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (cluster: QuestionCluster) => void;
}) {
  const [format, setFormat] = useState<"excel" | "json">("excel");
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState("");
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(""); setConfig(null); setFile(null);
    void fetch("/api/answers/config", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить модели.");
        if (controller.signal.aborted) return;
        setConfig(result); setModel((current) => result.models.includes(current) ? current : result.models[0] ?? "");
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось загрузить модели."); });
    return () => controller.abort();
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !model || uploading || !config?.configured) return;
    setError(""); setUploading(true);
    try {
      const form = new FormData(); form.set("file", file); form.set("model", model);
      const response = await fetch("/api/answers/clusters", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить вопросы.");
      setFile(null); onOpenChange(false); onUploaded(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить вопросы."); }
    finally { setUploading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!uploading) onOpenChange(next); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle className="text-lg font-semibold">Загрузить кластер вопросов</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">Выберите модель и файл вопросов. Ответы будут получены через RAG по книге и Yandex API. Модель-судья и обе оценки останутся пустыми.</DialogDescription>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium"><FileSpreadsheet className="size-4" />Пример Excel (.xlsx / .xls)</p>
            <table className="w-full border-collapse text-left text-xs"><thead><tr><th className="border border-border px-3 py-2 font-medium">request</th></tr></thead><tbody>
              {["вопрос 1", "вопрос 2", "так далее"].map((question) => <tr key={question}><td className="border border-border px-3 py-2 text-muted-foreground">{question}</td></tr>)}
            </tbody></table>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium"><FileJson className="size-4" />Пример JSON (.json)</p>
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{'{\n  "request": [\n    "вопрос 1",\n    "вопрос 2",\n    "так далее"\n  ]\n}'}</pre>
          </div>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <fieldset disabled={uploading} className="flex flex-wrap gap-4">
            <legend className="mb-2 text-xs text-muted-foreground">Способ загрузки</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="cluster-format" checked={format === "excel"} onChange={() => { setFormat("excel"); setFile(null); setError(""); }} />Таблица XLSX / XLS</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="cluster-format" checked={format === "json"} onChange={() => { setFormat("json"); setFile(null); setError(""); }} />Файл JSON</label>
          </fieldset>
          <div>
            <label htmlFor="cluster-file" className="mb-2 block text-xs text-muted-foreground">Файл вопросов</label>
            <input key={`${format}-${open}`} id="cluster-file" type="file" required accept={format === "excel" ? ".xlsx,.xls" : ".json"} disabled={uploading}
              className="w-full rounded-lg border border-border bg-background/40 p-3 text-xs file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                if (selected && (!selected.size || selected.size > 10 * 1024 * 1024)) { setFile(null); setError("Загрузите непустой файл размером до 10 МБ."); }
                else { setFile(selected); setError(""); }
              }} />
            <p className="mt-2 text-xs text-muted-foreground">До 500 вопросов, файл до 10 МБ. Excel: первый лист, заголовок request в первой строке; пустые строки пропускаются.</p>
          </div>
          <div>
            <label htmlFor="cluster-model" className="mb-2 block text-xs text-muted-foreground">Модель для всех вопросов</label>
            <Select value={model} onValueChange={setModel} disabled={uploading || !config}>
              <SelectTrigger id="cluster-model" aria-label="Модель для кластера вопросов"><SelectValue placeholder="Загрузка моделей…" /></SelectTrigger>
              <SelectContent>{config?.models.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {config && !config.configured && <p className="text-xs text-amber-300">Yandex API не настроен. Укажите YANDEX_API_KEY и YANDEX_CLOUD_FOLDER на сервере.</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={uploading} onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={uploading || !file || !model || !config?.configured}>{uploading && <Loader2 className="animate-spin" />}{uploading ? "Загрузка…" : "Загрузить и получить ответы"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
