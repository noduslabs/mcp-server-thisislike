import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerTools } from "@/lib/tools"
import { SITE_URL } from "@/lib/thisislike"

export const SERVER_INFO = { name: "thisislike", title: "ThisIsLike", version: "1.0.0" }

export const INSTRUCTIONS = `ThisIsLike (${SITE_URL}) finds things that are like each other (places, books, authors, apps, music, films, ideas), each with why it is similar, and saves them as a knowledge graph in the user's InfraNodus account.

How to use the tools:
- find_similar(query) to find things like something. Queries can carry context: "Berghain in Tokyo", "Barack Obama in literature". Show the user the results with the "why" for each.
- To keep results: save_search(query, results, graphName). Each result becomes the statement "[[query]] is like [[name]] because why" in that InfraNodus graph. Use list_graphs to pick a graph; the default is thisislike_search.
- Saved searches are private by default. Setting isPublic also makes the whole InfraNodus graph public, and isPublished lists the search in the community: ask the user before either.
- Browse: list_saved_searches (scope published, public, guides, mine, favorites), get_saved_search(id), list_guides, list_tags.
- Edit the user's own searches: update_saved_search, add_results, remove_result (dryRun first), delete_saved_search (confirm first).
- add_contribution adds a result to any query for everyone (shown on the website), credited to the user. First check find_items for an existing item with that name and, if one fits, add it under its exact name so it links to the same item. It goes to the community graph thisislike_public; moderators can pick another thisislike graph (list_contribution_graphs), e.g. the graph the saved search is in.
- Every saved search and search has a page on ThisIsLike (the url field): share it with the user.
The connection is authenticated with the user's InfraNodus API key; they can only change their own saved searches.`

export function createServer(apiKey: string) {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  registerTools(server, apiKey)
  return server
}
