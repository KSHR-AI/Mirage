import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://mirage-khaki.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Mirage: Hot Ride",
  description:
    "Drive one hot coupe across a block-built San Francisco and make the drop.",
  openGraph: {
    type: "website",
    url: "/",
    title: "Mirage: Hot Ride",
    description:
      "Drive one hot coupe across a block-built San Francisco and make the drop.",
    images: [
      {
        url: "/og.png",
        width: 1440,
        height: 900,
        alt: "Mirage: Hot Ride in Bay City",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mirage: Hot Ride",
    description:
      "Drive one hot coupe across a block-built San Francisco and make the drop.",
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
