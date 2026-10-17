import type { Metadata, Viewport } from "next";
import "./globals.css";

const isProd = process.env.NODE_ENV === "production";
const SITE_URL = isProd
  ? "https://jordanbarker.github.io/termverse/termoil/"
  : "http://localhost:3000/";
// The shared termverse card (site/og.png); this app ships no image of its own.
const OG_IMAGE = "https://jordanbarker.github.io/termverse/og.png";

const TITLE = "Termoil";
const DESCRIPTION =
  "A narrative-driven browser game that teaches Linux/terminal basics through a workplace mystery.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "termverse",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Termoil: a workplace mystery played at the command line",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0e14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body className="overflow-hidden">{children}</body>
    </html>
  );
}
