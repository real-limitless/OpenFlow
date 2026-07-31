import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@openflow/sdk": path.join(root, "src/sdk"),
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
