import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "ThisIsLike MCP server",
  description: "Use ThisIsLike from Claude, ChatGPT, Cursor and other AI apps: find similar things and save them to your InfraNodus graphs.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", lineHeight: 1.55 }}>{children}</body>
    </html>
  )
}
