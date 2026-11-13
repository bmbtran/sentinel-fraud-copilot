import test from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "../src/sentinel-data.js";
import { recordedClaudeAssessment } from "../src/claude-baseline.js";
import { assessScenario, metrics } from "../src/sentinel-core.js";

const assess = (scenario) =>
  assessScenario(scenario, recordedClaudeAssessment(scenario.id));

test("card-testing pattern becomes an urgent hybrid alert with explainable evidence", () => {
  const assessment = assess(
    scenarios.find((scenario) => scenario.id === "S01"),
  );
  assert.equal(assessment.hybrid.action, "alert");
  assert.ok(
    assessment.rules.findings.some(
      (finding) => finding.code === "CARD_TESTING",
    ),
  );
  assert.ok(assessment.hybrid.counterfactuals.length > 0);
});

test("travel context prevents an interruption for a legitimate unusual purchase", () => {
  const assessment = assess(
    scenarios.find((scenario) => scenario.id === "S07"),
  );
  assert.equal(assessment.hybrid.classification, "legitimate");
  assert.ok(
    assessment.rules.findings.some(
      (finding) => finding.code === "TRAVEL_CONTEXT",
    ),
  );
});

test("hybrid benchmark reports macro metrics from a recorded Claude run", () => {
  const results = scenarios.map((scenario) => ({
    scenario,
    ...assess(scenario),
  }));
  const hybrid = metrics(results, "hybrid");
  const claude = metrics(results, "claude");
  assert.equal(hybrid.perLabel.length, 3);
  assert.equal(claude.perLabel.length, 3);
  assert.ok(hybrid.f1 >= 0 && hybrid.f1 <= 100);
  assert.ok(claude.f1 >= 0 && claude.f1 <= 100);
});
