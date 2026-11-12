# TransferTrust

**A transparent fraud-screening demo for payment-change requests.**

TransferTrust makes a simple, testable claim: the same synthetic batch that slips through a naive review flow can be caught before money moves when deterministic safeguards run first.

## The demo moment

| Flow | Fraud attempts stopped | Legitimate payments incorrectly held |
| --- | ---: | ---: |
| Naive review | 0 / 12 | 0 |
| TransferTrust controls | 12 / 12 | 0 |

The data is synthetic and the controls are illustrative. This is not a real payment processor or fraud-prevention system.

## What it demonstrates

- A seeded adversarial payment-request dataset
- Deterministic pre-transfer risk checks
- A vendor-master policy that prevents invoice text from changing payout details
- An explainable audit trail for each decision
- A side-by-side before/after benchmark

## Development

This project deliberately uses a dependency-free static dashboard so the demo can run anywhere:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

Run the deterministic benchmark tests with:

```powershell
npm test
```

## Design note

TransferTrust is a clean-room portfolio project inspired by the general idea of measuring controls against a fixed adversarial test set. Its implementation, data, and interface are original.
