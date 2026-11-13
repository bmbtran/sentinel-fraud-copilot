import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { replayCase, replayCases, validateFinancialAnswer } from "./replay-suite.js";

const caseIdSchema = z.string().regex(/^R\d{2}$/);
const limitationSchema = z.enum(["partial_period", "pending_replaced", "merchant_enriched", "refund_included", "needs_confirmation", "removed_transaction"]);
const toolResult = (payload) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload });
const toolError = (error) => ({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Unexpected replay error." }] });

export function createReplayMcpServer() {
  const server = new McpServer({
    name: "plaid-agent-replay-lab",
    version: "0.2.0",
    instructions: "Use these tools to inspect synthetic Plaid Transactions Sync replay cases. Before making a financial claim, check the active transaction IDs, coverage, and required limitations. The validation tool checks answer structure; it does not verify real bank data.",
  });
  server.registerTool("list_replay_cases", {
    description: "List the synthetic Plaid Transactions Sync cases used to test financial-agent behavior. Start here before inspecting one case.",
    inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false },
  }, () => toolResult({ cases: replayCases }));
  server.registerTool("get_replay_case", {
    description: "Return a synthetic replay case with its question, cursor steps, current transaction state, coverage, and answer contract. Use this before answering the case question.",
    inputSchema: { caseId: caseIdSchema }, annotations: { readOnlyHint: true, openWorldHint: false },
  }, ({ caseId }) => { try { return toolResult(replayCase(caseId)); } catch (error) { return toolError(error); } });
  server.registerTool("validate_financial_answer", {
    description: "Validate a proposed answer against a replay case. Include the current Plaid transaction IDs used as evidence and the required limitations. This does not make a real financial decision.",
    inputSchema: { caseId: caseIdSchema, conclusion: z.string().min(1).max(500), sourceTransactionIds: z.array(z.string().min(1)).max(12), limitations: z.array(limitationSchema).max(6) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, (input) => { try { return toolResult(validateFinancialAnswer(input)); } catch (error) { return toolError(error); } });
  return server;
}
