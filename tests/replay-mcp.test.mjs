import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReplayMcpServer } from "../src/replay-mcp.js";
import { replayCase, validateFinancialAnswer } from "../src/replay-suite.js";

test("replay MCP domain exposes only synthetic current transaction context", () => {
  const caseDetail = replayCase("R06");
  assert.equal(caseDetail.transactions.length, 0);
  const validation = validateFinancialAnswer({
    caseId: "R06",
    conclusion: "You bought groceries on November 8.",
    sourceTransactionIds: ["removed-charge"],
    limitations: [],
  });
  assert.equal(validation.passed, false);
  assert.ok(createReplayMcpServer());
});

test("streamable MCP endpoint lists replay tools and validates an answer", async () => {
  const port = 8793;
  const child = spawn(process.execPath, ["mcp-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, MCP_PORT: String(port) },
    stdio: "ignore",
  });
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const rpc = async (id, method, params = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      return response.json();
    };
    await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const listed = await rpc(2, "tools/list");
    assert.ok(listed.result, JSON.stringify(listed));
    assert.deepEqual(listed.result.tools.map((tool) => tool.name).sort(), ["get_replay_case", "list_replay_cases", "validate_financial_answer"]);
    const validation = await rpc(3, "tools/call", {
      name: "validate_financial_answer",
      arguments: { caseId: "R02", conclusion: "One posted $6.50 coffee purchase remains; the pending record was replaced.", sourceTransactionIds: ["coffee-posted"], limitations: ["pending_replaced"] },
    });
    assert.equal(validation.result.structuredContent.passed, true);
  } finally {
    child.kill();
    await once(child, "exit");
  }
});
