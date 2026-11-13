const app = document.querySelector("#app");
const state = { view: "overview", harness: null, selectedId: "R01", detail: null, plaid: null, syncing: false };

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const label = (value) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const transaction = (item) => `<tr><td><code>${escapeHtml(item.transaction_id)}</code></td><td>${escapeHtml(item.merchant_name ?? item.original_description ?? "Unenriched merchant")}</td><td>${escapeHtml(item.date)}</td><td>${item.amount < 0 ? "−" : ""}$${Math.abs(item.amount).toFixed(2)}</td><td>${item.pending ? "Pending" : "Posted"}</td></tr>`;

async function get(path) {
  const response = await fetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

async function selectCase(id, render = true) {
  state.selectedId = id;
  state.detail = await get(`/api/replay/${id}`);
  if (render) draw();
}

function header(title, copy, action = "") {
  return `<div class="page-head"><div><p class="eyebrow">PLAID AGENT REPLAY LAB</p><h1>${title}</h1><p>${copy}</p></div>${action}</div>`;
}

function renderOverview() {
  const { summary, runs } = state.harness;
  const detail = state.detail;
  return `<div class="page">${header("Test the data before you test the answer", "A replay harness for financial agents that receive Plaid transaction data. It checks whether an answer still has valid sources and appropriate limitations after the sync stream changes.", '<button class="primary" data-view="cases">Open replay cases</button>')}<section class="metrics"><article><span>Replay cases</span><b>${summary.total}</b><small>Synthetic Plaid-shaped fixtures</small></article><article><span>Reference contracts</span><b>${summary.passed}/${summary.total}</b><small>Deterministic validation passes</small></article><article><span>Sync operations</span><b>${summary.syncOperations.length}</b><small>Added, modified, removed</small></article><article><span>Current case</span><b>${escapeHtml(detail.id)}</b><small>${escapeHtml(detail.title)}</small></article></section><section class="section-grid"><article class="card focus-alert"><p class="eyebrow">CURRENT REPLAY</p><h2>${escapeHtml(detail.question)}</h2><p>${escapeHtml(detail.purpose)}</p><div class="evidence-line">${detail.assertions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><button class="outline" data-view="trace">Inspect cursor trace</button></article><article class="card"><p class="eyebrow">WHAT THE HARNESS CHECKS</p><h2>Financial claims need more than a plausible answer.</h2><ul class="counterfactuals"><li>Only current transaction IDs may be cited.</li><li>Coverage gaps and data changes must be disclosed.</li><li>Refunds, pending replacements, and removals affect what can be claimed.</li></ul></article></section><section class="card benchmark"><div class="card-head"><div><h2>Reference-contract run</h2><p class="fine-print">These are fixture contracts, not model scores.</p></div></div><div class="table-wrap"><table><thead><tr><th>Case</th><th>Result</th><th>Required coverage behavior</th></tr></thead><tbody>${runs.map((run) => `<tr><td><b>${run.id}</b> ${escapeHtml(run.title)}</td><td><span class="pill legitimate">${run.passed ? "Pass" : "Fail"}</span></td><td>${escapeHtml(run.checks.find((check) => check.id === "limitations").detail)}</td></tr>`).join("")}</tbody></table></div></section></div>`;
}

function renderCases() {
  const rows = state.harness.cases.map((item) => `<button class="scenario-row ${item.id === state.selectedId ? "selected" : ""}" data-case="${item.id}"><span class="row-risk">${item.id}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.purpose)}</small></span><span class="pill investigate">${item.stepCount} ${item.stepCount === 1 ? "step" : "steps"}</span></button>`).join("");
  const detail = state.detail;
  return `<div class="page">${header("Replay cases", "Each case starts from an empty local state and applies Plaid-shaped sync changes in cursor order.")}<div class="alerts-layout"><section class="card scenario-list"><div class="card-head"><h2>${state.harness.cases.length} cases</h2></div>${rows}</section><section class="card alert-main"><p class="eyebrow">${escapeHtml(detail.id)} · ANSWER CONTRACT</p><h2>${escapeHtml(detail.title)}</h2><p>${escapeHtml(detail.question)}</p><div class="decision-copy"><h3>Why this exists</h3><p>${escapeHtml(detail.purpose)}</p></div><div class="evidence-list">${detail.assertions.map((item) => `<article><div class="signal-dot medium"></div><div><b>Required behavior</b><p>${escapeHtml(item)}</p></div></article>`).join("")}</div><p class="safe-copy">Reference conclusion: ${escapeHtml(detail.contract.referenceConclusion)}</p><button class="primary" data-view="trace">View the replay trace</button></section></div></div>`;
}

function renderTrace() {
  const detail = state.detail;
  const timeline = detail.steps.map((step) => `<article class="card"><p class="eyebrow">CURSOR ${escapeHtml(step.cursor)}</p><div class="trace"><span><i>+</i> Added <b>${step.added.join(", ") || "—"}</b></span><span><i>~</i> Modified <b>${step.modified.join(", ") || "—"}</b></span><span><i>−</i> Removed <b>${step.removed.join(", ") || "—"}</b></span></div><p class="fine-print">Current state: ${step.currentTransactionIds.join(", ") || "no transactions"}</p></article>`).join("");
  return `<div class="page">${header("Cursor trace", "This is the state an agent should reason over after each Transactions Sync response.", '<button class="outline" data-view="cases">Choose another case</button>')}<section class="method-grid">${timeline}</section><section class="card benchmark"><div class="card-head"><div><p class="eyebrow">FINAL REPLAY STATE</p><h2>Transactions available to cite</h2></div><span class="dataset">${detail.transactions.length} current records</span></div><div class="table-wrap"><table><thead><tr><th>Transaction ID</th><th>Merchant</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>${detail.transactions.map(transaction).join("") || '<tr><td colspan="5">No current transactions remain.</td></tr>'}</tbody></table></div><p class="fine-print">Coverage: ${escapeHtml(detail.coverage.start)} through ${escapeHtml(detail.coverage.end)}. Incomplete periods: ${detail.coverage.incompletePeriods.join(", ") || "none"}.</p></section></div>`;
}

function renderMethod() {
  const status = state.plaid?.connected ? `Sandbox connected to ${state.plaid.accounts.length} account(s).` : "Demo fixtures are available without credentials.";
  return `<div class="page">${header("Data path", "The harness uses the same data-change semantics an agent sees after Plaid Transactions Sync.")}<section class="method-grid"><article class="card"><h2>Transactions Sync replay</h2><p>Every fixture applies added, modified, and removed records in cursor order. A modified record updates state; it is not a second transaction.</p></article><article class="card"><h2>Answer contract</h2><p>An agent must cite current transaction IDs and disclose fixture-specific limitations before its answer passes validation.</p></article><article class="card"><h2>SQLite + Sandbox</h2><p>Sandbox sync records are normalized and stored locally. The replay suite stays synthetic so expected behavior is repeatable.</p><button class="outline ai-button" data-sync ${state.syncing ? "disabled" : ""}>${state.syncing ? "Syncing…" : "Sync Plaid Sandbox data"}</button><p class="fine-print">${escapeHtml(status)}</p></article><article class="card"><h2>MCP interface</h2><p>ChatGPT or another client can list cases, inspect a replay state, and validate a proposed structured answer through three read-only tools.</p></article></section></div>`;
}

function draw() {
  app.innerHTML = state.view === "cases" ? renderCases() : state.view === "trace" ? renderTrace() : state.view === "method" ? renderMethod() : renderOverview();
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const connection = document.querySelector("#connection");
  if (connection) connection.textContent = state.plaid?.connected ? "Plaid Sandbox ready" : "Fixture mode";
}

document.addEventListener("click", async (event) => {
  const view = event.target.closest("[data-view]");
  if (view) { state.view = view.dataset.view; draw(); return; }
  const replay = event.target.closest("[data-case]");
  if (replay) { await selectCase(replay.dataset.case); return; }
  if (event.target.closest("[data-sync]") && !state.syncing) {
    state.syncing = true; draw();
    try { await fetch("/api/plaid/sync", { method: "POST" }); state.plaid = await get("/api/plaid/status"); }
    finally { state.syncing = false; draw(); }
  }
});

Promise.all([get("/api/harness"), get("/api/plaid/status")]).then(async ([harness, plaid]) => { state.harness = harness; state.plaid = plaid; await selectCase(state.selectedId, false); draw(); }).catch((error) => { app.innerHTML = `<div class="page"><h1>Could not load the replay lab</h1><p>${escapeHtml(error.message)}</p></div>`; });
