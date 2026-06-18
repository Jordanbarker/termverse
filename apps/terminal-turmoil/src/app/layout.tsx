import type { Metadata, Viewport } from "next";
import "./globals.css";

const isProd = process.env.NODE_ENV === "production";
const SITE_URL = isProd
  ? "https://jordanbarker.github.io/terminal-turmoil/"
  : "http://localhost:3000/";

const TITLE = "Terminal Turmoil";
const DESCRIPTION =
  "A narrative-driven browser game that teaches Linux/terminal basics through a workplace mystery.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "og-image.png",
        width: 1200,
        height: 630,
        alt: "Terminal Turmoil — a workplace mystery played at the command line",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["og-image.png"],
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
