import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Packages that may be missing from node_modules during build (optional executor
 * drivers). Externalize only these so the production image does not need them
 * unless the feature is used. Do NOT list core deps like `pg` / `ioredis` here —
 * the Docker runner image does not install a full node_modules tree.
 */
const NODE_EXTERNALS = ["mqtt", "@elastic/elasticsearch", "amqplib", "kafkajs"];

export default defineConfig(({ command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
  ];

  if (command === "build") {
    plugins.push(
      nitro({
        // We run on Node (see Dockerfile), not Workers. Nitro's default cloudflare-module
        // preset can't bundle the node-only drivers our executors pull in (mongodb, mssql,
        // mysql2, ssh2, isolated-vm). NITRO_PRESET still overrides this for other targets.
        preset: "node-server",
        rollupConfig: {
          external: NODE_EXTERNALS,
        },
      }),
    );
  }

  plugins.push(react());

  return {
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    ssr: {
      external: NODE_EXTERNALS,
    },
    build: {
      rolldownOptions: {
        external: NODE_EXTERNALS,
      },
    },
    server: {
      host: "::",
      port: 8080,
    },
    plugins,
  };
});
