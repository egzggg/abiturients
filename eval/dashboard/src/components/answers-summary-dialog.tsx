"use client";

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AnswerGradeSummary, AnswersPage } from "@/lib/types";

const percent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

function GradeCells({ grade }: { grade: AnswerGradeSummary }) {
  return <>
    <td className="px-4 py-3 text-primary">{grade.correct}</td>
    <td className="px-4 py-3">{grade.incorrect}</td>
    <td className="px-4 py-3 font-semibold">{percent(grade.accuracy)}<span className="mt-1 block text-xs font-normal text-muted-foreground">Оценено: {grade.evaluated}</span></td>
    <td className="px-4 py-3">{grade.missing}{grade.unrecognized > 0 && <span className="mt-1 block text-xs text-amber-300">Другие оценки: {grade.unrecognized}</span>}</td>
  </>;
}

export function AnswersSummaryDialog({ open, onOpenChange, data, error }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AnswersPage | null;
  error: string;
}) {
  const summary = data?.summary ?? [];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-6xl">
      <DialogTitle>Итог: точность ответов моделей</DialogTitle>
      <DialogDescription>Все записи базы, независимо от фильтров и страницы. Данные обновляются каждые 4 секунды.</DialogDescription>
      <p className="text-xs leading-relaxed text-muted-foreground">1 — правильный ответ, 0 — неправильный. Точность = правильные / ответы с оценкой 0 или 1 × 100%. Другие оценки и вопросы без полученного ответа в расчёт точности не входят.</p>
      {error && <p role="alert" className="text-sm text-red-300">{error}{data && " Показаны ранее загруженные данные."}</p>}
      {!data ? !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Загрузка сводки…</p>
        : !data.available ? <p className="text-sm text-muted-foreground">База ответов ещё не создана.</p>
        : !summary.length ? <p className="text-sm text-muted-foreground">В базе пока нет записей для сводки.</p>
        : <>
          <p className="text-sm">Моделей: {summary.length} · Получено ответов: {summary.reduce((sum, row) => sum + row.answered, 0)} из {summary.reduce((sum, row) => sum + row.total, 0)} вопросов</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-white/[0.025] text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th rowSpan={2} scope="col" className="px-4 py-3 font-normal">Модель</th>
                  <th rowSpan={2} scope="col" className="px-4 py-3 font-normal">Ответы / вопросы</th>
                  <th colSpan={4} scope="colgroup" className="px-4 py-3 font-medium">Ручная оценка</th>
                  <th colSpan={4} scope="colgroup" className="px-4 py-3 font-medium">Оценка LLM</th>
                </tr>
                <tr className="border-b border-border">{["manual", "llm"].flatMap((source) => ["Правильно", "Неправильно", "Точность", "Без оценки"].map((label) => <th key={`${source}:${label}`} scope="col" className="px-4 py-3 font-normal">{label}</th>))}</tr>
              </thead>
              <tbody>{summary.map((row) => <tr key={row.model === null ? "null" : `model:${row.model}`} className="border-b border-border/50 last:border-0">
                <th scope="row" className="max-w-64 break-words px-4 py-3 font-medium">{row.model?.trim() ? row.model : "Модель не указана"}</th>
                <td className="px-4 py-3">{row.answered} / {row.total}</td>
                <GradeCells grade={row.manual} /><GradeCells grade={row.llm} />
              </tr>)}</tbody>
            </table>
          </div>
        </>}
    </DialogContent>
  </Dialog>;
}
