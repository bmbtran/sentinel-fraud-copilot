import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentTask, replayCases } from "../src/replay-suite.js";
import { evaluateWithOpenAI, summarizeBenchmark } from "../src/openai-benchmark.mjs";

test("raw-sync benchmark context does not leak the answer contract", () => {
  const context = JSON.stringify(buildAgentTask("R02", "raw_sync"));
  assert.ok(context.includes("coffee-pending"));
  assert.ok(context.includes("coffee-posted"));
  assert.equal(context.includes("pending_replaced"), false);
  assert.equal(context.includes("referenceConclusion"), false);
});

test("reconciled benchmark context contains only the derived current state", () => {
  const task = buildAgentTask("R02", "reconciled_state");
  assert.deepEqual(task.currentTransactions.map((item) => item.transaction_id), ["coffee-posted"]);
  assert.equal("syncBatches" in task, false);
});

test("OpenAI evaluation scores structured output with the independent contract", async () => {
  let request;
  const result = await evaluateWithOpenAI({
    apiKey: "test-key",
    model: "test-model",
    caseId: "R02",
    condition: "raw_sync",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({
        id: "resp_test",
        output: [{ content: [{ type: "output_text", text: JSON.stringify({ conclusion: "One $6.50 coffee purchase was replaced from pending to posted.", sourceTransactionIds: ["coffee-posted"], limitations: ["pending_replaced"] }) }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(result.validation.passed, true);
});

test("benchmark summary keeps conditions separate", () => {
  const rows = [
    { condition: "raw_sync", validation: { passed: true } },
    { condition: "raw_sync", validation: { passed: false } },
    { condition: "reconciled_state", validation: { passed: true } },
  ];
  assert.deepEqual(summarizeBenchmark(rows), [
    { condition: "raw_sync", passed: 1, total: 2, passRate: 0.5 },
    { condition: "reconciled_state", passed: 1, total: 1, passRate: 1 },
  ]);
  assert.equal(replayCases.length, 12);
});
