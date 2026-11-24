import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

// Development previews are framed and proxied by Niteshift.
const frameHeader = isDevelopment
  ? {
      key: "Content-Security-Policy",
      value:
        "frame-ancestors 'self' https://niteshift.dev https://*.niteshift.dev",
    }
  : { key: "X-Frame-Options", value: "SAMEORIGIN" };

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.preview.niteshift.dev"],
  outputFileTracingIncludes: {
    "/*": ["./submissions/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          frameHeader,
        ],
      },
    ];
  },
};

export default nextConfig;
