import type { NextConfig } from "next";

const assetCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=3600, stale-while-revalidate=86400",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/game-assets/:path*",
        headers: assetCacheHeaders,
      },
      {
        source: "/vendor/:path*",
        headers: assetCacheHeaders,
      },
    ];
  },
};

export default nextConfig;
