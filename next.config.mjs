/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      // OAuth discovery (RFC 9728 and RFC 8414), including the path-suffixed forms clients try
      { source: "/.well-known/oauth-protected-resource", destination: "/oauth/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/oauth/protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/oauth/metadata" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/oauth/metadata" },
      { source: "/.well-known/openid-configuration", destination: "/oauth/metadata" },
      { source: "/.well-known/openid-configuration/:path*", destination: "/oauth/metadata" },
    ]
  },
}
export default nextConfig
