const app = document.querySelector("#app");
const state = { view: "reliability", overview: null, replayCases: [], selectedReplayId: "duplicate-delivery", selectedId: "item-credit", activeSession: null, toast: null };

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const label = (value) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const timestamp = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

async function refresh() {
  const [overview, replays] = await Promise.all([request("/api/relay/overview"), request("/api/relay/replays")]);
  state.overview = overview;
  state.replayCases = replays.cases;
  if (!state.overview.items.some((item) => item.id === state.selectedId)) state.selectedId = state.overview.items[0]?.id;
  draw();
}

function status(item) {
  const className = item.status === "healthy" ? "healthy" : item.status === "recovery_in_progress" ? "progress" : "action";
  const text = item.status === "healthy" ? "Healthy" : item.status === "recovery_in_progress" ? "Recovery in progress" : "Action needed";
  return `<span class="status ${className}">${text}</span>`;
}

function header(title, copy, action = "") {
  return `<section class="page-head"><div><h1>${title}</h1><p>${copy}</p></div>${action}</section>`;
}

function connectionRow(item) {
  return `<button class="connection-row ${item.id === state.selectedId ? "selected" : ""}" data-item="${escapeHtml(item.id)}"><span class="connection-mark">${escapeHtml(item.label.slice(0, 1))}</span><span><strong>${escapeHtml(item.label)}</strong><small>${item.reason ? label(item.reason) : "Connection is current"}</small></span>${status(item)}</button>`;
}

function fleetRow(item) {
  const latest = state.overview.events.find((entry) => entry.itemId === item.id);
  return `<button class="fleet-row" data-select-item="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.label)}</strong><small>${latest ? `${label(latest.kind)} · ${timestamp(latest.occurredAt)}` : "No lifecycle events"}</small></span>${status(item)}<span class="fleet-reason">${escapeHtml(item.reason ? label(item.reason) : "Current")}</span></button>`;
}

function eventRow(event) {
  const tone = event.outcome === "ignored_stale" ? "muted" : event.kind === "LOGIN_REPAIRED" ? "good" : event.kind === "ITEM_ERROR" ? "urgent" : "neutral";
  return `<article class="timeline-row"><span class="timeline-dot ${tone}"></span><div><strong>${escapeHtml(label(event.kind))}</strong><p>${escapeHtml(event.errorCode ? label(event.errorCode) : event.outcome === "ignored_stale" ? "Recorded, but older than the current issue" : "Recorded without a recovery action")}</p></div><time>${escapeHtml(timestamp(event.occurredAt))}</time></article>`;
}

function renderConnections() {
  const overview = state.overview;
  const item = overview.items.find((entry) => entry.id === state.selectedId) ?? overview.items[0];
  const events = overview.events.filter((entry) => entry.itemId === item.id);
  const sessions = overview.sessions.filter((entry) => entry.itemId === item.id);
  const actionCount = overview.items.filter((entry) => entry.status !== "healthy").length;
  const session = sessions.find((entry) => ["issued", "in_progress"].includes(entry.status));
  const sandboxCopy = overview.sandbox.configured ? "Sandbox credentials are configured. Relay can issue a real Plaid Link update token." : "Fixture mode is active. Add Sandbox credentials to launch a real Link update session.";
  let action = "";
  if (item.status === "recovery_required") action = `<div class="action-pair"><button class="primary" data-action="recover">${overview.sandbox.configured ? "Launch Sandbox Link" : "Start recovery"}</button>${overview.sandbox.configured ? '<button class="secondary" data-action="fixture-recover">Run fixture repair</button>' : ""}</div>`;
  if (item.status === "recovery_in_progress" && session?.mode === "fixture") action = `<button class="primary" data-action="complete" data-session="${escapeHtml(session.id)}">Complete simulated repair</button>`;
  if (item.status === "recovery_in_progress" && session?.mode === "sandbox") action = `<span class="status progress">Link session issued</span>`;
  return `<div class="page">${header("Connection recovery", "Relay records the lifecycle around a Plaid Item and creates one focused update path when the connection needs attention.", '<button class="secondary" data-action="reset">Reset demo</button>')}<section class="summary-strip"><article><span>Items needing action</span><strong>${actionCount}</strong><small>Recovery is only offered when the Item requires it.</small></article><article><span>Active recovery sessions</span><strong>${overview.sessions.filter((entry) => ["issued", "in_progress"].includes(entry.status)).length}</strong><small>Duplicate sessions are blocked by the state machine.</small></article><article><span>Environment</span><strong>${overview.sandbox.configured ? "Sandbox" : "Fixture"}</strong><small>${escapeHtml(sandboxCopy)}</small></article></section><section class="workbench"><aside class="item-list"><div class="list-heading"><h2>Connected Items</h2><span>${overview.items.length}</span></div>${overview.items.map(connectionRow).join("")}</aside><section class="detail-panel"><div class="detail-head"><div><p class="section-label">ITEM STATUS</p><h2>${escapeHtml(item.label)}</h2><p>${item.status === "healthy" ? "No user action is needed." : `Recovery reason: ${label(item.reason)}.`}</p></div>${status(item)}</div><div class="recovery-callout ${item.status === "healthy" ? "quiet" : ""}"><div><strong>${item.status === "healthy" ? "Connection is healthy" : item.status === "recovery_in_progress" ? "Recovery session is active" : "User action is required"}</strong><p>${item.status === "healthy" ? "Relay will retain the event history and wait for a newer lifecycle signal." : item.status === "recovery_in_progress" ? "A second update Link session cannot be issued while this session is active." : "Create a one-time Link update session. The browser receives only a short-lived link token."}</p></div>${action}</div><div class="timeline"><div class="list-heading"><h2>Lifecycle timeline</h2><span>${events.length} events</span></div>${events.length ? events.map(eventRow).join("") : '<p class="empty">No events recorded for this Item.</p>'}</div><div class="demo-controls"><div><h3>Demo controls</h3><p>These controls create clearly labelled local fixture events. They do not send a live Plaid webhook.</p></div><div><button class="secondary" data-action="login-required">Simulate login required</button><button class="secondary" data-action="self-heal">Simulate login repaired</button>${overview.sandbox.configured ? '<button class="secondary" data-action="sandbox-reset">Reset Sandbox login</button>' : ""}</div></div></section></section></div>`;
}

function renderReliability() {
  const reliability = state.overview.reliability;
  const selectedReplay = state.replayCases.find((entry) => entry.id === state.selectedReplayId) ?? state.replayCases[0];
  const activeReplay = state.overview.replay;
  return `<div class="page reliability-page">${header("Connection reliability", "An operator view for the state after Plaid Link: which Items need attention, why, and whether recovery work is already in flight.", '<button class="secondary" data-action="reset">Restore baseline</button>')}
  <section class="reliability-summary"><div class="health-summary"><div><span>Fleet health</span><strong>${reliability.healthy} of ${reliability.total}</strong><p>Items currently healthy</p></div><div class="health-bar" aria-label="${reliability.healthy} of ${reliability.total} Items healthy"><i style="width:${reliability.total ? (reliability.healthy / reliability.total) * 100 : 0}%"></i></div></div><div><span>Needs action</span><strong>${reliability.actionRequired}</strong><p>Awaiting an update path</p></div><div><span>In progress</span><strong>${reliability.inProgress}</strong><p>${reliability.activeSessions} active session${reliability.activeSessions === 1 ? "" : "s"}</p></div></section>
  <section class="operator-grid"><section class="fleet-panel"><div class="panel-heading"><div><h2>Fleet state</h2><p>Current materialized state, not raw webhook volume.</p></div><button class="quiet-button" data-view="connections">Open Item detail</button></div><div class="fleet-list">${state.overview.items.map(fleetRow).join("")}</div></section><section class="signal-panel"><div class="panel-heading"><div><h2>Latest decision</h2><p>${activeReplay ? "Loaded from a labelled local replay." : "Baseline fixture is active."}</p></div>${activeReplay ? '<span class="fixture-badge">Fixture replay</span>' : '<span class="fixture-badge neutral">Baseline</span>'}</div>${activeReplay ? `<h3>${escapeHtml(activeReplay.label)}</h3><p class="signal-copy">${escapeHtml(activeReplay.summary)}</p><dl class="decision-facts"><div><dt>Events evaluated</dt><dd>${activeReplay.outcomes.length}</dd></div><div><dt>Final Item state</dt><dd>${escapeHtml(state.overview.items.find((item) => item.id === "item-credit")?.status.replaceAll("_", " ") ?? "—")}</dd></div></dl><button class="secondary" data-select-item="item-credit" data-view="connections">Inspect the audit trail</button>` : `<h3>Recovery required</h3><p class="signal-copy">The baseline fixture contains one pending disconnect. Open the Item detail to see the reason, event history, and repair path.</p><button class="secondary" data-select-item="item-credit" data-view="connections">Inspect the Item</button>`}</section></section>
  <section class="replay-panel"><div class="panel-heading"><div><h2>Incident replays</h2><p>Deterministic fixtures that expose the failure mode a naive integration can miss.</p></div></div><div class="replay-layout"><div class="replay-list">${state.replayCases.map((entry) => `<button class="replay-choice ${entry.id === selectedReplay.id ? "selected" : ""}" data-replay="${escapeHtml(entry.id)}"><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.summary)}</span></button>`).join("")}</div><div class="replay-detail"><h3>${escapeHtml(selectedReplay.label)}</h3><p>${escapeHtml(selectedReplay.summary)}</p><div class="comparison"><div><span>Without the guard</span><p>${escapeHtml(selectedReplay.unsafeOutcome)}</p></div><div><span>Relay's outcome</span><p>${escapeHtml(selectedReplay.guardedOutcome)}</p></div></div><button class="primary" data-action="run-replay" data-replay="${escapeHtml(selectedReplay.id)}">Run this replay</button></div></div></section></div>`;
}

function renderEvents() {
  const events = state.overview.events;
  return `<div class="page">${header("Event ledger", "Append-only connection events make recovery decisions explainable. A duplicate event is not allowed to produce a second repair flow.")}<section class="ledger"><div class="ledger-head"><span>Event</span><span>Item</span><span>Outcome</span><span>Time</span></div>${events.map((event) => { const item = state.overview.items.find((entry) => entry.id === event.itemId); return `<div class="ledger-row"><strong>${escapeHtml(label(event.kind))}</strong><span>${escapeHtml(item?.label ?? event.itemId)}</span><span class="event-outcome ${escapeHtml(event.outcome)}">${escapeHtml(label(event.outcome))}</span><time>${escapeHtml(timestamp(event.occurredAt))}</time></div>`; }).join("")}</section></div>`;
}

function renderAbout() {
  return `<div class="page">${header("A narrow control plane for Link recovery.", "Relay models the application work that happens after an Item is initially connected.")}<section class="explain-grid"><article><h2>1. Persist the signal</h2><p>Every recovery-relevant event is stored with an idempotency key and a timestamp. Replayed webhooks do not create another user prompt.</p></article><article><h2>2. Choose one action</h2><p>Only known recovery signals create an update path. A healthy Item cannot receive an unnecessary update Link session.</p></article><article><h2>3. Close obsolete work</h2><p>A newer self-healing signal clears the prompt and supersedes an unfinished recovery session.</p></article></section><section class="flow-panel"><h2>Recovery state machine</h2><div class="flow"><span>Healthy</span><i></i><span>Action needed</span><i></i><span>Update Link</span><i></i><span>Healthy</span></div><p>Relay is a Sandbox demonstration of application-side orchestration. It does not replace Plaid Link Recovery, production webhook verification, or a production support workflow.</p></section></div>`;
}

function draw() {
  if (!state.overview) return;
  app.innerHTML = state.view === "events" ? renderEvents() : state.view === "about" ? renderAbout() : state.view === "connections" ? renderConnections() : renderReliability();
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const env = document.querySelector("#environment");
  env.textContent = state.overview.sandbox.configured ? "Sandbox ready" : "Fixture mode";
  env.className = `environment ${state.overview.sandbox.configured ? "ready" : ""}`;
  if (state.toast) { const notice = document.createElement("div"); notice.className = "toast"; notice.textContent = state.toast; document.body.append(notice); setTimeout(() => notice.remove(), 3200); state.toast = null; }
}

async function applyFixture(kind, errorCode = null) {
  const itemId = state.selectedId;
  await request("/api/relay/events", { method: "POST", body: JSON.stringify({ eventId: `browser-${kind}-${Date.now()}`, itemId, kind, errorCode, occurredAt: new Date().toISOString(), payload: { source: "browser_fixture" } }) });
  await refresh();
}

async function openSandboxLink(linkToken, sessionId) {
  if (!window.Plaid) throw new Error("Plaid Link could not load. Check your network connection and try again.");
  await request(`/api/relay/items/${encodeURIComponent(state.selectedId)}/update-started`, { method: "POST", body: JSON.stringify({ sessionId }) });
  const handler = window.Plaid.create({ token: linkToken, onSuccess: async () => { await request(`/api/relay/items/${encodeURIComponent(state.selectedId)}/update-completed`, { method: "POST", body: JSON.stringify({ sessionId }) }); state.toast = "Sandbox update completed. The connection is healthy again."; await refresh(); }, onExit: async () => { state.toast = "Link was closed. The recovery session remains active."; await refresh(); } });
  handler.open();
}

document.addEventListener("click", async (event) => {
  const view = event.target.closest("[data-view]");
  if (view) { state.view = view.dataset.view; draw(); return; }
  const item = event.target.closest("[data-item]");
  if (item) { state.selectedId = item.dataset.item; draw(); return; }
  const selectedItem = event.target.closest("[data-select-item]");
  if (selectedItem) { state.selectedId = selectedItem.dataset.selectItem; if (selectedItem.dataset.view) state.view = selectedItem.dataset.view; draw(); return; }
  const replay = event.target.closest("[data-replay]");
  if (replay && !event.target.closest("[data-action]")) { state.selectedReplayId = replay.dataset.replay; draw(); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  try {
    if (action === "reset") { await request("/api/relay/demo/reset", { method: "POST" }); state.selectedId = "item-credit"; state.toast = "Fixture timeline reset."; }
    if (action === "run-replay") { const result = await request("/api/relay/demo/replay", { method: "POST", body: JSON.stringify({ caseId: event.target.closest("[data-replay]").dataset.replay }) }); state.overview = result; state.selectedId = "item-credit"; state.toast = `${result.replay.label} replay loaded.`; }
    if (action === "login-required") { await applyFixture("ITEM_ERROR", "ITEM_LOGIN_REQUIRED"); state.toast = "Simulated ITEM_LOGIN_REQUIRED event recorded."; }
    if (action === "self-heal") { await applyFixture("LOGIN_REPAIRED"); state.toast = "Simulated LOGIN_REPAIRED event recorded."; }
    if (action === "sandbox-reset") { await request(`/api/relay/items/${encodeURIComponent(state.selectedId)}/sandbox-reset`, { method: "POST", body: "{}" }); state.toast = "Sandbox login reset and recovery event recorded."; }
    if (action === "recover" || action === "fixture-recover") { const result = await request(`/api/relay/items/${encodeURIComponent(state.selectedId)}/update-link`, { method: "POST", body: JSON.stringify({ mode: action === "fixture-recover" ? "fixture" : "sandbox" }) }); if (result.mode === "sandbox") await openSandboxLink(result.linkToken, result.session.id); else { state.activeSession = result.session.id; state.toast = "Fixture recovery session issued."; } }
    if (action === "complete") { await request(`/api/relay/items/${encodeURIComponent(state.selectedId)}/update-completed`, { method: "POST", body: JSON.stringify({ sessionId: event.target.closest("[data-session]").dataset.session }) }); state.toast = "Fixture repair completed."; }
    await refresh();
  } catch (error) { state.toast = error.message; draw(); }
});

refresh().catch((error) => { app.innerHTML = `<div class="error"><h1>Relay could not start</h1><p>${escapeHtml(error.message)}</p></div>`; });
