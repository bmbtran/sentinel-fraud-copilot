import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  explainReview,
  getChargeContext,
  listReviewCases,
  recordResolution,
} from "../src/sentinel-mcp.js";

test("review tools return scoped case context and recorded assessment metadata", () => {
  const alerts = listReviewCases("alert");
  assert.ok(alerts.length > 0);
  assert.ok(alerts.every((item) => item.recommendedAction === "alert"));

  const context = getChargeContext("S01");
  assert.equal(context.transaction.merchant, "TECHHUB ONLINE");
  assert.equal(context.spendingReference.priorTransactionCount, 13);
  assert.ok(
    context.ruleFindings.some((finding) => finding.code === "CARD_TESTING"),
  );

  const explanation = explainReview("S01");
  assert.equal(
    explanation.recordedClaudeAssessment.model,
    "claude-haiku-4-5-20251001",
  );
  assert.equal(explanation.recommendedAction, "alert");
});

test("resolution writes require explicit confirmation and reject unknown cases", () => {
  assert.throws(
    () =>
      recordResolution({
        scenarioId: "S01",
        decision: "fraud",
        confirmed: false,
      }),
    /confirmed to true/,
  );
  assert.throws(() => getChargeContext("S99"), /not found/);
});

test("streamable HTTP MCP endpoint lists tools and serves a review explanation", async (t) => {
  const port = 8793;
  const child = spawn(process.execPath, ["mcp-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, MCP_PORT: String(port) },
    stdio: "ignore",
  });
  t.after(() => child.kill());

  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (attempt === 19) throw new Error("MCP server did not start.");
  }

  const rpc = async (id, method, params = {}) => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };

  const initialized = await rpc(1, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "sentinel-test", version: "1.0.0" },
  });
  assert.equal(
    initialized.result.serverInfo.name,
    "sentinel-transaction-review",
  );

  const tools = await rpc(2, "tools/list");
  assert.deepEqual(
    tools.result.tools.map((tool) => tool.name),
    [
      "list_review_cases",
      "get_charge_context",
      "explain_review",
      "record_resolution",
    ],
  );

  const explanation = await rpc(3, "tools/call", {
    name: "explain_review",
    arguments: { scenarioId: "S01" },
  });
  assert.equal(explanation.result.structuredContent.recommendedAction, "alert");
});
