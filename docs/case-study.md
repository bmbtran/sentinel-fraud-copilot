# TransferTrust: a constrained payment-review prototype

## Problem

Payment-change requests often arrive in documents that are not a trusted system of record. A reviewer needs to distinguish the invoice's claim from what a verified vendor record, purchase order, and funding account support.

## Product hypothesis

Run deterministic controls before release, expose the evidence for every outcome, and retain a lightweight local review record. This prototype tests whether those controls improve outcomes on a fixed adversarial batch.

## Evidence

The project evaluates the same synthetic 30-request batch through two paths:

- Document-only Claude baseline: 3 of 12 fixed context-gap fixtures stopped in a recorded, one-document-at-a-time evaluation of `claude-haiku-4-5-20251001`.
- Protected path: 12 of 12 seeded attacks stopped and 0 of 16 clean payments held.

Claude has no vendor-master, PO, invoice-history, or balance access in that evaluation. The batch is synthetic by design. These are test results, not a claim about real-world fraud performance.

## Plaid's role

The app creates a Plaid Sandbox Item server-side and uses the connected Cash Management account's available balance as a funding-readiness control. A payment above that balance is held with the `plaid-funding` reason. Plaid does not determine whether an invoice is fraudulent; it supplies an account signal appropriate to its role.

## Demo workflow

1. Select a context-gap scenario to inspect its deterministic evidence trail.
2. Open **View source document** to inspect the clean-looking synthetic document that Claude saw without trusted context.
3. Read the control trace, including the explicit “not initiated” release-action entry after a block or hold.
4. Select **Insufficient funds** to see the connected Plaid Sandbox balance affect the result.
5. Record a local operator acknowledgement; it persists in browser storage.
6. Export the review audit JSON.

## Intentional boundaries

This is not a money-movement system. It has no production authentication, persistence, vendor-maintenance workflow, permissions, webhooks, or real customer data. The prototype is designed to make the decision boundary and tradeoffs inspectable.
