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
