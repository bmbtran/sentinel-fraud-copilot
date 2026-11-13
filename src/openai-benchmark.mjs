import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildAgentTask, replayCases, validateFinancialAnswer } from "./replay-suite.js";

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    conclusion: { type: "string" },
    sourceTransactionIds: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["conclusion", "sourceTransactionIds", "limitations"],
};

const CONDITIONS = ["raw_sync", "reconciled_state"];

function parseArgs(args) {
  const options = { all: false, caseIds: [], model: process.env.OPENAI_MODEL, out: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--all") options.all = true;
    else if (value === "--case") options.caseIds.push(args[++index]);
    else if (value === "--model") options.model = args[++index];
    else if (value === "--out") options.out = args[++index];
    else throw new Error(`Unknown benchmark option: ${value}`);
  }
  return options;
}

function outputText(response) {
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("The Responses API returned no output text.");
}

function instruction(condition) {
  const source = condition === "raw_sync"
    ? "You receive raw Plaid-shaped Transactions Sync batches. Reconstruct the final state before answering."
    : "You receive a deterministic reconciliation of Plaid-shaped Transactions Sync batches. Use only the current transactions and cursor trace supplied.";
  return `${source}\nReturn JSON only. Answer the question conservatively. Cite transaction IDs in sourceTransactionIds. Add applicable limitations using exactly these snake_case labels when appropriate: partial_period, pending_replaced, merchant_enriched, refund_included, needs_confirmation, removed_transaction, amount_modified, transfer_excluded, account_scope. Do not invent transactions or claim fraud from similarity alone.`;
}

export async function evaluateWithOpenAI({ apiKey, model, caseId, condition, fetchImpl = fetch }) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      store: false,
      instructions: instruction(condition),
      input: JSON.stringify(buildAgentTask(caseId, condition)),
      text: { format: { type: "json_schema", name: "financial_answer", strict: true, schema: ANSWER_SCHEMA } },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Responses API ${response.status}: ${payload.error?.message ?? "unknown error"}`);
  const answer = JSON.parse(outputText(payload));
  return {
    caseId,
    condition,
    responseId: payload.id ?? null,
    answer,
    validation: validateFinancialAnswer({ caseId, ...answer }),
  };
}

export function summarizeBenchmark(rows) {
  return CONDITIONS.map((condition) => {
    const conditionRows = rows.filter((row) => row.condition === condition);
    const passed = conditionRows.filter((row) => row.validation.passed).length;
    return { condition, passed, total: conditionRows.length, passRate: conditionRows.length ? Number((passed / conditionRows.length).toFixed(3)) : 0 };
  });
}

export async function runBenchmark({ apiKey, model, caseIds, fetchImpl = fetch }) {
  const rows = [];
  for (const caseId of caseIds) {
    for (const condition of CONDITIONS) rows.push(await evaluateWithOpenAI({ apiKey, model, caseId, condition, fetchImpl }));
  }
  return { generatedAt: new Date().toISOString(), model, caseIds, conditions: CONDITIONS, summary: summarizeBenchmark(rows), rows };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required. Use a newly issued key; do not reuse a key pasted into a terminal or chat.");
  if (!options.model) throw new Error("Choose a model with --model <model-id> or set OPENAI_MODEL.");
  const available = new Set(replayCases.map((item) => item.id));
  const caseIds = options.all ? replayCases.map((item) => item.id) : options.caseIds;
  if (!caseIds.length) throw new Error("Choose at least one --case Rxx, or use --all.");
  if (caseIds.some((caseId) => !available.has(caseId))) throw new Error("Unknown replay case requested.");
  const report = await runBenchmark({ apiKey: process.env.OPENAI_API_KEY, model: options.model, caseIds });
  const target = resolve(options.out ?? `output/benchmarks/${report.generatedAt.replaceAll(":", "-")}.json`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ saved: target, summary: report.summary }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
