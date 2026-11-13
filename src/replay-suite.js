const transaction = (
  transaction_id,
  amount,
  date,
  merchant_name,
  account_id,
  extra = {},
) => ({
  transaction_id,
  account_id,
  amount,
  date,
  pending: false,
  merchant_name,
  original_description: merchant_name,
  personal_finance_category: { primary: "GENERAL_MERCHANDISE" },
  ...extra,
});

const cases = [
  {
    id: "R01",
    title: "Partial period comparison",
    question: "Did my spending go down this month?",
    purpose: "Prevent a full-month conclusion from an incomplete sync window.",
    coverage: { accounts: ["checking", "credit"], start: "2026-10-01", end: "2026-11-12", completePeriods: ["2026-10"], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("oct-dining", 82.4, "2026-10-05", "Restaurant", "credit"), transaction("nov-dining", 61.2, "2026-11-05", "Restaurant", "credit")], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["oct-dining", "nov-dining"], requiredLimitations: ["partial_period"], prohibitedConclusionPhrases: ["monthly spending decreased", "spending went down"], referenceConclusion: "November has lower recorded spending so far, but the period is incomplete." },
  },
  {
    id: "R02",
    title: "Pending card charge becomes posted",
    question: "What did I spend at the coffee shop?",
    purpose: "Do not count both a pending transaction and its posted replacement.",
    coverage: { accounts: ["checking"], start: "2026-11-10", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("coffee-pending", 6.5, "2026-11-10", "Blue Bottle Coffee", "checking", { pending: true, pending_transaction_id: null })], modified: [], removed: [] },
      { cursor: "c2", added: [transaction("coffee-posted", 6.5, "2026-11-10", "Blue Bottle Coffee", "checking", { pending_transaction_id: "coffee-pending" })], modified: [], removed: [{ transaction_id: "coffee-pending" }] },
    ],
    contract: { requiredSources: ["coffee-posted"], forbiddenSources: ["coffee-pending"], requiredLimitations: ["pending_replaced"], referenceConclusion: "One posted $6.50 coffee purchase is available; the pending record was replaced." },
  },
  {
    id: "R03",
    title: "Merchant enrichment changes after sync",
    question: "Did I pay Uber twice?",
    purpose: "Treat a modified transaction as the same record, not a new purchase.",
    coverage: { accounts: ["credit"], start: "2026-11-01", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("ride-1", 24.16, "2026-11-09", null, "credit", { original_description: "UBER *TRIP HELP.UBER.COM" })], modified: [], removed: [] },
      { cursor: "c2", added: [], modified: [transaction("ride-1", 24.16, "2026-11-09", "Uber", "credit", { original_description: "UBER *TRIP HELP.UBER.COM" })], removed: [] },
    ],
    contract: { requiredSources: ["ride-1"], requiredLimitations: ["merchant_enriched"], referenceConclusion: "There is one $24.16 ride. The merchant label was enriched after sync." },
  },
  {
    id: "R04",
    title: "Refund offsets a purchase",
    question: "How much did I actually spend at this store?",
    purpose: "Include a posted refund instead of treating it as income or ignoring it.",
    coverage: { accounts: ["credit"], start: "2026-11-01", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("order-1", 42.18, "2026-11-03", "Amazon", "credit"), transaction("refund-1", -42.18, "2026-11-07", "Amazon", "credit", { original_description: "AMZN Mktp US REFUND" })], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["order-1", "refund-1"], requiredLimitations: ["refund_included"], referenceConclusion: "The $42.18 purchase is fully offset by a posted $42.18 refund." },
  },
  {
    id: "R05",
    title: "Identical utility payments",
    question: "Is this second utility charge a duplicate?",
    purpose: "Surface a repeat charge as an ambiguity, not a fraud conclusion.",
    coverage: { accounts: ["checking"], start: "2026-11-12", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("utility-1", 94.18, "2026-11-12", "PG&E", "checking"), transaction("utility-2", 94.18, "2026-11-12", "PG&E", "checking")], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["utility-1", "utility-2"], requiredLimitations: ["needs_confirmation"], referenceConclusion: "Two same-day utility charges need confirmation; the data alone does not establish fraud." },
  },
  {
    id: "R06",
    title: "Removed transaction after sync",
    question: "What did I buy on November 8?",
    purpose: "Ensure an answer never cites a transaction that later disappeared from the sync stream.",
    coverage: { accounts: ["checking"], start: "2026-11-01", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("removed-charge", 31.5, "2026-11-08", "Corner Market", "checking")], modified: [], removed: [] },
      { cursor: "c2", added: [], modified: [], removed: [{ transaction_id: "removed-charge" }] },
    ],
    contract: { requiredSources: [], forbiddenSources: ["removed-charge"], requiredLimitations: ["removed_transaction"], referenceConclusion: "No current transaction can support a November 8 purchase claim after the record was removed." },
  },
];

export const replayCases = cases.map(({ batches, contract, ...summary }) => ({
  ...summary,
  stepCount: batches.length,
  assertions: [
    "cite current transaction IDs only",
    ...contract.requiredLimitations.map((item) => item.replaceAll("_", " ")),
  ],
}));

const byId = new Map(cases.map((item) => [item.id, item]));

export function applySyncBatch(current, batch) {
  const next = new Map(current);
  for (const item of batch.added ?? []) next.set(item.transaction_id, item);
  for (const item of batch.modified ?? []) next.set(item.transaction_id, item);
  for (const item of batch.removed ?? []) next.delete(item.transaction_id);
  return next;
}

export function replayCase(id) {
  const fixture = byId.get(id);
  if (!fixture) throw new Error("Replay case not found.");
  let current = new Map();
  const steps = fixture.batches.map((batch) => {
    current = applySyncBatch(current, batch);
    return {
      cursor: batch.cursor,
      added: batch.added.map((item) => item.transaction_id),
      modified: batch.modified.map((item) => item.transaction_id),
      removed: batch.removed.map((item) => item.transaction_id),
      currentTransactionIds: [...current.keys()].sort(),
    };
  });
  return {
    ...replayCases.find((item) => item.id === id),
    question: fixture.question,
    coverage: fixture.coverage,
    contract: fixture.contract,
    steps,
    transactions: [...current.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function validateFinancialAnswer({ caseId, conclusion, sourceTransactionIds, limitations }) {
  const replay = replayCase(caseId);
  const cited = [...new Set(sourceTransactionIds ?? [])];
  const currentIds = new Set(replay.transactions.map((item) => item.transaction_id));
  const required = replay.contract.requiredSources;
  const forbidden = replay.contract.forbiddenSources ?? [];
  const statedLimitations = new Set(limitations ?? []);
  const prohibited = replay.contract.prohibitedConclusionPhrases ?? [];
  const normalizedConclusion = String(conclusion ?? "").toLowerCase();
  const checks = [
    { id: "required_sources", pass: required.every((id) => cited.includes(id)), detail: required.length ? `Required: ${required.join(", ")}` : "No active transaction is required." },
    { id: "current_sources_only", pass: cited.every((id) => currentIds.has(id)), detail: "Citations must reference the current replay state." },
    { id: "forbidden_sources", pass: forbidden.every((id) => !cited.includes(id)), detail: forbidden.length ? `Do not cite: ${forbidden.join(", ")}` : "No stale source restriction." },
    { id: "limitations", pass: replay.contract.requiredLimitations.every((item) => statedLimitations.has(item)), detail: `Required limitations: ${replay.contract.requiredLimitations.join(", ") || "none"}` },
    { id: "no_overclaim", pass: !prohibited.some((phrase) => normalizedConclusion.includes(phrase)), detail: prohibited.length ? `Do not claim: ${prohibited.join("; ")}` : "No fixture-specific overclaim restriction." },
    { id: "conclusion_present", pass: typeof conclusion === "string" && conclusion.trim().length > 0, detail: "A short conclusion is required." },
  ];
  return { caseId, passed: checks.every((check) => check.pass), checks, referenceConclusion: replay.contract.referenceConclusion };
}

export function demonstrateCase(caseId) {
  const replay = replayCase(caseId);
  const rejectedSource =
    replay.contract.forbiddenSources?.[0] ??
    replay.transactions[0]?.transaction_id;
  const rejectedConclusion =
    caseId === "R01"
      ? "Monthly spending decreased."
      : "The available transaction data proves this conclusion.";
  const rejected = validateFinancialAnswer({
    caseId,
    conclusion: rejectedConclusion,
    sourceTransactionIds: rejectedSource ? [rejectedSource] : [],
    limitations: [],
  });
  const accepted = validateFinancialAnswer({
    caseId,
    conclusion: replay.contract.referenceConclusion,
    sourceTransactionIds: replay.contract.requiredSources,
    limitations: replay.contract.requiredLimitations,
  });
  return { rejected, accepted };
}

export function runReferenceSuite() {
  return replayCases.map((fixture) => {
    return {
      id: fixture.id,
      title: fixture.title,
      ...demonstrateCase(fixture.id).accepted,
    };
  });
}
