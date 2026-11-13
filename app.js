import { renderIncidentSummary } from "./incident-ui.js";

const app = document.querySelector("#app");
const state = {
  view: "overview",
  data: null,
  benchmark: null,
  selectedId: "S01",
  detail: null,
  status: "",
  liveClaude: null,
  aiLoading: false,
  plaidSyncing: false,
  incident: null,
};
const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const label = (value) =>
  String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const pill = (text, tone = text) =>
  `<span class="pill ${String(tone).toLowerCase()}">${escapeHtml(label(text))}</span>`;
async function get(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
async function selectScenario(id, shouldRender = true) {
  state.selectedId = id;
  state.liveClaude = null;
  state.incident = null;
  state.detail = await get(`/api/scenarios/${id}`);
  if (shouldRender) render();
}
async function load() {
  [state.data, state.benchmark] = await Promise.all([
    get("/api/dashboard"),
    get("/api/benchmark"),
  ]);
  await selectScenario(state.selectedId, false);
  render();
}
function riskRing(score) {
  const dash = Math.round(score * 1.89);
  return `<div class="risk-ring" style="--dash:${dash}"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30"></circle><circle class="progress" cx="36" cy="36" r="30"></circle></svg><b>${score}</b><small>risk</small></div>`;
}
function header(eyebrow, title, copy, action = "") {
  return `<header class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${copy}</p></div>${action}</header>`;
}
function renderOverview() {
  const { summary, personas, resolutions } = state.data;
  const detail = state.detail;
  const person = personas.find((item) => item.id === detail.scenario.personaId);
  return `<div class="page">${header("CHARGE REVIEW", "A second look at a charge that doesn’t fit.", "Sentinel compares a new charge with the spending history already in the account, then points to the few details worth checking.", `<button class="outline" data-view="trust">See how it decided →</button>`)}<section class="metrics"><article><span>Recent charges</span><b>${summary.monitored}</b><small>Available in this demo account</small></article><article><span>Review now</span><b class="danger-text">${summary.alerts}</b><small>Several details do not line up</small></article><article><span>Unusual, not urgent</span><b class="amber-text">${summary.review}</b><small>Worth confirming when there’s time</small></article><article><span>Already confirmed</span><b>${resolutions.length}</b><small>Saved decisions for this account</small></article></section><section class="hero-card"><div><p class="eyebrow">MAYA’S ACCOUNT</p><h2>What’s normal for <em>${person.name}</em></h2><p>We have ${detail.profile.transactionCount} prior transactions to compare against: regular merchants, familiar places, and the usual time of day she spends.</p><div class="person-row"><span class="avatar">${person.avatar}</span><div><b>${person.name}</b><small>${person.role} · ${person.city}</small></div><button class="text-button" data-view="alerts">Choose another account</button></div></div>${riskRing(detail.hybrid.score)}</section><section class="section-grid"><article class="card focus-alert"><div class="card-head"><div><p class="eyebrow">CURRENTLY UNDER REVIEW</p><h2>${detail.scenario.title}</h2></div>${pill(detail.hybrid.action, detail.hybrid.action === "alert" ? "fraud" : "investigate")}</div><div class="transaction"><div class="merchant-icon">↗</div><div><b>${detail.scenario.target.merchant}</b><small>${detail.scenario.target.location} · ${new Date(detail.scenario.target.date).toLocaleString([], { hour: "numeric", minute: "2-digit" })}</small></div><strong>${money(detail.scenario.target.amount)}</strong></div><div class="evidence-line">${detail.hybrid.evidence.map((item) => `<span>${label(item.code)}</span>`).join("")}</div><button class="primary full" data-view="alerts">Look at this charge</button></article><article class="card"><p class="eyebrow">MAYA’S PATTERN</p><h2>A few useful reference points</h2><div class="fingerprint"><span>Middle-of-the-road purchase <b>${money(detail.profile.typicalAmount)}</b></span><span>Places she’s spent <b>${detail.profile.regions.length}</b></span><span>Most common merchant <b>${escapeHtml(detail.profile.merchants[0]?.merchant ?? "—")}</b></span></div><p class="fine-print">A pattern is a reference point, not proof that a charge is wrong.</p></article></section></div>`;
}
function transactionDetail() {
  const { scenario, profile, rules, claude, hybrid } = state.detail;
  const live = state.liveClaude
    ? `<article class="live-claude"><p class="eyebrow">CLAUDE’S SECOND READ · ${escapeHtml(state.liveClaude.model)}</p><b>${pill(state.liveClaude.classification, state.liveClaude.classification)} ${Math.round(state.liveClaude.confidence * 100)}% confidence</b><p>${escapeHtml(state.liveClaude.rationale)}</p></article>`
    : "";
  return `<section class="alert-layout"><article class="card alert-main"><div class="alert-top"><div><div class="risk-label">${pill(hybrid.action, hybrid.action === "alert" ? "fraud" : "investigate")} <span>${hybrid.confidence}% confidence</span></div><h2>${escapeHtml(scenario.target.merchant)}</h2><p>${money(scenario.target.amount)} · ${scenario.target.location} · ${new Date(scenario.target.date).toLocaleString()}</p></div>${riskRing(hybrid.score)}</div><div class="decision-copy"><h3>Here’s what doesn’t line up</h3><p>${escapeHtml(claude.rationale)}</p></div><div class="evidence-list">${hybrid.evidence.map((item) => `<article><div class="signal-dot ${item.severity}"></div><div><b>${label(item.code)}</b><p>${escapeHtml(item.detail)}</p></div><strong>+${item.points}</strong></article>`).join("") || `<p class="empty">Nothing high-risk turned up for this charge.</p>`}</div><div class="actions"><button class="danger" data-resolve="fraud">I don’t recognize this</button><button class="outline" data-resolve="legitimate">I made this purchase</button></div><p class="safe-copy">This only records your choice in Sentinel. For a real disputed charge, contact your card issuer directly.</p></article><aside class="side-stack"><article class="card"><p class="eyebrow">WHAT WOULD MAKE THIS LESS CONCERNING?</p><h3>Details that would change the call</h3><ul class="counterfactuals">${hybrid.counterfactuals.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No material counterfactual applies.</li>"}</ul></article><article class="card"><p class="eyebrow">ASK CLAUDE</p><h3>Get a separate read on the same facts</h3><button class="outline ai-button" data-live-claude ${state.aiLoading ? "disabled" : ""}>${state.aiLoading ? "Checking…" : "Ask Claude to review it"}</button>${live}<p class="fine-print">This is an optional live call. The comparison page stays repeatable.</p></article><article class="card"><p class="eyebrow">HOW THIS CALL WAS MADE</p><div class="trace"><span><i>1</i> Specific account signals <b>${rules.score}/100</b></span><span><i>2</i> Claude’s read <b>${claude.classification}</b></span><span><i>3</i> What Sentinel shows <b>${hybrid.action}</b></span></div><p class="fine-print">${profile.confidence} confidence from ${profile.transactionCount} earlier transactions</p></article></aside></section>`;
}
function renderAlerts() {
  const rows = state.data.scenarios
    .slice()
    .sort((a, b) => b.risk - a.risk)
    .map(
      (item) =>
        `<button class="scenario-row ${item.id === state.selectedId ? "selected" : ""}" data-scenario="${item.id}"><span class="row-risk">${item.risk}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.target.merchant)} · ${money(item.target.amount)}</small></span>${pill(item.action, item.action === "alert" ? "fraud" : "investigate")}</button>`,
    )
    .join("");
  return `<div class="page">${header("CHARGES TO REVIEW", "Start with the facts.", "Pick a charge to see what is unusual, what looks ordinary, and why Sentinel chose to surface it.")}<div class="alerts-layout"><section class="card scenario-list"><div class="card-head"><div><p class="eyebrow">DEMO CHARGES</p><h2>${state.data.scenarios.length} examples to compare</h2></div></div>${rows}</section>${transactionDetail()}</div>${state.status ? `<div class="toast">${escapeHtml(state.status)}</div>` : ""}</div>`;
}
function renderTrust() {
  const engineCards = state.benchmark.engines
    .map((engine) => {
      const name =
        engine.engine === "rules"
          ? "Deterministic rules"
          : engine.engine === "claude"
            ? "Recorded Claude"
            : "Hybrid policy";
      const label =
        engine.engine === "rules"
          ? "RULES"
          : engine.engine === "claude"
            ? "RECORDED MODEL RUN"
            : "RULES + RECORDED MODEL";
      return `<article class="engine ${engine.engine}"><p>${label}</p><h2>${name}</h2><div class="engine-score"><b>${engine.f1}<small>macro F1</small></b><span><strong>${engine.precision}%</strong> macro precision<br><strong>${engine.recall}%</strong> macro recall</span></div></article>`;
    })
    .join("");
  const rows = state.benchmark.cases
    .map(
      (item) =>
        `<tr><td><b>${item.id}</b> ${escapeHtml(item.title)}</td><td>${pill(item.expected, item.expected)}</td><td>${pill(item.rules, item.rules)}</td><td>${pill(item.claude, item.claude)}</td><td>${pill(item.hybrid, item.hybrid)}</td></tr>`,
    )
    .join("");
  const dataset = state.benchmark.dataset;
  const recordedAt = new Date(dataset.recordedAt).toLocaleDateString();
  return `<div class="page">${header("COMPARE DECISIONS", "A fixed test set, shown honestly.", "Each approach sees the same eight synthetic cases. The model results come from one recorded Claude run; the live model is not used to calculate these scores.")}<section class="engine-grid">${engineCards}</section><section class="card benchmark"><div class="card-head"><div><p class="eyebrow">SAME CASES, THREE APPROACHES</p><h2>Where each approach landed</h2></div><span class="dataset">${dataset.total} fixed cases</span></div><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Expected</th><th>Rules</th><th>Recorded Claude</th><th>Hybrid</th></tr></thead><tbody>${rows}</tbody></table></div><p class="fine-print">${escapeHtml(dataset.note)} Recorded ${escapeHtml(dataset.model)} on ${recordedAt}, temperature 0, prompt ${escapeHtml(dataset.promptVersion)}.</p></section></div>`;
}
function renderMethod() {
  return `<div class="page methodology">${header("PLAID DATA PATH", "Transactions first. Decisions second.", "Plaid supplies the account and transaction record. Sentinel uses that record to build a spending reference, then keeps the review policy separate and inspectable.")}<section class="method-grid"><article class="card"><p class="eyebrow">PLAID TRANSACTIONS SYNC</p><h2>Incremental transaction ingestion</h2><p>The server creates a Sandbox item and calls <code>/transactions/sync</code>. Added and modified records are normalized with the cursor-based Sync API.</p><button class="outline ai-button" data-sync-plaid ${state.plaidSyncing ? "disabled" : ""}>${state.plaidSyncing ? "Syncing Plaid data…" : "Sync Plaid Sandbox data"}</button></article><article class="card"><p class="eyebrow">LOCAL REVIEW STORE</p><h2>Normalized transactions in SQLite</h2><p>Normalized Plaid records, review decisions, incident summaries, and audit events are stored in <code>data/sentinel.sqlite</code>.</p></article><article class="card"><p class="eyebrow">REVIEW POLICY</p><h2>Rules keep authority</h2><p>Deterministic checks preserve high-signal patterns such as card testing. Claude provides a separate assessment, not an authorization decision.</p></article><article class="card"><p class="eyebrow">EVALUATION DATA</p><h2>Fixtures stay separate</h2><p>The comparison screen uses synthetic cases so results can be replayed. Plaid supplies transaction data, not fraud labels.</p></article></section><section class="flow card"><p class="eyebrow">DATA FLOW</p><div><span>Plaid Sandbox item</span><i></i><span>Transactions Sync</span><i></i><span>Normalize and persist</span><i></i><span>Build a spending reference</span></div></section></div>`;
}
function render() {
  if (!state.data || !state.detail) return;
  document
    .querySelectorAll("nav button")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === state.view),
    );
  app.innerHTML =
    state.view === "overview"
      ? renderOverview()
      : state.view === "alerts"
        ? renderAlerts()
        : state.view === "trust"
          ? renderTrust()
          : renderMethod();
  if (state.status && state.view !== "alerts") {
    app.insertAdjacentHTML(
      "beforeend",
      `<div class="toast">${escapeHtml(state.status)}</div>`,
    );
  }
  if (state.view === "alerts" && state.incident)
    document
      .querySelector(".alerts-layout")
      ?.insertAdjacentHTML("afterend", renderIncidentSummary(state.incident));
}
document.querySelector("nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) {
    state.view = button.dataset.view;
    render();
  }
});
app.addEventListener("click", async (event) => {
  const view = event.target.closest("[data-view]");
  if (view) {
    state.view = view.dataset.view;
    render();
    return;
  }
  const scenario = event.target.closest("[data-scenario]");
  if (scenario) {
    await selectScenario(scenario.dataset.scenario);
    return;
  }
  const liveButton = event.target.closest("[data-live-claude]");
  if (liveButton && !state.aiLoading) {
    state.aiLoading = true;
    render();
    try {
      const response = await fetch(
        `/api/scenarios/${state.selectedId}/claude`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Claude analysis failed.");
      state.liveClaude = data.assessment;
    } catch (error) {
      state.status =
        error instanceof Error ? error.message : "Claude analysis failed.";
    } finally {
      state.aiLoading = false;
      render();
    }
    return;
  }
  const syncButton = event.target.closest("[data-sync-plaid]");
  if (syncButton && !state.plaidSyncing) {
    state.plaidSyncing = true;
    render();
    try {
      const response = await fetch("/api/plaid/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Plaid sync failed.");
      state.status = `Plaid sync stored ${data.received} transaction updates (${data.stored} total).`;
      await plaidStatus();
    } catch (error) {
      state.status =
        error instanceof Error ? error.message : "Plaid sync failed.";
    } finally {
      state.plaidSyncing = false;
      render();
    }
    return;
  }
});
async function plaidStatus() {
  try {
    const data = await get("/api/plaid/status");
    document.querySelector("#connection").textContent = data.connected
      ? `Plaid Sandbox · ${data.accounts.length} accounts ready`
      : "Demo Mode · Plaid ready when configured";
    document
      .querySelector("#connection")
      .classList.toggle("connected", data.connected);
  } catch {
    document.querySelector("#connection").textContent = "Demo Mode";
  }
}
app.addEventListener(
  "click",
  async (event) => {
    const copy = event.target.closest("[data-copy-incident]");
    if (copy && state.incident) {
      await navigator.clipboard.writeText(state.incident.plainText);
      state.status =
        "Incident summary copied. It is ready to paste into your notes or a bank support chat.";
      render();
      return;
    }
    const resolution = event.target.closest("[data-resolve]");
    if (!resolution) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const response = await fetch(`/api/scenarios/${state.selectedId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: resolution.dataset.resolve }),
    });
    const data = await response.json();
    if (!response.ok) {
      state.status = data.error ?? "Could not save your decision.";
      render();
      return;
    }
    state.incident = data.incident ?? null;
    state.status = data.incident
      ? "Incident summary prepared. Review the evidence below before contacting your issuer."
      : "Marked as a purchase you recognize.";
    await load();
    state.incident = data.incident ?? null;
    render();
  },
  true,
);
load().catch((error) => {
  app.innerHTML = `<div class="error"><b>Sentinel could not start.</b><br>${escapeHtml(error.message)}</div>`;
});
plaidStatus();
