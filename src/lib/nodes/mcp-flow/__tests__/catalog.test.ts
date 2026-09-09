import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  entryFilename,
  resetMcpGalleryCache,
  searchMcpIndex,
  searchMcpGallery,
} from "../catalog";

const fixture = [
  {
    id: "io.github.example/files",
    title: "Filesystem",
    summary: "Read files from disk",
    transport: "stdio" as const,
  },
  {
    id: "io.github.example/github",
    title: "GitHub",
    summary: "Issues and pull requests",
    transport: "streamable-http" as const,
    endpointUrl: "https://api.githubcopilot.com/mcp/",
  },
];

describe("mcp-flow gallery consumer", () => {
  afterEach(() => {
    resetMcpGalleryCache();
    delete process.env.MCP_FLOW_CATALOG_DIR;
    delete process.env.MCP_FLOW_ADMIN_TOKEN;
  });

  it("builds shard filenames like mcp-flow catalog-data", () => {
    expect(entryFilename("io.github.foo/bar")).toBe("io.github.foo--bar.json");
  });

  it("searches index rows by title and id", () => {
    expect(searchMcpIndex(fixture, "github", 10).map((r) => r.id)).toEqual([
      "io.github.example/github",
    ]);
    expect(searchMcpIndex(fixture, "files", 10)[0]?.title).toBe("Filesystem");
    expect(searchMcpIndex(fixture, "", 10)).toEqual([]);
  });

  it("loads a local catalog-data tree", async () => {
    const dir = join(tmpdir(), `mcp-gallery-${process.pid}-${Date.now()}`);
    mkdirSync(join(dir, "entries"), { recursive: true });
    writeFileSync(
      join(dir, "index.json"),
      JSON.stringify({ schemaVersion: "1.2.0", entries: fixture }),
    );
    writeFileSync(
      join(dir, "entries", entryFilename(fixture[1]!.id)),
      JSON.stringify({
        id: fixture[1]!.id,
        title: "GitHub",
        description: "Issues",
        transport: "streamable-http",
        provenance: "official-registry",
      }),
    );
    process.env.MCP_FLOW_CATALOG_DIR = dir;
    try {
      const result = await searchMcpGallery("github", 20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.endpointUrl).toContain("githubcopilot");
      expect(existsSync(join(dir, "index.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
