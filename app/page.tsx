import { headers } from "next/headers"
import { SITE_URL } from "@/lib/thisislike"

export default async function Home() {
  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3020"
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")
  const url = `${process.env.MCP_PUBLIC_URL?.replace(/\/$/, "") || `${proto}://${host}`}/mcp`
  const code = { background: "rgba(127,127,127,.12)", padding: "12px", borderRadius: 4, overflowX: "auto" as const, fontSize: 13 }

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontWeight: 300 }}>ThisIsLike MCP server</h1>
      <p>
        Use <a href={SITE_URL}>ThisIsLike</a> from Claude, ChatGPT, Cursor and other AI apps: find things that are like each other,
        save them to your InfraNodus graphs, publish and curate saved searches.
      </p>
      <p>
        Server URL: <code>{url}</code>
      </p>
      <p>Sign in with your InfraNodus API key (from infranodus.com/api-access), either through the app's sign-in page or as a header:</p>
      <pre style={code}>{`claude mcp add --transport http thisislike ${url} \\
  --header "Authorization: Bearer YOUR_INFRANODUS_API_KEY"`}</pre>
      <p>
        Full instructions and the list of tools: <a href={`${SITE_URL}/mcp`}>{`${SITE_URL.replace(/^https?:\/\//, "")}/mcp`}</a>
      </p>
    </main>
  )
}
