# Benchmark protocol

## Question

Does a model produce a contract-valid financial answer more often when it receives raw Transactions Sync-style deltas, or a deterministic reconciliation of those same deltas?

## Conditions

`raw_sync` gives the model the question, account/date coverage, and every `added`, `modified`, and `removed` batch. The model must reconstruct the final state.

`reconciled_state` gives the same question and coverage plus the current transaction state and a cursor trace produced by the reducer. It does not include the fixture contract, expected conclusion, or required limitations.

## Scoring

The model returns structured JSON with a conclusion, cited transaction IDs, and limitations. After generation, the validator checks current sources, required sources, forbidden stale sources, required limitations, fixture-specific overclaims, and bounded claim terms. Structured output makes response shape reliable; it does not replace domain validation.

The report records every raw answer and check result. It reports pass rate by condition, not a hand-picked example. A difference is descriptive for this small synthetic suite, not a claim of general model performance.

## Rules for reporting

- Name the exact model and run timestamp.
- Publish the case count and both condition pass rates.
- Include failed cases or link to the saved JSON report.
- Do not describe a result as fraud detection, live-bank validation, or an OpenAI benchmark.
- Rerun after changing fixtures, prompts, reducer behavior, or the validator. If saved answers are rescored after an evaluator fix, label them exploratory and do not use them for a comparative claim.
