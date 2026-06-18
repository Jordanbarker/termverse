import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/puzzle-game" : "",
  images: { unoptimized: true },
  trailingSlash: true,
  // @tt/core lives outside this app's root, so Next must be told to compile
  // its raw TS/TSX (resolved through the node_modules workspace symlink).
  transpilePackages: ["@tt/core"],
};

export default nextConfig;
