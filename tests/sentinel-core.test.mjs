import test from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "../src/sentinel-data.js";
import { assessScenario, metrics } from "../src/sentinel-core.js";

test("card-testing pattern becomes an urgent hybrid alert with explainable evidence", () => {
  const assessment = assessScenario(scenarios.find((scenario) => scenario.id === "S01"));
  assert.equal(assessment.hybrid.action, "alert");
  assert.ok(assessment.rules.findings.some((finding) => finding.code === "CARD_TESTING"));
  assert.ok(assessment.hybrid.counterfactuals.length > 0);
});

test("travel context prevents an interruption for a legitimate unusual purchase", () => {
  const assessment = assessScenario(scenarios.find((scenario) => scenario.id === "S07"));
  assert.equal(assessment.hybrid.classification, "legitimate");
  assert.ok(assessment.rules.findings.some((finding) => finding.code === "TRAVEL_CONTEXT"));
});

test("hybrid benchmark measures deterministic and contextual engines separately", () => {
  const results = scenarios.map((scenario) => ({ scenario, ...assessScenario(scenario) }));
  const hybrid = metrics(results, "hybrid");
  const rules = metrics(results, "rules");
  assert.equal(hybrid.recall, 100);
  assert.ok(hybrid.f1 > rules.f1);
});
