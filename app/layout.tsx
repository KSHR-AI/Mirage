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
    title: "Mirage: The Afterlight Job",
    description:
      "Steal the core, kill the grid, and break the response across a playable Bay City.",
    openGraph: {
      type: "website",
      url: origin,
      title: "Mirage: The Afterlight Job",
      description:
        "Steal the core, kill the grid, and break the response across a playable Bay City.",
      images: [
        {
          url: image,
          width: 1440,
          height: 900,
          alt: "Mirage: The Afterlight Job in Bay City",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mirage: The Afterlight Job",
      description:
        "Steal the core, kill the grid, and break the response across a playable Bay City.",
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
