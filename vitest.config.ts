import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      // Order matters: the more specific @tt/core alias must precede @.
      "@tt/core": path.resolve(__dirname, "./packages/core/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
