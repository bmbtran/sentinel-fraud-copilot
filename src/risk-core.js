import { flaggedDestinations, knownDeviceUses } from "./command-data.js";

export function assessPayment(payment) {
  const signals = [];
  let score = 6;
  if (payment.amount >= 2000) { score += 18; signals.push({ code: "LARGE_AMOUNT", weight: 18, detail: `$${payment.amount.toLocaleString()} is above this fixture cohort's normal purchase size.` }); }
  if (payment.tags.includes("new_device")) { score += 14; signals.push({ code: "NEW_DEVICE", weight: 14, detail: "The device has no established account history." }); }
  if (knownDeviceUses[payment.device] >= 3 || payment.tags.includes("shared_device")) { score += 30; signals.push({ code: "SHARED_DEVICE", weight: 30, detail: `${knownDeviceUses[payment.device] ?? 0} fixture payments share this device.` }); }
  if (flaggedDestinations.has(payment.destination)) { score += 32; signals.push({ code: "FLAGGED_DESTINATION", weight: 32, detail: "This destination belongs to a high-fan-in payment cluster." }); }
  if (payment.tags.includes("velocity")) { score += 18; signals.push({ code: "VELOCITY", weight: 18, detail: "Multiple related payment attempts appeared in a short window." }); }
  score = Math.min(score, 99);
  const level = score >= 75 ? "CRITICAL" : score >= 55 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const decision = level === "LOW" ? "READY_FOR_AUTHORIZATION" : level === "MEDIUM" ? "HOLD_FOR_REVIEW" : "REJECT_OR_ESCALATE";
  return { score, level, decision, signals: signals.sort((a, b) => b.weight - a.weight) };
}

export function buildGraph(payments) {
  const nodes = new Map(); const edges = [];
  const addNode = (id, type, label, flagged = false) => nodes.set(id, { id, type, label, flagged });
  for (const payment of payments) {
    const customer = `customer:${payment.customer}`; const device = `device:${payment.device}`; const destination = `destination:${payment.destination}`;
    addNode(customer, "customer", payment.customer); addNode(device, "device", payment.device, knownDeviceUses[payment.device] >= 3); addNode(destination, "destination", payment.destination, flaggedDestinations.has(payment.destination));
    edges.push({ source: customer, target: device, transactionId: payment.id }, { source: customer, target: destination, transactionId: payment.id });
  }
  return { nodes: [...nodes.values()], edges };
}

export function queueSummary(payments) {
  const assessments = payments.map((payment) => ({ payment, assessment: assessPayment(payment) }));
  return {
    total: assessments.length,
    ready: assessments.filter(({ assessment }) => assessment.decision === "READY_FOR_AUTHORIZATION").length,
    held: assessments.filter(({ assessment }) => assessment.decision === "HOLD_FOR_REVIEW").length,
    critical: assessments.filter(({ assessment }) => assessment.level === "CRITICAL").length,
    totalAmount: assessments.reduce((sum, { payment }) => sum + payment.amount, 0)
  };
}
