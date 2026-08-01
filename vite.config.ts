// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Packages that may be missing from node_modules during build (optional executor
 * drivers). Externalize only these so the production image does not need them
 * unless the feature is used. Do NOT list core deps like `pg` / `ioredis` here —
 * the Docker runner image does not install a full node_modules tree.
 */
const NODE_EXTERNALS = ["mqtt", "@elastic/elasticsearch", "amqplib", "kafkajs"];

export default defineConfig({
  nitro: {
    // We run on Node (see Dockerfile), not Workers. Nitro's default cloudflare-module
    // preset can't bundle the node-only drivers our executors pull in (mongodb, mssql,
    // mysql2, ssh2, isolated-vm). NITRO_PRESET still overrides this for other targets.
    preset: "node-server",
    externals: {
      external: NODE_EXTERNALS,
    },
  },
  vite: {
    ssr: {
      external: NODE_EXTERNALS,
    },
    build: {
      rolldownOptions: {
        external: NODE_EXTERNALS,
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
