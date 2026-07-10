import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://mirage-khaki.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Mirage: The Afterlight Job",
  description:
    "Steal the core, kill the grid, and break the response across a playable Bay City.",
  openGraph: {
    type: "website",
    url: "/",
    title: "Mirage: The Afterlight Job",
    description:
      "Steal the core, kill the grid, and break the response across a playable Bay City.",
    images: [
      {
        url: "/og.png",
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
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
