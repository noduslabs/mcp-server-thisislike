import { baseUrl, corsHeaders } from "@/lib/auth"
import { SITE_URL } from "@/lib/thisislike"
import { json } from "@/lib/oauth"

// RFC 8414: authorization server metadata
export function GET(request: Request) {
  const base = baseUrl(request)
  return json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["thisislike"],
    service_documentation: `${SITE_URL}/mcp`,
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
