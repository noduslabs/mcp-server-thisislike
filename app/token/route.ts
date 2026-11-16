import { corsHeaders } from "@/lib/auth"
import { json, oauthError, readParams } from "@/lib/oauth"
import { open, pkceMatches, seal, TTL, type AccessPayload, type CodePayload } from "@/lib/tokens"
import { usernameForKey } from "@/lib/thisislike"

// OAuth token endpoint: authorization_code (with PKCE) and refresh_token grants
export async function POST(request: Request) {
  const p = await readParams(request)

  let clientId: string
  let apiKey: string
  let username: string

  if (p.grant_type === "authorization_code") {
    const code = open<CodePayload>(p.code, "code")
    if (!code) return oauthError("invalid_grant", "The authorization code is invalid or expired")
    if (p.client_id && p.client_id !== code.clientId) return oauthError("invalid_grant", "The code was issued to another client")
    if (p.redirect_uri && p.redirect_uri !== code.redirectUri) return oauthError("invalid_grant", "redirect_uri doesn't match")
    if (!p.code_verifier || !pkceMatches(p.code_verifier, code.codeChallenge)) {
      return oauthError("invalid_grant", "PKCE verification failed")
    }
    ;({ clientId, apiKey, username } = code)
  } else if (p.grant_type === "refresh_token") {
    const refresh = open<AccessPayload>(p.refresh_token, "refresh")
    if (!refresh) return oauthError("invalid_grant", "The refresh token is invalid or expired")
    if (p.client_id && p.client_id !== refresh.clientId) return oauthError("invalid_grant", "The token was issued to another client")
    // The key may have been revoked in InfraNodus since: check it again
    const current = await usernameForKey(refresh.apiKey)
    if (!current) return oauthError("invalid_grant", "InfraNodus no longer accepts this API key. Connect again.")
    ;({ clientId, apiKey } = refresh)
    username = current
  } else {
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token")
  }

  return json({
    access_token: seal({ typ: "access", clientId, apiKey, username }, TTL.access),
    token_type: "Bearer",
    expires_in: TTL.access,
    refresh_token: seal({ typ: "refresh", clientId, apiKey, username }, TTL.refresh),
    scope: "thisislike",
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
