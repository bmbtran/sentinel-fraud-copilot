import test from "node:test";
import assert from "node:assert/strict";
import {
  demonstrateCase,
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

test("partial-period case rejects an overclaimed monthly conclusion", () => {
  const validation = validateFinancialAnswer({
    caseId: "R01",
    conclusion: "Monthly spending decreased.",
    sourceTransactionIds: ["oct-dining", "nov-dining"],
    limitations: ["partial_period"],
  });
  assert.equal(validation.passed, false);
  assert.equal(validation.checks.find((check) => check.id === "no_overclaim").pass, false);
});

test("every replay case includes a rejected and accepted answer demonstration", () => {
  for (const fixture of replayCases) {
    const demonstration = demonstrateCase(fixture.id);
    assert.equal(demonstration.rejected.passed, false);
    assert.equal(demonstration.accepted.passed, true);
  }
});

test("reference contracts pass for every replay case", () => {
  assert.equal(replayCases.length, 12);
  const runs = runReferenceSuite();
  assert.equal(runs.length, replayCases.length);
  assert.ok(runs.every((run) => run.passed));
});
