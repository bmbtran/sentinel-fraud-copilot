# Plaid Agent Replay Lab

I started this after connecting Plaid to ChatGPT and Muse. The analysis was already useful: ChatGPT could state the accounts and dates it had, distinguish a partial month from a complete one, cite transactions, and avoid treating transfers as ordinary spending.

That shifted the question for me. The problem is not how to make another financial chatbot. It is how to test an agent after the transaction record changes.

Plaid Agent Replay Lab replays Plaid-shaped Transactions Sync responses and checks the contract around an agent answer. A valid answer needs to cite transactions that still exist in the current state and disclose limitations such as an incomplete period, a pending-to-posted replacement, a refund, or a removed record.

The project uses synthetic fixtures for expected behavior. The Sandbox integration is separate and shows the real account and cursor-based sync path without claiming that Sandbox transactions have fraud or correctness labels.

## What it tests

The suite covers six cases that are easy to mishandle when an agent works from transaction history:

- a partial-period comparison
- a pending card charge that becomes posted
- merchant enrichment applied through a modified transaction
- a refund that offsets a purchase
- two identical utility payments that need confirmation
- a transaction removed by a later sync response

Each case starts from an empty local state. The harness applies `added`, `modified`, and `removed` changes in cursor order, then exposes only the final transaction state to the answer validator.

## The answer contract

The validator does not decide whether an answer sounds good. It checks facts that can be tested:

- cited transaction IDs exist in the current replay state
- required source transactions are included
- stale pending or removed records are not cited
- the answer contains the limitations required by that fixture
- a conclusion is present

This keeps the evaluation separate from a model score. An agent can use the MCP tools to inspect a case and submit its own structured answer for validation.

## MCP interface

The local Streamable HTTP endpoint is `http://127.0.0.1:8787/mcp`.

| Tool | Purpose |
| --- | --- |
| `list_replay_cases` | Lists the six synthetic replay cases. |
| `get_replay_case` | Returns one case's cursor steps, current transactions, coverage, and answer contract. |
| `validate_financial_answer` | Checks a proposed structured answer against the current replay state. |

All three tools are read-only. They operate on synthetic fixtures and do not access a user's financial data, contact a bank, or submit a dispute.

## Architecture

```text
Plaid Sandbox
  -> Transactions Sync cursor
  -> normalized SQLite records

Synthetic sync fixture
  -> added / modified / removed replay
  -> current transaction state
  -> answer-contract validator
  -> browser UI or MCP client
```

- `src/replay-suite.js` contains the fixtures, cursor reducer, and answer validator.
- `src/replay-mcp.js` exposes the replay harness through MCP.
- `server.mjs` serves the browser UI and Plaid Sandbox sync route.
- `src/replay-db.js` stores normalized Sandbox transactions in SQLite.
- `tests/replay-suite.test.mjs` tests sync semantics and unsupported citations.
- `tests/replay-mcp.test.mjs` tests the live Streamable HTTP transport.

## Run locally

```powershell
npm install
npm start
```

Open `http://127.0.0.1:4173`.

To run the MCP server separately:

```powershell
npm run mcp
```

The app works in fixture mode without credentials. Add Plaid Sandbox credentials to `.env` to enable the live Sandbox account and sync route:

```dotenv
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
```

## Test

```powershell
npm test
```

The test suite covers pending replacement, modified merchant enrichment, stale-citation rejection, partial-period disclosure, all reference contracts, and the running MCP endpoint.

## Scope

This is an engineering prototype for replaying synthetic transaction changes. It is not a fraud model, a production financial advisor, or a measure of how ChatGPT performs with a user's connected account. It is a way to make the data assumptions behind an agent answer testable.
