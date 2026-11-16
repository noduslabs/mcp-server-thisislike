// The MCP endpoint (Streamable HTTP). Stateless: every request gets a fresh server bound to the
// caller's InfraNodus API key, so it runs on serverless platforms (Vercel) without sessions.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { authenticate, corsHeaders, unauthorized } from "@/lib/auth"
import { createServer } from "@/lib/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60 // a new find_similar search can take up to ~40 s

async function handle(request: Request): Promise<Response> {
  const caller = await authenticate(request)
  if (!caller) {
    return unauthorized(
      request,
      request.headers.get("authorization") ? "The InfraNodus API key or token was not accepted" : "Authentication required",
    )
  }

  const server = createServer(caller.apiKey)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true, // plain JSON responses (no SSE stream needed)
  })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(request, {
      authInfo: { token: caller.apiKey, clientId: caller.username, scopes: [], extra: { username: caller.username } },
    })
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
    return new Response(response.body, { status: response.status, headers })
  } finally {
    // the response body is fully buffered (enableJsonResponse), so it's safe to close
    void transport.close().catch(() => {})
    void server.close().catch(() => {})
  }
}

export const POST = handle
export const GET = handle
export const DELETE = handle

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
