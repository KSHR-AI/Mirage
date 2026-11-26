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
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "./globals.css";

const SITE_URL = "https://mirageml.com";

const SITE_METADATA = {
  title: "MirageML Bench — Can an LLM solve GTA?",
  description:
    "GTA is the new benchmark. Play games LLMs built, vote on the best, and track how close they get.",
};

/**
 * Production previews and canonical links always name mirageml.com, whichever
 * host served the page. Preview deployments and local runs keep their own
 * host, so their share cards can be checked before release.
 */
async function getMetadataBase() {
  if (process.env.VERCEL_ENV === "production") return new URL(SITE_URL);
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
  return host ? new URL(`${protocol}://${host}`) : new URL(SITE_URL);
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: await getMetadataBase(),
    title: SITE_METADATA.title,
    description: SITE_METADATA.description,
    openGraph: {
      title: SITE_METADATA.title,
      description: SITE_METADATA.description,
      siteName: "MirageML Bench",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
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
