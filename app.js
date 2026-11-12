import { requests, scenarioLabels, vendorMaster } from "./src/data.js";
import { recordedAgentBenchmark } from "./src/agent-benchmark.js";
import { metrics, runBenchmark } from "./src/risk-engine.js";

const defaultControls = { documentScreen: true, vendorMaster: true, purchaseOrder: true, duplicateCheck: true, funding: true };
const savedControls = (() => { try { return { ...defaultControls, ...JSON.parse(localStorage.getItem("transfer-trust-controls") ?? "{}") }; } catch { return defaultControls; } })();
let results = runBenchmark(requests, null, savedControls);
const firstRisk = results.find((result) => result.request.category !== "clean" && !["insufficient_funds", "duplicate"].includes(result.request.category));
const savedReviews = (() => { try { return JSON.parse(localStorage.getItem("transfer-trust-reviews") ?? "{}"); } catch { return {}; } })();
const savedAgentBenchmark = (() => { try { const saved = JSON.parse(localStorage.getItem("transfer-trust-agent-benchmark") ?? "null"); return Array.isArray(saved?.assessments) ? saved : null; } catch { return null; } })();
const defaultAlerts = Object.fromEntries(["unverified_destination", "unverified_vendor", "purchase_order_mismatch"].map((category) => [category, "open"]));
const savedAlerts = (() => { try { return { ...defaultAlerts, ...JSON.parse(localStorage.getItem("transfer-trust-alerts") ?? "{}") }; } catch { return defaultAlerts; } })();
const state = { filter: "all", search: "", selected: firstRisk?.request.invoiceId ?? null, fundingAccount: null, reviews: savedReviews, aiByInvoice: {}, extractingInvoice: null, agentBenchmark: savedAgentBenchmark ?? recordedAgentBenchmark, benchmarkingAgent: false, controls: savedControls, alerts: savedAlerts, rootRefreshedAt: new Date(), page: "queue" };
const list = document.querySelector("#request-list");
const panel = document.querySelector("#decision-panel");
const reviewProgress = document.querySelector("#review-progress");

function classification(result) {
  if (result.request.category === "clean") return "clean";
  if (["insufficient_funds", "duplicate"].includes(result.request.category)) return "exception";
  return "attack";
}

function saveControls() { localStorage.setItem("transfer-trust-controls", JSON.stringify(state.controls)); }
function saveAlerts() { localStorage.setItem("transfer-trust-alerts", JSON.stringify(state.alerts)); }
function recomputeResults() { results = runBenchmark(requests, state.fundingAccount, state.controls); updateScenarioCounts(); renderList(); renderRootCause(); renderGuardrails(); renderAlerts(); }

function updateScenarioCounts() {
  const attackCount = results.filter((result) => classification(result) === "attack").length;
  const cleanCount = results.filter((result) => classification(result) === "clean").length;
  const exceptionCount = results.filter((result) => classification(result) === "exception").length;
  document.querySelector("#batch-count").textContent = results.length;
  document.querySelector("#all-count").textContent = results.length;
  document.querySelector("#attack-count").textContent = attackCount;
  document.querySelector("#clean-count").textContent = cleanCount;
  document.querySelector("#exception-count").textContent = exceptionCount;
  const agentDecisions = new Map(state.agentBenchmark?.assessments?.map((assessment) => [assessment.invoiceId, assessment]) ?? []);
  const agentStopped = state.agentBenchmark ? results.filter((result) => classification(result) === "attack" && ["hold", "block"].includes(agentDecisions.get(result.request.invoiceId)?.decision)).length : null;
  document.querySelector("#naive-stopped").textContent = agentStopped ?? "—";
  document.querySelector("#protected-stopped").textContent = metrics(results, "protected").stopped;
  document.querySelector("#naive-attack-total").textContent = attackCount;
  document.querySelector("#protected-attack-total").textContent = attackCount;
  document.querySelector(".benchmark-result.naive .meter i").style.width = agentStopped == null ? "0%" : `${(agentStopped / attackCount) * 100}%`;
  document.querySelector(".benchmark-result.protected .meter i").style.width = `${(metrics(results, "protected").stopped / attackCount) * 100}%`;
  const benchmarkButton = document.querySelector("#run-agent-benchmark");
  benchmarkButton.textContent = state.benchmarkingAgent ? "Evaluating Claude…" : state.agentBenchmark ? "Re-run Claude baseline" : "Evaluate Claude baseline";
  benchmarkButton.disabled = state.benchmarkingAgent;
  document.querySelector("#benchmark-note-text").textContent = state.agentBenchmark?.recorded
    ? `Recorded ${state.agentBenchmark.evaluatedAt} · ${state.agentBenchmark.model} saw one document at a time, without trusted vendor, PO, history, or balance data. Policy may override before simulated release; no payment is executed.`
    : "Live Claude evaluation · one document at a time without trusted vendor, PO, history, or balance data. Policy may override before simulated release; no payment is executed.";
}

function filteredResults() {
  const query = state.search.trim().toLowerCase();
  return results.filter((result) => {
    const matchesFilter = state.filter === "all" || classification(result) === state.filter;
    const haystack = `${result.request.vendor} ${result.request.invoiceId} ${result.request.account}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function statusClass(decision) { return decision === "block" ? "block" : decision === "hold" ? "hold" : "approve"; }
function decisionLabel(decision) { return decision === "block" ? "Blocked" : decision === "hold" ? "Hold" : "Approved"; }
function currency(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function escapeHtml(value) { return String(value ?? "—").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function saveReviews() { localStorage.setItem("transfer-trust-reviews", JSON.stringify(state.reviews)); }
function updateReviewProgress() { reviewProgress.textContent = `${Object.keys(state.reviews).length} ${Object.keys(state.reviews).length === 1 ? "review" : "reviews"} recorded locally`; }
function traceFor(request, decision) {
  const stoppedAtInput = decision.guard === "input-screen" || decision.guard === "sensitive-data";
  const stoppedAtVendor = decision.guard === "vendor-master";
  const stoppedAtPurchaseOrder = decision.guard === "purchase-order" || decision.guard === "duplicate-check";
  const stoppedAtFunding = decision.guard === "plaid-funding";
  return [
    ["Document screen", stoppedAtInput ? "blocked" : "passed", stoppedAtInput ? "stop" : "pass"],
    ["Vendor master", stoppedAtInput ? "skipped" : stoppedAtVendor ? decision.decision : "verified", stoppedAtInput ? "skip" : stoppedAtVendor ? decision.decision : "pass"],
    ["Purchase order and duplicate check", stoppedAtInput || stoppedAtVendor ? "skipped" : stoppedAtPurchaseOrder ? "held" : "passed", stoppedAtInput || stoppedAtVendor ? "skip" : stoppedAtPurchaseOrder ? "hold" : "pass"],
    ["Plaid funding check", stoppedAtInput || stoppedAtVendor || stoppedAtPurchaseOrder ? "skipped" : stoppedAtFunding ? "held" : state.fundingAccount ? "passed" : "pending", stoppedAtInput || stoppedAtVendor || stoppedAtPurchaseOrder ? "skip" : stoppedAtFunding ? "hold" : "pass"],
    ["Release action", decision.decision === "approve" ? "eligible — not executed in demo" : "not initiated", decision.decision === "approve" ? "pass" : "stop"]
  ];
}

function documentForClaude(request) {
  return `Vendor: ${request.vendor}\nInvoice ID: ${request.invoiceId}\nRequested amount: ${currency(request.amount)}\nRequested destination: ${request.account}\nPurpose: ${request.note}${request.hiddenText ? `\nAdditional document text: ${request.hiddenText}` : ""}`;
}

function autonomousAgentDecision(request) {
  return state.agentBenchmark?.assessments?.find((assessment) => assessment.invoiceId === request.invoiceId) ?? null;
}

const clusterDefinitions = [
  { category: "unverified_destination", control: "vendorMaster", title: "Destination is not verified", description: "The document looks ordinary, but its requested account differs from the vendor master. The agent has no account-of-record to compare." },
  { category: "unverified_vendor", control: "vendorMaster", title: "Vendor identity is unverified", description: "A familiar display name is not enough. The intake identity must resolve to a verified vendor record before release." },
  { category: "purchase_order_mismatch", control: "purchaseOrder", title: "Amount exceeds the approved PO", description: "The invoice gives one amount; the purchase order gives another. The document-only agent cannot see that discrepancy." }
];

function rootCases(category) { return results.filter((result) => result.request.category === category); }
function renderRootCause() {
  const riskCases = results.filter((result) => classification(result) === "attack");
  const agentStops = riskCases.filter((result) => ["hold", "block"].includes(autonomousAgentDecision(result.request)?.decision)).length;
  const policyStops = riskCases.filter((result) => result.protected.decision !== "approve").length;
  document.querySelector("#root-cluster-count").textContent = clusterDefinitions.length;
  document.querySelector("#root-risk-count").textContent = riskCases.length;
  document.querySelector("#root-agent-approvals").textContent = riskCases.length - agentStops;
  document.querySelector("#root-policy-stops").textContent = policyStops;
  document.querySelector("#root-summary-text").textContent = `${riskCases.length - agentStops} of ${riskCases.length} fixture requests were approved by the document-only agent. The enabled policy controls stopped ${policyStops}. Each cluster below names the trusted context the agent did not have.`;
  document.querySelector("#root-refreshed-at").textContent = `Analysis refreshed ${state.rootRefreshedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · fixture data only`;
  document.querySelector("#root-clusters").innerHTML = clusterDefinitions.map((cluster) => {
    const cases = rootCases(cluster.category);
    const stopped = cases.filter((result) => result.protected.decision !== "approve").length;
    return `<article class="root-cluster"><span class="cluster-count">${cases.length} cases · ${stopped} stopped</span><h2>${cluster.title}</h2><p>${cluster.description}</p><p class="cluster-meta">Required control: ${cluster.control === "vendorMaster" ? "vendor master" : "purchase order"}</p><button class="cluster-action" type="button" data-open-case="${cluster.category}">Open representative case →</button></article>`;
  }).join("");
}

const controlDefinitions = [
  { key: "vendorMaster", title: "Vendor master verification", description: "Matches source identity and requested destination to a verified record.", categories: ["unverified_destination", "unverified_vendor"] },
  { key: "purchaseOrder", title: "Purchase order verification", description: "Holds a request when its amount differs from the approved PO.", categories: ["purchase_order_mismatch"] },
  { key: "funding", title: "Plaid funding readiness", description: "Holds a payment that exceeds the current connected Sandbox balance.", categories: ["insufficient_funds"] }
];

function renderGuardrails() {
  const enabledCount = controlDefinitions.filter((control) => state.controls[control.key]).length;
  document.querySelector("#guardrail-status").textContent = `${enabledCount} of ${controlDefinitions.length} key controls enabled`;
  document.querySelector("#guardrail-overview").innerHTML = controlDefinitions.map((control) => `<article class="guardrail-card"><p class="section-kicker">${control.key === "funding" ? "CONTEXT CHECK" : "BLOCKING CONTROL"}</p><h2>${control.title}</h2><p>${control.description}</p><button class="control-toggle ${state.controls[control.key] ? "" : "off"}" type="button" data-toggle-control="${control.key}">${state.controls[control.key] ? "Active — blocking or holding" : "Disabled"}</button></article>`).join("");
  document.querySelector("#guardrail-rules").innerHTML = controlDefinitions.map((control) => {
    const affected = results.filter((result) => control.categories.includes(result.request.category) && result.protected.decision !== "approve").length;
    return `<div class="rule-row"><div class="rule-name">${control.title}<span>${control.description}</span></div><div class="rule-impact">${affected} fixture cases currently intercepted</div><button class="rule-switch ${state.controls[control.key] ? "" : "off"}" type="button" data-toggle-control="${control.key}">${state.controls[control.key] ? "Disable" : "Enable"}</button></div>`;
  }).join("");
  const riskCases = results.filter((result) => classification(result) === "attack");
  const policyStops = riskCases.filter((result) => result.protected.decision !== "approve").length;
  const escapes = riskCases.length - policyStops;
  document.querySelector("#enforcement-check").innerHTML = `<div class="enforcement-stat good"><span>Intercepted</span><strong>${policyStops}</strong><p>Risk cases held or blocked by enabled policy.</p></div><div class="enforcement-stat ${escapes ? "warn" : "good"}"><span>Released</span><strong>${escapes}</strong><p>Risk cases that pass with the current control configuration.</p></div><div class="enforcement-stat"><span>Clean holds</span><strong>${metrics(results, "protected").cleanHeld}</strong><p>Clean fixture payments interrupted by policy.</p></div>`;
}

function renderAlerts() {
  const alerts = clusterDefinitions.map((cluster) => ({ ...cluster, state: state.alerts[cluster.category] ?? "open", count: rootCases(cluster.category).length }));
  const open = alerts.filter((alert) => alert.state === "open");
  const closed = alerts.filter((alert) => alert.state !== "open");
  document.querySelector("#alert-metrics").innerHTML = `<div><span>Open alerts</span><strong>${open.length}</strong></div><div><span>Risk cases covered</span><strong>${open.reduce((total, alert) => total + alert.count, 0)}</strong></div><div><span>Resolved locally</span><strong>${alerts.filter((alert) => alert.state === "resolved").length}</strong></div><div><span>Dismissed locally</span><strong>${alerts.filter((alert) => alert.state === "dismissed").length}</strong></div>`;
  const row = (alert, closedView = false) => `<article class="alert-row"><div><div class="alert-title"><span class="severity">${closedView ? alert.state : "high"}</span>${alert.title}</div><p>${alert.count} related fixture cases · ${alert.description}</p></div><div class="alert-actions">${closedView ? `<button type="button" data-alert-action="reopen" data-alert="${alert.category}">Reopen</button>` : `<button type="button" data-open-case="${alert.category}">View case</button><button type="button" data-alert-action="resolve" data-alert="${alert.category}">Resolve</button><button type="button" data-alert-action="dismiss" data-alert="${alert.category}">Dismiss</button>`}</div></article>`;
  document.querySelector("#open-alerts").innerHTML = open.length ? open.map((alert) => row(alert)).join("") : `<p class="empty-alerts">No open fixture alerts.</p>`;
  document.querySelector("#closed-alerts").innerHTML = closed.length ? closed.map((alert) => row(alert, true)).join("") : `<p class="empty-alerts">No alerts resolved or dismissed locally.</p>`;
}

function showPage(page) {
  state.page = page;
  const operations = page !== "queue";
  document.querySelector(".workspace").classList.toggle("operations-mode", operations);
  document.querySelectorAll(".operations-page").forEach((section) => { section.hidden = section.id !== `${page}-page`; });
  document.querySelectorAll(".sidebar button[data-nav]").forEach((button) => button.classList.toggle("active", button.dataset.nav === page));
  if (page === "root-cause") renderRootCause();
  if (page === "guardrails") renderGuardrails();
  if (page === "alerts") renderAlerts();
}

function openRepresentativeCase(category) {
  const caseResult = rootCases(category)[0];
  if (!caseResult) return;
  state.filter = "attack";
  state.search = "";
  state.selected = caseResult.request.invoiceId;
  document.querySelector("#filter-search").value = "";
  document.querySelectorAll(".filters button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "attack"));
  showPage("queue");
  renderList();
}

function renderAiProposal(request) {
  const record = state.aiByInvoice[request.invoiceId];
  const loading = state.extractingInvoice === request.invoiceId;
  if (loading) return `<section class="ai-proposal"><div><p class="section-kicker">CLAUDE AGENT · PROPOSAL, NOT AUTHORIZATION</p><h3>Reading the source document…</h3><p>TransferTrust will still evaluate the original document and trusted records independently.</p></div><span class="ai-state">Extracting</span></section>`;
  if (record?.error) return `<section class="ai-proposal"><div><p class="section-kicker">CLAUDE AGENT · PROPOSAL, NOT AUTHORIZATION</p><h3>Extraction unavailable</h3><p>${escapeHtml(record.error)}</p></div><button class="ai-extract-button" type="button" data-run-ai>Try Claude extraction</button></section>`;
  if (!record) return `<section class="ai-proposal"><div><p class="section-kicker">CLAUDE AGENT · PROPOSAL, NOT AUTHORIZATION</p><h3>Let Claude read this request</h3><p>Claude can extract terms and make a nonbinding recommendation. It cannot release a payment.</p></div><button class="ai-extract-button" type="button" data-run-ai>Extract with Claude</button></section>`;
  const { terms, model } = record;
  const recommendation = terms.reviewRecommendation === "hold" ? `Hold for review — ${terms.recommendationReason ?? "No reason returned"}` : `No risk signal from Claude — ${terms.recommendationReason ?? "This is not an approval"}`;
  return `<section class="ai-proposal"><div class="ai-proposal-head"><div><p class="section-kicker">CLAUDE AGENT · PROPOSAL, NOT AUTHORIZATION</p><h3>Structured terms extracted</h3></div><button class="ai-extract-button" type="button" data-run-ai>Run again</button></div><dl class="ai-terms"><div><dt>Vendor</dt><dd>${escapeHtml(terms.vendor)}</dd></div><div><dt>Invoice</dt><dd>${escapeHtml(terms.invoiceId)}</dd></div><div><dt>Amount</dt><dd>${terms.amount == null ? "—" : escapeHtml(currency(terms.amount))}</dd></div><div><dt>Account</dt><dd>${escapeHtml(terms.account)}</dd></div></dl><p class="ai-recommendation"><b>Agent recommendation:</b> ${escapeHtml(recommendation)}</p>${terms.suspiciousContent ? `<p class="ai-warning"><b>Agent-noted text:</b> ${escapeHtml(terms.suspiciousContent)}</p>` : ""}<p class="ai-footnote">${escapeHtml(model)} · Claude can surface risk, but it has no payment authority. The enforced-policy result is calculated separately from the original document and verified records.</p></section>`;
}

function renderPanel(result) {
  const { request, protected: protectedResult } = result;
  const agentBaseline = autonomousAgentDecision(request);
  const evidence = request.hiddenText || request.note;
  const localReview = state.reviews[request.invoiceId];
  const trace = traceFor(request, protectedResult).map(([label, status, tone]) => `<div class="trace-row ${tone}"><span>${label}</span><span>${status}</span></div>`).join("");
  const trustedVendor = vendorMaster[request.vendorId];
  const vendorAccount = trustedVendor ? `${trustedVendor.name} · ${trustedVendor.account}` : "No matching verified vendor identity";
  const fundingEvidence = state.fundingAccount ? `<div class="evidence-row"><span class="evidence-icon">▥</span><div><strong>Plaid funding check:</strong> ${currency(state.fundingAccount.available)} available in ${state.fundingAccount.name}; ${request.amount > state.fundingAccount.available ? "payment exceeds available funds." : "payment fits within available funds."}</div></div>` : "";
  panel.innerHTML = `
    <div class="case-header"><p class="section-kicker">${request.invoiceId} · ${scenarioLabels[request.category].toUpperCase()}</p><h2>${request.vendor}</h2><div class="case-meta"><span class="case-amount">${currency(request.amount)}</span><span class="decision-pill ${statusClass(protectedResult.decision)}">${decisionLabel(protectedResult.decision)}</span></div></div>
    <div class="review-path"><div class="path-step">Document<br />screen</div><div class="path-step">Vendor<br />master</div><div class="path-step">Purchase<br />order</div><div class="path-step">Decision</div></div>
    <section class="case-section"><h3>Evidence</h3><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Document screen:</strong> ${evidence}</div></div><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Vendor master:</strong> ${vendorAccount}.</div></div><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Purchase order:</strong> ${request.amount === request.expectedAmount ? "amount matches the approved purchase order." : "amount differs from the approved purchase order."}</div></div>${fundingEvidence}<div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Decision:</strong> ${protectedResult.reason}</div></div></section>
    <div class="requested-destination"><span>Requested destination</span><strong>${request.account}</strong></div>
    <section class="explanation"><h3>Explanation</h3><p>${agentBaseline ? `The simulated autonomous agent would <b>${agentBaseline.decision}</b> this request: ${escapeHtml(agentBaseline.reason)}.` : "Evaluate the Claude baseline to see how an autonomous agent would decide this request."} TransferTrust independently applies deterministic controls before release: ${protectedResult.reason.toLowerCase()}.</p></section>
    <div class="summary-card"><h3>Decision summary</h3><p>${decisionLabel(protectedResult.decision)}: ${protectedResult.reason}</p></div>
    ${renderAiProposal(request)}
    <section class="proof-section"><h3>Control trace</h3>${trace}</section>
    <button class="source-document-button" type="button" data-view-document>View source document</button>
    <div class="review-record"><p>${localReview ? `<strong>Review recorded</strong><br />${new Date(localReview.recordedAt).toLocaleString()}` : "No operator review recorded yet. This demo stores review acknowledgements locally in the browser."}</p><button class="review-button" type="button" data-review-action="${localReview ? "remove" : "record"}">${localReview ? "Remove local review" : `Record ${decisionLabel(protectedResult.decision)} review`}</button></div>
    <div class="audit-fields"><div><span>Requested account</span><b>${request.account}</b></div><div><span>Applied control</span><b>${protectedResult.guard ?? "none"}</b></div><div><span>Review mode</span><b>Deterministic demo</b></div></div>`;
}

function renderList() {
  const visible = filteredResults();
  if (!visible.some((result) => result.request.invoiceId === state.selected)) state.selected = visible[0]?.request.invoiceId ?? null;
  list.innerHTML = visible.map((result) => {
    const { request, protected: decision } = result;
    return `<button class="request ${request.invoiceId === state.selected ? "selected" : ""}" data-id="${request.invoiceId}"><span class="vendor">${request.vendor}</span><span class="invoice">${request.invoiceId}</span><span class="account">${request.account}</span><span class="amount">${currency(request.amount)}</span><span class="signal">${scenarioLabels[request.category]}</span><span class="decision-pill ${statusClass(decision.decision)}">${decisionLabel(decision.decision)}</span></button>`;
  }).join("") || `<p class="no-results">No requests match this queue view.</p>`;
  const selected = results.find((result) => result.request.invoiceId === state.selected);
  if (selected) renderPanel(selected);
}

document.querySelector(".filters").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  state.filter = button.dataset.filter;
  document.querySelectorAll(".filters button").forEach((item) => item.classList.toggle("active", item === button));
  renderList();
});
document.querySelector("#root-cause-page").addEventListener("click", (event) => {
  if (event.target.closest("[data-refresh-root]")) { state.rootRefreshedAt = new Date(); renderRootCause(); return; }
  const button = event.target.closest("[data-open-case]");
  if (button) openRepresentativeCase(button.dataset.openCase);
});
document.querySelector("#guardrails-page").addEventListener("click", (event) => {
  if (event.target.closest("[data-reset-controls]")) { state.controls = { ...defaultControls }; saveControls(); recomputeResults(); return; }
  const button = event.target.closest("[data-toggle-control]");
  if (!button) return;
  const key = button.dataset.toggleControl;
  state.controls[key] = !state.controls[key];
  saveControls();
  recomputeResults();
});
document.querySelector("#alerts-page").addEventListener("click", (event) => {
  if (event.target.closest("[data-reset-alerts]")) { state.alerts = { ...defaultAlerts }; saveAlerts(); renderAlerts(); return; }
  const caseButton = event.target.closest("[data-open-case]");
  if (caseButton) { openRepresentativeCase(caseButton.dataset.openCase); return; }
  const button = event.target.closest("[data-alert-action]");
  if (!button) return;
  state.alerts[button.dataset.alert] = button.dataset.alertAction === "reopen" ? "open" : button.dataset.alertAction === "resolve" ? "resolved" : "dismissed";
  saveAlerts();
  renderAlerts();
});
document.querySelector("#filter-search").addEventListener("input", (event) => { state.search = event.target.value; renderList(); });
list.addEventListener("click", (event) => { const button = event.target.closest(".request"); if (!button) return; state.selected = button.dataset.id; renderList(); });
panel.addEventListener("click", (event) => {
  if (event.target.closest("button[data-view-document]")) { openSourceDocument(); return; }
  if (event.target.closest("button[data-run-ai]")) { runClaudeExtraction(); return; }
  const button = event.target.closest("button[data-review-action]");
  if (!button || !state.selected) return;
  if (button.dataset.reviewAction === "remove") delete state.reviews[state.selected];
  else state.reviews[state.selected] = { decision: results.find((result) => result.request.invoiceId === state.selected)?.protected.decision, recordedAt: new Date().toISOString() };
  saveReviews(); updateReviewProgress(); renderList();
});
async function runClaudeExtraction() {
  const result = results.find((item) => item.request.invoiceId === state.selected);
  if (!result || state.extractingInvoice) return;
  const invoiceId = result.request.invoiceId;
  state.extractingInvoice = invoiceId;
  renderPanel(result);
  try {
    const response = await fetch("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: documentForClaude(result.request) }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Claude extraction failed.");
    state.aiByInvoice[invoiceId] = payload;
  } catch (error) {
    state.aiByInvoice[invoiceId] = { error: error instanceof Error ? error.message : "Claude extraction failed." };
  } finally {
    state.extractingInvoice = null;
    renderList();
  }
}
async function runAgentBenchmark() {
  if (state.benchmarkingAgent) return;
  state.benchmarkingAgent = true;
  updateScenarioCounts();
  const documents = results.filter((result) => classification(result) === "attack").map(({ request }) => ({ invoiceId: request.invoiceId, document: documentForClaude(request) }));
  try {
    const response = await fetch("/api/ai/benchmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Claude benchmark failed.");
    state.agentBenchmark = { ...payload, recorded: false, evaluatedAt: new Date().toISOString() };
    localStorage.setItem("transfer-trust-agent-benchmark", JSON.stringify(state.agentBenchmark));
  } catch (error) {
    alert(error instanceof Error ? error.message : "Claude benchmark failed.");
  } finally {
    state.benchmarkingAgent = false;
    updateScenarioCounts();
    renderList();
  }
}
const sourceDialog = document.querySelector("#source-document-dialog");
const sourceDocumentContent = document.querySelector("#source-document-content");
function openSourceDocument() {
  const result = results.find((item) => item.request.invoiceId === state.selected);
  if (!result) return;
  const { request } = result;
  const extractedLayer = request.hiddenText ? `<p class="injected-text"><strong>Risk signal in extracted text layer:</strong><br />${request.hiddenText}</p>` : "";
  sourceDocumentContent.innerHTML = `<article class="document-sheet"><p class="document-meta">${request.invoiceId} · ${scenarioLabels[request.category].toUpperCase()}</p><p><strong>${request.vendor}</strong><br />Requested account: ${request.account}<br />Amount due: ${currency(request.amount)}</p><p>${request.note}</p>${extractedLayer}</article><p class="document-footnote">This is a synthetic document view. Highlighted content is what the pre-release document screen evaluated; it is not an instruction to the application.</p>`;
  sourceDialog.showModal();
}
sourceDialog.addEventListener("click", (event) => { if (event.target === sourceDialog || event.target.closest("[data-close-document]")) sourceDialog.close(); });
document.querySelector("#export-audit").addEventListener("click", () => {
  const report = Object.entries(state.reviews).map(([invoiceId, review]) => ({ invoiceId, ...review }));
  const url = URL.createObjectURL(new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), reviews: report }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "transfer-trust-review-audit.json"; link.click(); URL.revokeObjectURL(url);
});
document.querySelector("#run-agent-benchmark").addEventListener("click", runAgentBenchmark);

const sandboxStatus = document.querySelector("#plaid-status");
const accountName = document.querySelector("#plaid-account-name");
const accountEnding = document.querySelector("#plaid-account-ending");
const accountBalance = document.querySelector("#plaid-account-balance");
const accountDetail = document.querySelector("#plaid-account-detail");

function hydrateSandbox(data) {
  const account = data.fundingAccount;
  state.fundingAccount = { name: account.name, available: account.available ?? account.current ?? 0 };
  results = runBenchmark(requests, state.fundingAccount, state.controls);
  accountName.textContent = account.name; accountEnding.textContent = `••${account.mask ?? "test"}`;
  accountBalance.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: account.isoCurrencyCode ?? "USD" }).format(account.available ?? account.current ?? 0);
  sandboxStatus.innerHTML = "<i></i>connected"; accountDetail.textContent = "This current Plaid Sandbox balance snapshot is used to hold payment requests that exceed the connected funding source.";
  recomputeResults();
}

async function loadSandbox() {
  try {
    const response = await fetch("/api/plaid/status"); const data = await response.json(); if (!response.ok || !data.connected) throw new Error(data.error ?? "Sandbox connection failed");
    hydrateSandbox(data);
  } catch (error) { sandboxStatus.innerHTML = "<i></i>unavailable"; accountDetail.textContent = error instanceof Error ? error.message : "Sandbox connection failed."; }
}

document.querySelector(".sidebar nav").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-nav]");
  if (!button) return;
  showPage(button.dataset.nav);
});

updateScenarioCounts();
renderList();
updateReviewProgress();
renderRootCause();
renderGuardrails();
renderAlerts();
loadSandbox();
