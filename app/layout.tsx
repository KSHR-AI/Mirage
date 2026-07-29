import type { Metadata } from "next";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./globals.css";

const SITE_METADATA = {
  title: "Mirage — Playable games built by coding models",
  description:
    "Play immutable browser games built by coding models, then inspect each source, lineage, and provenance record.",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    .trim();
  const host = forwardedHost ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host?.startsWith("localhost")
        ? "http"
        : "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;

  return {
    metadataBase,
    title: SITE_METADATA.title,
    description: SITE_METADATA.description,
    openGraph: {
      title: SITE_METADATA.title,
      description: SITE_METADATA.description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: SITE_METADATA.title,
      description: SITE_METADATA.description,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
