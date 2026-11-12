# Sentinel

### A demo app for reviewing suspicious charges with Plaid data, rules, and Claude.

Most fraud alerts ask a user to make a snap call with almost no context: *“Was this you?”* Sentinel compares a new transaction with the account’s spending history and shows the details that do not fit.

This hackathon project uses Claude to explain the context around a charge. Rule checks handle patterns that should stay predictable, such as duplicate charges and card testing.

![Sentinel charge-review demo](docs/sentinel-demo.png)

## 90-second walkthrough

The repository is meant to be readable before it is run.

1. **Overview** shows Maya Chen's reference profile built from 13 earlier transactions. The screen shows her typical spend, known locations, common merchants, and the charge currently under review.
2. **Charges to review** opens an $847 purchase from a first-time merchant in Austin at 2:13 AM. Sentinel shows the rule findings behind the alert: small card-testing charges, an amount outside Maya's usual range, and no prior history with the merchant.
3. Selecting **I don't recognize this** writes a resolution to SQLite and prepares an incident summary. The summary groups the main charge, related micro-charges, and the next step a person can take with their issuer.
4. **Compare decisions** runs the same labeled scenarios through Rules Only, Claude Only, and the hybrid policy. This view makes disagreements visible instead of treating a model score as an answer.

## Request flow

| User action | Server path | What happens |
| --- | --- | --- |
| Open the overview | `GET /api/dashboard` | Loads the seeded scenarios, computes their hybrid assessments, and reads recent resolutions and audit events from SQLite. |
| Open a charge | `GET /api/scenarios/:id` | Builds a spending reference, evaluates rules, runs the deterministic Claude baseline, and returns the evidence used by the UI. |
| Mark a charge as unrecognized | `POST /api/scenarios/:id/resolve` | Stores the decision, creates an incident summary from the same evidence, and records both events in SQLite. |
| Ask Claude for a second read | `POST /api/scenarios/:id/claude` | Sends a minimized, structured context object to the Anthropic Messages API. The response is parsed and validated before it is shown. |
| Sync Sandbox data | `POST /api/plaid/sync` | Fetches transaction changes with Plaid's cursor-based Transactions Sync endpoint and stores normalized records locally. |

## Source map

The main implementation is small enough to inspect from GitHub:

- [`server.mjs`](server.mjs): HTTP routes, Plaid and Anthropic adapters, request validation, and static serving.
- [`src/sentinel-core.js`](src/sentinel-core.js): reference profile, rule findings, hybrid risk policy, counterfactuals, incident builder, and benchmark metrics.
- [`src/sentinel-db.js`](src/sentinel-db.js): SQLite schema and persistence functions.
- [`src/sentinel-data.js`](src/sentinel-data.js): three personas and eight labeled fraud-review scenarios.
- [`app.js`](app.js): the client-side review flow.
- [`tests/sentinel-core.test.mjs`](tests/sentinel-core.test.mjs): checks for card-testing evidence, travel context, and benchmark separation.

## Design notes

The app separates charges into three outcomes: **alert**, **ask**, and **ignore**. A new merchant or a large purchase alone is not enough to trigger an alert. The decision also considers the account's prior spending, nearby transactions, time of day, location, and category.

Each rule keeps its name, score contribution, and supporting detail. Claude receives a minimized transaction context and returns a structured assessment. The hybrid policy uses both results, then produces counterfactuals that explain what would lower the risk score.

The comparison page replays the same labeled scenarios through Rules Only, Claude Only, and the hybrid policy. The incident flow reuses the same evidence to prepare a summary when a user says a charge is not theirs.

## Architecture

```text
Plaid Transactions / Demo Scenarios
                ↓
   Transaction normalization + SQLite
                ↓
  Personal spending reference builder
                ↓
  Rules engine ────────┐
                        ├── Hybrid risk policy ──→ alert / ask / ignore
  Claude assessment ───┘
                ↓
   Evidence + counterfactuals + incident summary
```

### Stack

- **Frontend:** vanilla JavaScript, semantic HTML, and responsive CSS.
- **Server:** Node.js HTTP server, kept small enough to make the evaluation path easy to follow.
- **Database:** built-in `node:sqlite`; it stores demo personas, scenarios, audit events, user resolutions, incident summaries, and normalized Plaid transactions.
- **Plaid:** Sandbox item creation, account lookup, and cursor-based `/transactions/sync` ingestion. Plaid credentials and access tokens stay server-side.
- **Claude:** optional Anthropic Messages API call for an independent, structured assessment of the selected charge. The live response is validated before display.
- **Evaluation:** a synthetic, labeled scenario suite that makes the product’s behavior repeatable during a demo.

## Implementation choices

Each rule records its own name, score contribution, and detail. The UI can show the score and the evidence behind it.

Claude explains the context around a transaction. It does not decide the final action by itself. The deterministic policy keeps duplicate charges, card testing, and other high-signal patterns visible and testable.

The comparison page uses seeded scenarios so the same input can be replayed. The optional live Claude check is separate from that benchmark, since model output can vary between calls.

Sentinel does not freeze cards, file disputes, move money, or claim real-world fraud accuracy. The incident summary gives the user a concise record before they contact their issuer.

## Run it locally

Sentinel requires Node 22.13+ because the project uses the built-in `node:sqlite` module.

```powershell
nvm use 22
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Optional live services

Create a local `.env` from `.env.example`:

```text
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-haiku-4-5-20251001
```

The app is still fully demoable without keys. Plaid turns on the Sandbox connection and sync path. Anthropic turns on **Ask Claude to review it** for a selected charge.

## Test

```powershell
npm test
```

## A note on evaluation

The Compare Decisions screen uses made-up, labeled scenarios. It exists to make the prototype’s choices legible; its precision, recall, and F1 scores are not a claim about real-world fraud performance.
