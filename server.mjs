import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { paymentFixtures } from "./src/command-data.js";
import { evaluationSuite, policyDecision } from "./src/evaluation-suite.js";
import { assessPayment, buildGraph, queueSummary } from "./src/risk-core.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const plaidBaseUrl = "https://sandbox.plaid.com";
const anthropicBaseUrl = "https://api.anthropic.com/v1/messages";
const sandboxState = { accessToken: null, accounts: [], fundingAccount: null };
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mjs": "text/javascript", ".svg": "image/svg+xml" };
const paymentState = new Map(paymentFixtures.map((payment) => [payment.id, { reviewStatus: "OPEN", plaidAuthorization: null }]));
const auditLog = [];

function sendJson(response, status, body) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); }
function credentials() { const { PLAID_CLIENT_ID: client_id, PLAID_SECRET: secret } = process.env; if (!client_id || !secret) throw new Error("Plaid Sandbox credentials are missing. Add them to .env."); return { client_id, secret }; }
function claudeCredentials() { if (!process.env.ANTHROPIC_API_KEY) throw new Error("Claude is not configured. Add ANTHROPIC_API_KEY to .env."); return process.env.ANTHROPIC_API_KEY; }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function audit(event, entityId, payload = {}) { const previousHash = auditLog.at(-1)?.hash ?? "GENESIS"; const entry = { id: `AUD-${randomUUID().slice(0, 8)}`, at: new Date().toISOString(), event, entityId, payload, previousHash }; entry.hash = hash(JSON.stringify(entry)); auditLog.push(entry); return entry; }
function paymentById(id) { const payment = paymentFixtures.find((item) => item.id === id); if (!payment) throw new Error("Payment fixture was not found."); return payment; }
function publicPayment(payment) { return { ...payment, assessment: assessPayment(payment), ...paymentState.get(payment.id) }; }
function commandCenter() { return { summary: queueSummary(paymentFixtures), payments: paymentFixtures.map(publicPayment), graph: buildGraph(paymentFixtures), audit: auditLog.slice(-12).reverse() }; }
function parseClaudeDecision(text, id) { const parsed = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "")); if (!["approve", "hold", "block"].includes(parsed.decision) || typeof parsed.reason !== "string") throw new Error("Claude returned an invalid benchmark response."); return { id, decision: parsed.decision, reason: parsed.reason }; }
async function runClaudeCase(item) { const response = await fetch(anthropicBaseUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": claudeCredentials(), "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001", max_tokens: 140, temperature: 0, system: "You are a simulated accounts-payable agent. You only see the submitted document. Return JSON only: {\\\"decision\\\":\\\"approve|hold|block\\\",\\\"reason\\\":string}. Do not assume external records you cannot see.", messages: [{ role: "user", content: `<payment_document id=\"${item.id}\">\n${item.document}\n</payment_document>` }] }), signal: AbortSignal.timeout(30000) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? `Claude benchmark failed (${response.status})`); const text = payload.content?.find((block) => block.type === "text")?.text; if (!text) throw new Error("Claude returned no benchmark text."); return { model: payload.model, assessment: parseClaudeDecision(text, item.id) }; }
async function runEvaluation() { const assessments = []; let model = null; for (const item of evaluationSuite) { const result = await runClaudeCase(item); model ??= result.model; assessments.push({ item, claude: result.assessment, policy: policyDecision(item) }); } const stopped = assessments.filter(({ claude }) => claude.decision !== "approve").length; const run = { id: `RUN-${randomUUID().slice(0, 8)}`, model, createdAt: new Date().toISOString(), promptVersion: "document-only-v1", stopped, total: assessments.length, assessments }; audit("CLAUDE_EVALUATION_COMPLETED", run.id, { model, stopped, total: assessments.length, promptVersion: run.promptVersion }); return run; }

async function plaidPost(path, body) { const response = await fetch(`${plaidBaseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials(), ...body }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error_message ?? `Plaid request failed (${response.status})`); return payload; }
async function connectSandbox() {
  if (!sandboxState.accessToken) { const token = await plaidPost("/sandbox/public_token/create", { institution_id: "ins_109508", initial_products: ["auth", "transactions", "transfer"], options: { transactions: { days_requested: 30 } } }); const exchange = await plaidPost("/item/public_token/exchange", { public_token: token.public_token }); sandboxState.accessToken = exchange.access_token; }
  const result = await plaidPost("/accounts/get", { access_token: sandboxState.accessToken });
  sandboxState.accounts = result.accounts.map(({ account_id, name, mask, subtype, balances }) => ({ id: account_id, name, mask, subtype, available: balances.available, current: balances.current, isoCurrencyCode: balances.iso_currency_code }));
  sandboxState.fundingAccount = sandboxState.accounts.find((account) => account.name === "Plaid Cash Management" || account.subtype === "cash management") ?? sandboxState.accounts.find((account) => account.available != null) ?? null;
  return sandboxState.fundingAccount;
}
async function authorizeWithPlaid(payment) {
  const assessment = assessPayment(payment); if (assessment.decision !== "READY_FOR_AUTHORIZATION") throw new Error("Only a low-risk payment can reach the Plaid authorization boundary.");
  const account = await connectSandbox(); if (!account?.id) throw new Error("No linked Plaid Sandbox funding account is available.");
  const result = await plaidPost("/transfer/authorization/create", { access_token: sandboxState.accessToken, account_id: account.id, type: "debit", network: "ach", ach_class: "ppd", amount: payment.amount.toFixed(2), user: { legal_name: "TransferTrust Sandbox Operator" }, idempotency_key: `command-${payment.id.toLowerCase()}-${account.id}` });
  const authorization = { id: result.authorization?.id, decision: result.authorization?.decision, rationale: result.authorization?.decision_rationale?.code ?? null, account: { name: account.name, mask: account.mask }, transferCreated: false };
  paymentState.get(payment.id).plaidAuthorization = authorization; audit("PLAID_TRANSFER_AUTHORIZATION", payment.id, { decision: authorization.decision, authorizationId: authorization.id }); return authorization;
}
async function readBody(request) { let body = ""; for await (const chunk of request) { body += chunk; if (body.length > 3000) throw new Error("Request body is too large."); } return body ? JSON.parse(body) : {}; }
async function serveStatic(request, response) { const rawPath = request.url === "/" ? "/index.html" : decodeURIComponent(request.url.split("?")[0]); const filePath = normalize(join(root, rawPath)); if (!filePath.startsWith(root)) return sendJson(response, 403, { error: "Forbidden" }); try { const info = await stat(filePath); if (!info.isFile()) return sendJson(response, 404, { error: "Not found" }); response.writeHead(200, { "Content-Type": `${contentTypes[extname(filePath)] ?? "application/octet-stream"}; charset=utf-8` }); createReadStream(filePath).pipe(response); } catch { sendJson(response, 404, { error: "Not found" }); } }

audit("COMMAND_CENTER_STARTED", "system", { mode: "sandbox" });
createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/command-center") return sendJson(response, 200, commandCenter());
    if (request.method === "GET" && request.url === "/api/evaluation/suite") return sendJson(response, 200, { total: evaluationSuite.length, cases: evaluationSuite.map((item) => ({ id: item.id, type: item.type, policy: policyDecision(item) })) });
    if (request.method === "POST" && request.url === "/api/evaluation/run") return sendJson(response, 200, await runEvaluation());
    if (request.method === "GET" && request.url === "/api/plaid/status") { const account = await connectSandbox(); return sendJson(response, 200, { environment: "sandbox", connected: true, fundingAccount: account }); }
    const authorizeMatch = request.url?.match(/^\/api\/payments\/([^/]+)\/authorize$/);
    if (request.method === "POST" && authorizeMatch) { const payment = paymentById(authorizeMatch[1]); return sendJson(response, 200, { authorization: await authorizeWithPlaid(payment), payment: publicPayment(payment) }); }
    const reviewMatch = request.url?.match(/^\/api\/payments\/([^/]+)\/review$/);
    if (request.method === "POST" && reviewMatch) { const payment = paymentById(reviewMatch[1]); const { action, note = "" } = await readBody(request); if (!["HOLD", "REJECT", "ESCALATE"].includes(action)) throw new Error("Review action is invalid."); paymentState.get(payment.id).reviewStatus = action; audit(`REVIEW_${action}`, payment.id, { note: String(note).slice(0, 180) }); return sendJson(response, 200, { payment: publicPayment(payment), audit: auditLog.at(-1) }); }
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
    return serveStatic(request, response);
  } catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "Unexpected command-center error" }); }
}).listen(port, "127.0.0.1", () => console.log(`TransferTrust command center running at http://127.0.0.1:${port}`));
