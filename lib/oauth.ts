// Shared helpers for the OAuth endpoints

import { corsHeaders } from "@/lib/auth"

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders, ...headers },
  })
}

export function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status)
}

// Form-encoded or JSON body as a flat string map
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") || ""
  try {
    if (type.includes("application/json")) {
      const body = await request.json()
      return Object.fromEntries(Object.entries(body || {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]))
    }
    const form = new URLSearchParams(await request.text())
    return Object.fromEntries(form.entries())
  } catch {
    return {}
  }
}

// Redirect URIs a client may register: https, http on the local machine, or an app's own scheme
// (cursor://, vscode://, claude://...). Never javascript:, data: and the like.
export function allowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri)
    if (url.hash) return false
    if (url.protocol === "https:") return true
    if (url.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && !["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"].includes(url.protocol)
  } catch {
    return false
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
