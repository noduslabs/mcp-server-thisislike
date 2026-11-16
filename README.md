# ThisIsLike MCP server

Use [ThisIsLike](https://www.thisislike.app) from Claude, ChatGPT, Cursor and any other MCP client: find things that are like each other, save them to your InfraNodus graphs, publish and curate saved searches.

Every tool calls the [ThisIsLike public API](https://www.thisislike.app/developers) with the user's InfraNodus API key, so the API's permissions apply: you can change only your own saved searches.

- MCP endpoint: `https://<deployment>/mcp` (Streamable HTTP, stateless)
- Docs for users: https://www.thisislike.app/mcp

## Connecting

The server needs the user's **InfraNodus API key** (from https://infranodus.com/api-access). Two ways:

**1. As a header** (Claude Code, Cursor, VS Code, Windsurf, any client with custom headers)

```bash
claude mcp add --transport http thisislike https://<deployment>/mcp \
  --header "Authorization: Bearer YOUR_INFRANODUS_API_KEY"
```

```json
{
  "mcpServers": {
    "thisislike": {
      "url": "https://<deployment>/mcp",
      "headers": { "Authorization": "Bearer YOUR_INFRANODUS_API_KEY" }
    }
  }
}
```

**2. OAuth** (claude.ai and Claude Desktop custom connectors, ChatGPT connectors): add `https://<deployment>/mcp` as a connector. The app opens a sign-in page that asks for the InfraNodus API key.

## Tools

| Tool | What it does |
|---|---|
| `whoami` | The InfraNodus username of the connection |
| `list_graphs` | The user's InfraNodus graphs (where searches can be saved) |
| `find_similar` | Things like X, each with why (cached results instantly; new searches 10–40 s, 30/hour) |
| `list_saved_searches` | Saved searches: published, public, guides, mine, favorites; filters and paging |
| `get_saved_search` | A saved search with its results (live from the graph) and people's additions |
| `save_search` | Save a search (results become `[[query]] is like [[name]] because why` in a graph) |
| `update_saved_search` | Visibility, community listing, favorite, tags, graph, guide (moderators) |
| `delete_saved_search` | Delete a saved search (the graph keeps its statements) |
| `add_results` | Add results to a saved search |
| `remove_result` | Remove a result from a saved search (dry run available) |
| `list_contributions` / `add_contribution` / `delete_contribution` | "Add yours": results anyone can add to a query |
| `list_tags` | Tags with counts |
| `list_guides` | Curated guides by category |
| `set_guide_category_description` | Describe a guide category (moderators) |

## How authentication works

- `/mcp` accepts `Authorization: Bearer <token>` where the token is either an InfraNodus API key (checked with InfraNodus through ThisIsLike, cached 5 minutes) or an access token issued by this server's OAuth flow.
- OAuth 2.1 with PKCE (S256), dynamic client registration (RFC 7591), discovery at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. Unauthenticated requests get `401` with `WWW-Authenticate: Bearer resource_metadata="…"`.
- **Stateless:** client registrations, authorization codes (5 min), access tokens (7 days) and refresh tokens (1 year) are AES-256-GCM sealed payloads. The InfraNodus key travels inside them, encrypted with `MCP_TOKEN_SECRET`; nothing is stored. On refresh the key is checked with InfraNodus again, so a revoked key stops working. Rotating `MCP_TOKEN_SECRET` signs everyone out.

## Deploy on Vercel

1. Import this folder as a Vercel project (framework: Next.js, no settings needed).
2. Environment variables:
   - `MCP_TOKEN_SECRET`: a random string of 32+ characters (`openssl rand -base64 48`)
   - `THISISLIKE_API_URL` (optional): default `https://www.thisislike.app/api/v1`
   - `MCP_PUBLIC_URL` (optional): the public base URL, if it differs from the request host (e.g. behind another proxy)
3. Deploy. The MCP endpoint is `https://<project>.vercel.app/mcp` (or your domain).

`/mcp` allows up to 60 s per request (`maxDuration`), enough for a new search.

It also runs anywhere Next.js runs (`pnpm build && pnpm start`), e.g. on Fly.io.

## Develop and test

```bash
pnpm install
cp .env.example .env.local   # set MCP_TOKEN_SECRET
pnpm dev                      # http://localhost:3020

# end-to-end test: every tool, the write cycle and the OAuth flow (41 checks)
INFRANODUS_API_KEY=... TEST_GRAPH=a_throwaway_graph pnpm test http://localhost:3020
```

The test writes a saved search to `TEST_GRAPH` (it makes that graph public and private again) and deletes it at the end; the statements it wrote stay in the graph.
