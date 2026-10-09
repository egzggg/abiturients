import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.EVAL_TEST_URL ?? "http://127.0.0.1:3000";
const post = (body) =>
  fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(body),
  });

test("dashboard renders and reads valid local reports", async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Eval Studio/);
  const response = await fetch(`${base}/api/reports`);
  assert.equal(response.status, 200);
  const reports = await response.json();
  assert.ok(Array.isArray(reports));
  if (reports.length) {
    const report = reports[0];
    const download = await fetch(
      `${base}/api/reports/${encodeURIComponent(report.file)}`,
    );
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /attachment/);
    const source = await download.json();
    assert.equal(source.created_at_utc, report.created_at_utc);
  }
});

test("loads current embedding comparisons and preserves source variants", async () => {
  const response = await fetch(`${base}/api/reports`);
  assert.equal(response.status, 200);
  const reports = await response.json();
  const expected = [
    "gte_qwen2_1_5b_golden_comparison.json",
    "qwen3_embedding_4b_gguf_golden_comparison.json",
    "qwen3_embedding_8b_gguf_golden_comparison.json",
  ];
  for (const file of expected) {
    const report = reports.find((item) => item.file === file);
    assert.ok(report, `${file} missing from dashboard`);
    assert.ok(report.models.some((model) => model.model.includes("#applicant_task_prompt")));
    const source = await (await fetch(`${base}/api/reports/${file}`)).json();
    assert.ok(source.variants.applicant_task_prompt);
  }
});

test("rejects invalid evaluator arguments before spawning a process", async () => {
  for (const body of [
    {
      models: ["intfloat/multilingual-e5-large;echo injected"],
      datasets: ["golden"],
      device: "cpu",
      batchSize: 16,
    },
    {
      models: ["intfloat/multilingual-e5-large"],
      datasets: ["unknown"],
      device: "cpu",
      batchSize: 16,
    },
    { models: [], datasets: ["golden"], device: "cpu", batchSize: 16 },
    {
      models: ["intfloat/multilingual-e5-large"],
      datasets: ["golden"],
      device: "cpu",
      batchSize: 0,
    },
  ])
    assert.equal((await post(body)).status, 400);
});

test("rejects a cross-origin launch and invalid report downloads", async () => {
  const launch = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.com",
    },
    body: JSON.stringify({
      models: ["intfloat/multilingual-e5-large"],
      datasets: ["golden"],
      device: "cpu",
      batchSize: 16,
    }),
  });
  assert.equal(launch.status, 400);
  assert.equal((await fetch(`${base}/api/reports/missing.json`)).status, 404);
  assert.equal(
    (
      await fetch(`${base}/api/jobs/missing`, {
        method: "DELETE",
        headers: { Origin: base },
      })
    ).status,
    400,
  );
});

test("reads SQLite answers and validates pagination", async () => {
  const response = await fetch(`${base}/api/answers`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(typeof data.available, "boolean");
  assert.equal(typeof data.total, "number");
  assert.equal(data.page, 1);
  assert.equal(data.pageSize, 25);
  assert.ok(Array.isArray(data.rows));
  for (const row of data.rows) {
    assert.deepEqual(Object.keys(row), ["id", "llm_model", "request", "answer", "llm_judge_model", "manual_grade", "llm_grade"]);
  }
  for (const query of ["page=0", "pageSize=101", "page=abc", "sortBy=answer", "order=invalid", `search=${"a".repeat(501)}`]) {
    assert.equal((await fetch(`${base}/api/answers?${query}`)).status, 400);
  }
  const search = await fetch(`${base}/api/answers?search=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(search.status, 200);
  assert.equal((await search.json()).total, 0);
});


test("sorts SQLite models before pagination", async () => {
  for (const sortBy of ["llm_model", "llm_judge_model"]) {
    for (const order of ["asc", "desc"]) {
      const response = await fetch(`${base}/api/answers?sortBy=${sortBy}&order=${order}&pageSize=100`);
      assert.equal(response.status, 200);
      const data = await response.json();
      const keys = data.rows.map((row) => row[sortBy] || "");
      const populated = keys.filter((key) => key.trim());
      const sorted = [...populated].sort((a, b) => {
        const left = a.replace(/[A-Z]/g, (c) => c.toLowerCase());
        const right = b.replace(/[A-Z]/g, (c) => c.toLowerCase());
        return (left < right ? -1 : left > right ? 1 : 0) * (order === "asc" ? 1 : -1);
      });
      assert.deepEqual(populated, sorted);
      assert.ok(keys.slice(populated.length).every((key) => !key.trim()));
      if (data.total > 1) {
        const second = await (await fetch(`${base}/api/answers?sortBy=${sortBy}&order=${order}&pageSize=1&page=2`)).json();
        assert.equal(second.rows[0].id, data.rows[1].id);
      }
    }
  }
});

test("filters answers by exact models and preserves all model options", async () => {
  const data = await (await fetch(`${base}/api/answers`)).json();
  assert.ok(Array.isArray(data.models));
  assert.ok(Array.isArray(data.judgeModels));
  for (const [parameter, options, field] of [
    ["model", data.models, "llm_model"],
    ["judgeModel", data.judgeModels, "llm_judge_model"],
  ]) {
    for (const value of options) {
      const query = new URLSearchParams({ [parameter]: value, pageSize: "1", page: "2" });
      const response = await fetch(`${base}/api/answers?${query}`);
      assert.equal(response.status, 200);
      const filtered = await response.json();
      assert.ok(filtered.total > 0);
      assert.ok(filtered.rows.every((row) => row[field] === value));
      assert.deepEqual(filtered.models, data.models);
      assert.deepEqual(filtered.judgeModels, data.judgeModels);
    }
  }
  const missing = await (await fetch(`${base}/api/answers?model=${encodeURIComponent("' OR 1=1 --")}`)).json();
  assert.equal(missing.total, 0);
});

test("filters by manual and LLM grade presence", async () => {
  for (const [parameter, field] of [["manualGrade", "manual_grade"], ["llmGrade", "llm_grade"]]) {
    for (const presence of ["present", "missing"]) {
      const response = await fetch(`${base}/api/answers?${parameter}=${presence}`);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.rows.every((row) => Boolean(row[field]?.trim()) === (presence === "present")));
    }
    assert.equal((await fetch(`${base}/api/answers?${parameter}=invalid`)).status, 400);
  }
  const config = await (await fetch(`${base}/api/answers/config`)).json();
  assert.deepEqual(Object.keys(config).sort(), ["configured", "models"]);
  assert.ok(config.models.length > 0);
  assert.equal(typeof config.configured, "boolean");
});

test("validates cluster upload fields and file formats", async () => {
  const upload = (file, model = "gpt-oss-120b/latest", origin = base) => {
    const body = new FormData();
    if (file) body.set("file", file);
    body.set("model", model);
    return fetch(`${base}/api/answers/clusters`, { method: "POST", headers: { Origin: origin }, body });
  };
  assert.equal((await upload(null)).status, 400);
  assert.equal((await upload(new File(['{}'], "questions.csv"))).status, 400);
  assert.equal((await upload(new File(['{}'], "questions.json"), "")).status, 400);
  assert.equal((await upload(new File([], "questions.json"))).status, 413);
  assert.equal((await upload(new File(['{}'], "questions.json"), "gpt-oss-120b/latest", "https://example.com")).status, 400);
});

test("creates and grades questions in an isolated test database", { skip: process.env.EVAL_TEST_WRITES !== "1" }, async () => {
  const config = await (await fetch(`${base}/api/answers/config`)).json();
  const write = (url, method, body, origin = base) => fetch(`${base}${url}`, {
    method, headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
  const response = await write("/api/answers", "POST", { question: "  Тестовый вопрос о Гарри  ", model: config.models[0] });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.request, "Тестовый вопрос о Гарри");
  for (const field of ["answer", "manual_grade", "llm_grade", "llm_judge_model"]) assert.equal(created[field], null);
  const graded = await write(`/api/answers/${created.id}`, "PATCH", { manual_grade: "0" });
  assert.equal(graded.status, 200);
  const llmGraded = await write(`/api/answers/${created.id}`, "PATCH", { llm_grade: "Верно", llm_judge_model: "Внешняя модель" });
  assert.equal(llmGraded.status, 200);
  const result = await llmGraded.json();
  assert.equal(result.manual_grade, "0");
  assert.equal(result.llm_judge_model, "Внешняя модель");
  assert.equal(result.llm_grade, "Верно");
  assert.equal(result.answer, null);
  assert.equal(result.request, created.request);
  const filtered = await (await fetch(`${base}/api/answers?manualGrade=present&llmGrade=present&search=${encodeURIComponent(created.request)}`)).json();
  assert.ok(filtered.rows.some((row) => row.id === created.id));
  for (const body of [{ question: " ", model: config.models[0] }, { question: "Вопрос", model: "invalid-model" }, { question: "Вопрос", model: config.models[0], manual_grade: "5" }]) {
    assert.equal((await write("/api/answers", "POST", body)).status, 400);
  }
  assert.equal((await write(`/api/answers/${created.id}`, "PATCH", { answer: "overwrite" })).status, 400);
  assert.equal((await write(`/api/answers/${created.id}`, "PATCH", { manual_grade: "5" }, "https://example.com")).status, 400);
  assert.equal((await write("/api/answers/999999999", "PATCH", { manual_grade: "5" })).status, 404);
  assert.equal((await write("/api/answers/999999999/generate", "POST", {})).status, 404);
});
