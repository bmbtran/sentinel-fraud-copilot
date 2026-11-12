# TransferTrust

**A Plaid Sandbox payment-risk command center.**

TransferTrust is an original portfolio prototype that puts a transparent risk decision in front of a Plaid Transfer authorization. It does not create transfers or move money.

## The demo

1. A synthetic payment enters a command-center stream.
2. A transparent rules engine scores device sharing, destination fan-in, transaction velocity, and amount signals.
3. The operator can run a real **Claude document-only** baseline against a fixed 12-case adversarial suite and compare it with **Claude plus deterministic evidence rules**, which stop 12/12 cases. Each run records its model, prompt version, timestamp, and per-case outputs because model behavior can vary across runs.
4. Only a low-risk fixture may call Plaid Sandbox's Transfer authorization endpoint.
5. Holds, escalations, and Plaid authorizations append a hash-linked audit event. Transfer creation is intentionally unavailable.

## Why Plaid is central

Plaid is the authorization boundary, not a decorative account card. The app retrieves a server-side Sandbox funding account and calls `/transfer/authorization/create` only after its risk policy returns `READY_FOR_AUTHORIZATION`. The browser never receives a Plaid access token or secret.

This is a Sandbox-only portfolio demo. A Plaid authorization assesses the linked funding source and ACH authorization; it does not validate a merchant or prove fraud detection is production-ready.

## Run locally

```powershell
npm start
```

Open `http://127.0.0.1:4173`. To use the live Sandbox authorization path, add Plaid Sandbox credentials to `.env` using `.env.example` as a guide.

```powershell
npm test
```

## Architecture inspiration and attribution

The project was rethought after studying the high-level architecture of [Sentinel](https://github.com/Tanisha-dey18/hackathon), an MIT-licensed PayPal hackathon project: a payment-state boundary, evidence-led risk assessment, operator review, relationship intelligence, and auditability. TransferTrust is a clean-room Plaid-oriented implementation: its code, UI, fixtures, risk rules, and terminology were written independently and it does not copy Sentinel source files.
