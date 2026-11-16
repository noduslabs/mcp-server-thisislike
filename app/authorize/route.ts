// OAuth authorization: a sign-in page that asks for the user's InfraNodus API key. The key is
// checked with InfraNodus (through ThisIsLike), then sealed into a 5-minute authorization code.

import { escapeHtml, readParams } from "@/lib/oauth"
import { open, seal, TTL, type ClientPayload } from "@/lib/tokens"
import { SITE_URL, usernameForKey } from "@/lib/thisislike"

interface AuthRequest {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scope: string
  clientName: string
}

// Validate the request. Errors about the client or redirect URI are shown on the page (never
// redirected to an unverified URI); other errors are sent back to the client.
function validate(p: Record<string, string>): { ok: AuthRequest } | { page: string } | { redirect: string } {
  const client = open<ClientPayload>(p.client_id, "client")
  if (!client) return { page: "This app's registration is not valid. Remove the ThisIsLike connector and add it again." }
  const redirectUri = p.redirect_uri || (client.redirectUris.length === 1 ? client.redirectUris[0] : "")
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) return { page: "The redirect address doesn't match the app's registration." }

  const back = (error: string, description: string) => {
    const url = new URL(redirectUri)
    url.searchParams.set("error", error)
    url.searchParams.set("error_description", description)
    if (p.state) url.searchParams.set("state", p.state)
    return { redirect: url.toString() }
  }
  if ((p.response_type || "code") !== "code") return back("unsupported_response_type", "Only response_type=code is supported")
  if (!p.code_challenge) return back("invalid_request", "PKCE code_challenge is required")
  if ((p.code_challenge_method || "S256") !== "S256") return back("invalid_request", "Only code_challenge_method=S256 is supported")

  return {
    ok: {
      clientId: p.client_id,
      redirectUri,
      state: p.state || "",
      codeChallenge: p.code_challenge,
      scope: p.scope || "thisislike",
      clientName: client.name || "An app",
    },
  }
}

function page(content: string, status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to ThisIsLike</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#666; --line:#ddd; --field:#f6f6f6; --accent:#111; --accent-fg:#fff; --err:#b00020 }
  @media (prefers-color-scheme: dark) { :root { --bg:#000; --fg:#f2f2f2; --muted:#999; --line:#333; --field:#111; --accent:#f2f2f2; --accent-fg:#000; --err:#ff6b6b } }
  * { box-sizing: border-box }
  body { margin:0; background:var(--bg); color:var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 440px; margin: 0 auto; padding: 48px 16px }
  h1 { font-weight: 300; font-size: 22px; margin: 0 0 4px; text-transform: lowercase }
  .logo { font-size: 28px; letter-spacing: -0.5px; margin-bottom: 32px } .logo b { color:#1a8fc4; font-weight: 400 }
  p { color: var(--muted); margin: 8px 0 }
  label { display:block; margin: 24px 0 6px; font-size: 13px }
  input[type=password] { width:100%; padding: 10px 12px; border:1px solid var(--line); background:var(--field); color:var(--fg); border-radius: 4px; font: inherit }
  .row { display:flex; gap: 12px; margin-top: 20px }
  button { flex:1; padding: 10px; border-radius: 4px; border:1px solid var(--line); background: transparent; color: var(--fg); font: inherit; cursor: pointer }
  button.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent) }
  .error { color: var(--err); margin-top: 12px }
  a { color: inherit }
  ul { color: var(--muted); padding-left: 18px; font-size: 13px }
</style></head><body><main>
<div class="logo">this<b>is</b>like</div>
${content}
</main></body></html>`
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" },
  })
}

function form(req: AuthRequest, error?: string) {
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`
  return page(`
<h1>connect ${escapeHtml(req.clientName)}</h1>
<p><strong>${escapeHtml(req.clientName)}</strong> wants to use ThisIsLike for you: find similar things, and read and change your saved searches and the InfraNodus graphs they are saved in.</p>
<form method="post" action="/authorize">
  ${hidden("client_id", req.clientId)}${hidden("redirect_uri", req.redirectUri)}${hidden("state", req.state)}
  ${hidden("code_challenge", req.codeChallenge)}${hidden("code_challenge_method", "S256")}${hidden("scope", req.scope)}${hidden("response_type", "code")}
  <label for="api_key">Your InfraNodus API key</label>
  <input id="api_key" name="api_key" type="password" autocomplete="off" required autofocus placeholder="paste your key">
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <p>Get it at <a href="https://infranodus.com/api-access" target="_blank" rel="noopener">infranodus.com/api-access</a>. It's the same key you use in ThisIsLike's settings.</p>
  <div class="row">
    <button type="submit" name="action" value="deny">cancel</button>
    <button type="submit" name="action" value="allow" class="primary">connect</button>
  </div>
</form>
<ul>
  <li>The key is checked with InfraNodus, then kept only inside the encrypted token given to ${escapeHtml(req.clientName)}. ThisIsLike doesn't store it.</li>
  <li>To disconnect, remove the connector in the app, or create a new InfraNodus API key.</li>
  <li><a href="${SITE_URL}/mcp" target="_blank" rel="noopener">About the ThisIsLike MCP server</a></li>
</ul>`)
}

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const v = validate(params)
  if ("page" in v) return page(`<h1>can't connect</h1><p class="error">${escapeHtml(v.page)}</p>`, 400)
  if ("redirect" in v) return Response.redirect(v.redirect, 302)
  return form(v.ok)
}

export async function POST(request: Request) {
  const params = await readParams(request)
  const v = validate(params)
  if ("page" in v) return page(`<h1>can't connect</h1><p class="error">${escapeHtml(v.page)}</p>`, 400)
  if ("redirect" in v) return Response.redirect(v.redirect, 302)
  const req = v.ok

  const back = new URL(req.redirectUri)
  if (req.state) back.searchParams.set("state", req.state)

  if (params.action === "deny") {
    back.searchParams.set("error", "access_denied")
    back.searchParams.set("error_description", "The user cancelled")
    return Response.redirect(back.toString(), 302)
  }

  const apiKey = (params.api_key || "").trim()
  if (!apiKey) return form(req, "Paste your InfraNodus API key.")
  const username = await usernameForKey(apiKey)
  if (!username) return form(req, "InfraNodus didn't accept this key. Check it at infranodus.com/api-access.")

  const code = seal(
    { typ: "code", clientId: req.clientId, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge, apiKey, username, scope: req.scope },
    TTL.code,
  )
  back.searchParams.set("code", code)
  return Response.redirect(back.toString(), 302)
}
