import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = `${protocol}://${host}`;
  const image = new URL("/og.png", origin).toString();

  return {
    title: "Mirage: Bay City",
    description: "A playable open-world San Francisco, built by a coding model.",
    openGraph: {
      type: "website",
      url: origin,
      title: "Mirage: Bay City",
      description: "A playable open-world San Francisco, built by a coding model.",
      images: [
        {
          url: image,
          width: 1440,
          height: 900,
          alt: "Mirage: Bay City, a playable San Francisco",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mirage: Bay City",
      description: "A playable open-world San Francisco, built by a coding model.",
      images: [image],
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
