const median = (numbers) => {
  const xs = [...numbers].sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : 0;
};
const p90 = (numbers) => {
  const xs = [...numbers].sort((a, b) => a - b);
  return xs[Math.max(0, Math.ceil(xs.length * 0.9) - 1)] ?? 0;
};
const norm = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const unique = (items) => [...new Set(items)];
export function fingerprint(history) {
  const byCategory = Object.groupBy(
    history,
    (transaction) => transaction.category || "Other",
  );
  const categories = Object.fromEntries(
    Object.entries(byCategory).map(([category, values]) => [
      category,
      {
        median: median(values.map((x) => x.amount)),
        p90: p90(values.map((x) => x.amount)),
        count: values.length,
      },
    ]),
  );
  const merchantCounts = history.reduce(
    (all, transaction) => ({
      ...all,
      [norm(transaction.merchant)]: (all[norm(transaction.merchant)] ?? 0) + 1,
    }),
    {},
  );
  return {
    transactionCount: history.length,
    confidence:
      history.length >= 12 ? "high" : history.length >= 7 ? "medium" : "low",
    categories,
    merchants: Object.entries(merchantCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([merchant, count]) => ({ merchant, count })),
    typicalAmount: median(history.map((x) => x.amount)),
    activeHours: unique(history.map((x) => new Date(x.date).getUTCHours())),
    regions: unique(history.map((x) => x.location)),
    history,
  };
}
export function evaluateRules(target, profile, related = []) {
  const findings = [];
  const add = (
    code,
    points,
    detail,
    severity = points >= 20 ? "high" : points >= 10 ? "medium" : "low",
  ) => findings.push({ code, points, detail, severity });
  const sameMerchant = profile.history.filter(
    (x) => norm(x.merchant) === norm(target.merchant),
  );
  const category = profile.categories[target.category];
  const hour = new Date(target.date).getUTCHours();
  if (!sameMerchant.length)
    add(
      "NEW_MERCHANT",
      12,
      `${target.merchant} has not appeared in this person’s history.`,
    );
  if (
    category?.p90 &&
    target.amount > Math.max(category.p90 * 2.5, category.p90 + 180)
  )
    add(
      "AMOUNT_OUTLIER",
      24,
      `$${target.amount.toFixed(2)} is far above the typical ${target.category} range.`,
    );
  if (
    profile.activeHours.length &&
    !profile.activeHours.includes(hour) &&
    (hour < 6 || hour > 23)
  )
    add(
      "UNUSUAL_HOUR",
      12,
      "The transaction occurred outside the usual active purchase window.",
    );
  const duplicate = related.find(
    (x) =>
      norm(x.merchant) === norm(target.merchant) &&
      Math.abs(x.amount - target.amount) < 0.01 &&
      Math.abs(new Date(x.date) - new Date(target.date)) < 600000,
  );
  if (duplicate)
    add(
      "DUPLICATE_CHARGE",
      29,
      "An identical merchant and amount appeared within ten minutes.",
    );
  const micro = related.filter((x) => x.amount < 5);
  if (micro.length >= 2 && target.amount > 100)
    add(
      "CARD_TESTING",
      31,
      `${micro.length} small verification-like charges preceded a larger purchase.`,
    );
  const burst = related.filter(
    (x) =>
      Math.abs(new Date(x.date) - new Date(target.date)) < 2700000 &&
      x.amount >= 50,
  );
  if (burst.length >= 2) {
    add(
      "SPEND_VELOCITY",
      18,
      `${burst.length} substantial charges appeared in the same 45-minute window.`,
    );
    if (!sameMerchant.length)
      add(
        "NEW_MERCHANT_BURST",
        24,
        "Several first-time merchants appeared in a concentrated purchase burst.",
      );
  }
  if (
    target.location &&
    !profile.regions.includes(target.location) &&
    !sameMerchant.length
  )
    add(
      "UNFAMILIAR_REGION",
      12,
      `${target.location} is new in this person’s transaction history.`,
    );
  if (
    target.category === "Cash Advance" &&
    !profile.regions.includes(target.location)
  )
    add(
      "UNFAMILIAR_CASH_WITHDRAWAL",
      46,
      "A high-value cash withdrawal occurred in an unfamiliar region.",
    );
  const priorRecurring = related.find(
    (x) =>
      norm(x.merchant) === norm(target.merchant) &&
      target.amount > x.amount * 1.35,
  );
  if (priorRecurring)
    add(
      "SUBSCRIPTION_DRIFT",
      10,
      `This recurring charge increased from $${priorRecurring.amount.toFixed(2)} to $${target.amount.toFixed(2)}.`,
    );
  const travelEvidence = related.some(
    (x) => x.category === "Travel" && x.location === target.location,
  );
  if (travelEvidence)
    add(
      "TRAVEL_CONTEXT",
      -18,
      "A related travel transaction supports this location as expected activity.",
      "protective",
    );
  return {
    score: Math.max(
      0,
      Math.min(
        99,
        findings.reduce((sum, finding) => sum + finding.points, 4),
      ),
    ),
    findings: findings.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
  };
}
export function fuse(rules, claude, profile) {
  const direction =
    claude.classification === "fraud"
      ? 100
      : claude.classification === "investigate"
        ? 50
        : 0;
  const bonus =
    rules.findings.filter((x) => x.points >= 18).length >= 2 ? 8 : 0;
  const hardSignals = [
    "CARD_TESTING",
    "DUPLICATE_CHARGE",
    "NEW_MERCHANT_BURST",
    "UNFAMILIAR_CASH_WITHDRAWAL",
  ];
  const alertSignals = [
    "CARD_TESTING",
    "NEW_MERCHANT_BURST",
    "UNFAMILIAR_CASH_WITHDRAWAL",
  ];
  const hasHardSignal = rules.findings.some((x) =>
    hardSignals.includes(x.code),
  );
  const hasAlertSignal = rules.findings.some((x) =>
    alertSignals.includes(x.code),
  );
  const cap = profile.confidence === "low" && !hasHardSignal ? 72 : 99;
  const blendedScore = Math.min(
    cap,
    Math.round(
      0.68 * rules.score + 0.32 * claude.confidence * direction + 0.1 * bonus,
    ),
  );
  const score = hasAlertSignal ? Math.max(75, blendedScore) : blendedScore;
  const action = score >= 75 ? "alert" : score >= 25 ? "ask" : "ignore";
  const evidence = rules.findings.filter((x) => x.points > 0).slice(0, 3);
  const counterfactuals = evidence
    .slice(0, 2)
    .map((finding) =>
      finding.code === "AMOUNT_OUTLIER"
        ? "A lower amount within the person’s usual category range would reduce concern."
        : finding.code === "NEW_MERCHANT"
          ? "Prior history with this merchant would reduce concern."
          : finding.code === "UNUSUAL_HOUR"
            ? "A purchase during a typical active window would reduce concern."
            : finding.code === "CARD_TESTING"
              ? "Without the sequence of small verification-like charges, this alert would be less urgent."
              : `Removing the ${finding.code.replaceAll("_", " ").toLowerCase()} signal would reduce concern.`,
    );
  return {
    score,
    action,
    classification:
      action === "alert"
        ? "fraud"
        : action === "ask"
          ? "investigate"
          : "legitimate",
    evidence,
    counterfactuals,
    confidence: Math.round(claude.confidence * 100),
  };
}
export function assessScenario(scenario, claude) {
  if (!claude)
    throw new Error(`A Claude assessment is required for ${scenario.id}.`);
  const profile = fingerprint(scenario.history);
  const rules = evaluateRules(scenario.target, profile, scenario.related);
  return { profile, rules, claude, hybrid: fuse(rules, claude, profile) };
}
export function buildIncident(scenario, assessment) {
  const evidence = assessment.hybrid.evidence.map((finding) => ({
    title: finding.code
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    detail: finding.detail,
  }));
  const related = scenario.related
    .filter(
      (transaction) =>
        transaction.amount < 5 ||
        Math.abs(new Date(transaction.date) - new Date(scenario.target.date)) <
          60 * 60 * 1000,
    )
    .map((transaction) => ({
      merchant: transaction.merchant,
      amount: transaction.amount,
      date: transaction.date,
      note:
        transaction.amount < 5
          ? "Small verification-like charge"
          : "Related activity in the hour before the purchase",
    }));
  const chargeDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(scenario.target.date));
  const plainText = [
    `SENTINEL INCIDENT SUMMARY — DEMO ONLY`,
    `Charge: ${scenario.target.merchant} • $${scenario.target.amount.toFixed(2)} • ${chargeDate}`,
    `Location: ${scenario.target.location}`,
    ``,
    `Why it was surfaced:`,
    ...evidence.map((item) => `• ${item.title}: ${item.detail}`),
    ``,
    `Related activity:`,
    ...(related.length
      ? related.map(
          (item) =>
            `• ${item.merchant} • $${item.amount.toFixed(2)} • ${item.note}`,
        )
      : ["• No linked activity found"]),
    ``,
    `Suggested next steps:`,
    `1. Review the merchant and amount against your receipts.`,
    `2. If you do not recognize it, contact the card issuer using its official app or number.`,
    `3. Keep an eye on nearby charges and update the decision if new information appears.`,
    ``,
    `This is a prototype summary, not a dispute submission.`,
  ].join("\n");
  return {
    id: `INC-${scenario.id}`,
    scenarioId: scenario.id,
    createdAt: new Date().toISOString(),
    status: "prepared",
    charge: {
      merchant: scenario.target.merchant,
      amount: scenario.target.amount,
      date: chargeDate,
      location: scenario.target.location,
    },
    evidence,
    related,
    nextSteps: [
      "Review the merchant and amount against your receipts.",
      "If you do not recognize it, contact the card issuer through its official app or number.",
      "Watch nearby charges and update the decision if new information appears.",
    ],
    plainText,
  };
}
export function metrics(results, engine) {
  const labels = ["fraud", "investigate", "legitimate"];
  const predict = (result) =>
    engine === "rules"
      ? result.rules.score >= 90
        ? "fraud"
        : result.rules.score >= 30
          ? "investigate"
          : "legitimate"
      : engine === "claude"
        ? result.claude.classification
        : result.hybrid.classification;
  const perLabel = labels.map((label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const result of results) {
      const predicted = predict(result) === label;
      const actual = result.scenario.label === label;
      if (predicted && actual) tp++;
      else if (predicted) fp++;
      else if (actual) fn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return {
      label,
      precision,
      recall,
      f1:
        precision + recall
          ? (2 * precision * recall) / (precision + recall)
          : 0,
    };
  });
  const average = (field) =>
    perLabel.reduce((sum, item) => sum + item[field], 0) / perLabel.length;
  return {
    precision: Math.round(average("precision") * 100),
    recall: Math.round(average("recall") * 100),
    f1: Math.round(average("f1") * 100),
    perLabel,
  };
}
