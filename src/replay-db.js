import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "replay-lab.sqlite"));
db.exec(`PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS plaid_transactions (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY, event TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);

export function audit(event, payload = {}) { db.prepare("INSERT INTO audit_events (event, payload, created_at) VALUES (?, ?, ?)").run(event, JSON.stringify(payload), new Date().toISOString()); }
export function initializeDatabase() { audit("REPLAY_LAB_READY", { storage: "sqlite" }); }
export function savePlaidTransactions(transactions) {
  const put = db.prepare("INSERT OR REPLACE INTO plaid_transactions (id, data, updated_at) VALUES (?, ?, ?)");
  const updatedAt = new Date().toISOString();
  for (const item of transactions) put.run(item.id, JSON.stringify(item), updatedAt);
  audit("PLAID_SYNC_STORED", { transactionCount: transactions.length });
  return transactions.length;
}
export function removePlaidTransactions(transactionIds) {
  const remove = db.prepare("DELETE FROM plaid_transactions WHERE id = ?");
  for (const id of transactionIds) remove.run(id);
  audit("PLAID_SYNC_REMOVED", { transactionCount: transactionIds.length });
  return transactionIds.length;
}
