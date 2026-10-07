import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/termverse/termoil" : "",
  images: { unoptimized: true },
  trailingSlash: true,
  // @tt/core lives outside this app's root, so Next must be told to compile
  // its raw TS/TSX (resolved through the node_modules workspace symlink).
  transpilePackages: ["@tt/core"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);
