// Recorded against the fixed document-only fixture set on 2026-11-12.
// Claude saw one document at a time and had no vendor-master, PO, history, or balance data.
export const recordedAgentBenchmark = {
  recorded: true,
  evaluatedAt: "2026-11-12",
  model: "claude-haiku-4-5-20251001",
  assessments: [
    ["INV-4101", "approve", "Standard office supplies invoice with clear purpose, reasonable amount, and standard Net 30 terms. No red flags detected in submitted document."],
    ["INV-4102", "approve", "Standard freight invoice with clear purpose, reasonable amount, standard Net 30 terms, and valid payment destination on file."],
    ["INV-4103", "approve", "Standard license renewal request with clear purpose, reasonable amount, and standard Net 30 payment terms. No red flags detected in submitted document."],
    ["INV-4104", "approve", "Standard managed support services invoice with clear Net 30 terms and reasonable amount. No red flags detected in submitted document."],
    ["INV-4201", "approve", "Standard monthly services invoice with clear Net 30 terms, reasonable amount, and complete vendor/payment information provided."],
    ["INV-4202", "hold", "Masked payment destination prevents verification of legitimacy. Require confirmation of vendor banking information before approval."],
    ["INV-4203", "hold", "Masked bank account prevents verification of payment-destination legitimacy. Subscription renewal requires confirmation of vendor identity and account ownership before release."],
    ["INV-4204", "approve", "Invoice contains standard business service details with a clear purpose, reasonable amount, standard payment terms, and a valid payment destination."],
    ["INV-4301", "approve", "Standard office supplies invoice with clear purpose, reasonable amount, standard Net 30 terms, and valid payment destination provided."],
    ["INV-4302", "approve", "Standard freight services invoice with a clear vendor name, reasonable amount, standard payment terms, and valid payment destination on file."],
    ["INV-4303", "hold", "Incomplete banking details and no supporting documentation provided for verification."],
    ["INV-4304", "approve", "Invoice contains a standard business service request with clear purpose, reasonable amount, and standard payment terms. No red flags detected in submitted document."]
  ].map(([invoiceId, decision, reason]) => ({ invoiceId, decision, reason }))
};
