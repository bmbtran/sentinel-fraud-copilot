import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(process.env.RELAY_DB_PATH ?? join(dataDir, "relay.sqlite"));
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY, event TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS connection_items (id TEXT PRIMARY KEY, plaid_item_id TEXT, label TEXT NOT NULL, status TEXT NOT NULL, reason TEXT, recovery_required_at TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS connection_events (event_id TEXT PRIMARY KEY, item_id TEXT NOT NULL, kind TEXT NOT NULL, error_code TEXT, occurred_at TEXT NOT NULL, payload TEXT NOT NULL, outcome TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS recovery_sessions (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, status TEXT NOT NULL, mode TEXT NOT NULL, link_token TEXT, created_at TEXT NOT NULL, completed_at TEXT);`);

export function audit(event, payload = {}) { db.prepare("INSERT INTO audit_events (event, payload, created_at) VALUES (?, ?, ?) ").run(event, JSON.stringify(payload), new Date().toISOString()); }
export function initializeDatabase() { audit("RELAY_READY", { storage: "sqlite" }); }

export function loadRelayState() {
  return {
    items: db.prepare("SELECT id, plaid_item_id, label, status, reason, recovery_required_at, updated_at FROM connection_items").all().map((row) => ({
      id: row.id, plaidItemId: row.plaid_item_id, label: row.label, status: row.status, reason: row.reason, recoveryRequiredAt: row.recovery_required_at, updatedAt: row.updated_at,
    })),
    events: db.prepare("SELECT event_id, item_id, kind, error_code, occurred_at, payload, outcome FROM connection_events").all().map((row) => ({
      eventId: row.event_id, itemId: row.item_id, kind: row.kind, errorCode: row.error_code, occurredAt: row.occurred_at, payload: JSON.parse(row.payload), outcome: row.outcome,
    })),
    sessions: db.prepare("SELECT id, item_id, status, mode, link_token, created_at, completed_at FROM recovery_sessions").all().map((row) => ({
      id: row.id, itemId: row.item_id, status: row.status, mode: row.mode, token: row.link_token, createdAt: row.created_at, completedAt: row.completed_at,
    })),
  };
}

export function saveRelayState(state) {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM connection_items; DELETE FROM connection_events; DELETE FROM recovery_sessions;");
    const putItem = db.prepare("INSERT INTO connection_items (id, plaid_item_id, label, status, reason, recovery_required_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const putEvent = db.prepare("INSERT INTO connection_events (event_id, item_id, kind, error_code, occurred_at, payload, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const putSession = db.prepare("INSERT INTO recovery_sessions (id, item_id, status, mode, link_token, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const item of state.items) putItem.run(item.id, item.plaidItemId, item.label, item.status, item.reason, item.recoveryRequiredAt, item.updatedAt);
    for (const event of state.events) putEvent.run(event.eventId, event.itemId, event.kind, event.errorCode, event.occurredAt, JSON.stringify(event.payload), event.outcome);
    for (const session of state.sessions) putSession.run(session.id, session.itemId, session.status, session.mode, session.token, session.createdAt, session.completedAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
