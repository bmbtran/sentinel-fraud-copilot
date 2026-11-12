# Five-minute interview demo

## The opening (20 seconds)

> “TransferTrust is a small payment-risk demonstration built around an outcome that matters: the same 30 synthetic payment requests go from 0 of 12 fraud attempts stopped to 12 of 12 stopped, without holding any of the 16 clean payments.”

Clarify that all requests and vendors are synthetic. The point is the engineering pattern, not a production fraud-rate claim.

## The walkthrough (three minutes)

1. Start at the benchmark cards. Explain that both flows receive the exact same immutable test batch.
2. Open a **hidden instruction**. The naive path approves it because it treats document text as trusted context. The protected path blocks it before a payment decision.
3. Open a **bank-change request**. Explain the key boundary: invoice text cannot update payout details. Only the vendor master is authoritative.
4. Open a **look-alike vendor**. The text screen cannot reliably identify a visually similar name; the structural vendor-master match instead holds it for review. This is the deliberately honest limitation in the demo.
5. Filter to **clean payments**. The protected result keeps all 16 moving, showing that the project is not simply a “block everything” rule.

## Engineering decisions to highlight

- **Deterministic controls before automation.** Payment safety does not depend on a model being cautious.
- **Separation of concerns.** `src/data.js` owns the scenario manifest; `src/risk-engine.js` owns pure decision logic; `app.js` only renders results.
- **Fixed benchmark.** The result is reproducible and tested rather than a hand-picked dashboard statistic.
- **Explainability.** Every blocked, held, and approved item exposes the applied control and reason.
- **Fail-safe behavior.** The vendor master is the source of truth whenever an invoice conflicts with it.
- **Narrow Plaid boundary.** The Sandbox integration fetches test account context server-side, but it does not authorize, initiate, or simulate money movement. That keeps the API usage relevant without overstating the prototype's safety guarantees.

## Architecture

```text
Synthetic request batch
        │
        ├── Naive review ───────────────► approve / hold
        │
        └── TransferTrust controls
              ├── input screen
              ├── sensitive-data check
              ├── vendor-master verification
              ├── purchase-order check
              └── duplicate check ─────► block / hold / approve + reason
```

## Validation

`npm test` verifies the intended benchmark contract: the naive flow stops 0/12 attacks; the protected flow stops 12/12 while holding 0/16 clean payments.
