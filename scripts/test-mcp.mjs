// End-to-end test of the ThisIsLike MCP server.
//   INFRANODUS_API_KEY=... TEST_GRAPH=zzz_delete_test node scripts/test-mcp.mjs http://localhost:3020
// Uses the official MCP client. Writes a saved search "zzz mcp test" to TEST_GRAPH (a throwaway
// graph: the test makes it public and private) and deletes the saved search at the end.

import crypto from "node:crypto"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const BASE = (process.argv[2] || "http://localhost:3020").replace(/\/$/, "")
const KEY = process.env.INFRANODUS_API_KEY || process.env.INFRANODUS_DEFAULT_API_KEY
const GRAPH = process.env.TEST_GRAPH || "zzz_delete_test"
const Q = "zzz mcp test"
let passed = 0, failed = 0
const check = (name, cond, info = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`) } else { failed++; console.log(`  FAIL ${name}  ${String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300)}`) }
}

async function connect(token) {
  const client = new Client({ name: "thisislike-mcp-test", version: "1.0.0" })
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} } })
  await client.connect(transport)
  return client
}
const data = (r) => { try { const t = r.content[0].text; return JSON.parse(t.includes("\n\n{") ? t.slice(t.indexOf("\n\n{") + 2) : t) } catch { return null } }

console.log("discovery and access")
let r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })
check("no auth -> 401 with resource_metadata", r.status === 401 && /resource_metadata=".*oauth-protected-resource"/.test(r.headers.get("www-authenticate") || ""), r.status)
r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: "Bearer nope", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" })
check("bad key -> 401", r.status === 401, r.status)
const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource`)).json()
check("protected resource metadata", prm.resource === `${BASE}/mcp` && prm.authorization_servers?.[0] === BASE, prm)
const prm2 = await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)
check("path-suffixed discovery works too", prm2.status === 200, prm2.status)
const asm = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json()
check("authorization server metadata (S256, registration)", asm.code_challenge_methods_supported?.includes("S256") && asm.registration_endpoint === `${BASE}/register`, asm)

console.log("tools (with the InfraNodus key as Bearer)")
const client = await connect(KEY)
const info = client.getServerVersion(); const instr = client.getInstructions()
check("initialize: server info + instructions", info?.name === "thisislike" && instr?.includes("find_similar"), info)
const { tools } = await client.listTools()
check(`tools/list: 16 tools`, tools.length === 16, tools.map((t) => t.name))
check("every tool has a description and annotations", tools.every((t) => (t.description || "").length > 40 && t.annotations), tools.filter((t) => !t.annotations).map((t) => t.name))
const call = (name, args = {}) => client.callTool({ name, arguments: args })

let res = await call("whoami"); const me = data(res)
check("whoami", me?.username, res)
res = await call("list_graphs"); check("list_graphs includes the test graph", data(res)?.graphs?.includes(GRAPH), res)
res = await call("find_similar", { query: "Vladimir Nabokov" }); let d = data(res)
check("find_similar (cached) with a summary line", d?.results?.length > 0 && res.content[0].text.startsWith(`${d.results.length} things like`), res)
res = await call("find_similar", { query: "" }); check("invalid arguments -> error", res.isError === true, res)
res = await call("list_saved_searches", { scope: "published", limit: 3 }); d = data(res); check("list_saved_searches published", d?.searches?.length > 0, res)
const publicId = d?.searches?.[0]?.id
res = await call("get_saved_search", { id: publicId }); check("get_saved_search (public) with results", Array.isArray(data(res)?.results), res)
res = await call("list_guides"); check("list_guides", Array.isArray(data(res)?.categories), res)
res = await call("list_tags"); check("list_tags", Array.isArray(data(res)?.tags), res)

console.log("write cycle")
res = await call("save_search", { query: Q, graphName: GRAPH, results: [{ name: "zzz mcp one", why: "first" }, { name: "zzz mcp two", why: "second", tags: ["test"] }], tags: ["testing"] })
d = data(res); const id = d?.search?.id
check("save_search -> 2 results, private", d?.search?.resultCount === 2 && d.search.isPublic === false && res.content[0].text.startsWith("Saved"), res)
res = await call("update_saved_search", { id, isFavorite: true, tags: ["testing", "mcp"] }); check("update_saved_search", data(res)?.search?.isFavorite && data(res).search.tags.includes("mcp"), res)
res = await call("add_results", { id, results: [{ name: "zzz mcp three", why: "third" }] }); check("add_results -> 3", data(res)?.search?.resultCount === 3, res)
res = await call("remove_result", { id, name: "zzz mcp three", dryRun: true }); check("remove_result dry run", data(res)?.toRemove === 1, res)
res = await call("remove_result", { id, name: "zzz mcp three" }); check("remove_result -> 2", data(res)?.removed === 1 && data(res)?.search?.resultCount === 2, res)
res = await call("get_saved_search", { id }); check("get_saved_search (own private) reads the graph", data(res)?.results?.length === 2, res)
res = await call("add_contribution", { query: Q, name: "zzz mcp added", why: "contributed via MCP" }); const cid = data(res)?.contribution?.id
check("add_contribution credited to the user", data(res)?.contribution?.author === me.username, res)
res = await call("list_contributions", { query: Q }); check("list_contributions", data(res)?.contributions?.length === 1, res)
res = await call("delete_contribution", { id: cid, query: Q }); check("delete_contribution", data(res)?.deleted, res)
res = await call("delete_saved_search", { id }); check("delete_saved_search", data(res)?.deleted, res)
res = await call("get_saved_search", { id }); check("deleted -> error 404 as a tool error", res.isError && /404/.test(res.content[0].text), res)
await client.close()

console.log("oauth")
const reg = await fetch(`${BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Test App", redirect_uris: ["http://localhost:9999/callback"] }) })
const regData = await reg.json(); check("register -> 201 client_id", reg.status === 201 && regData.client_id?.startsWith("til1."), regData)
const bad = await fetch(`${BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["javascript:alert(1)"] }) })
check("register refuses javascript: redirect", bad.status === 400, bad.status)
const verifier = crypto.randomBytes(32).toString("base64url"); const challenge = crypto.createHash("sha256").update(verifier).digest("base64url")
const authParams = new URLSearchParams({ response_type: "code", client_id: regData.client_id, redirect_uri: "http://localhost:9999/callback", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope: "thisislike" })
let page = await fetch(`${BASE}/authorize?${authParams}`); let html = await page.text()
check("authorize page asks for the InfraNodus key", page.status === 200 && html.includes('name="api_key"') && html.includes("Test App"), page.status)
page = await fetch(`${BASE}/authorize?${new URLSearchParams({ ...Object.fromEntries(authParams), redirect_uri: "https://evil.example/cb" })}`)
check("unregistered redirect_uri -> error page, no redirect", page.status === 400, page.status)
page = await fetch(`${BASE}/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...Object.fromEntries(authParams), api_key: "wrong", action: "allow" }) })
html = await page.text(); check("wrong key -> form with error", page.status === 200 && html.includes("accept this key"), page.status)
page = await fetch(`${BASE}/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...Object.fromEntries(authParams), action: "deny" }) })
check("cancel -> redirect with access_denied", page.status === 302 && page.headers.get("location").includes("error=access_denied") && page.headers.get("location").includes("state=xyz"), page.headers.get("location"))
page = await fetch(`${BASE}/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...Object.fromEntries(authParams), api_key: KEY, action: "allow" }) })
const loc = new URL(page.headers.get("location") || "http://x"); const code = loc.searchParams.get("code")
check("right key -> redirect with code and state", page.status === 302 && code && loc.searchParams.get("state") === "xyz", page.headers.get("location"))
const tok = (body) => fetch(`${BASE}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) })
r = await tok({ grant_type: "authorization_code", code, code_verifier: "wrong-verifier", client_id: regData.client_id, redirect_uri: "http://localhost:9999/callback" })
check("token with wrong PKCE verifier -> invalid_grant", r.status === 400 && (await r.json()).error === "invalid_grant", r.status)
r = await tok({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: regData.client_id, redirect_uri: "http://localhost:9999/callback" })
const tokens = await r.json(); check("token exchange", r.status === 200 && tokens.access_token?.startsWith("til1.") && tokens.refresh_token, tokens)
check("the access token doesn't contain the key in clear", !tokens.access_token.includes(KEY.slice(0, 12)))
const oc = await connect(tokens.access_token); res = await oc.callTool({ name: "whoami", arguments: {} }); check("MCP with the OAuth access token", data(res)?.username === me.username, res); await oc.close()
r = await tok({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: regData.client_id }); const t2 = await r.json()
check("refresh token -> new access token", r.status === 200 && t2.access_token && t2.access_token !== tokens.access_token, t2)
r = await tok({ grant_type: "refresh_token", refresh_token: tokens.access_token }); check("access token can't be used as refresh token", r.status === 400)
r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${tokens.refresh_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" })
check("refresh token can't be used for MCP", r.status === 401, r.status)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
