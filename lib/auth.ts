// Who is calling /mcp. Two ways to authenticate, both resolving to the user's InfraNodus API key:
//   1. Authorization: Bearer <InfraNodus API key>        (Claude Code, Cursor, VS Code, ...)
//   2. Authorization: Bearer <token from our OAuth flow>  (claude.ai, ChatGPT, ...: the sign-in
//      page asks for the InfraNodus API key and seals it into the token)

import { open, isSealed, type AccessPayload } from "@/lib/tokens"
import { usernameForKey } from "@/lib/thisislike"

export interface Caller {
  apiKey: string
  username: string
}

// The public base URL of this server, as the client sees it (works behind Vercel's proxy)
export function baseUrl(request: Request): string {
  const configured = process.env.MCP_PUBLIC_URL
  if (configured) return configured.replace(/\/$/, "")
  const url = new URL(request.url)
  const host = request.headers.get("x-forwarded-host") || url.host
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")
  return `${proto}://${host}`
}

function bearer(request: Request): string | null {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function authenticate(request: Request): Promise<Caller | null> {
  const token = bearer(request)
  if (!token) return null
  if (isSealed(token)) {
    const payload = open<AccessPayload>(token, "access")
    return payload ? { apiKey: payload.apiKey, username: payload.username } : null
  }
  // A raw InfraNodus API key: check it with InfraNodus (through ThisIsLike)
  const username = await usernameForKey(token)
  return username ? { apiKey: token, username } : null
}

// 401 that tells MCP clients where to start OAuth (RFC 9728)
export function unauthorized(request: Request, description: string) {
  const base = baseUrl(request)
  return new Response(
    JSON.stringify({
      error: "unauthorized",
      error_description: description,
      help: `Connect with your InfraNodus API key (Authorization: Bearer <key>) or sign in through OAuth. See ${base}`,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="ThisIsLike MCP", error="invalid_token", error_description="${description}", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
        ...corsHeaders,
      },
    },
  )
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
}
