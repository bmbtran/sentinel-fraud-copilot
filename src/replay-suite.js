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
    contract: { requiredSources: ["oct-dining", "nov-dining"], requiredLimitations: ["partial_period"], prohibitedConclusionPhrases: ["monthly spending decreased", "spending went down"], requiredConclusionGroups: [["lower recorded spending", "less so far", "lower so far", "less"], ["incomplete", "covered through"]], referenceConclusion: "November has lower recorded spending so far, but the period is incomplete." },
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
    contract: { requiredSources: ["coffee-posted"], forbiddenSources: ["coffee-pending"], requiredLimitations: ["pending_replaced"], requiredConclusionGroups: [["one", "once", "single"], ["6.50"], ["replaced", "replaces"]], referenceConclusion: "One posted $6.50 coffee purchase is available; the pending record was replaced." },
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
    contract: { requiredSources: ["ride-1"], requiredLimitations: ["merchant_enriched"], requiredConclusionGroups: [["one"], ["24.16"], ["enriched", "later update", "modified", "updated"]], referenceConclusion: "There is one $24.16 ride. The merchant label was enriched after sync." },
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
    contract: { requiredSources: ["order-1", "refund-1"], requiredLimitations: ["refund_included"], requiredConclusionGroups: [["42.18"], ["offset"]], referenceConclusion: "The $42.18 purchase is fully offset by a posted $42.18 refund." },
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
    contract: { requiredSources: ["utility-1", "utility-2"], requiredLimitations: ["needs_confirmation"], requiredConclusionGroups: [["two", "both", "separate"], ["confirmation", "confirm", "not confirmed"]], referenceConclusion: "Two same-day utility charges need confirmation; the data alone does not establish fraud." },
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
    contract: { requiredSources: [], forbiddenSources: ["removed-charge"], requiredLimitations: ["removed_transaction"], requiredConclusionGroups: [["no current", "no purchases", "cannot identify", "can’t identify"], ["removed"]], referenceConclusion: "No current transaction can support a November 8 purchase claim after the record was removed." },
  },
  {
    id: "R07",
    title: "Posted amount changes after settlement",
    question: "How much was the restaurant bill?",
    purpose: "Use a modified transaction's settled amount instead of the earlier authorization amount.",
    coverage: { accounts: ["credit"], start: "2026-11-09", end: "2026-11-10", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("restaurant-1", 36, "2026-11-09", "Swan Oyster Depot", "credit")], modified: [], removed: [] },
      { cursor: "c2", added: [], modified: [transaction("restaurant-1", 42.6, "2026-11-09", "Swan Oyster Depot", "credit", { original_description: "SWAN OYSTER DEPOT + TIP" })], removed: [] },
    ],
    contract: { requiredSources: ["restaurant-1"], requiredLimitations: ["amount_modified"], requiredConclusionGroups: [["42.60", "42.6"], ["updated", "including tip", "settled"]], referenceConclusion: "The current settled restaurant charge is $42.60; the transaction amount was updated after sync." },
  },
  {
    id: "R08",
    title: "Similar charges across two accounts",
    question: "Are these two bookstore charges duplicates?",
    purpose: "Avoid collapsing same-merchant charges that occurred on different accounts into one record.",
    coverage: { accounts: ["checking", "credit"], start: "2026-11-11", end: "2026-11-11", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("books-checking", 18.5, "2026-11-11", "City Lights", "checking"), transaction("books-credit", 18.5, "2026-11-11", "City Lights", "credit")], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["books-checking", "books-credit"], requiredLimitations: ["needs_confirmation"], requiredConclusionGroups: [["two", "both"], ["separate accounts", "different accounts", "one is on checking and the other is on credit", "one on checking and one on credit"]], referenceConclusion: "There are two $18.50 bookstore charges on separate accounts. The data alone cannot establish that either is a duplicate." },
  },
  {
    id: "R09",
    title: "Transfer is not ordinary spending",
    question: "What did I spend from checking?",
    purpose: "Exclude an account transfer from a spending total while preserving it as a cited source.",
    coverage: { accounts: ["checking"], start: "2026-11-01", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("groceries-1", 57.2, "2026-11-04", "Rainbow Grocery", "checking"), transaction("transfer-1", 300, "2026-11-06", "Transfer to Savings", "checking", { personal_finance_category: { primary: "TRANSFER_OUT" } })], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["groceries-1", "transfer-1"], requiredLimitations: ["transfer_excluded"], requiredConclusionGroups: [["57.20"], ["transfer"]], referenceConclusion: "Recorded spending is $57.20 at Rainbow Grocery; the $300 transfer to savings is excluded from ordinary spending." },
  },
  {
    id: "R10",
    title: "Account coverage is incomplete",
    question: "What did I spend across all my accounts?",
    purpose: "Require an account-scope limitation when the replay only covers checking.",
    coverage: { accounts: ["checking"], start: "2026-11-01", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("checking-coffee", 5.4, "2026-11-05", "Ritual Coffee", "checking"), transaction("checking-groceries", 31.6, "2026-11-07", "Bi-Rite Market", "checking")], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["checking-coffee", "checking-groceries"], requiredLimitations: ["account_scope"], requiredConclusionGroups: [["37.00", "37.0"], ["checking"]], referenceConclusion: "The replay shows $37.00 of checking-account spending only; it cannot establish spending across all accounts." },
  },
  {
    id: "R11",
    title: "Recurring-looking charges on different dates",
    question: "Is my streaming service charging me twice?",
    purpose: "Distinguish a possible billing issue from a conclusion of duplicate or fraudulent activity.",
    coverage: { accounts: ["credit"], start: "2026-10-28", end: "2026-11-12", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("stream-oct", 15.49, "2026-10-28", "StreamFlix", "credit"), transaction("stream-nov", 15.49, "2026-11-11", "StreamFlix", "credit")], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["stream-oct", "stream-nov"], requiredLimitations: ["needs_confirmation"], requiredConclusionGroups: [["two"], ["different dates", "october 28", "14 days apart"]], referenceConclusion: "There are two $15.49 streaming charges on different dates. Their timing alone does not establish a duplicate charge." },
  },
  {
    id: "R12",
    title: "Ordinary posted purchase control",
    question: "What was my pharmacy purchase?",
    purpose: "Confirm that the evaluator permits a simple, well-supported answer when no lifecycle ambiguity exists.",
    coverage: { accounts: ["checking"], start: "2026-11-10", end: "2026-11-10", completePeriods: [], incompletePeriods: ["2026-11"] },
    batches: [
      { cursor: "c1", added: [transaction("pharmacy-1", 12.84, "2026-11-10", "Walgreens", "checking")], modified: [], removed: [] },
    ],
    contract: { requiredSources: ["pharmacy-1"], requiredLimitations: [], requiredConclusionGroups: [["12.84"], ["walgreens"]], referenceConclusion: "The current state shows one posted $12.84 Walgreens purchase." },
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

export function buildAgentTask(caseId, condition = "raw_sync") {
  const fixture = byId.get(caseId);
  if (!fixture) throw new Error("Replay case not found.");
  if (condition === "raw_sync") {
    return {
      caseId,
      condition,
      question: fixture.question,
      coverage: fixture.coverage,
      syncBatches: fixture.batches,
    };
  }
  if (condition === "reconciled_state") {
    const replay = replayCase(caseId);
    return {
      caseId,
      condition,
      question: replay.question,
      coverage: replay.coverage,
      currentTransactions: replay.transactions,
      cursorTrace: replay.steps,
    };
  }
  throw new Error(`Unknown benchmark condition: ${condition}`);
}

export function validateFinancialAnswer({ caseId, conclusion, sourceTransactionIds, limitations }) {
  const replay = replayCase(caseId);
  const cited = [...new Set(sourceTransactionIds ?? [])];
  const currentIds = new Set(replay.transactions.map((item) => item.transaction_id));
  const required = replay.contract.requiredSources;
  const forbidden = replay.contract.forbiddenSources ?? [];
  const statedLimitations = new Set(limitations ?? []);
  const prohibited = replay.contract.prohibitedConclusionPhrases ?? [];
  const requiredGroups = replay.contract.requiredConclusionGroups ?? [];
  const normalizedConclusion = String(conclusion ?? "").toLowerCase().replace(/\bonce\b/g, "one");
  const isNegatedClaim = (phrase) => {
    const index = normalizedConclusion.indexOf(phrase);
    if (index < 0) return false;
    const prefix = normalizedConclusion.slice(Math.max(0, index - 80), index);
    return /(does not|doesn't|did not|didn't|cannot|can't|too early to conclude|does not establish|doesn't establish)/.test(prefix);
  };
  const checks = [
    { id: "required_sources", pass: required.every((id) => cited.includes(id)), detail: required.length ? `Required: ${required.join(", ")}` : "No active transaction is required." },
    { id: "current_sources_only", pass: cited.every((id) => currentIds.has(id)), detail: "Citations must reference the current replay state." },
    { id: "forbidden_sources", pass: forbidden.every((id) => !cited.includes(id)), detail: forbidden.length ? `Do not cite: ${forbidden.join(", ")}` : "No stale source restriction." },
    { id: "limitations", pass: replay.contract.requiredLimitations.every((item) => statedLimitations.has(item)), detail: `Required limitations: ${replay.contract.requiredLimitations.join(", ") || "none"}` },
    { id: "no_overclaim", pass: !prohibited.some((phrase) => normalizedConclusion.includes(phrase) && !isNegatedClaim(phrase)), detail: prohibited.length ? `Do not claim: ${prohibited.join("; ")}` : "No fixture-specific overclaim restriction." },
    { id: "supported_claim", pass: requiredGroups.every((group) => group.some((term) => normalizedConclusion.includes(term.toLowerCase()))), detail: requiredGroups.length ? `Conclusion must include one phrase from each group: ${requiredGroups.map((group) => group.join(" | ")).join("; ")}` : "No fixture-specific conclusion terms." },
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
