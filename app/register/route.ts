import { corsHeaders } from "@/lib/auth"
import { allowedRedirectUri, json, oauthError } from "@/lib/oauth"
import { seal } from "@/lib/tokens"

// RFC 7591 dynamic client registration. Stateless: the client_id is the sealed registration
// (its redirect URIs), so nothing is stored. Public clients only (PKCE, no client secret).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const redirectUris: unknown = body?.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
    return oauthError("invalid_redirect_uri", "redirect_uris must be a list of 1 to 10 URIs")
  }
  if (!redirectUris.every((u) => typeof u === "string" && allowedRedirectUri(u))) {
    return oauthError("invalid_redirect_uri", "redirect URIs must be https, http on localhost, or an app scheme")
  }
  const name = typeof body?.client_name === "string" ? body.client_name.slice(0, 100) : undefined
  const clientId = seal({ typ: "client", redirectUris: redirectUris as string[], name })
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
