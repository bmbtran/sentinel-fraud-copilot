import { requests, scenarioLabels } from "./src/data.js";
import { metrics, runBenchmark } from "./src/risk-engine.js";

const results = runBenchmark(requests);
const firstRisk = results.find((result) => result.request.category === "bank_change");
const state = { filter: "all", search: "", selected: firstRisk?.request.invoiceId ?? null };
const list = document.querySelector("#request-list");
const panel = document.querySelector("#decision-panel");
const protectedMetrics = metrics(results, "protected");

document.querySelector("#naive-stopped").textContent = metrics(results, "naive").stopped;
document.querySelector("#protected-stopped").textContent = protectedMetrics.stopped;

function classification(result) {
  if (result.request.category === "clean") return "clean";
  if (["amount_mismatch", "duplicate"].includes(result.request.category)) return "exception";
  return "attack";
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

function renderPanel(result) {
  const { request, naive, protected: protectedResult } = result;
  const evidence = request.hiddenText || request.note;
  const vendorAccount = request.vendorId === "northstar-spoof" ? "No verified vendor record" : request.account;
  panel.innerHTML = `
    <div class="case-header"><p class="section-kicker">${request.invoiceId} · ${scenarioLabels[request.category].toUpperCase()}</p><h2>${request.vendor}</h2><div class="case-meta"><span class="case-amount">${currency(request.amount)}</span><span class="decision-pill ${statusClass(protectedResult.decision)}">${decisionLabel(protectedResult.decision)}</span></div></div>
    <div class="review-path"><div class="path-step">Document<br />screen</div><div class="path-step">Vendor<br />master</div><div class="path-step">Purchase<br />order</div><div class="path-step">Decision</div></div>
    <section class="case-section"><h3>Evidence</h3><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Document screen:</strong> ${evidence}</div></div><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Vendor master:</strong> ${vendorAccount}.</div></div><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Purchase order:</strong> ${request.amount === request.expectedAmount ? "amount matches the approved purchase order." : "amount differs from the approved purchase order."}</div></div><div class="evidence-row"><span class="evidence-icon">▧</span><div><strong>Decision:</strong> ${protectedResult.reason}</div></div></section>
    <div class="requested-destination"><span>Requested destination</span><strong>${request.account}</strong></div>
    <section class="explanation"><h3>Explanation</h3><p>The naive path would <b>${naive.decision}</b> this request. TransferTrust applies deterministic controls before release: ${protectedResult.reason.toLowerCase()}.</p></section>
    <div class="summary-card"><h3>Decision summary</h3><p>${decisionLabel(protectedResult.decision)}: ${protectedResult.reason}</p></div>
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

const sandboxStatus = document.querySelector("#plaid-status");
const accountName = document.querySelector("#plaid-account-name");
const accountEnding = document.querySelector("#plaid-account-ending");
const accountBalance = document.querySelector("#plaid-account-balance");
const accountDetail = document.querySelector("#plaid-account-detail");

function hydrateSandbox(data) {
  const account = data.accounts[0];
  accountName.textContent = account.name; accountEnding.textContent = `••${account.mask ?? "test"}`;
  accountBalance.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: account.isoCurrencyCode ?? "USD" }).format(account.available ?? account.current ?? 0);
  sandboxStatus.innerHTML = "<i></i>connected"; accountDetail.textContent = "Plaid Sandbox context is connected automatically at server startup. Credentials and access tokens remain server-side.";
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

renderList();
loadSandbox();
