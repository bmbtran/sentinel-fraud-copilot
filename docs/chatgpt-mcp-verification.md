# ChatGPT connector verification

On November 13, 2026, the local MCP server was connected to ChatGPT through an OpenAI Secure MCP Tunnel and tested against replay case `R02`.

The test asked ChatGPT to list the cases, inspect `R02`, answer the coffee-shop question from the current replay state, and call `validate_financial_answer` before replying.

Observed result:

- ChatGPT cited `coffee-posted`.
- It did not cite the removed `coffee-pending` record.
- It included the `pending_replaced` limitation.
- The MCP validator returned a pass for all five checks.

This is a connector integration check, not a benchmark of ChatGPT or a claim about production financial-data accuracy.
