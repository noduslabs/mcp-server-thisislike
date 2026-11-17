// The MCP tools: one per ThisIsLike API endpoint (https://www.thisislike.app/developers).
// Every call is made with the connected user's InfraNodus API key, so the API's permissions apply:
// you can change only your own saved searches; moderators can curate guides.

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { api, qs, type ApiResponse } from "@/lib/thisislike"

const resultSchema = z.object({
  name: z.string().min(1).max(100).describe('What it is like, e.g. "Kefalonia".'),
  why: z.string().min(1).max(500).describe("Why it is like the search, in one sentence."),
  description: z.string().max(500).optional().describe("What it is, briefly."),
  url: z.string().max(500).optional().describe("A link about it (Wikipedia, official site)."),
  tags: z.array(z.string()).max(5).optional().describe("Up to 5 lowercase tags, e.g. [\"island\", \"greece\"]."),
})

function reply(res: ApiResponse, summary?: (data: any) => string): CallToolResult {
  if (!res.ok) {
    const err = res.data?.error
    const message = typeof err === "object" ? `${err.code}: ${err.message}` : String(err || `HTTP ${res.status}`)
    return { isError: true, content: [{ type: "text", text: `ThisIsLike API error (${res.status}) ${message}` }] }
  }
  const text = JSON.stringify(res.data, null, 2)
  return { content: [{ type: "text", text: summary ? `${summary(res.data)}\n\n${text}` : text }] }
}

const enc = encodeURIComponent

export function registerTools(server: McpServer, apiKey: string) {
  const call = (method: Parameters<typeof api>[0], path: string, body?: unknown) => api(method, path, apiKey, body)

  // --- Account ---

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Returns the InfraNodus username the connection is authenticated as, and whether it is a ThisIsLike moderator.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => reply(await call("GET", "/me")),
  )

  server.registerTool(
    "list_graphs",
    {
      title: "List my InfraNodus graphs",
      description:
        "Lists the graphs in the user's InfraNodus account: the places where searches can be saved. Use it before save_search to pick a graphName. If no graph is given when saving, thisislike_search is used.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => reply(await call("GET", "/graphs")),
  )

  // --- Search ---

  server.registerTool(
    "find_similar",
    {
      title: "Find things that are like something",
      description:
        'Finds things that are like the query (a place, book, author, app, band, film, idea, product...), each with why it is similar, a short description, a link and tags. Queries can add context, e.g. "Berghain in Tokyo" or "Barack Obama in literature". Results searched by anyone in the last 30 days come from the cache instantly; a new search takes 10-40 seconds and is limited to 30 per hour per user. Searching saves nothing: use save_search to keep results.',
      inputSchema: {
        query: z.string().min(1).max(200).describe('What to find similar things to, e.g. "Corfu", "Vladimir Nabokov", "Obsidian app".'),
        fresh: z.boolean().optional().describe("true to skip the cache and run a new search (only when the user asks for new results)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, fresh }) =>
      reply(await call("POST", "/search", { query, fresh }), (d) => `${d.results?.length ?? 0} things like "${d.query}"${d.cached ? " (cached)" : ""}. Page: ${d.url}`),
  )

  // --- Saved searches ---

  server.registerTool(
    "list_saved_searches",
    {
      title: "List saved searches",
      description:
        'Lists saved searches, newest first. scope: "published" = the community list (default), "public" = all public ones, "guides" = curated guides, "mine" = the user\'s own including private ones, "favorites" = the user\'s favorites. Filter by username, tag, visibility (mine only), or text in the query. Returns ids for get_saved_search.',
      inputSchema: {
        scope: z.enum(["published", "public", "guides", "mine", "favorites"]).optional().describe("Which list. Default: published."),
        username: z.string().optional().describe("Only this InfraNodus user's searches."),
        tag: z.string().optional().describe("Only searches with this tag."),
        visibility: z.enum(["public", "private"]).optional().describe("With scope mine: only public or only private ones."),
        q: z.string().optional().describe("Only searches whose query contains this text."),
        limit: z.number().int().min(1).max(200).optional().describe("How many (default 50)."),
        offset: z.number().int().min(0).optional().describe("Skip this many, for paging."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => reply(await call("GET", `/searches${qs(args)}`), (d) => `${d.total} saved searches (showing ${d.searches?.length ?? 0}).`),
  )

  server.registerTool(
    "get_saved_search",
    {
      title: "Get a saved search with its results",
      description:
        "A saved search by id: its details, its results read live from the owner's InfraNodus graph, and results other people added to the same query (contributions). Public searches are readable by anyone; private ones only by their owner.",
      inputSchema: {
        id: z.string().min(1).describe("The search id (from list_saved_searches or save_search)."),
        graph: z.string().optional().describe("Owner only: read the results from another of their graphs."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, graph }) => reply(await call("GET", `/searches/${enc(id)}${qs({ graph })}`)),
  )

  server.registerTool(
    "save_search",
    {
      title: "Save a search to an InfraNodus graph",
      description:
        'Saves a search to one of the user\'s InfraNodus graphs. Each result is written to the graph as "[[query]] is like [[name]] because why". Typical flow: find_similar, keep the results the user wants, then save_search with them. Saving the same query again updates the saved search. Without results it points the search at what is already in the graph for that query. New searches are private unless isPublic is true; isPublic also makes the whole graph public in InfraNodus, so ask the user before setting it.',
      inputSchema: {
        query: z.string().min(1).max(200).describe('The search, e.g. "Corfu".'),
        results: z.array(resultSchema).max(100).optional().describe("The results to save (e.g. from find_similar)."),
        graphName: z.string().optional().describe("The user's graph to save to (see list_graphs). Default: thisislike_search."),
        tags: z.array(z.string()).max(5).optional().describe("Up to 5 tags for the search. Default: suggested from the results."),
        isPublic: z.boolean().optional().describe("Visible to everyone (also makes the graph public). Default false."),
        isPublished: z.boolean().optional().describe("Listed in the community searches (needs isPublic)."),
        isFavorite: z.boolean().optional().describe("Add to the user's favorites."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => reply(await call("POST", "/searches", args), (d) => `Saved "${d.search?.query}" (${d.search?.resultCount} results) in ${d.search?.graphName}. Page: ${d.search?.url}`),
  )

  server.registerTool(
    "update_saved_search",
    {
      title: "Change a saved search",
      description:
        "Changes a saved search: visibility (isPublic, also changes the graph's privacy in InfraNodus), community listing (isPublished, needs public), favorite, tags (replaces them), the graph it shows, or guide status (moderators only). Owners can change everything except isGuide; moderators can change tags, graphName and isGuide on anyone's search. Making a search private also unpublishes it.",
      inputSchema: {
        id: z.string().min(1).describe("The search id."),
        isPublic: z.boolean().optional(),
        isPublished: z.boolean().optional(),
        isFavorite: z.boolean().optional(),
        tags: z.array(z.string()).max(5).optional().describe("The new tags (replaces the old ones)."),
        graphName: z.string().optional().describe("Which of the owner's graphs the search shows."),
        isGuide: z.boolean().optional().describe("Moderators: promote to (or remove from) the guides."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, ...patch }) => reply(await call("PATCH", `/searches/${enc(id)}`, patch)),
  )

  server.registerTool(
    "delete_saved_search",
    {
      title: "Delete a saved search",
      description:
        "Deletes the user's saved search from ThisIsLike (and from the community list, guides and favorites). The statements stay in the InfraNodus graph; use remove_result first to delete those too. Cannot be undone: confirm with the user.",
      inputSchema: { id: z.string().min(1).describe("The search id.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => reply(await call("DELETE", `/searches/${enc(id)}`)),
  )

  server.registerTool(
    "add_results",
    {
      title: "Add results to a saved search",
      description: 'Adds results to the user\'s saved search: each is written to its InfraNodus graph as "[[query]] is like [[name]] because why".',
      inputSchema: {
        id: z.string().min(1).describe("The search id."),
        results: z.array(resultSchema).min(1).max(100).describe("The results to add."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ id, results }) => reply(await call("POST", `/searches/${enc(id)}/results`, { results })),
  )

  server.registerTool(
    "remove_result",
    {
      title: "Remove a result from a saved search",
      description:
        'Removes a result from the user\'s saved search by deleting the statements ThisIsLike wrote for that pair ("[[query]] is like [[name]]", either direction) from their InfraNodus graph. Other notes that mention both are kept (keptNotes) and the result stays while they exist. Use dryRun first to show the user what will be deleted.',
      inputSchema: {
        id: z.string().min(1).describe("The search id."),
        name: z.string().min(1).describe("The result's name exactly as shown."),
        dryRun: z.boolean().optional().describe("true: only report what would be deleted."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, name, dryRun }) => reply(await call("DELETE", `/searches/${enc(id)}/results/${enc(name)}${qs({ dryRun: dryRun ? "true" : undefined })}`)),
  )

  // --- Add yours ---

  server.registerTool(
    "list_contributions",
    {
      title: "Results people added to a search",
      description: 'Results people added by hand to a query ("add yours"), shown with that query\'s results on the website. Newest first.',
      inputSchema: { query: z.string().min(1).describe("The search, e.g. \"Corfu\" (case doesn't matter).") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => reply(await call("GET", `/contributions${qs({ query })}`)),
  )

  server.registerTool(
    "add_contribution",
    {
      title: "Add a result to any search",
      description:
        'Adds a result to a query for everyone ("add yours"): it appears with that query\'s results on ThisIsLike, credited to the user, and is written to a thisislike graph (the community graph thisislike_public unless a moderator picks another with `graph`). Unlike save_search it does not touch the user\'s own graphs. If the name matches an existing item (find_items), that item is added under its exact name, with its description, link and tags where none are given. 10 per hour per user; the same name can\'t be added twice to a query.',
      inputSchema: {
        query: z.string().min(1).max(200).describe("The search to add to."),
        name: z.string().min(1).max(100).describe("What is like it."),
        why: z.string().min(1).max(300).describe("Why it is like it."),
        description: z.string().max(500).optional(),
        url: z.string().max(500).optional().describe("A link (http or https)."),
        tags: z.array(z.string()).max(5).optional(),
        graph: z
          .string()
          .max(100)
          .optional()
          .describe("The thisislike graph to write it to (default thisislike_public). Other graphs: moderators only, see list_contribution_graphs."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => reply(await call("POST", "/contributions", args)),
  )

  server.registerTool(
    "list_contribution_graphs",
    {
      title: "Graphs an added result can go to",
      description:
        "The thisislike graphs add_contribution can write to: for moderators every graph of the thisislike account (canChoose: true), for everyone else only the community graph.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => reply(await call("GET", "/contributions/graphs")),
  )

  server.registerTool(
    "find_items",
    {
      title: "Find existing items",
      description:
        'Items ThisIsLike already knows whose name matches (case, spaces, dashes and underscores ignored), with their description, link and tags. Use before add_contribution: adding an existing item under its exact name links to the same item, e.g. "eh tw71" finds "Epson EH-TW7100".',
      inputSchema: {
        q: z.string().min(2).describe("Part of the name."),
        exclude: z.string().optional().describe("A name to leave out, e.g. the search itself."),
        limit: z.number().int().min(1).max(20).optional().describe("Default 8."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ q, exclude, limit }) => reply(await call("GET", `/items${qs({ q, exclude, limit })}`)),
  )

  server.registerTool(
    "delete_contribution",
    {
      title: "Remove an added result",
      description: "Removes an added result (and its statement in the graph it was written to). Only its author or a moderator can.",
      inputSchema: {
        id: z.string().min(1).describe("The contribution id (from list_contributions or get_saved_search)."),
        query: z.string().min(1).describe("The search it was added to."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, query }) => reply(await call("DELETE", `/contributions/${enc(id)}${qs({ query })}`)),
  )

  // --- Tags and guides ---

  server.registerTool(
    "list_tags",
    {
      title: "Tags with counts",
      description: 'Tags and how many searches have them, most used first: in the community list ("published") or in the user\'s own searches ("mine").',
      inputSchema: { scope: z.enum(["published", "mine"]).optional().describe("Default: published.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ scope }) => reply(await call("GET", `/tags${qs({ scope })}`)),
  )

  server.registerTool(
    "list_guides",
    {
      title: "Guides by category",
      description: "Curated guides: searches promoted by moderators, grouped by category (tag), with each category's description. The same as thisislike.app/guides.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => reply(await call("GET", "/guides")),
  )

  server.registerTool(
    "set_guide_category_description",
    {
      title: "Describe a guide category (moderators)",
      description: "Moderators only: sets the description shown for a category (tag) on the guides page. An empty description clears it.",
      inputSchema: {
        tag: z.string().min(1).describe("The category (tag)."),
        description: z.string().max(500).describe("The description (empty to clear)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tag, description }) => reply(await call("PUT", `/guides/categories/${enc(tag)}`, { description })),
  )
}
