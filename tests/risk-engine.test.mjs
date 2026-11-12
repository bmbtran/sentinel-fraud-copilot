import test from "node:test";
import assert from "node:assert/strict";
import { requests } from "../src/data.js";
import { metrics, protectedDecision, runBenchmark } from "../src/risk-engine.js";

test("protected path stops every seeded fraud scenario without holding clean payments", () => {
  const result = runBenchmark(requests);
  assert.deepEqual(metrics(result, "naive"), { stopped: 0, attacks: 12, cleanHeld: 0, clean: 16 });
  assert.deepEqual(metrics(result, "protected"), { stopped: 12, attacks: 12, cleanHeld: 0, clean: 16 });
});

test("vendor-master mismatch cannot be approved", () => {
  const request = requests.find((item) => item.category === "lookalike_vendor");
  assert.equal(protectedDecision(request).decision, "hold");
});
