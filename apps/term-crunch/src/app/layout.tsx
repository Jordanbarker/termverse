import type { Metadata, Viewport } from "next";
import "./globals.css";

const isProd = process.env.NODE_ENV === "production";
const SITE_URL = isProd
  ? "https://jordanbarker.github.io/termverse/term-crunch/"
  : "http://localhost:3001/";
// The shared termverse card (site/og.png); this app ships no image of its own.
const OG_IMAGE = "https://jordanbarker.github.io/termverse/og.png";

const TITLE = "Term Crunch: timed terminal, tmux, git & vim challenges";
const DESCRIPTION =
  "Free browser game for practicing the command line. Beat bite-size tmux, git, vim, and filesystem challenges against the clock, with spaced repetition to review what you're rusty on.";

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
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "term-crunch and termoil running in a browser terminal" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <noscript>
          <p>
            Term Crunch is a browser game of timed terminal challenges covering tmux, git, vim, and
            the filesystem. It needs JavaScript to run. More games at{" "}
            <a href="https://jordanbarker.github.io/termverse/">termverse</a>.
          </p>
        </noscript>
        {children}
      </body>
    </html>
  );
}
