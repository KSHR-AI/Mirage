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
    title: "Mirage",
    description: "Enter a world that changes as you play.",
    openGraph: {
      type: "website",
      url: origin,
      title: "Mirage",
      description: "Enter a world that changes as you play.",
      images: [
        {
          url: image,
          width: 1731,
          height: 909,
          alt: "Mirage, a world that changes as you play",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mirage",
      description: "Enter a world that changes as you play.",
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
