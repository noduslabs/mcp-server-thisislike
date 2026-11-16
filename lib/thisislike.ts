// Calls to the ThisIsLike public API (https://www.thisislike.app/developers) with the user's key.

export const API_URL = (process.env.THISISLIKE_API_URL || "https://www.thisislike.app/api/v1").replace(/\/$/, "")
export const SITE_URL = API_URL.replace(/\/api\/v1$/, "")

export interface ApiResponse {
  ok: boolean
  status: number
  data: any
}

export async function api(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  apiKey: string | null,
  body?: unknown,
): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "thisislike-mcp/1.0",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, data }
}

// Query string from defined values only
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : ""
}

// Who an InfraNodus API key belongs to (via ThisIsLike), cached for 5 minutes per instance
const verified = new Map<string, { username: string | null; expires: number }>()

export async function usernameForKey(apiKey: string): Promise<string | null> {
  const { createHash } = await import("node:crypto")
  const cacheKey = createHash("sha256").update(apiKey).digest("hex")
  const hit = verified.get(cacheKey)
  if (hit && hit.expires > Date.now()) return hit.username
  try {
    const { ok, data } = await api("GET", "/me", apiKey)
    const username = ok && typeof data?.username === "string" ? data.username : null
    verified.set(cacheKey, { username, expires: Date.now() + 5 * 60 * 1000 })
    return username
  } catch {
    return null // network problem: don't cache
  }
}
