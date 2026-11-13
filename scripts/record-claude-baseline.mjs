import { createHash } from "node:crypto";
import { scenarios } from "../src/sentinel-data.js";
import { evaluateRules, fingerprint } from "../src/sentinel-core.js";

const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";

if (!key || key.startsWith("your_")) {
  throw new Error(
    "ANTHROPIC_API_KEY is required to record the Claude baseline.",
  );
}

function contextFor(scenario) {
  const profile = fingerprint(scenario.history);
  const rules = evaluateRules(scenario.target, profile, scenario.related);
  return {
    transaction: {
      merchant: scenario.target.merchant,
      amount: scenario.target.amount,
      occurredAt: scenario.target.date,
      category: scenario.target.category,
      location: scenario.target.location,
    },
    fingerprint: {
      confidence: profile.confidence,
      typicalAmount: profile.typicalAmount,
      knownRegions: profile.regions,
      topMerchants: profile.merchants,
    },
    ruleFindings: rules.findings.map(({ code, points, detail }) => ({
      code,
      points,
      detail,
    })),
    relatedTransactions: scenario.related.map(
      ({ merchant, amount, date, category, location }) => ({
        merchant,
        amount,
        date,
        category,
        location,
      }),
    ),
  };
}

async function assess(scenario) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 320,
      temperature: 0,
      system:
        "You are an explainable fraud-risk analyst for a sandbox prototype. Assess only the structured evidence supplied. Do not assert fraud as fact, give banking advice, or invent facts.",
      tools: [
        {
          name: "record_assessment",
          description:
            "Record a structured fraud-risk assessment for one transaction.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "classification",
              "confidence",
              "rationale",
              "supportingSignals",
              "benignExplanations",
            ],
            properties: {
              classification: {
                type: "string",
                enum: ["fraud", "legitimate", "investigate"],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", maxLength: 280 },
              supportingSignals: {
                type: "array",
                items: { type: "string" },
                maxItems: 5,
              },
              benignExplanations: {
                type: "array",
                items: { type: "string" },
                maxItems: 5,
              },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "record_assessment" },
      messages: [
        { role: "user", content: JSON.stringify(contextFor(scenario)) },
      ],
    }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Claude evaluation failed.");
  const parsed = payload.content?.find(
    (block) => block.type === "tool_use",
  )?.input;
  if (
    !["fraud", "legitimate", "investigate"].includes(parsed.classification) ||
    typeof parsed.confidence !== "number" ||
    typeof parsed.rationale !== "string"
  ) {
    throw new Error(
      `Claude returned an invalid assessment for ${scenario.id}.`,
    );
  }
  return {
    id: scenario.id,
    expected: scenario.label,
    classification: parsed.classification,
    confidence: parsed.confidence,
    rationale: parsed.rationale,
    supportingSignals: Array.isArray(parsed.supportingSignals)
      ? parsed.supportingSignals
      : [],
    benignExplanations: Array.isArray(parsed.benignExplanations)
      ? parsed.benignExplanations
      : [],
  };
}

const cases = [];
for (const scenario of scenarios) cases.push(await assess(scenario));
const promptVersion = "fraud-review-baseline-v1";
const output = {
  schemaVersion: 1,
  model,
  recordedAt: new Date().toISOString(),
  temperature: 0,
  promptVersion,
  promptHash: createHash("sha256")
    .update(promptVersion)
    .digest("hex")
    .slice(0, 12),
  cases,
};

console.log(JSON.stringify(output, null, 2));
