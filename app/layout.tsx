import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://mirage-khaki.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Mirage: The Drop",
  description:
    "Grab the package, break the pursuit, and reach Pier 11 in a handcrafted block-built San Francisco.",
  openGraph: {
    type: "website",
    url: "/",
    title: "Mirage: The Drop",
    description:
      "Grab the package, break the pursuit, and reach Pier 11 in a handcrafted block-built San Francisco.",
    images: [
      {
        url: "/og.png",
        width: 1440,
        height: 900,
        alt: "Mirage: The Drop in Bay City",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mirage: The Drop",
    description:
      "Grab the package, break the pursuit, and reach Pier 11 in a handcrafted block-built San Francisco.",
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
