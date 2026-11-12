import { vendorMaster } from "./data.js";

const PII_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const BANK_CHANGE_PATTERN = /remittance details have changed|update (our )?bank details|new payment account/i;

export function naiveDecision(request) {
  if (request.category === "amount_mismatch" || request.category === "duplicate") {
    return { decision: "hold", reason: request.category === "duplicate" ? "Duplicate invoice" : "Amount exceeds expected purchase order" };
  }
  return { decision: "approve", reason: "Invoice details accepted" };
}

export function protectedDecision(request, master = vendorMaster, fundingAccount = null, controls = {}) {
  const enabled = { documentScreen: true, vendorMaster: true, purchaseOrder: true, duplicateCheck: true, funding: true, ...controls };
  if (enabled.documentScreen && request.hiddenText) return { decision: "block", reason: "Document contains an instruction to override payment controls", guard: "input-screen" };
  if (enabled.documentScreen && PII_PATTERN.test(request.note)) return { decision: "block", reason: "Sensitive identifier detected in payment context", guard: "sensitive-data" };
  if (enabled.vendorMaster && BANK_CHANGE_PATTERN.test(request.note)) return { decision: "block", reason: "Bank changes cannot originate in an invoice", guard: "vendor-master" };
  if (enabled.vendorMaster && !master[request.vendorId]) return { decision: "hold", reason: "Vendor does not match the verified vendor master", guard: "vendor-master" };
  if (enabled.vendorMaster && request.account !== master[request.vendorId].account) return { decision: "block", reason: "Requested payout account differs from the vendor master", guard: "vendor-master" };
  if (enabled.purchaseOrder && request.amount !== request.expectedAmount) return { decision: "hold", reason: "Amount differs from the approved purchase order", guard: "purchase-order" };
  if (enabled.duplicateCheck && request.category === "duplicate") return { decision: "hold", reason: "Invoice already appears in payment history", guard: "duplicate-check" };
  if (enabled.funding && fundingAccount && request.amount > fundingAccount.available) return { decision: "hold", reason: "Available funds in the connected account are below the payment amount", guard: "plaid-funding" };
  return { decision: "approve", reason: "Verified against vendor master and purchase order", guard: "verified" };
}

export function runBenchmark(items, fundingAccount = null, controls = {}) {
  return items.map((request) => ({ request, naive: naiveDecision(request), protected: protectedDecision(request, vendorMaster, fundingAccount, controls) }));
}

export function metrics(results, version) {
  const attacks = results.filter(({ request }) => request.category !== "clean" && !["insufficient_funds", "duplicate"].includes(request.category));
  const cleanItems = results.filter(({ request }) => request.category === "clean");
  return {
    stopped: attacks.filter((result) => result[version].decision !== "approve").length,
    attacks: attacks.length,
    cleanHeld: cleanItems.filter((result) => result[version].decision !== "approve").length,
    clean: cleanItems.length
  };
}
