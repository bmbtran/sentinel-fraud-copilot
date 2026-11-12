import { requests, scenarioLabels } from "./src/data.js";
import { metrics, runBenchmark } from "./src/risk-engine.js";

let results = runBenchmark(requests);
const firstRisk = results.find((result) => result.request.category === "bank_change");
const savedReviews = (() => { try { return JSON.parse(localStorage.getItem("transfer-trust-reviews") ?? "{}"); } catch { return {}; } })();
const state = { filter: "all", search: "", selected: firstRisk?.request.invoiceId ?? null, fundingAccount: null, reviews: savedReviews, aiByInvoice: {}, extractingInvoice: null };
const list = document.querySelector("#request-list");
const panel = document.querySelector("#decision-panel");
const reviewProgress = document.querySelector("#review-progress");

function classification(result) {
  if (result.request.category === "clean") return "clean";
  if (["insufficient_funds", "duplicate"].includes(result.request.category)) return "exception";
  return "attack";
}

function updateScenarioCounts() {
  const attackCount = results.filter((result) => classification(result) === "attack").length;
  const cleanCount = results.filter((result) => classification(result) === "clean").length;
  const exceptionCount = results.filter((result) => classification(result) === "exception").length;
  document.querySelector("#batch-count").textContent = results.length;
  document.querySelector("#all-count").textContent = results.length;
  document.querySelector("#attack-count").textContent = attackCount;
  document.querySelector("#clean-count").textContent = cleanCount;
  document.querySelector("#exception-count").textContent = exceptionCount;
  document.querySelector("#naive-stopped").textContent = metrics(results, "naive").stopped;
  document.querySelector("#protected-stopped").textContent = metrics(results, "protected").stopped;
  document.querySelector("#naive-attack-total").textContent = attackCount;
  document.querySelector("#protected-attack-total").textContent = attackCount;
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
  const { request, naive, protected: protectedResult } = result;
  const evidence = request.hiddenText || request.note;
  const localReview = state.reviews[request.invoiceId];
  const trace = traceFor(request, protectedResult).map(([label, status, tone]) => `<div class="trace-row ${tone}"><span>${label}</span><span>${status}</span></div>`).join("");
  const vendorAccount = request.vendorId === "northstar-spoof" ? "No verified vendor record" : request.account;
  const fundingEvidence = state.fundingAccount ? `<div class="evidence-row"><span class="evidence-icon">▥</span><div><strong>Plaid funding check:</strong> ${currency(state.fundingAccount.available)} available in ${state.fundingAccount.name}; ${request.amount > state.fundingAccount.available ? "payment exceeds available funds." : "payment fits within available funds."}</div></div>` : "";
  panel.innerHTML = `
    <div class="case-header"><p class="section-kicker">${request.invoiceId} · ${scenarioLabels[request.category].toUpperCase()}</p><h2>${request.vendor}</h2><div class="case-meta"><span class="case-amount">${currency(request.amount)}</span><span class="decision-pill ${statusClass(protectedResult.decision)}">${decisionLabel(protectedResult.decision)}</span></div></div>
    <div class="review-path"><div class="path-step">Document<br />screen</div><div class="path-step">Vendor<br />master</div><div class="path-step">Purchase<br />order</div><div class="path-step">Decision</div></div>
    <section class="case-section"><h3>Evidence</h3><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Document screen:</strong> ${evidence}</div></div><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Vendor master:</strong> ${vendorAccount}.</div></div><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Purchase order:</strong> ${request.amount === request.expectedAmount ? "amount matches the approved purchase order." : "amount differs from the approved purchase order."}</div></div>${fundingEvidence}<div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Decision:</strong> ${protectedResult.reason}</div></div></section>
    <div class="requested-destination"><span>Requested destination</span><strong>${request.account}</strong></div>
    <section class="explanation"><h3>Explanation</h3><p>The naive path would <b>${naive.decision}</b> this request. TransferTrust applies deterministic controls before release: ${protectedResult.reason.toLowerCase()}.</p></section>
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

const sandboxStatus = document.querySelector("#plaid-status");
const accountName = document.querySelector("#plaid-account-name");
const accountEnding = document.querySelector("#plaid-account-ending");
const accountBalance = document.querySelector("#plaid-account-balance");
const accountDetail = document.querySelector("#plaid-account-detail");

function hydrateSandbox(data) {
  const account = data.fundingAccount;
  state.fundingAccount = { name: account.name, available: account.available ?? account.current ?? 0 };
  results = runBenchmark(requests, state.fundingAccount);
  accountName.textContent = account.name; accountEnding.textContent = `••${account.mask ?? "test"}`;
  accountBalance.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: account.isoCurrencyCode ?? "USD" }).format(account.available ?? account.current ?? 0);
  sandboxStatus.innerHTML = "<i></i>connected"; accountDetail.textContent = "This current Plaid Sandbox balance snapshot is used to hold payment requests that exceed the connected funding source.";
  updateScenarioCounts();
  renderList();
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
  document.querySelectorAll(".sidebar button").forEach((item) => item.classList.toggle("active", item === button));
  const behavior = "smooth";
  if (button.dataset.nav === "overview") document.querySelector(".queue-header").scrollIntoView({ behavior, block: "start" });
  if (button.dataset.nav === "queue") document.querySelector(".queue-table").scrollIntoView({ behavior, block: "start" });
  if (button.dataset.nav === "controls") { state.selected = results.find((result) => result.protected.decision === "block")?.request.invoiceId ?? state.selected; renderList(); panel.querySelector(".review-path")?.scrollIntoView({ behavior, block: "start" }); }
  if (button.dataset.nav === "audit") panel.querySelector(".audit-fields")?.scrollIntoView({ behavior, block: "start" });
  if (button.dataset.nav === "sandbox") document.querySelector("#sandbox-context").scrollIntoView({ behavior, block: "start" });
});

updateScenarioCounts();
renderList();
updateReviewProgress();
loadSandbox();
