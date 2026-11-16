import { baseUrl, corsHeaders } from "@/lib/auth"
import { SITE_URL } from "@/lib/thisislike"
import { json } from "@/lib/oauth"

// RFC 9728: the MCP endpoint is protected; this server is its own authorization server
export function GET(request: Request) {
  const base = baseUrl(request)
  return json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["thisislike"],
    resource_name: "ThisIsLike",
    resource_documentation: `${SITE_URL}/mcp`,
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
