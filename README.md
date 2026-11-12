# Sentinel

**An explainable AI fraud co-pilot built around Plaid transaction data.**

Sentinel builds a personal spending fingerprint, compares deterministic risk rules with Claude’s contextual reasoning, and explains why a transaction was flagged before asking the user to act.

![Sentinel charge-review demo](docs/sentinel-demo.png)

## What is included

- Plaid-inspired, responsive command interface with overview, alert center, Trust Lab, and methodology views.
- Eight realistic, repeatable transaction scenarios across three financial personas.
- Transparent risk rules for new merchants, amount outliers, unusual timing, duplicates, card testing, velocity, unfamiliar locations, subscription drift, travel context, and unfamiliar cash withdrawals.
- Hybrid decision policy with risk counterfactuals: “what would make this safer?”
- Trust Lab that compares a deterministic baseline, contextual AI baseline, and hybrid system on the same labeled scenarios.
- Optional, server-side live Claude analysis for any selected case.
- Optional Plaid Sandbox status integration; secrets and access tokens never leave the server.
- Real SQLite persistence in `data/sentinel.sqlite` for personas, scenarios, user resolutions, and audit events.

## Run

Requires Node 22.13+ because SQLite uses the built-in `node:sqlite` module.

```powershell
npm start
```

Open `http://127.0.0.1:4173`.

## Configure optional live services

Copy the variable names in `.env.example` into `.env` and add:

```text
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-haiku-4-5-20251001
```

Without either key, Sentinel still runs as a complete deterministic demo. Plaid Sandbox enables the connection status check. Anthropic enables the **Run live Claude analysis** control in the Alert Center.

## Test

```powershell
npm test
```

## Safety and evaluation note

The Trust Lab uses synthetic, labeled scenarios to make the product’s behavior inspectable. Its metrics are not claims of production fraud performance. Sentinel does not freeze cards, contact issuers, create disputes, or move money.
