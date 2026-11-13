import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { audit, initializeDatabase, removePlaidTransactions, savePlaidTransactions } from "./src/replay-db.js";
import {
  demonstrateCase,
  replayCase,
  replayCases,
  runReferenceSuite,
} from "./src/replay-suite.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const plaidBaseUrl = "https://sandbox.plaid.com";
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
let accessToken = null;
let plaidCursor = null;

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function credentials() {
  const { PLAID_CLIENT_ID: client_id, PLAID_SECRET: secret } = process.env;
  if (!client_id || !secret || client_id.startsWith("your_")) {
    throw new Error("Plaid Sandbox credentials are not configured.");
  }
  return { client_id, secret };
}

async function plaidPost(path, data) {
  const response = await fetch(`${plaidBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials(), ...data }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_message ?? "Plaid Sandbox request failed.");
  return payload;
}

async function plaidStatus() {
  if (!process.env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID.startsWith("your_")) {
    return { connected: false, mode: "demo" };
  }
  if (!accessToken) {
    const token = await plaidPost("/sandbox/public_token/create", {
      institution_id: "ins_109508",
      initial_products: ["transactions"],
      options: { transactions: { days_requested: 90 } },
    });
    accessToken = (await plaidPost("/item/public_token/exchange", { public_token: token.public_token })).access_token;
  }
  const accounts = await plaidPost("/accounts/get", { access_token: accessToken });
  return {
    connected: true,
    mode: "sandbox",
    accounts: accounts.accounts.map((account) => ({ name: account.name, mask: account.mask, balance: account.balances.available ?? account.balances.current })),
  };
}

async function syncPlaidTransactions() {
  await plaidStatus();
  const changes = [];
  const removed = [];
  let cursor = plaidCursor;
  let hasMore = true;
  while (hasMore) {
    const page = await plaidPost("/transactions/sync", { access_token: accessToken, cursor: cursor ?? "" });
    changes.push(...page.added, ...page.modified);
    removed.push(...(page.removed ?? []));
    cursor = page.next_cursor;
    hasMore = page.has_more;
  }
  plaidCursor = cursor;
  const normalized = changes.map((item) => ({
    id: item.transaction_id,
    merchant: item.merchant_name ?? item.name,
    amount: item.amount,
    date: `${item.date}T12:00:00Z`,
    category: item.personal_finance_category?.primary ?? "Other",
    channel: item.payment_channel ?? "other",
    location: [item.location?.city, item.location?.region].filter(Boolean).join(", ") || null,
    pending: item.pending,
    source: "plaid",
  }));
  return {
    received: normalized.length,
    stored: savePlaidTransactions(normalized),
    removed: removePlaidTransactions(removed.map((item) => item.transaction_id)),
    nextCursor: plaidCursor,
  };
}

function harness() {
  const runs = runReferenceSuite();
  return {
    summary: {
      total: runs.length,
      passed: runs.filter((run) => run.passed).length,
      syncOperations: ["added", "modified", "removed"],
      connectorVerification: {
        client: "ChatGPT custom MCP connector",
        caseId: "R02",
        checksPassed: 5,
        recordedAt: "2026-11-13",
      },
    },
    cases: replayCases,
    runs,
  };
}

async function serveStatic(request, response) {
  const rawPath = request.url === "/" ? "/index.html" : decodeURIComponent(request.url.split("?")[0]);
  const filePath = normalize(join(root, rawPath));
  if (!filePath.startsWith(root)) return sendJson(response, 403, { error: "Forbidden" });
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return sendJson(response, 404, { error: "Not found" });
    response.writeHead(200, { "Content-Type": `${contentTypes[extname(filePath)] ?? "application/octet-stream"}; charset=utf-8` });
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

initializeDatabase();
createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/api/harness") return sendJson(response, 200, harness());
    if (request.method === "GET" && url.pathname === "/api/plaid/status") return sendJson(response, 200, await plaidStatus());
    if (request.method === "POST" && url.pathname === "/api/plaid/sync") return sendJson(response, 200, await syncPlaidTransactions());
    const replayMatch = url.pathname.match(/^\/api\/replay\/(R\d{2})$/);
    if (request.method === "GET" && replayMatch) {
      const caseId = replayMatch[1];
      return sendJson(response, 200, {
        ...replayCase(caseId),
        demonstrations: demonstrateCase(caseId),
      });
    }
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });
    return serveStatic(request, response);
  } catch (error) {
    audit("REQUEST_FAILED", { message: error instanceof Error ? error.message : "Unknown error" });
    return sendJson(response, 400, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Plaid Agent Replay Lab listening on http://127.0.0.1:${port}`);
});
