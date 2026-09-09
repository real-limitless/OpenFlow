// Prisma config. dotenv is an OpenFlow devDependency — consumers (CleanFlow)
// must not fail if it is absent. Load it when present so local DATABASE_URL
// still works for first-party OpenFlow checkouts.
import { createRequire } from "node:module";
import { defineConfig } from "prisma/config";

try {
  createRequire(import.meta.url)("dotenv/config");
} catch {
  // optional when OpenFlow is installed as a library
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
