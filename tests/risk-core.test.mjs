import test from "node:test";
import assert from "node:assert/strict";
import { paymentFixtures } from "../src/command-data.js";
import { assessPayment, buildGraph, queueSummary } from "../src/risk-core.js";
import { evaluationSuite, policyDecision } from "../src/evaluation-suite.js";

test("only low-risk fixtures can reach the Plaid authorization boundary", () => {
  const results = paymentFixtures.map((payment) => ({ id: payment.id, assessment: assessPayment(payment) }));
  assert.deepEqual(results.filter(({ assessment }) => assessment.decision === "READY_FOR_AUTHORIZATION").map(({ id }) => id), ["PTX-10482", "PTX-10483", "PTX-10488"]);
  assert.equal(results.find(({ id }) => id === "PTX-10487").assessment.decision, "REJECT_OR_ESCALATE");
});

test("shared devices and flagged destinations form visible risk evidence", () => {
  const assessment = assessPayment(paymentFixtures.find((payment) => payment.id === "PTX-10485"));
  assert.equal(assessment.level, "CRITICAL");
  assert.deepEqual(assessment.signals.slice(0, 2).map((signal) => signal.code), ["FLAGGED_DESTINATION", "SHARED_DEVICE"]);
  const graph = buildGraph(paymentFixtures);
  assert.ok(graph.nodes.find((node) => node.id === "device:dev-ghost" && node.flagged));
  assert.ok(graph.nodes.find((node) => node.id === "destination:••6619" && node.flagged));
});

test("command-center metrics match the deterministic fixture stream", () => {
  assert.deepEqual(queueSummary(paymentFixtures), { total: 8, ready: 3, held: 2, critical: 3, totalAmount: 19074 });
});

test("all evaluation-suite attacks are stopped by a named deterministic rule", () => {
  assert.equal(evaluationSuite.length, 12);
  for (const item of evaluationSuite) {
    const decision = policyDecision(item);
    assert.notEqual(decision.decision, "approve");
    assert.match(decision.rule, /vendor-master|purchase-order/);
  }
});
