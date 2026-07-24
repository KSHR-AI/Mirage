import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Mirage: GTA in SF";
const description =
  "Drive a fully simulated 3D San Francisco, swap rides, protect the package, shed escalating police heat, and make the drop.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    .trim();
  const host =
    forwardedHost ??
    requestHeaders.get("host") ??
    "mirage-game.amankishore.chatgpt.site";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost")
        ? "http"
        : "https";

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1731,
          height: 908,
          alt: "Mirage: GTA in SF getaway car escaping police at night",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
