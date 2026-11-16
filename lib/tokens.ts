// Stateless, encrypted tokens (AES-256-GCM). Everything the OAuth flow needs to remember (the
// registered client, the authorization code, the access and refresh tokens) is sealed into the
// token itself, so the server needs no database and runs on serverless platforms like Vercel.
// The user's InfraNodus API key travels inside the codes and tokens, encrypted with MCP_TOKEN_SECRET.

import crypto from "node:crypto"

const PREFIX = "til1."

export type TokenType = "client" | "code" | "access" | "refresh"

export interface ClientPayload {
  typ: "client"
  redirectUris: string[]
  name?: string
}
export interface CodePayload {
  typ: "code"
  clientId: string
  redirectUri: string
  codeChallenge: string
  apiKey: string
  username: string
  scope?: string
}
export interface AccessPayload {
  typ: "access" | "refresh"
  clientId: string
  apiKey: string
  username: string
}
type Payload = ClientPayload | CodePayload | AccessPayload

function secretKey(): Buffer {
  const secret = process.env.MCP_TOKEN_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("MCP_TOKEN_SECRET is not set (any random string of 32+ characters)")
  }
  return crypto.createHash("sha256").update(secret).digest()
}

export function seal(payload: Payload, ttlSeconds?: number): string {
  const body = JSON.stringify({ ...payload, iat: Date.now(), exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined })
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")
}

// The payload, or null if the token is not ours, was tampered with, expired, or of another type
export function open<T extends Payload>(token: string | null | undefined, typ: T["typ"] | T["typ"][]): T | null {
  if (!token || !token.startsWith(PREFIX)) return null
  try {
    const raw = Buffer.from(token.slice(PREFIX.length), "base64url")
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv)
    decipher.setAuthTag(tag)
    const body = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"))
    const types = Array.isArray(typ) ? typ : [typ]
    if (!types.includes(body.typ)) return null
    if (body.exp && Date.now() > body.exp) return null
    return body as T
  } catch {
    return null
  }
}

export const isSealed = (token: string | null | undefined) => Boolean(token?.startsWith(PREFIX))

// PKCE S256: base64url(sha256(verifier)) must equal the challenge
export function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url")
  const a = Buffer.from(computed)
  const b = Buffer.from(challenge)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export const TTL = {
  code: 5 * 60, // 5 minutes
  access: 7 * 24 * 60 * 60, // 7 days
  refresh: 365 * 24 * 60 * 60, // 1 year
}
