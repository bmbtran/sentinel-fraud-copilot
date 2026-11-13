import test from "node:test";
import assert from "node:assert/strict";
import {
  replayCase,
  replayCases,
  runReferenceSuite,
  validateFinancialAnswer,
} from "../src/replay-suite.js";

test("pending records are removed when their posted replacement arrives", () => {
  const replay = replayCase("R02");
  assert.equal(replay.steps.length, 2);
  assert.deepEqual(replay.transactions.map((item) => item.transaction_id), ["coffee-posted"]);
  assert.deepEqual(replay.steps[1].removed, ["coffee-pending"]);
});

test("modified merchant enrichment does not create a second transaction", () => {
  const replay = replayCase("R03");
  assert.equal(replay.transactions.length, 1);
  assert.equal(replay.transactions[0].merchant_name, "Uber");
  assert.deepEqual(replay.steps[1].modified, ["ride-1"]);
});

test("answer validation rejects a stale pending citation", () => {
  const validation = validateFinancialAnswer({
    caseId: "R02",
    conclusion: "There was one coffee purchase.",
    sourceTransactionIds: ["coffee-pending"],
    limitations: ["pending_replaced"],
  });
  assert.equal(validation.passed, false);
  assert.equal(validation.checks.find((check) => check.id === "current_sources_only").pass, false);
});

test("answer validation requires partial-period disclosure", () => {
  const validation = validateFinancialAnswer({
    caseId: "R01",
    conclusion: "November has less recorded spending so far.",
    sourceTransactionIds: ["oct-dining", "nov-dining"],
    limitations: [],
  });
  assert.equal(validation.passed, false);
  assert.equal(validation.checks.find((check) => check.id === "limitations").pass, false);
});

test("reference contracts pass for every replay case", () => {
  assert.equal(replayCases.length, 6);
  const runs = runReferenceSuite();
  assert.equal(runs.length, replayCases.length);
  assert.ok(runs.every((run) => run.passed));
});
