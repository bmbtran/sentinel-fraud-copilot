# Sentinel

### A charge-review prototype built with Plaid transaction data, deterministic checks, and Claude.

Most fraud alerts reduce the review to one question: *“Was this you?”* Sentinel adds the context behind that question. It compares a charge with the account’s history, records the checks that fired, and shows which details differ from the person’s usual activity.

The project uses rules for patterns that should remain predictable, including duplicate charges and card testing. Claude produces a separate, structured assessment of the same charge. The comparison screen makes the difference between rules, model output, and the hybrid policy visible.

![Sentinel charge-review demo](docs/sentinel-demo.png)

## 90-second walkthrough

The repository is meant to be readable before it is run.

1. **Overview** establishes a reference profile for Maya Chen from 13 earlier transactions: typical spend, known locations, common merchants, and the charge under review.
2. **Charges to review** examines an $847 purchase at a first-time merchant in Austin at 2:13 AM. The alert includes the rule findings: small card-testing charges, an amount outside Maya's usual range, and no prior merchant history.
3. Selecting **I don't recognize this** stores a resolution in SQLite and prepares an incident summary. The summary groups the charge, related micro-charges, and the issuer guidance shown in the app.
4. **Compare decisions** runs the labeled scenarios through Rules Only, Claude Only, and the hybrid policy. It shows where the approaches agree and where they do not.

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

The app assigns charges to **alert**, **ask**, or **ignore**. It considers the account's prior spending, nearby transactions, time of day, location, and category. A new merchant or a high amount alone does not trigger an alert.

Each rule keeps its name, score contribution, and supporting detail. Claude receives a reduced transaction context and returns a structured assessment. The hybrid policy combines those results and generates counterfactuals that show what would reduce the risk score.

The comparison page replays the same labeled scenarios through Rules Only, Claude Only, and the hybrid policy. When a user marks a charge as unrecognized, the incident flow reuses that evidence to prepare a summary.

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
- **Server:** Node.js HTTP server with a small request path that is easy to inspect.
- **Database:** built-in `node:sqlite`; it stores demo personas, scenarios, audit events, user resolutions, incident summaries, and normalized Plaid transactions.
- **Plaid:** Sandbox item creation, account lookup, and cursor-based `/transactions/sync` ingestion. Plaid credentials and access tokens stay server-side.
- **Claude:** optional Anthropic Messages API call for an independent, structured assessment of the selected charge. The live response is validated before display.
- **Evaluation:** a synthetic, labeled scenario suite that makes the product’s behavior repeatable during a demo.

## Implementation choices

Each rule records its name, score contribution, and supporting detail. The UI uses that data to show both the score and the reason for it.

Claude explains the context around a transaction. Deterministic checks keep duplicate charges, card testing, and other high-signal patterns visible and testable.

The comparison page uses seeded scenarios so each approach sees the same input. The optional live Claude check remains separate from the benchmark because model output can vary between calls.

Sentinel does not freeze cards, file disputes, move money, or make claims about real-world fraud accuracy. The incident summary gives the user a record to review before contacting their issuer.

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

The demo works without keys. Plaid enables the Sandbox connection and sync path. Anthropic enables **Ask Claude to review it** for a selected charge.

## Test

```powershell
npm test
```

## A note on evaluation

The Compare Decisions screen uses synthetic, labeled scenarios. Its precision, recall, and F1 scores describe this small evaluation set only. They are not a claim about real-world fraud performance.
