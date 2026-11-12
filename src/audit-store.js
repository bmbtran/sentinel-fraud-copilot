import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const auditPath = join(dataDir, "audit-ledger.json");
let entries = [];

const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function initializeAuditLedger() {
  await mkdir(dataDir, { recursive: true });
  try { entries = JSON.parse(await readFile(auditPath, "utf8")); } catch { entries = []; }
  if (!Array.isArray(entries)) entries = [];
}

export async function appendAuditEvent({ id, at, event, entityId, payload = {} }) {
  const previousHash = entries.at(-1)?.hash ?? "GENESIS";
  const entry = { id, at, event, entityId, payload, previousHash };
  entry.hash = hash(JSON.stringify(entry));
  entries.push(entry);
  await writeFile(auditPath, JSON.stringify(entries, null, 2));
  return entry;
}

export function recentAuditEvents(limit = 24) { return entries.slice(-limit).reverse(); }

export function verifyAuditLedger() {
  let previousHash = "GENESIS";
  for (const entry of entries) {
    const { hash: entryHash, ...unsigned } = entry;
    if (entry.previousHash !== previousHash || entryHash !== hash(JSON.stringify(unsigned))) return { valid: false, failedAt: entry.id };
    previousHash = entryHash;
  }
  return { valid: true, entries: entries.length, tailHash: previousHash };
}
