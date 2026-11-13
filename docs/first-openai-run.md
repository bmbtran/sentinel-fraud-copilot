# First OpenAI benchmark run

## Configuration

- Date: November 13, 2026
- Model: `gpt-6.1-sol`
- Cases: R01–R12
- Conditions: `raw_sync` and `reconciled_state`
- Responses: 24 total, one response for each case-condition pair
- Data: synthetic Plaid-shaped fixtures only

## Result

The initial model outputs were rescored after the validator was corrected to accept equivalent, evidence-preserving phrasing such as “counted once” and “different accounts.” The corrected local score was:

| Condition | Contract-valid answers |
| --- | ---: |
| Raw Sync batches | 11 / 12 |
| Reconciled current state | 10 / 12 |

This is an exploratory result, not a claim about general model quality or about the relative performance of the two contexts. It has one sample per case and no repeated trials.

## Failures retained after rescoring

| Case | Condition | Failed checks | Why it matters |
| --- | --- | --- | --- |
| R03 | Reconciled current state | `limitations` | The response correctly described an update to the same record but omitted the required `merchant_enriched` limitation. |
| R06 | Raw Sync batches | `current_sources_only`, `forbidden_sources` | The response explained that the transaction was removed yet still cited its removed ID as evidence. |
| R06 | Reconciled current state | `current_sources_only`, `forbidden_sources` | The same stale-source error appeared despite the current state containing no transactions. |

The R06 behavior is the useful result. A response can sound cautious and still attach provenance to a record that is no longer part of the current transaction state. The deterministic contract catches that mismatch before the response is surfaced.

## What this does not show

- It does not evaluate live bank-account data.
- It does not establish fraud or financial truth.
- It does not prove that deterministic reconciliation improves model performance; this one run did not show that.
- It does not replace repeated trials, more fixtures, or an evaluator audit before making a comparative claim.
