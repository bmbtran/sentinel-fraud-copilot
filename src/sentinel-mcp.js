import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getScenario,
  listScenarios,
  saveIncident,
  saveResolution,
} from "./sentinel-db.js";
import { recordedClaudeAssessment } from "./claude-baseline.js";
import { assessScenario, buildIncident } from "./sentinel-core.js";

const actions = ["alert", "ask", "ignore"];

function assessmentFor(scenario) {
  return assessScenario(scenario, recordedClaudeAssessment(scenario.id));
}

function reviewCase(scenario) {
  const assessment = assessmentFor(scenario);
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    merchant: scenario.target.merchant,
    amount: scenario.target.amount,
    occurredAt: scenario.target.date,
    recommendedAction: assessment.hybrid.action,
    riskScore: assessment.hybrid.score,
  };
}

export function listReviewCases(action) {
  if (action && !actions.includes(action)) {
    throw new Error("Action must be alert, ask, or ignore.");
  }
  return listScenarios()
    .map(reviewCase)
    .filter((item) => !action || item.recommendedAction === action)
    .sort((left, right) => right.riskScore - left.riskScore);
}

export function getChargeContext(scenarioId) {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error("Review case not found.");
  const { profile, rules } = assessmentFor(scenario);
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    transaction: {
      merchant: scenario.target.merchant,
      amount: scenario.target.amount,
      occurredAt: scenario.target.date,
      category: scenario.target.category,
      location: scenario.target.location,
    },
    spendingReference: {
      priorTransactionCount: profile.transactionCount,
      typicalAmount: profile.typicalAmount,
      knownRegions: profile.regions,
      topMerchants: profile.merchants,
    },
    relatedTransactions: scenario.related.map(
      ({ merchant, amount, date, category, location }) => ({
        merchant,
        amount,
        date,
        category,
        location,
      }),
    ),
    ruleFindings: rules.findings.map(({ code, points, detail, severity }) => ({
      code,
      points,
      detail,
      severity,
    })),
  };
}

export function explainReview(scenarioId) {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error("Review case not found.");
  const { rules, claude, hybrid } = assessmentFor(scenario);
  return {
    scenarioId: scenario.id,
    recommendedAction: hybrid.action,
    riskScore: hybrid.score,
    evidence: hybrid.evidence.map(({ code, detail, points }) => ({
      code,
      detail,
      points,
    })),
    counterfactuals: hybrid.counterfactuals,
    deterministicRules: { score: rules.score },
    recordedClaudeAssessment: {
      model: claude.model,
      recordedAt: claude.recordedAt,
      classification: claude.classification,
      confidence: claude.confidence,
      rationale: claude.rationale,
    },
    boundary:
      "This is a synthetic demo review. It does not submit disputes, freeze cards, or make a fraud determination.",
  };
}

export function recordResolution({ scenarioId, decision, confirmed }) {
  if (confirmed !== true) {
    throw new Error("Set confirmed to true before recording a resolution.");
  }
  if (!["fraud", "legitimate"].includes(decision)) {
    throw new Error("Decision must be fraud or legitimate.");
  }
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error("Review case not found.");
  const assessment = assessmentFor(scenario);
  const incident =
    decision === "fraud"
      ? saveIncident(buildIncident(scenario, assessment))
      : null;
  const resolution = saveResolution(scenario.id, decision);
  return {
    resolution,
    incidentId: incident?.id ?? null,
    message:
      decision === "fraud"
        ? "Resolution recorded and demo incident summary prepared."
        : "Resolution recorded as a recognized purchase.",
  };
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolError(error) {
  const message =
    error instanceof Error ? error.message : "Unexpected tool error.";
  return { isError: true, content: [{ type: "text", text: message }] };
}

export function createSentinelMcpServer() {
  const server = new McpServer(
    { name: "sentinel-transaction-review", version: "0.1.0" },
    {
      instructions:
        "Sentinel is a synthetic Plaid transaction-review demo. Use list_review_cases before inspecting a case. Use get_charge_context or explain_review for evidence. record_resolution changes local demo state and requires confirmed: true. Never describe an output as a bank decision or fraud determination.",
    },
  );

  server.registerTool(
    "list_review_cases",
    {
      title: "List review cases",
      description:
        "Use this when a user asks which synthetic transaction-review cases need attention. Optionally filter by the deterministic action: alert, ask, or ignore.",
      inputSchema: { action: z.enum(actions).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ action }) => {
      try {
        return toolResult({ cases: listReviewCases(action) });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_charge_context",
    {
      title: "Get charge context",
      description:
        "Use this after list_review_cases to inspect one synthetic charge, its spending reference, related activity, and deterministic rule findings.",
      inputSchema: { scenarioId: z.string().regex(/^S\d{2}$/) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ scenarioId }) => {
      try {
        return toolResult(getChargeContext(scenarioId));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "explain_review",
    {
      title: "Explain a review decision",
      description:
        "Use this after get_charge_context when a user asks why Sentinel surfaced a case. It returns evidence, counterfactuals, deterministic-rule output, and the recorded Claude assessment.",
      inputSchema: { scenarioId: z.string().regex(/^S\d{2}$/) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ scenarioId }) => {
      try {
        return toolResult(explainReview(scenarioId));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "record_resolution",
    {
      title: "Record a review resolution",
      description:
        "Use this only after a user explicitly confirms a synthetic review decision. It records local demo state and may prepare a demo incident summary. It does not contact a bank, freeze a card, or submit a dispute.",
      inputSchema: {
        scenarioId: z.string().regex(/^S\d{2}$/),
        decision: z.enum(["fraud", "legitimate"]),
        confirmed: z.literal(true),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input) => {
      try {
        return toolResult(recordResolution(input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
