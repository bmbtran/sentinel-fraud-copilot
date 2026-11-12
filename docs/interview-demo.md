# Five-minute interview demo

## The opening (20 seconds)

> “TransferTrust asks what happens when an AI agent sees only a clean-looking payment document, versus when the same request is checked against trusted records. In a fixed synthetic run, Claude stopped 3 of 12 context-gap cases; the enforced policy stopped all 12 without holding any of the 16 clean payments.”

Clarify that all requests and vendors are synthetic. The point is the engineering pattern, not a production fraud-rate claim.

## The walkthrough (three minutes)

1. Start at the benchmark cards. Explain that both flows receive the exact same immutable test batch.
2. Select **Evaluate Claude baseline** if you want to re-run the model. It receives one document at a time with simulated authority, but no trusted context. The recorded score is shown by default.
3. Open a **destination mismatch**. The invoice looks ordinary, but the vendor master rejects its requested account.
4. Open a **vendor identity mismatch**. Explain that the apparent vendor name is insufficient; the verified identity from the intake record must also match.
5. Open a **purchase-order mismatch**. The document contains one amount; the deterministic policy sees a different approved amount that Claude cannot see.
6. Filter to **clean payments**. The protected result keeps all 16 moving, showing that the project is not simply a “block everything” rule.
7. Open the **insufficient-funds** exception. Explain that the Plaid Sandbox funding source contributes a current available-balance snapshot; this request is held because its amount exceeds the connected account's available funds.

## Engineering decisions to highlight

- **AI for interpretation; policy for authority.** Claude can propose and explain, but it cannot authorize a release.
- **Separation of concerns.** `src/data.js` owns the scenario manifest; `src/risk-engine.js` owns pure decision logic; `app.js` only renders results.
- **Fixed benchmark.** The result is reproducible and tested rather than a hand-picked dashboard statistic.
- **Explainability.** Every blocked, held, and approved item exposes the applied control and reason.
- **Fail-safe behavior.** The vendor master is the source of truth whenever an invoice conflicts with it.
- **Plaid as an operational input.** The Sandbox integration fetches a funding source's available balance server-side and applies it as a deterministic funding-readiness hold. It does not authorize, initiate, or simulate money movement.

## Architecture

```text
Synthetic request batch
        │
        ├── Claude, document-only ──────► simulated approve / hold / block
        │
        └── TransferTrust enforced policy
              ├── vendor-master verification
              ├── purchase-order check
              └── duplicate check ─────► block / hold / approve + reason
```

## Validation

`npm test` verifies the deterministic policy contract: it stops 12/12 context-gap fixtures while holding 0/16 clean payments. `src/agent-benchmark.js` records the named Claude/model evaluation for the fixed document-only fixture run.
