import test from "node:test";
import assert from "node:assert/strict";
import { createRelayEngine, createRelayReplay, relayReplayCases } from "../src/relay-core.js";

const at = (second) => `2026-11-13T09:00:${String(second).padStart(2, "0")}.000Z`;
const event = (overrides = {}) => ({
  eventId: "evt-1",
  itemId: "item-checking",
  kind: "ITEM_ERROR",
  errorCode: "ITEM_LOGIN_REQUIRED",
  occurredAt: at(1),
  ...overrides,
});

function engineWithItem() {
  const engine = createRelayEngine();
  engine.addItem({ id: "item-checking", label: "First Platypus Checking", status: "healthy" });
  return engine;
}

test("RLY-01: login-required moves a healthy Item to recovery-required", () => {
  const engine = engineWithItem();
  const result = engine.applyEvent(event());
  assert.equal(result.outcome, "applied");
  assert.deepEqual(engine.getItem("item-checking"), {
    id: "item-checking",
    label: "First Platypus Checking",
    status: "recovery_required",
    reason: "item_login_required",
    recoveryRequiredAt: at(1),
  });
});

test("RLY-02: pending-disconnect also requests recovery", () => {
  const engine = engineWithItem();
  engine.applyEvent(event({ kind: "PENDING_DISCONNECT", errorCode: null }));
  assert.equal(engine.getItem("item-checking").reason, "pending_disconnect");
});

test("RLY-03: duplicate event IDs are idempotent", () => {
  const engine = engineWithItem();
  engine.applyEvent(event());
  const replay = engine.applyEvent(event());
  assert.equal(replay.outcome, "duplicate");
  assert.equal(engine.eventsFor("item-checking").length, 1);
});

test("RLY-04: a newer LOGIN_REPAIRED clears an outstanding recovery action", () => {
  const engine = engineWithItem();
  engine.applyEvent(event());
  engine.applyEvent(event({ eventId: "evt-2", kind: "LOGIN_REPAIRED", errorCode: null, occurredAt: at(2) }));
  assert.equal(engine.getItem("item-checking").status, "healthy");
  assert.equal(engine.getItem("item-checking").reason, null);
});

test("RLY-05: an older LOGIN_REPAIRED cannot clear a newer required recovery", () => {
  const engine = engineWithItem();
  engine.applyEvent(event({ eventId: "evt-new", occurredAt: at(5) }));
  const result = engine.applyEvent(event({ eventId: "evt-old", kind: "LOGIN_REPAIRED", errorCode: null, occurredAt: at(4) }));
  assert.equal(result.outcome, "ignored_stale");
  assert.equal(engine.getItem("item-checking").status, "recovery_required");
});

test("RLY-06: an unrelated event is recorded without changing a healthy Item", () => {
  const engine = engineWithItem();
  const result = engine.applyEvent(event({ kind: "SYNC_UPDATES_AVAILABLE", errorCode: null }));
  assert.equal(result.outcome, "applied");
  assert.equal(engine.getItem("item-checking").status, "healthy");
});

test("RLY-07: issuing recovery creates one session and marks the Item in progress", () => {
  const engine = engineWithItem();
  engine.applyEvent(event());
  const session = engine.issueRecovery("item-checking", { token: "link-sandbox-example", mode: "sandbox" });
  assert.equal(session.status, "issued");
  assert.equal(session.mode, "sandbox");
  assert.equal(engine.getItem("item-checking").status, "recovery_in_progress");
  assert.equal(engine.sessionsFor("item-checking").length, 1);
});

test("RLY-08: an Item already in recovery cannot receive a second active session", () => {
  const engine = engineWithItem();
  engine.applyEvent(event());
  engine.issueRecovery("item-checking", { token: "link-sandbox-example", mode: "sandbox" });
  assert.throws(() => engine.issueRecovery("item-checking", { token: "link-sandbox-second", mode: "sandbox" }), /already active/i);
});

test("RLY-09: completion returns the Item to healthy and completes its session", () => {
  const engine = engineWithItem();
  engine.applyEvent(event());
  const session = engine.issueRecovery("item-checking", { token: "link-sandbox-example", mode: "sandbox" });
  engine.completeRecovery("item-checking", session.id, at(4));
  assert.equal(engine.getItem("item-checking").status, "healthy");
  assert.equal(engine.sessionsFor("item-checking")[0].status, "completed");
});

test("RLY-10: a newer self-healing event supersedes an active recovery session", () => {
  const engine = engineWithItem();
  engine.applyEvent(event());
  const session = engine.issueRecovery("item-checking", { token: "link-sandbox-example", mode: "sandbox" });
  engine.applyEvent(event({ eventId: "evt-repaired", kind: "LOGIN_REPAIRED", errorCode: null, occurredAt: at(5) }));
  assert.equal(engine.getItem("item-checking").status, "healthy");
  assert.equal(engine.sessionsFor("item-checking").find((entry) => entry.id === session.id).status, "superseded");
});

test("RLY-11: overview never exposes a Link token", () => {
  const engine = engineWithItem();
  engine.applyEvent(event());
  engine.issueRecovery("item-checking", { token: "link-sandbox-secret", mode: "sandbox" });
  const overview = engine.overview();
  assert.equal(JSON.stringify(overview).includes("link-sandbox-secret"), false);
  assert.equal(overview.items[0].status, "recovery_in_progress");
});

test("RLY-12: a serialized lifecycle state can be restored without exposing tokens", () => {
  const source = engineWithItem();
  source.applyEvent(event());
  source.issueRecovery("item-checking", { token: "link-sandbox-secret", mode: "sandbox" });
  const restored = createRelayEngine(source.snapshot());
  assert.equal(restored.getItem("item-checking").status, "recovery_in_progress");
  assert.equal(restored.sessionsFor("item-checking")[0].status, "issued");
  assert.equal(JSON.stringify(restored.overview()).includes("link-sandbox-secret"), false);
});

test("RLY-13: the duplicate-delivery replay retains one recovery requirement", () => {
  const replay = createRelayReplay("duplicate-delivery");
  assert.equal(replay.outcomes.at(-1).outcome, "duplicate");
  assert.equal(replay.engine.overview().events.length, 1);
  assert.equal(replay.engine.getItem("item-credit").status, "recovery_required");
});

test("RLY-14: the stale-repair replay cannot clear a newer recovery requirement", () => {
  const replay = createRelayReplay("stale-repair");
  assert.equal(replay.outcomes.at(-1).outcome, "ignored_stale");
  assert.equal(replay.engine.getItem("item-credit").status, "recovery_required");
});

test("RLY-15: the self-heal replay supersedes an open repair session", () => {
  const replay = createRelayReplay("self-heal");
  assert.equal(replay.engine.getItem("item-credit").status, "healthy");
  assert.equal(replay.engine.sessionsFor("item-credit")[0].status, "superseded");
});

test("RLY-16: each replay case declares the guarded and unsafe comparison", () => {
  assert.deepEqual(relayReplayCases.map((entry) => entry.id), ["duplicate-delivery", "stale-repair", "self-heal"]);
  for (const replay of relayReplayCases) {
    assert.ok(replay.unsafeOutcome.length > 20);
    assert.ok(replay.guardedOutcome.length > 20);
  }
});
