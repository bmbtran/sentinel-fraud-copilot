const recoveryReasons = new Map([
  ["ITEM_LOGIN_REQUIRED", "item_login_required"],
  ["PENDING_DISCONNECT", "pending_disconnect"],
  ["PENDING_EXPIRATION", "pending_expiration"],
]);

const clone = (value) => structuredClone(value);

function publicSession(session) {
  const { token, ...safe } = session;
  return safe;
}

export function createRelayEngine(initialState = null) {
  const items = new Map();
  const events = new Map();
  const sessions = new Map();

  function addItem(item) {
    if (!item?.id) throw new Error("An Item id is required.");
    const existing = items.get(item.id);
    const normalized = {
      id: item.id,
      label: item.label ?? existing?.label ?? item.id,
      plaidItemId: item.plaidItemId ?? existing?.plaidItemId ?? null,
      status: item.status ?? existing?.status ?? "healthy",
      reason: item.reason ?? existing?.reason ?? null,
      recoveryRequiredAt: item.recoveryRequiredAt ?? existing?.recoveryRequiredAt ?? null,
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    };
    items.set(normalized.id, normalized);
    return clone(normalized);
  }

  function getItem(id) {
    const item = items.get(id);
    if (!item) return null;
    const { plaidItemId, updatedAt, ...safe } = item;
    return clone(safe);
  }

  function applyEvent(input) {
    if (!input?.eventId || !input?.itemId || !input?.kind || !input?.occurredAt) throw new Error("eventId, itemId, kind, and occurredAt are required.");
    if (events.has(input.eventId)) return { outcome: "duplicate", item: getItem(input.itemId) };
    const item = items.get(input.itemId);
    if (!item) throw new Error("Item not found.");
    const reason = recoveryReasons.get(input.errorCode) ?? recoveryReasons.get(input.kind);
    let outcome = "applied";

    if (reason) {
      item.status = "recovery_required";
      item.reason = reason;
      item.recoveryRequiredAt = input.occurredAt;
    } else if (input.kind === "LOGIN_REPAIRED") {
      if (item.recoveryRequiredAt && new Date(input.occurredAt) < new Date(item.recoveryRequiredAt)) {
        outcome = "ignored_stale";
      } else {
        item.status = "healthy";
        item.reason = null;
        item.recoveryRequiredAt = null;
        for (const session of sessions.values()) {
          if (session.itemId === item.id && ["issued", "in_progress"].includes(session.status)) session.status = "superseded";
        }
      }
    }
    item.updatedAt = input.occurredAt;
    const stored = {
      eventId: input.eventId,
      itemId: input.itemId,
      kind: input.kind,
      errorCode: input.errorCode ?? null,
      occurredAt: input.occurredAt,
      payload: clone(input.payload ?? {}),
      outcome,
    };
    events.set(stored.eventId, stored);
    return { outcome, item: getItem(item.id) };
  }

  function issueRecovery(itemId, { token = null, mode = "fixture" } = {}) {
    const item = items.get(itemId);
    if (!item) throw new Error("Item not found.");
    const active = [...sessions.values()].find((entry) => entry.itemId === itemId && ["issued", "in_progress"].includes(entry.status));
    if (active) throw new Error("A recovery session is already active for this Item.");
    if (item.status !== "recovery_required") throw new Error("Recovery is only available when an Item needs action.");
    const session = {
      id: `recovery-${sessions.size + 1}`,
      itemId,
      status: "issued",
      mode,
      token,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    sessions.set(session.id, session);
    item.status = "recovery_in_progress";
    item.updatedAt = session.createdAt;
    return publicSession(session);
  }

  function startRecovery(itemId, sessionId, occurredAt = new Date().toISOString()) {
    const session = sessions.get(sessionId);
    if (!session || session.itemId !== itemId) throw new Error("Recovery session not found.");
    if (session.status === "superseded") throw new Error("Recovery session has been superseded.");
    session.status = "in_progress";
    items.get(itemId).status = "recovery_in_progress";
    items.get(itemId).updatedAt = occurredAt;
    return publicSession(session);
  }

  function completeRecovery(itemId, sessionId, occurredAt = new Date().toISOString()) {
    const session = sessions.get(sessionId);
    const item = items.get(itemId);
    if (!session || !item || session.itemId !== itemId) throw new Error("Recovery session not found.");
    if (!["issued", "in_progress"].includes(session.status)) throw new Error("Recovery session cannot be completed.");
    session.status = "completed";
    session.completedAt = occurredAt;
    item.status = "healthy";
    item.reason = null;
    item.recoveryRequiredAt = null;
    item.updatedAt = occurredAt;
    return { item: getItem(itemId), session: publicSession(session) };
  }

  function eventsFor(itemId) {
    return [...events.values()].filter((entry) => entry.itemId === itemId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map(clone);
  }

  function sessionsFor(itemId) {
    return [...sessions.values()].filter((entry) => entry.itemId === itemId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((entry) => publicSession(entry));
  }

  function overview() {
    const itemList = [...items.values()].sort((a, b) => a.label.localeCompare(b.label)).map(({ plaidItemId, ...item }) => clone(item));
    return {
      items: itemList,
      events: [...events.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(clone),
      sessions: [...sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicSession),
    };
  }

  function snapshot() {
    return {
      items: [...items.values()].map(clone),
      events: [...events.values()].map(clone),
      sessions: [...sessions.values()].map(clone),
    };
  }

  if (initialState) {
    for (const item of initialState.items ?? []) addItem(item);
    for (const entry of initialState.events ?? []) events.set(entry.eventId, clone(entry));
    for (const session of initialState.sessions ?? []) sessions.set(session.id, clone(session));
  }

  return { addItem, getItem, applyEvent, issueRecovery, startRecovery, completeRecovery, eventsFor, sessionsFor, overview, snapshot };
}

export function createRelayFixture() {
  const engine = createRelayEngine();
  engine.addItem({ id: "item-checking", label: "First Platypus Checking", status: "healthy" });
  engine.addItem({ id: "item-credit", label: "First Platypus Credit", status: "healthy" });
  engine.applyEvent({
    eventId: "fixture-pending-disconnect",
    itemId: "item-credit",
    kind: "PENDING_DISCONNECT",
    errorCode: null,
    occurredAt: "2026-11-13T09:00:00.000Z",
    payload: { source: "fixture" },
  });
  return engine;
}
