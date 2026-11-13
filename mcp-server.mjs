import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createReplayMcpServer } from "./src/replay-mcp.js";

const port = Number(process.env.MCP_PORT ?? 8787);

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : undefined;
}

createServer(async (request, response) => {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
        JSON.stringify({ status: "ok", server: "plaid-agent-replay-lab" }),
    );
    return;
  }
  if (url.pathname !== "/mcp") {
    response.writeHead(404).end();
    return;
  }
  if (!["GET", "POST", "DELETE"].includes(request.method ?? "")) {
    response.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
    return;
  }
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createReplayMcpServer();
    await server.connect(transport);
    await transport.handleRequest(
      request,
      response,
      request.method === "POST" ? await readJson(request) : undefined,
    );
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid MCP request.",
      }),
    );
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Plaid Agent Replay Lab MCP listening on http://127.0.0.1:${port}/mcp`);
});
