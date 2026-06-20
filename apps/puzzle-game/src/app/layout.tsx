import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terminal Puzzles",
  description: "Learn real terminal, tmux, and git skills by solving challenges.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
