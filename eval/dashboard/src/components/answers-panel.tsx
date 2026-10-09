"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Search, Upload } from "lucide-react";
import { AnswersSummaryDialog } from "@/components/answers-summary-dialog";
import { QuestionClusterDialog } from "@/components/question-cluster-dialog";
import { answerRequest, GradeDialog, NewQuestionDialog } from "@/components/answer-forms";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AnswerRecord, AnswersPage } from "@/lib/types";

const columns = [
  ["id", "ID"], ["llm_model", "Модель"], ["request", "Вопрос"], ["answer", "Ответ"],
  ["llm_judge_model", "Модель-судья"], ["manual_grade", "Ручная оценка"], ["llm_grade", "Оценка LLM"],
] as const;
const display = (value: string | number | null) => value === null || value === "" ? "—" : String(value);
const missingGrade = (row: AnswerRecord) => !row.manual_grade?.trim() || !row.llm_grade?.trim();

export function AnswersPanel() {
  const [data, setData] = useState<AnswersPage | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("id:desc");
  const [model, setModel] = useState("");
  const [judgeModel, setJudgeModel] = useState("");
  const [manualGrade, setManualGrade] = useState("all");
  const [llmGrade, setLlmGrade] = useState("all");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [judgeModelOptions, setJudgeModelOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AnswerRecord | null>(null);
  const [newQuestion, setNewQuestion] = useState(false);
  const [clusterUpload, setClusterUpload] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [grading, setGrading] = useState<AnswerRecord | null>(null);
  const [generatingIds, setGeneratingIds] = useState<number[]>([]);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  async function generate(record: AnswerRecord) {
    if (generatingIds.includes(record.id) || data?.generatingIds.includes(record.id)) return;
    setGeneratingIds((ids) => [...ids, record.id]); setActionError("");
    setNotice(`Генерируется ответ на вопрос №${record.id} через RAG и Yandex API…`);
    try {
      const result = await answerRequest<AnswerRecord>(`/api/answers/${record.id}/generate`, "POST");
      setSelected((current) => current?.id === result.id ? result : current);
      setNotice(`Ответ на вопрос №${record.id} получен и сохранён.`);
    } catch (cause) {
      setNotice("");
      setActionError(cause instanceof Error ? cause.message : "Не удалось получить ответ. Вопрос сохранён; запуск можно повторить.");
    } finally {
      setGeneratingIds((ids) => ids.filter((id) => id !== record.id)); refresh();
    }
  }

  function savedGrades(record: AnswerRecord) {
    setSelected((current) => current?.id === record.id ? record : current);
    setActionError(""); setNotice(`Оценки ответа №${record.id} сохранены.`); refresh();
  }

  useEffect(() => {
    window.addEventListener("answers-refresh", refresh);
    return () => window.removeEventListener("answers-refresh", refresh);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    setLoading(true);
    setData(null);
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const [sortBy, order] = sort.split(":");
        const query = new URLSearchParams({ page: String(page), pageSize: "25", search, sortBy, order, model, judgeModel, manualGrade, llmGrade });
        const response = await fetch(`/api/answers?${query}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить ответы.");
        if (active) {
          setData(result); setModelOptions(result.models); setJudgeModelOptions(result.judgeModels); setError("");
        }
      } catch (cause) {
        if (active && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить ответы.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    const timeout = setTimeout(() => void load(), 250);
    const timer = setInterval(() => void load(), 4000);
    return () => { active = false; controller?.abort(); clearTimeout(timeout); clearInterval(timer); };
  }, [page, search, sort, model, judgeModel, manualGrade, llmGrade, revision]);

  const currentPage = data?.page ?? page;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  const detail = data?.rows.find((row) => row.id === selected?.id) ?? selected;
  const isGenerating = (id: number) => generatingIds.includes(id) || Boolean(data?.generatingIds.includes(id));
  const filtered = search || model || judgeModel || manualGrade !== "all" || llmGrade !== "all";
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">Вопросы и ответы</h2>
          <p className="mt-1 text-xs text-muted-foreground">{data ? `${data.total} записей` : "Загрузка записей…"} · обновление каждые 4 секунды</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSummaryOpen(true)}><BarChart3 />Итог</Button>
          <Button size="sm" onClick={() => setNewQuestion(true)}><Plus />Добавить новый вопрос</Button>
          <Button variant="outline" size="sm" onClick={() => setClusterUpload(true)}><Upload />Загрузить кластер вопросов</Button>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input aria-label="Поиск по ответам" placeholder="Вопрос, ответ, модель, оценка…" value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className="h-9 w-72 max-w-full rounded-md border border-border bg-transparent pl-9 pr-3 text-xs outline-none focus:border-primary" />
          </div>
          <Select value={sort} onValueChange={(value) => { setSort(value); setPage(1); }}>
            <SelectTrigger aria-label="Сортировка ответов" className="w-[230px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="id:desc">Сначала новые записи</SelectItem>
              <SelectItem value="llm_model:asc">Модель: А → Я</SelectItem>
              <SelectItem value="llm_model:desc">Модель: Я → А</SelectItem>
              <SelectItem value="llm_judge_model:asc">Модель-судья: А → Я</SelectItem>
              <SelectItem value="llm_judge_model:desc">Модель-судья: Я → А</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} aria-label="Обновить ответы">
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-4">
        {[
          { label: "Модель ответа", value: model, options: modelOptions, setValue: setModel, all: "Все модели ответа" },
          { label: "Модель-судья", value: judgeModel, options: judgeModelOptions, setValue: setJudgeModel, all: "Все модели-судьи" },
        ].map((filter) => (
          <div key={filter.label} className="w-full sm:w-[260px]">
            <p className="mb-2 text-xs text-muted-foreground">{filter.label}</p>
            <Select value={filter.value ? `model:${filter.value}` : "all"} onValueChange={(value) => { filter.setValue(value === "all" ? "" : value.slice(6)); setPage(1); }}>
              <SelectTrigger aria-label={`Фильтр: ${filter.label}`} className="[&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{filter.all}</SelectItem>
                {[...new Set([...filter.options, ...(filter.value ? [filter.value] : [])])].map((option) => (
                  <SelectItem key={option} value={`model:${option}`}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {[
          { label: "Ручная оценка", value: manualGrade, setValue: setManualGrade },
          { label: "Оценка LLM", value: llmGrade, setValue: setLlmGrade },
        ].map((filter) => <div key={filter.label} className="w-full sm:w-[180px]">
          <p className="mb-2 text-xs text-muted-foreground">{filter.label}</p>
          <Select value={filter.value} onValueChange={(value) => { filter.setValue(value); setPage(1); }}>
            <SelectTrigger aria-label={`Фильтр: ${filter.label}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все записи</SelectItem>
              <SelectItem value="present">Есть оценка</SelectItem>
              <SelectItem value="missing">Нет оценки</SelectItem>
            </SelectContent>
          </Select>
        </div>)}
        {(model || judgeModel || manualGrade !== "all" || llmGrade !== "all") && <Button variant="ghost" size="sm" onClick={() => { setModel(""); setJudgeModel(""); setManualGrade("all"); setLlmGrade("all"); setPage(1); }}>Сбросить фильтры</Button>}
      </div>
      {notice && <p role="status" className="border-t border-border px-5 py-3 text-xs text-primary">{notice}</p>}
      {actionError && <p role="alert" className="border-t border-border px-5 py-3 text-sm text-red-300">{actionError}</p>}
      {data?.clusters?.length ? <div className="space-y-3 border-t border-border px-5 py-4">
        {data.clusters.slice(0, 3).map((cluster) => <div key={cluster.id} className="rounded-lg border border-border p-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="min-w-0 break-words font-medium">{cluster.filename} · {cluster.model}</span>
            <span role="status" className="text-muted-foreground">{cluster.status === "queued" ? "В очереди" : cluster.status === "running" ? "Получаем ответы…" : cluster.status === "completed" ? "Завершено" : "Завершено с ошибками"}</span>
          </div>
          <p className="mt-2 text-muted-foreground">Получено ответов: {cluster.completed} из {cluster.total}{cluster.failed > 0 && ` · Ошибок: ${cluster.failed}`}</p>
          <progress aria-label={`Прогресс обработки ${cluster.filename}`} value={cluster.completed + cluster.failed} max={cluster.total} className="mt-2 h-1.5 w-full accent-primary" />
          {cluster.error && <p className="mt-2 text-red-300">{cluster.error} Для вопросов без ответа доступна кнопка «Получить ответ».</p>}
        </div>)}
      </div> : null}
      {error && <p role="alert" className="border-t border-border p-5 text-sm text-red-300">{error}{data && " Показаны ранее загруженные данные."}</p>}
      {loading && !data ? <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Загрузка ответов…</div> : data && !data.available ? (
        <p className="border-t border-border p-6 text-sm text-muted-foreground">База ответов ещё не создана. Выполните в каталоге eval: <code>python3 RAG_HP.py --mode init-db</code>.</p>
      ) : data && data.rows.length === 0 ? (
        <p className="border-t border-border p-6 text-sm text-muted-foreground">{filtered ? "По выбранным фильтрам и поиску ничего не найдено." : "В базе пока нет записей. Нажмите «Добавить новый вопрос»."}</p>
      ) : data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="border-y border-border bg-white/[0.015] text-muted-foreground"><tr>
              {columns.map(([key, label]) => <th key={key} scope="col" className="px-4 py-3 font-normal">{label}</th>)}
              <th scope="col" className="px-4 py-3 font-normal">Действия</th>
            </tr></thead>
            <tbody>{data.rows.map((row) => <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02]">
              {columns.map(([key]) => <td key={key} className="px-4 py-4 align-top">
                <div className={key === "request" || key === "answer" ? "line-clamp-3 min-w-48 max-w-80 whitespace-pre-wrap break-words leading-relaxed" : "max-w-40 break-words"}>{display(row[key])}</div>
              </td>)}
              <td className="px-4 py-3 align-top"><div className="flex flex-col items-start gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(row)} aria-label={`Открыть ответ ${row.id}`}>Открыть</Button>
                {!row.answer?.trim() && <Button variant="outline" size="sm" onClick={() => void generate(row)} disabled={isGenerating(row.id)} aria-label={`Получить ответ на вопрос ${row.id}`}>{isGenerating(row.id) ? <><Loader2 className="animate-spin" />Генерация…</> : "Получить ответ"}</Button>}
                {missingGrade(row) && <Button variant="outline" size="sm" onClick={() => setGrading(row)} disabled={isGenerating(row.id) || !row.answer?.trim()} aria-label={`Оценить ответ ${row.id}`}>Оценить</Button>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {data?.available && <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span>Страница {currentPage} из {pages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading || currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Предыдущая страница ответов"><ChevronLeft /></Button>
          <Button variant="outline" size="sm" disabled={loading || currentPage >= pages} onClick={() => setPage(currentPage + 1)} aria-label="Следующая страница ответов"><ChevronRight /></Button>
        </div>
      </div>}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Ответ №{detail?.id}</DialogTitle>
          <DialogDescription>Полный вопрос, ответ и оценки.</DialogDescription>
          {detail && isGenerating(detail.id) && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Loader2 className="size-4 animate-spin" />Получаем ответ через RAG и Yandex API…</p>}
          {detail && <dl className="space-y-5">{columns.filter(([key]) => key !== "id").map(([key, label]) => <div key={key}>
            <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm leading-relaxed">{display(detail[key])}</dd>
          </div>)}</dl>}
          {detail && <div className="flex flex-wrap gap-2">
            {!detail.answer?.trim() && <Button variant="outline" size="sm" disabled={isGenerating(detail.id)} onClick={() => void generate(detail)}>{isGenerating(detail.id) ? "Генерация…" : "Получить ответ"}</Button>}
            {missingGrade(detail) && <Button size="sm" disabled={isGenerating(detail.id) || !detail.answer?.trim()} onClick={() => { setGrading(detail); setSelected(null); }}>Оценить</Button>}
          </div>}
        </DialogContent>
      </Dialog>
      <NewQuestionDialog open={newQuestion} onOpenChange={setNewQuestion} onCreated={(record, shouldGenerate) => {
        setSearch(""); setModel(""); setJudgeModel(""); setManualGrade("all"); setLlmGrade("all"); setSort("id:desc"); setPage(1);
        setActionError(""); setNotice(`Вопрос №${record.id} добавлен.`); setSelected(record); refresh();
        if (shouldGenerate) void generate(record);
      }} />
      <AnswersSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} data={data} error={error} />
      {grading && <GradeDialog key={grading.id} record={grading} onClose={() => setGrading(null)} onSaved={savedGrades} />}
      <QuestionClusterDialog open={clusterUpload} onOpenChange={setClusterUpload} onUploaded={(cluster) => {
        setSearch(""); setModel(""); setJudgeModel(""); setManualGrade("all"); setLlmGrade("all"); setSort("id:desc"); setPage(1);
        setActionError(""); setNotice(`Загружено вопросов: ${cluster.total}. Прогресс обработки показан над таблицей.`); refresh();
      }} />
    </Card>
  );
}
