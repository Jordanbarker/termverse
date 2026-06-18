import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  // Nested under terminal-turmoil's GitHub Pages site (one project Pages site,
  // served at /<repo>/). Both games ship in one artifact; see .github/workflows/deploy.yml.
  basePath: isProd ? "/terminal-turmoil/puzzle-game" : "",
  images: { unoptimized: true },
  trailingSlash: true,
  // @tt/core lives outside this app's root, so Next must be told to compile
  // its raw TS/TSX (resolved through the node_modules workspace symlink).
  transpilePackages: ["@tt/core"],
};

export default nextConfig;
