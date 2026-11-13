import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A randomized high port keeps this integration test isolated from a developer's
// local Relay instance and from concurrently-running test processes.
const port = 20_000 + Math.floor(Math.random() * 20_000);

async function waitForServer(startupError) {
  let lastNetworkError = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/relay/overview`);
      if (response.ok) return;
    } catch (error) { lastNetworkError = error.message; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Relay server did not start. ${startupError()} ${lastNetworkError}`);
}

test("RLY API persists fixture transitions and never returns an access token", async () => {
  const temp = await mkdtemp(join(tmpdir(), "relay-api-"));
  let serverOutput = "";
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), RELAY_DB_PATH: join(temp, "relay.sqlite"), PLAID_CLIENT_ID: "", PLAID_SECRET: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { serverOutput += chunk; });
  child.stderr.on("data", (chunk) => { serverOutput += chunk; });
  const post = async (path, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await waitForServer(() => serverOutput.trim());
    const first = await fetch(`http://127.0.0.1:${port}/api/relay/overview`).then((response) => response.json());
    assert.equal(first.items.length, 4);
    assert.equal(first.items.filter((item) => item.status === "recovery_required").length, 1);
    assert.equal(JSON.stringify(first).includes("access_token"), false);

    const rejected = await post("/api/relay/items/item-checking/update-link");
    assert.equal(rejected.status, 409);

    const issued = await post("/api/relay/items/item-credit/update-link", { mode: "fixture" });
    assert.equal(issued.status, 200);
    assert.equal(issued.body.mode, "fixture");
    assert.equal(issued.body.linkToken, null);
    assert.equal(JSON.stringify(issued.body).includes("access_token"), false);

    const completed = await post("/api/relay/items/item-credit/update-completed", { sessionId: issued.body.session.id });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.item.status, "healthy");

    const duplicateEvent = { eventId: "api-duplicate", itemId: "item-checking", kind: "ITEM_ERROR", errorCode: "ITEM_LOGIN_REQUIRED", occurredAt: "2026-11-13T10:00:00.000Z" };
    assert.equal((await post("/api/relay/events", duplicateEvent)).body.outcome, "applied");
    assert.equal((await post("/api/relay/events", duplicateEvent)).body.outcome, "duplicate");

    const reset = await post("/api/relay/demo/reset");
    assert.equal(reset.body.items.filter((item) => item.status === "recovery_required").length, 1);

    const replay = await post("/api/relay/demo/replay", { caseId: "stale-repair" });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replay.id, "stale-repair");
    assert.equal(replay.body.items.find((item) => item.id === "item-credit").status, "recovery_required");
    assert.equal(replay.body.events.find((event) => event.eventId === "replay-repair-old").outcome, "ignored_stale");
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    await rm(temp, { recursive: true, force: true });
  }
});
