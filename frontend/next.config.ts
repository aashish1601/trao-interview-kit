import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  async rewrites() {
    let apiOrigin = (process.env.API_INTERNAL_URL || "http://localhost:4000").trim().replace(/\/+$/, "");
    if (!apiOrigin.startsWith("http://") && !apiOrigin.startsWith("https://")) {
      apiOrigin = `https://${apiOrigin}`;
    }
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
