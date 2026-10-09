"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Database,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { AnswersPanel } from "@/components/answers-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  baseModelId,
  latestByModel,
  MODEL_CATALOG,
  modelLabel,
  promptLabel,
  promptVariantId,
  resultRows,
  type DatasetKey,
  type DatasetResult,
  type DatasetStats,
  type Job,
  type Report,
} from "@/lib/types";

type View = "overview" | "history" | "datasets" | "answers";
const number = new Intl.NumberFormat("ru-RU");
const pct = (v?: number) =>
  v === undefined ? "—" : `${(v * 100).toFixed(1)}%`;
const date = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const modelColor = (id: string) => {
  const known = MODEL_CATALOG.find((model) => model.id === baseModelId(id));
  if (known) return known.color;
  const palette = ["#e4a66d", "#d999bd", "#82b5e5", "#c4a5ee", "#8dc7a7"];
  const hash = [...baseModelId(id)].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
  return palette[hash % palette.length];
};
const statusLabel = {
  cancelling: "Останавливается",
  running: "В процессе",
  completed: "Завершён",
  failed: "Ошибка",
  cancelled: "Остановлен",
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <BarChart3 className="size-5" strokeWidth={2.5} />
      </div>
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight">
          eval<span className="font-normal text-muted-foreground">studio</span>
          <span className="ml-1 text-primary">.</span>
        </span>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Activity;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon
          className={cn(
            "size-4 text-muted-foreground/70",
            accent && "text-primary",
          )}
        />
      </div>
      <div
        className={cn(
          "text-[30px] leading-none font-semibold tracking-tight tabular-nums",
          accent && "text-primary",
        )}
      >
        {value}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">{note}</p>
    </Card>
  );
}

function RetrievalChart({ result }: { result?: DatasetResult }) {
  if (!result)
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-3 text-muted-foreground">
        <BarChart3 className="size-7 opacity-40" />
        <p className="text-sm">Запустите первый эксперимент</p>
        <p className="text-xs">Здесь появятся метрики поиска по top-k</p>
      </div>
    );
  const ks = [1, 5, 10];
  const xs = [55, 290, 525];
  const series = [
    {
      label: "Hit rate",
      metric: "hit_rate",
      color: "#79e2bd",
      fill: "chart-mint",
    },
    { label: "MRR", metric: "mrr", color: "#a29af6", fill: "chart-purple" },
  ];
  const curve = (values: number[]) =>
    values
      .map((v, i) =>
        i === 0
          ? `M ${xs[i]} ${200 - v * 160}`
          : `C ${(xs[i - 1] + xs[i]) / 2} ${200 - values[i - 1] * 160}, ${(xs[i - 1] + xs[i]) / 2} ${200 - v * 160}, ${xs[i]} ${200 - v * 160}`,
      )
      .join(" ");
  return (
    <div>
      <div className="mb-1 flex justify-end gap-4 text-[10px] text-muted-foreground">
        {series.map((s) => (
          <span key={s.metric} className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 570 240"
        className="w-full overflow-visible"
        role="img"
        aria-label="Hit rate и MRR для top-1, top-5 и top-10"
      >
        <defs>
          <linearGradient id="chart-mint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#79e2bd" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#79e2bd" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="chart-purple" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a29af6" stopOpacity="0.045" />
            <stop offset="100%" stopColor="#a29af6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              x1="55"
              x2="525"
              y1={200 - tick * 160}
              y2={200 - tick * 160}
              stroke="#303238"
              strokeDasharray="3 5"
            />
            <text
              x="39"
              y={204 - tick * 160}
              textAnchor="end"
              fill="#70747d"
              fontSize="10"
            >
              {tick * 100}%
            </text>
          </g>
        ))}
        {series.map((s) => {
          const values = ks.map((k) => result.metrics[`${s.metric}@${k}`] ?? 0);
          const path = curve(values);
          return (
            <g key={s.metric}>
              <path
                d={`${path} L 525 200 L 55 200 Z`}
                fill={`url(#${s.fill})`}
              />
              <motion.path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.65, ease: "easeOut" }}
              />
              {values.map((v, i) => (
                <g key={i}>
                  <circle
                    cx={xs[i]}
                    cy={200 - v * 160}
                    r="9"
                    fill={s.color}
                    fillOpacity="0.08"
                  />
                  <circle
                    cx={xs[i]}
                    cy={200 - v * 160}
                    r="3.5"
                    stroke="#18191c"
                    strokeWidth="2"
                    fill={s.color}
                  >
                    <title>{`${s.label}@${ks[i]}: ${pct(v)}`}</title>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
        {ks.map((k, i) => (
          <text
            key={k}
            x={xs[i]}
            y="228"
            textAnchor="middle"
            fill="#92959d"
            fontSize="11"
          >
            top-{k}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
        <span>Релевантность по эталонному документу</span>
        <span className="font-mono">k = 1 · 5 · 10</span>
      </div>
    </div>
  );
}

export function Dashboard({
  initialReports,
  datasets,
}: {
  initialReports: Report[];
  datasets: DatasetStats[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [view, setView] = useState<View>("answers");
  const [dataset, setDataset] = useState<DatasetKey>("abitura_golden");
  const [chartModel, setChartModel] = useState<string>(MODEL_CATALOG[0].id);
  const [chartVariant, setChartVariant] = useState("default_query_prompt");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([MODEL_CATALOG[0].id]);
  const [runDatasets, setRunDatasets] = useState<string[]>(["golden"]);
  const [device, setDevice] = useState("auto");
  const [batchSize, setBatchSize] = useState("16");
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const rows = resultRows(reports, dataset);
  const latest = latestByModel(rows);
  const availableModels = [...new Set(latest.map((row) => baseModelId(row.model.model)))];
  const testedModelCount = availableModels.length;
  const baselineModelId = MODEL_CATALOG.find((model) => model.tag === "Baseline")?.id;
  const comparisonEntries = [
    ...MODEL_CATALOG.map((model) => ({
      key: model.id,
      id: model.id,
      name: model.name,
      family: model.family,
      color: model.color,
      row: latest.find((row) => row.model.model === model.id),
    })).filter((entry) => entry.row || entry.id === baselineModelId),
    ...latest
      .filter((row) => !MODEL_CATALOG.some((model) => model.id === row.model.model))
      .map((row) => ({
        key: row.model.model,
        id: row.model.model,
        name: modelLabel(row.model.model),
        family: row.model.backend,
        color: modelColor(row.model.model),
        row,
      })),
  ];
  const visibleComparisonEntries = comparisonEntries.filter((entry) =>
    `${entry.name} ${entry.id} ${entry.family}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedModelId = availableModels.includes(chartModel) ? chartModel : availableModels[0] ?? chartModel;
  const modelRows = latest.filter((row) => baseModelId(row.model.model) === selectedModelId);
  const promptVariants = [...new Set(modelRows.map((row) => promptVariantId(row.model.model)))];
  const selected =
    rows.find(
      (r) => r.report.file === selectedFile && baseModelId(r.model.model) === selectedModelId && promptVariantId(r.model.model) === chartVariant,
    ) ??
    modelRows.find((r) => promptVariantId(r.model.model) === chartVariant) ??
    modelRows[0];
  const result = selected?.result;
  const stats = datasets.find((d) => d.key === dataset)!;
  const activeJob = jobs.find(
    (j) => j.status === "running" || j.status === "cancelling",
  );
  const lastJob = activeJob ?? jobs[0];
  const queryMs = result
    ? (result.query_embedding_seconds / result.query_count) * 1000
    : undefined;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [r, j] = await Promise.all([
        fetch("/api/reports", { cache: "no-store" }),
        fetch("/api/jobs", { cache: "no-store" }),
      ]);
      if (!r.ok || !j.ok) throw new Error("Не удалось обновить данные");
      setReports(await r.json());
      setJobs(await j.json());
      if (!silent) setError("");
    } catch {
      if (!silent)
        setError(
          "Не удалось загрузить данные. Проверьте, что сервер панели запущен.",
        );
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh(true);
    const timer = setInterval(() => void refresh(true), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function launch() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          models,
          datasets: runDatasets,
          device,
          batchSize: Number(batchSize),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setJobs((current) => [body, ...current]);
      setSelectedFile(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось запустить эксперимент",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function cancel(id: string) {
    try {
      const response = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      await refresh(true);
    } catch {
      setError("Не удалось остановить эксперимент");
    }
  }
  function toggleModel(id: string) {
    setModels((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id],
    );
  }
  function toggleDataset(id: string) {
    setRunDatasets((current) =>
      current.includes(id) ? current.filter((d) => d !== id) : [...current, id],
    );
  }
  function changeDataset(key: DatasetKey) {
    setDataset(key);
    setSelectedFile(null);
  }

  const nav = [
    { id: "answers" as const, label: "Ответы", icon: Database },
    { id: "overview" as const, label: "Обзор", icon: LayoutDashboard },
    { id: "history" as const, label: "Эксперименты", icon: FlaskConical },
    { id: "datasets" as const, label: "Датасеты", icon: Database },
  ];
  const titles = {
    answers: "Ответы и оценки",
    overview: "Обзор экспериментов",
    history: "История экспериментов",
    datasets: "Датасеты",
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen lg:flex">
        <aside className="hidden w-[216px] shrink-0 flex-col border-r border-border/80 bg-[#141517] lg:flex">
          <div className="flex h-[76px] items-center px-6">
            <Logo />
          </div>
          <div className="mx-4 mb-7 flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-3">
            <div className="flex size-7 items-center justify-center rounded-md bg-secondary">
              <Layers3 className="size-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">RAG Abitura</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Локальное пространство
              </p>
            </div>
          </div>
          <p className="mb-2 px-6 text-[9px] font-medium tracking-[0.15em] text-muted-foreground/60 uppercase">
            Evaluation
          </p>
          <nav className="space-y-1 px-3" aria-label="Разделы панели">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-xs transition-colors",
                  view === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {item.id === "history" && (
                  <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px]">
                    {reports.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="mt-8 px-6">
            <p className="mb-3 text-[9px] font-medium tracking-[0.15em] text-muted-foreground/60 uppercase">
              Стек эксперимента
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              Dense retrieval
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-[#a29af6]" />2 датасета
            </div>
          </div>
          <div className="mt-auto p-4 pt-12">
            <Card className="border-primary/15 bg-primary/[0.035] p-3.5">
              <div className="mb-2 flex items-center gap-2 text-xs text-primary">
                <Activity className="size-3.5" />
                Локальная оценка
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Результаты вашего проекта.
                <br />
                Каждый запуск — новое сравнение.
              </p>
            </Card>
            <div className="mt-5 flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold">
                RA
              </div>
              <span className="text-[11px] text-muted-foreground">
                Abitura workspace
              </span>
              <span className="ml-auto text-[9px] text-muted-foreground/50">
                v0.1
              </span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex h-[64px] items-center justify-between border-b border-border/80 px-5 sm:px-8">
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
              <span>Workspace</span>
              <ChevronRight className="size-3" />
              <span className="text-foreground">Evaluation</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                LOCAL
              </span>
              <div className="h-4 w-px bg-border" />
              <MetricsHelp />
              <span className="flex size-7 items-center justify-center rounded-full bg-[#2b2e36] text-[10px] font-medium">
                RA
              </span>
            </div>
          </header>
          <nav
            className="flex gap-2 border-b border-border px-5 py-2 lg:hidden"
            aria-label="Разделы панели"
          >
            {nav.map((n) => (
              <Button
                key={n.id}
                variant={view === n.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView(n.id)}
              >
                <n.icon />
                {n.label}
              </Button>
            ))}
          </nav>
          <main className="mx-auto max-w-[1550px] p-5 sm:p-8">
            <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2.5 flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  <span className="h-px w-5 bg-primary" />
                  {view === "answers" ? "Оценка ответов" : "Embedding benchmark"}
                </div>
                <h1 className="text-[26px] font-semibold tracking-[-0.035em] sm:text-[30px]">
                  {titles[view]}
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {view === "answers"
                    ? "Вопросы, ответы моделей и результаты оценки."
                    : view === "overview"
                    ? "Сравнивайте модели. Измеряйте качество поиска. Выбирайте по данным."
                    : view === "history"
                      ? "Сохранённые отчёты и состояние локальных запусков."
                      : "Эталонные вопросы и корпуса для воспроизводимой оценки."}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void refresh(); window.dispatchEvent(new Event("answers-refresh")); }}
                  disabled={refreshing}
                >
                  <RefreshCw className={cn(refreshing && "animate-spin")} />
                  Обновить
                </Button>
                {selected && view !== "answers" && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/reports/${encodeURIComponent(selected.report.file)}`}
                    >
                      <ArrowDownToLine />
                      JSON-отчёт
                    </a>
                  </Button>
                )}
              </div>
            </div>
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  role="alert"
                  className="mb-5 flex items-start gap-3 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300"
                >
                  <span className="min-w-0 flex-1 break-words">{error}</span>
                  <button
                    onClick={() => setError("")}
                    aria-label="Закрыть ошибку"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {view !== "datasets" && view !== "answers" && (
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div
                      className="inline-flex gap-1 rounded-lg border border-border bg-[#151619] p-1"
                      aria-label="Датасет результатов"
                    >
                      {datasets.map((d) => (
                        <button
                          key={d.key}
                          onClick={() => changeDataset(d.key)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-[11px] transition-colors",
                            dataset === d.key
                              ? "bg-[#2a2c31] text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {d.name}
                          <span
                            className={cn(
                              "text-[9px]",
                              dataset === d.key
                                ? "text-primary"
                                : "text-muted-foreground/60",
                            )}
                          >
                            {d.language}
                          </span>
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {testedModelCount} моделей · {latest.length} вариантов с результатами
                    </span>
                  </div>
                )}

                {view === "answers" && <AnswersPanel />}

                {view === "overview" && (
                  <>
                    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                      <MetricCard
                        label="Hit rate @5"
                        value={pct(result?.metrics["hit_rate@5"])}
                        note="Релевантный документ в top-5"
                        icon={Activity}
                        accent
                      />
                      <MetricCard
                        label="MRR @10"
                        value={pct(result?.metrics["mrr@10"])}
                        note="Позиция первого релевантного документа"
                        icon={BarChart3}
                      />
                      <MetricCard
                        label="Время на запрос"
                        value={
                          queryMs === undefined
                            ? "—"
                            : `${queryMs.toFixed(1)} ms`
                        }
                        note={
                          result?.query_latency_p95_ms === undefined
                            ? "Среднее время кодирования запроса"
                            : `P95 ${result.query_latency_p95_ms.toFixed(1)} ms · среднее время кодирования`
                        }
                        icon={Clock3}
                      />
                      <MetricCard
                        label="Вопросов в датасете"
                        value={number.format(stats.queries)}
                        note={`${number.format(stats.documents)} документов в корпусе`}
                        icon={Database}
                      />
                    </div>
                    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="min-w-0 space-y-5">
                        <Card>
                          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                            <div>
                              <CardTitle>Качество retrieval</CardTitle>
                              <p className="mt-1.5 text-[10px] text-muted-foreground">
                                Как меняются метрики с глубиной поиска
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Select
                                value={selectedModelId}
                                onValueChange={(value) => {
                                  setChartModel(value);
                                  setChartVariant("default_query_prompt");
                                  setSelectedFile(null);
                                }}
                              >
                                <SelectTrigger aria-label="Модель на графике" className="w-[190px]">
                                  <SelectValue placeholder="Выберите модель" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(availableModels.length
                                    ? availableModels
                                    : [MODEL_CATALOG[0].id]
                                  ).map((id) => (
                                    <SelectItem key={id} value={id}>
                                      {modelLabel(id)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {promptVariants.length > 1 && (
                                <Select value={promptVariantId(selected?.model.model ?? "")} onValueChange={(value) => { setChartVariant(value); setSelectedFile(null); }}>
                                  <SelectTrigger aria-label="Инструкция для поиска" className="w-[220px]">
                                    <SelectValue placeholder="Выберите инструкцию" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {promptVariants.map((variant) => (
                                      <SelectItem key={variant} value={variant}>{promptLabel(variant)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <RetrievalChart result={result} />
                            {selected && (
                              <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
                                <Check className="size-3 text-primary" />
                                <span>
                                  {date(selected.report.created_at_utc)}
                                </span>
                                <span className="mx-1 text-border">/</span>
                                <span>
                                  {selected.model.device.toUpperCase()}
                                </span>
                                <span className="ml-auto">
                                  {result?.embedding_dimension}d
                                </span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                            <div>
                              <CardTitle>Сравнение моделей</CardTitle>
                              <p className="mt-1.5 text-[10px] text-muted-foreground">
                                Последние результаты моделей и вариантов · {stats.name}
                              </p>
                            </div>
                            <div className="relative">
                              <Search className="absolute top-2.5 left-2.5 size-3 text-muted-foreground" />
                              <input
                                aria-label="Поиск модели"
                                placeholder="Найти модель…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-8 w-40 rounded-md border border-border bg-transparent pr-2 pl-7 text-[10px] outline-none focus:border-primary/50"
                              />
                            </div>
                          </CardHeader>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px]">
                              <thead className="border-y border-border bg-white/[0.015] text-[9px] text-muted-foreground">
                                <tr>
                                  <th className="py-3 pl-5 font-normal">
                                    МОДЕЛЬ
                                  </th>
                                  <th className="px-3 font-normal">HIT @5</th>
                                  <th className="px-3 font-normal">HIT @10</th>
                                  <th className="px-3 font-normal">MRR @10</th>
                                  <th className="pr-5 text-right font-normal">
                                    MEAN / P95 · MS/QUERY
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleComparisonEntries.map((entry) => {
                                  const row = entry.row;
                                  return (
                                    <tr
                                      key={entry.key}
                                      className={cn(
                                        "border-b border-border/50 last:border-0",
                                        row &&
                                          chartModel === baseModelId(entry.id) &&
                                          promptVariantId(entry.id) === chartVariant &&
                                          "bg-primary/[0.025]",
                                      )}
                                    >
                                      <td className="py-4 pl-5">
                                        <button
                                          className="flex items-center gap-2.5 text-left disabled:cursor-default"
                                          disabled={!row}
                                          onClick={() => {
                                            setChartModel(baseModelId(entry.id));
                                            setChartVariant(promptVariantId(entry.id));
                                            setSelectedFile(null);
                                          }}
                                        >
                                          <span
                                            className="size-2 shrink-0 rounded-full"
                                            style={{
                                              background: row ? entry.color : "#42454c",
                                            }}
                                          />
                                          <span>
                                            <span
                                              className={cn(
                                                "block text-[11px] font-medium",
                                                !row && "text-muted-foreground",
                                              )}
                                            >
                                              {entry.name}
                                            </span>
                                            <span className="mt-0.5 block text-[9px] text-muted-foreground/70">
                                              {row
                                                ? `${entry.family} · ${row.result.embedding_dimension}d · ${row.model.device.toUpperCase()}`
                                                : `${entry.family} · Нет прогонов`}
                                            </span>
                                          </span>
                                        </button>
                                      </td>
                                      <td
                                        className={cn(
                                          "px-3 tabular-nums",
                                          row && "text-primary",
                                        )}
                                      >
                                        {pct(row?.result.metrics["hit_rate@5"])}
                                      </td>
                                      <td className="px-3 tabular-nums">
                                        {pct(
                                          row?.result.metrics["hit_rate@10"],
                                        )}
                                      </td>
                                      <td className="px-3 tabular-nums">
                                        {pct(row?.result.metrics["mrr@10"])}
                                      </td>
                                      <td className="pr-5 text-right text-muted-foreground tabular-nums">
                                        {row ? (
                                          <>
                                            {(
                                              (row.result.query_embedding_seconds /
                                                row.result.query_count) *
                                              1000
                                            ).toFixed(1)}
                                            {row.result.query_latency_p95_ms !== undefined && (
                                              <span className="ml-1 text-[9px] text-muted-foreground/70">
                                                / {row.result.query_latency_p95_ms.toFixed(1)} p95
                                              </span>
                                            )}
                                          </>
                                        ) : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {!visibleComparisonEntries.length && (
                              <p className="py-8 text-center text-xs text-muted-foreground">
                                Модель не найдена
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 px-5 py-3 text-[9px] text-muted-foreground">
                            <CircleHelp className="size-3" />
                            Для сравнения используйте одинаковые датасет и
                            устройство.
                          </div>
                        </Card>
                      </div>
                      <Card className="overflow-hidden">
                        <div className="border-b border-border p-5">
                          <div className="mb-2 flex items-center gap-2">
                            <FlaskConical className="size-4 text-primary" />
                            <h2 className="text-sm font-semibold">
                              Новый эксперимент
                            </h2>
                          </div>
                          <p className="text-[10px] leading-relaxed text-muted-foreground">
                            Выберите модели и запустите оценку
                            <br />
                            на эталонном корпусе.
                          </p>
                        </div>
                        <div className="space-y-5 p-5">
                          <fieldset disabled={!!activeJob || submitting}>
                            <legend className="mb-3 flex w-full justify-between text-[10px] font-medium text-muted-foreground">
                              EMBEDDING-МОДЕЛИ
                              <span className="text-primary">
                                {models.length} выбрано
                              </span>
                            </legend>
                            <div className="space-y-2">
                              {MODEL_CATALOG.filter((m) => m.tag === "Baseline").map((m) => (
                                <label
                                  key={m.id}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
                                    models.includes(m.id)
                                      ? "border-primary/35 bg-primary/[0.035]"
                                      : "border-border hover:border-muted-foreground/50",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={models.includes(m.id)}
                                    onChange={() => toggleModel(m.id)}
                                    className="mt-0.5 size-3.5 shrink-0"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center justify-between gap-1">
                                      <span className="text-[11px] font-medium">
                                        {m.name.replace("Multilingual ", "")}
                                      </span>
                                      {m.tag === "Baseline" && (
                                        <span className="text-[8px] text-primary">
                                          baseline
                                        </span>
                                      )}
                                    </span>
                                    <span className="mt-1 block text-[9px] text-muted-foreground">
                                      {m.family} · {m.dimension} dimensions
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <fieldset disabled={!!activeJob || submitting}>
                            <legend className="mb-3 text-[10px] font-medium text-muted-foreground">
                              ДАТАСЕТЫ ЗАПУСКА
                            </legend>
                            <div className="grid grid-cols-2 gap-2">
                              {datasets.map((d) => (
                                <label
                                  key={d.cli}
                                  className={cn(
                                    "cursor-pointer rounded-lg border p-3",
                                    runDatasets.includes(d.cli)
                                      ? "border-primary/35 bg-primary/[0.035]"
                                      : "border-border",
                                    !d.available && "opacity-40",
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <Database className="size-3.5 text-muted-foreground" />
                                    <input
                                      type="checkbox"
                                      checked={runDatasets.includes(d.cli)}
                                      disabled={!d.available}
                                      onChange={() => toggleDataset(d.cli)}
                                      className="size-3"
                                    />
                                  </div>
                                  <span className="mt-2.5 block text-[10px] font-medium">
                                    {d.name}
                                  </span>
                                  <span className="mt-1 block text-[9px] text-muted-foreground">
                                    {number.format(d.queries)} вопросов ·{" "}
                                    {d.language}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-2 block text-[10px] text-muted-foreground">
                                Устройство
                              </label>
                              <Select
                                value={device}
                                onValueChange={setDevice}
                                disabled={!!activeJob || submitting}
                              >
                                <SelectTrigger aria-label="Устройство">
                                  <Cpu className="size-3.5 text-muted-foreground" />
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {["auto", "cpu", "cuda"].map((d) => (
                                    <SelectItem key={d} value={d}>
                                      {d === "auto" ? "Auto" : d.toUpperCase()}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="mb-2 block text-[10px] text-muted-foreground">
                                Batch size
                              </label>
                              <Select
                                value={batchSize}
                                onValueChange={setBatchSize}
                                disabled={!!activeJob || submitting}
                              >
                                <SelectTrigger aria-label="Batch size">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[4, 8, 16, 32].map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                      {n}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="rounded-md border border-dashed border-border px-3 py-2.5">
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <Layers3 className="size-3" />
                              <span>
                                Top-k:{" "}
                                <span className="text-foreground">
                                  1, 5, 10
                                </span>
                              </span>
                              <span className="ml-auto">Cosine</span>
                            </div>
                          </div>
                          <Button
                            onClick={() => void launch()}
                            disabled={
                              submitting ||
                              !!activeJob ||
                              !models.length ||
                              !runDatasets.length
                            }
                            className="w-full text-xs"
                          >
                            {submitting || activeJob ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Play className="size-3.5" fill="currentColor" />
                            )}
                            {activeJob
                              ? "Эксперимент выполняется"
                              : "Запустить эксперимент"}
                          </Button>
                          <p className="-mt-2 text-center text-[9px] leading-relaxed text-muted-foreground">
                            Первый запуск скачает выбранные модели.
                            <br />
                            SQuAD на CPU может занять несколько минут.
                          </p>
                        </div>
                      </Card>
                    </div>
                    {lastJob && (
                      <div className="mt-5">
                        <JobPanel
                          job={lastJob}
                          onCancel={() => void cancel(lastJob.id)}
                        />
                      </div>
                    )}
                  </>
                )}

                {view === "history" && (
                  <div className="space-y-5">
                    {jobs.map((job) => (
                      <JobPanel
                        key={job.id}
                        job={job}
                        onCancel={() => void cancel(job.id)}
                      />
                    ))}
                    <Card>
                      <CardHeader>
                        <CardTitle>Сохранённые результаты</CardTitle>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {rows.length} оценок · {stats.name}
                        </p>
                      </CardHeader>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-y border-border text-[10px] text-muted-foreground">
                            <tr>
                              <th className="p-4 pl-5 font-normal">
                                Модель / запуск
                              </th>
                              <th className="p-4 font-normal">Hit @5</th>
                              <th className="p-4 font-normal">MRR @10</th>
                              <th className="p-4 font-normal">Устройство</th>
                              <th className="p-4 font-normal">Отчёт</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr
                                key={`${row.report.file}-${row.model.model}`}
                                className="border-b border-border/50 last:border-0"
                              >
                                <td className="p-4 pl-5">
                                  <button
                                    className="text-left hover:text-primary"
                                    onClick={() => {
                                      setChartModel(baseModelId(row.model.model));
                                      setChartVariant(promptVariantId(row.model.model));
                                      setSelectedFile(row.report.file);
                                      setView("overview");
                                    }}
                                  >
                                    <span className="block text-xs">
                                      {modelLabel(row.model.model)}
                                    </span>
                                    <span className="mt-1 block text-[10px] text-muted-foreground">
                                      {date(row.report.created_at_utc)}
                                    </span>
                                  </button>
                                </td>
                                <td className="p-4 text-primary tabular-nums">
                                  {pct(row.result.metrics["hit_rate@5"])}
                                </td>
                                <td className="p-4 tabular-nums">
                                  {pct(row.result.metrics["mrr@10"])}
                                </td>
                                <td className="p-4">
                                  <Badge>
                                    {row.model.device.toUpperCase()}
                                  </Badge>
                                </td>
                                <td className="p-4">
                                  <Button variant="ghost" size="icon" asChild>
                                    <a
                                      aria-label={`Скачать отчёт ${row.report.file}`}
                                      href={`/api/reports/${encodeURIComponent(row.report.file)}`}
                                    >
                                      <ArrowDownToLine />
                                    </a>
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!rows.length && (
                          <p className="p-10 text-center text-xs text-muted-foreground">
                            Для этого датасета пока нет результатов.
                          </p>
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                {view === "datasets" && (
                  <>
                    <div className="grid gap-5 md:grid-cols-2">
                      {datasets.map((d) => (
                        <Card key={d.key} className="overflow-hidden">
                          <div className="flex items-center justify-between border-b border-border px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Database className="size-5" />
                              </div>
                              <div>
                                <h2 className="text-base font-medium">
                                  {d.name}
                                </h2>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  {d.key === "abitura_golden"
                                    ? "Корпус проекта · admission QA"
                                    : "Stanford QA · dev split"}
                                </p>
                              </div>
                            </div>
                            <Badge>{d.language}</Badge>
                          </div>
                          <div className="p-6">
                            <div className="grid grid-cols-2 gap-5">
                              <div>
                                <p className="text-[10px] text-muted-foreground">
                                  Эталонных вопросов
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight">
                                  {number.format(d.queries)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">
                                  Документов в корпусе
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight">
                                  {number.format(d.documents)}
                                </p>
                              </div>
                            </div>
                            <p className="my-6 min-h-12 text-xs leading-relaxed text-muted-foreground">
                              {d.key === "abitura_golden"
                                ? "Русские вопросы абитуриентов с привязкой к релевантным чанкам. Основной ориентир для выбора модели вашего бота."
                                : "Английские вопросы из SQuAD 1.1. Каждый вопрос связан с исходным абзацем; проверяется поиск этого абзаца в общем корпусе."}
                            </p>
                            <div className="flex items-center justify-between">
                              <span
                                className={cn(
                                  "flex items-center gap-2 text-[10px]",
                                  d.available ? "text-primary" : "text-red-300",
                                )}
                              >
                                <span className="size-1.5 rounded-full bg-current" />
                                {d.available
                                  ? "Датасет доступен"
                                  : "Файл не найден"}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  changeDataset(d.key);
                                  setView("overview");
                                }}
                              >
                                Результаты
                                <ArrowRight />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                    <Card className="mt-5 p-6">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4 text-primary" />
                        Что измеряет этот benchmark
                      </div>
                      <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
                        Запросы и документы кодируются выбранной моделью.
                        Документы ранжируются по cosine similarity, а top-k
                        сравнивается с эталонными источниками. Текущий этап
                        оценивает retrieval; оценка сгенерированных LLM-ответов
                        подключается отдельным этапом.
                      </p>
                    </Card>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-[9px] text-muted-foreground/65">
              <span>Eval Studio / RAG Abitura</span>
              <span className="flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-primary/70" />
                Данные из локальных JSON-отчётов
              </span>
            </footer>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}

function JobPanel({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <Terminal className="size-4 text-muted-foreground" />
          <span>
            <span className="block text-xs font-medium">
              {job.models.map(modelLabel).join(" + ")}
            </span>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {job.datasets.join(" · ")} / {date(job.startedAt)}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-3">
          <Badge
            className={
              job.status === "running" || job.status === "completed"
                ? "border-primary/20 text-primary"
                : job.status === "failed"
                  ? "border-red-400/20 text-red-300"
                  : ""
            }
          >
            {job.status === "running" || job.status === "cancelling" ? (
              <Loader2 className="size-2.5 animate-spin" />
            ) : (
              <span className="size-1 rounded-full bg-current" />
            )}
            {statusLabel[job.status]}
          </Badge>
          {job.status === "running" && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              <Square className="size-3" />
              Остановить
            </Button>
          )}
          {job.status === "completed" && (
            <Button size="sm" variant="ghost" asChild>
              <a href={`/api/reports/${encodeURIComponent(job.outputFile)}`}>
                <ArrowDownToLine />
                JSON
              </a>
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border bg-[#111315] p-5">
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-[#a9b7b0]">
            {job.logs || "Загрузка модели и подготовка датасетов…"}
          </pre>
          {job.error && (
            <p className="mt-3 text-[10px] text-red-300">{job.error}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function MetricsHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Описание метрик">
          <CircleHelp className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold tracking-tight">
          Как читать результаты
        </DialogTitle>
        <DialogDescription className="mt-2 text-xs text-muted-foreground">
          Все метрики оценивают поиск релевантных документов.
        </DialogDescription>
        <div className="mt-6 space-y-5 text-xs leading-relaxed">
          {[
            {
              name: "Hit rate @k",
              description:
                "Доля вопросов, для которых в top-k есть хотя бы один эталонный документ.",
            },
            {
              name: "Recall @k",
              description:
                "Доля эталонных документов, найденных в top-k. При одном эталонном документе совпадает с Hit rate.",
            },
            {
              name: "MRR @k",
              description:
                "Среднее значение 1 / позиция первого эталонного документа. Документ на первом месте даёт 1, на втором — 0,5.",
            },
            {
              name: "ms / query",
              description:
                "Среднее время кодирования запроса. Сравнивайте на одинаковом устройстве и с одинаковым batch size.",
            },
          ].map((item) => (
            <div key={item.name}>
              <h3 className="mb-1 font-medium text-primary">{item.name}</h3>
              <p className="text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
