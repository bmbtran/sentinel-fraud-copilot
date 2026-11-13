import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { audit, initializeDatabase, loadRelayState, saveRelayState } from "./src/relay-db.js";
import { createRelayEngine, createRelayFixture, createRelayReplay, relayReplayCases } from "./src/relay-core.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const plaidBaseUrl = "https://sandbox.plaid.com";
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
let sandbox = null;
let activeReplay = null;

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function configured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && !process.env.PLAID_CLIENT_ID.startsWith("your_"));
}

function credentials() {
  if (!configured()) throw new Error("Plaid Sandbox credentials are not configured.");
  return { client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET };
}

async function plaidPost(path, body) {
  const response = await fetch(`${plaidBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials(), ...body }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_message ?? "Plaid Sandbox request failed.");
  return payload;
}

async function ensureSandboxItem() {
  if (sandbox) return sandbox;
  const created = await plaidPost("/sandbox/public_token/create", {
    institution_id: "ins_109508",
    initial_products: ["transactions"],
    options: { transactions: { days_requested: 30 } },
  });
  const exchanged = await plaidPost("/item/public_token/exchange", { public_token: created.public_token });
  sandbox = { accessToken: exchanged.access_token, itemId: exchanged.item_id };
  engine.addItem({ id: "item-credit", plaidItemId: sandbox.itemId });
  persist();
  return sandbox;
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 100_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Request body must be valid JSON."); }
}

function seedEngine() {
  const saved = loadRelayState();
  if (saved.items.length) return createRelayEngine(saved);
  const fixture = createRelayFixture();
  saveRelayState(fixture.snapshot());
  return fixture;
}

let engine;
function persist() {
  saveRelayState(engine.snapshot());
}

function relayOverview() {
  const overview = engine.overview();
  const counts = overview.items.reduce((all, item) => ({ ...all, [item.status]: (all[item.status] ?? 0) + 1 }), { healthy: 0, recovery_required: 0, recovery_in_progress: 0 });
  return {
    ...overview,
    reliability: {
      total: overview.items.length,
      healthy: counts.healthy,
      actionRequired: counts.recovery_required,
      inProgress: counts.recovery_in_progress,
      activeSessions: overview.sessions.filter((entry) => ["issued", "in_progress"].includes(entry.status)).length,
    },
    replay: activeReplay,
    sandbox: { configured: configured(), itemReady: Boolean(sandbox) },
    generatedAt: new Date().toISOString(),
  };
}

async function issueUpdateLink(itemId, { forceFixture = false } = {}) {
  let mode = "fixture";
  let token = null;
  if (configured() && !forceFixture) {
    const item = await ensureSandboxItem();
    const response = await plaidPost("/link/token/create", {
      user: { client_user_id: "relay-sandbox-user" },
      client_name: "Relay Recovery Console",
      country_codes: ["US"],
      language: "en",
      access_token: item.accessToken,
    });
    token = response.link_token;
    mode = "sandbox";
  }
  const session = engine.issueRecovery(itemId, { token, mode });
  persist();
  audit("RELAY_RECOVERY_ISSUED", { itemId, mode, sessionId: session.id });
  return { session, linkToken: token, mode };
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
engine = seedEngine();

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/api/relay/overview") return sendJson(response, 200, relayOverview());
    if (request.method === "GET" && url.pathname === "/api/relay/replays") return sendJson(response, 200, { cases: relayReplayCases });
    if (request.method === "POST" && url.pathname === "/api/relay/demo/reset") {
      engine = createRelayFixture();
      activeReplay = null;
      persist();
      audit("RELAY_DEMO_RESET");
      return sendJson(response, 200, relayOverview());
    }
    if (request.method === "POST" && url.pathname === "/api/relay/demo/replay") {
      const body = await readBody(request);
      const replay = createRelayReplay(body.caseId);
      engine = replay.engine;
      activeReplay = { ...replay.definition, outcomes: replay.outcomes.map((entry) => entry.outcome) };
      persist();
      audit("RELAY_REPLAY_LOADED", { caseId: replay.definition.id, outcomes: activeReplay.outcomes });
      return sendJson(response, 200, relayOverview());
    }
    if (request.method === "POST" && url.pathname === "/api/relay/events") {
      const body = await readBody(request);
      const result = engine.applyEvent(body);
      persist();
      audit("RELAY_EVENT_RECEIVED", { eventId: body.eventId, itemId: body.itemId, kind: body.kind, outcome: result.outcome });
      return sendJson(response, 200, { ...result, overview: relayOverview() });
    }
    const route = url.pathname.match(/^\/api\/relay\/items\/([^/]+)\/(update-link|update-started|update-completed|sandbox-reset)$/);
    if (request.method === "POST" && route) {
      const itemId = decodeURIComponent(route[1]);
      const action = route[2];
      const body = await readBody(request);
      if (action === "update-link") return sendJson(response, 200, { ...(await issueUpdateLink(itemId, { forceFixture: body.mode === "fixture" })), overview: relayOverview() });
      if (action === "update-started") {
        const session = engine.startRecovery(itemId, body.sessionId);
        persist();
        return sendJson(response, 200, { session, overview: relayOverview() });
      }
      if (action === "update-completed") {
        const result = engine.completeRecovery(itemId, body.sessionId);
        persist();
        audit("RELAY_RECOVERY_COMPLETED", { itemId, sessionId: body.sessionId });
        return sendJson(response, 200, { ...result, overview: relayOverview() });
      }
      if (!configured()) throw new Error("Sandbox credentials are not configured.");
      const item = await ensureSandboxItem();
      await plaidPost("/sandbox/item/reset_login", { access_token: item.accessToken });
      const result = engine.applyEvent({ eventId: `sandbox-reset-${Date.now()}`, itemId, kind: "ITEM_ERROR", errorCode: "ITEM_LOGIN_REQUIRED", occurredAt: new Date().toISOString(), payload: { source: "sandbox_reset_login" } });
      persist();
      return sendJson(response, 200, { ...result, overview: relayOverview() });
    }
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });
    return serveStatic(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    audit("RELAY_REQUEST_FAILED", { message });
    return sendJson(response, message.includes("only available") || message.includes("already active") ? 409 : 400, { error: message });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Relay Recovery Console listening on http://127.0.0.1:${port}`);
});
