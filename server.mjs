import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const plaidBaseUrl = "https://sandbox.plaid.com";
const sandboxState = { accessToken: null, itemId: null, accounts: [], fundingAccount: null };
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mjs": "text/javascript" };

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function credentials() {
  const { PLAID_CLIENT_ID: client_id, PLAID_SECRET: secret } = process.env;
  if (!client_id || !secret) throw new Error("Plaid Sandbox credentials are missing. Copy .env.example to .env and add your keys.");
  return { client_id, secret };
}

async function plaidPost(path, body) {
  const response = await fetch(`${plaidBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials(), ...body })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_message ?? `Plaid request failed (${response.status})`);
  return payload;
}

async function connectSandbox() {
  if (!sandboxState.accessToken) {
    const sandboxItem = await plaidPost("/sandbox/public_token/create", {
      institution_id: "ins_109508",
      initial_products: ["auth", "transactions"],
      options: { transactions: { days_requested: 30 } }
    });
    const exchange = await plaidPost("/item/public_token/exchange", { public_token: sandboxItem.public_token });
    sandboxState.accessToken = exchange.access_token;
    sandboxState.itemId = exchange.item_id;
  }
  const accounts = await plaidPost("/accounts/get", { access_token: sandboxState.accessToken });
  sandboxState.accounts = accounts.accounts.map(({ name, mask, subtype, balances }) => ({
    name, mask, subtype, current: balances.current, available: balances.available, isoCurrencyCode: balances.iso_currency_code
  }));
  sandboxState.fundingAccount = sandboxState.accounts.find((account) => account.subtype === "cash management" || account.name === "Plaid Cash Management") ?? sandboxState.accounts.find((account) => account.available != null && account.available >= 10000) ?? null;
  return {
    connected: true,
    fundingAccount: sandboxState.fundingAccount
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

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/plaid/status") {
    try {
      sendJson(response, 200, { environment: "sandbox", ...(await connectSandbox()) });
    } catch (error) {
      sendJson(response, 500, { environment: "sandbox", connected: false, error: error instanceof Error ? error.message : "Could not connect to Plaid Sandbox" });
    }
    return;
  }
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  await serveStatic(request, response);
}).listen(port, "127.0.0.1", () => console.log(`TransferTrust running at http://127.0.0.1:${port}`));
