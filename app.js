import { requests, scenarioLabels } from "./src/data.js";
import { metrics, runBenchmark } from "./src/risk-engine.js";

const results = runBenchmark(requests);
const state = { filter: "all", selected: null };
const list = document.querySelector("#request-list");
const panel = document.querySelector("#detail-panel");

const protectedMetrics = metrics(results, "protected");
document.querySelector("#naive-stopped").textContent = metrics(results, "naive").stopped;
document.querySelector("#protected-stopped").textContent = protectedMetrics.stopped;
document.querySelector("#clean-held").textContent = protectedMetrics.cleanHeld;

function classification(result) {
  if (result.request.category === "clean") return "clean";
  if (["amount_mismatch", "duplicate"].includes(result.request.category)) return "exception";
  return "attack";
}

function filteredResults() {
  return state.filter === "all" ? results : results.filter((result) => classification(result) === state.filter);
}

function statusClass(decision) { return decision === "block" ? "block" : decision === "hold" ? "hold" : "approve"; }
function currency(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }

function renderPanel(result) {
  const { request, naive, protected: protectedResult } = result;
  const evidence = request.hiddenText || request.note;
  panel.innerHTML = `
    <p class="eyebrow">DECISION TRACE</p>
    <p class="detail-id">${request.invoiceId} · ${scenarioLabels[request.category]}</p>
    <h3>${request.vendor}</h3>
    <div class="decision-compare">
      <div class="decision"><span class="label">NAIVE REVIEW</span><strong>${naive.decision}</strong><p>${naive.reason}</p></div>
      <div class="decision protected"><span class="label">PROTECTED FLOW</span><strong>${protectedResult.decision}</strong><p>${protectedResult.reason}</p></div>
    </div>
    <div class="evidence">
      <p><b>Requested account</b><br /><code>${request.account}</code></p>
      <p><b>Control evidence</b><br /><span class="${protectedResult.decision === "block" ? "danger" : ""}">${evidence}</span></p>
      <p><b>Applied control</b><br /><code>${protectedResult.guard ?? "none"}</code></p>
    </div>`;
}

function renderList() {
  const visible = filteredResults();
  if (!visible.some((result) => result.request.invoiceId === state.selected)) state.selected = visible[0]?.request.invoiceId ?? null;
  list.innerHTML = visible.map((result) => {
    const { request, protected: decision } = result;
    return `<button class="request ${request.invoiceId === state.selected ? "selected" : ""}" data-id="${request.invoiceId}">
      <i class="status-dot ${statusClass(decision.decision)}"></i>
      <span class="request-main"><span class="request-title"><span>${request.vendor}</span><span class="tag">${scenarioLabels[request.category].toUpperCase()}</span></span><span class="request-sub">${request.invoiceId} · ${decision.reason}</span></span>
      <span class="request-amount">${currency(request.amount)}</span>
    </button>`;
  }).join("");
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

list.addEventListener("click", (event) => {
  const button = event.target.closest(".request");
  if (!button) return;
  state.selected = button.dataset.id;
  renderList();
});

renderList();
