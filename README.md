# TransferTrust

**A transparent fraud-screening guardrail for payment-change requests.**

Inspired by Plaid, TransferTrust tests a simple boundary: a document-only AI agent cannot verify facts it cannot see, while deterministic safeguards can compare a request with trusted records before release.

## The demo moment

| Flow | Fraud attempts stopped | Legitimate payments incorrectly held |
| --- | ---: | ---: |
| Document-only Claude baseline | 3 / 12 | Not evaluated in this fixture run |
| TransferTrust controls | 12 / 12 | 0 / 16 |

The Claude score is a recorded evaluation of `claude-haiku-4-5-20251001` on a fixed synthetic fixture set, one document at a time and without vendor-master, PO, history, or balance data. The data is synthetic and the controls are illustrative. This is not a real payment processor or fraud-prevention system.

## What it demonstrates

- A seeded adversarial payment-request dataset
- A Claude document-analysis proposal that has no payment authority
- Deterministic pre-transfer risk checks
- A vendor-master policy that prevents invoice text from changing payout details
- An explainable audit trail for each decision
- A side-by-side before/after benchmark
- A server-side Plaid Sandbox funding-readiness check using a live test-account balance

## Development

This project deliberately uses a dependency-free static dashboard so the demo can run anywhere:

```powershell
npm start
```

Then open `http://localhost:4173`.

Run the deterministic benchmark tests with:

```powershell
npm test
```

### Claude (optional)

Add `ANTHROPIC_API_KEY` to local `.env`. Claude is called server-side only. The dashboard can show a recorded fixture evaluation or re-run the document-only autonomous-agent baseline; both are simulated decisions and cannot execute a payment.

### Plaid Sandbox (optional)

Copy `.env.example` to `.env` and add a Plaid Sandbox client ID and secret. The local server uses `/sandbox/public_token/create` to create a test Item and `/accounts/get` to retrieve test account context. Credentials and the returned access token remain server-side and are never exposed to the browser.

This integration does **not** initiate transfers. It uses the connected Sandbox account's available balance as a funding-readiness control: a request above available funds is held before release. Fraud decisions remain deterministic and testable, while Plaid provides a live balance snapshot for a distinct operational constraint.

## Design note

TransferTrust is a clean-room portfolio project inspired by the general idea of measuring controls against a fixed adversarial test set. Its implementation, data, and interface are original.
