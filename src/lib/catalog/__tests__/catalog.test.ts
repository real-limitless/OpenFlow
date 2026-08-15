import { describe, it, expect } from "vitest";
import { buildNodeCorpus } from "../corpus";
import { hashEmbed, cosineSimilarity, contentHash } from "../hash";
import { isShellNodeType, rankTierFor } from "../shell";
import { createEmbedClient } from "../embed";
import { seedBuiltinDescriptions, allNodeTypes } from "@/lib/nodes/registry";

describe("node catalog corpus + ranking helpers", () => {
  it("builds corpus with git and executeCommand present", () => {
    seedBuiltinDescriptions();
    const corpus = buildNodeCorpus({ includeSpecs: false });
    expect(corpus.length).toBeGreaterThan(100);
    const types = new Set(corpus.map((c) => c.typeName));
    expect([...types].some((t) => t.includes("git") && !t.includes("github"))).toBe(true);
    expect([...types].some((t) => /executeCommand/i.test(t))).toBe(true);
  });

  it("marks executeCommand as shell and git as domain", () => {
    expect(isShellNodeType("openflow-node-base.executeCommand", "Execute Command", "shell")).toBe(
      true,
    );
    expect(rankTierFor("openflow-node-base.executeCommand", "Development", true)).toBe(
      "shell-fallback",
    );
    expect(rankTierFor("openflow-node-base.git", "Actions", false)).toBe("domain");
  });

  it("hash embeddings are normalized and similar for related text", () => {
    const a = hashEmbed("clone a git repository", 256);
    const b = hashEmbed("git clone repo branch commit", 256);
    const c = hashEmbed("send smtp email newsletter", 256);
    expect(a).toHaveLength(256);
    const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(na).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });

  it("contentHash is stable", () => {
    expect(contentHash(["a", "b"])).toBe(contentHash(["a", "b"]));
    expect(contentHash(["a", "b"])).not.toBe(contentHash(["a", "c"]));
  });

  it("hash embed client works without API key", async () => {
    const client = createEmbedClient(true);
    expect(client.mode).toBe("hash");
    const [v] = await client.embed(["list github issues"]);
    expect(v!.length).toBe(client.dimensions);
  });

  it("forceHash ignores remote settings", async () => {
    const prev = process.env.OPENFLOW_CATALOG_EMBED_BASE_URL;
    process.env.OPENFLOW_CATALOG_EMBED_BASE_URL = "http://example.invalid/v1";
    try {
      const client = createEmbedClient(true);
      expect(client.mode).toBe("hash");
    } finally {
      if (prev === undefined) delete process.env.OPENFLOW_CATALOG_EMBED_BASE_URL;
      else process.env.OPENFLOW_CATALOG_EMBED_BASE_URL = prev;
    }
  });

  it("registry still lists node catalog tool", () => {
    seedBuiltinDescriptions();
    const hit = allNodeTypes().find((t) => t.name === "openflow-node-langchain.toolNodeCatalog");
    expect(hit?.outputs).toContain("ai_tool");
  });
});

describe("catalog enrich snippets", () => {
  it("builds usageSnippet and shell whenToUse", async () => {
    const { enrichSuggestedFields } = await import("../enrich");
    seedBuiltinDescriptions();
    const git = allNodeTypes().find((t) => t.name === "openflow-node-base.git");
    expect(git).toBeTruthy();
    const g = enrichSuggestedFields(git, false);
    expect(g.icon).toBeTruthy();
    expect(g.usageSnippet.length).toBeGreaterThan(5);

    const sh = allNodeTypes().find((t) => t.name === "openflow-node-base.executeCommand");
    const s = enrichSuggestedFields(sh, true);
    expect(s.whenToUse.toLowerCase()).toMatch(/shell|last resort|domain/);
  });
});

describe("hybrid ranking preference (offline hash index)", () => {
  it("scores git-related intent higher for git than pure shell when both in candidate set", async () => {
    // Lightweight stand-in for full DB suggest: corpus + hash cosine
    const corpus = buildNodeCorpus({ includeSpecs: false }).filter(
      (c) =>
        c.chunkKind === "summary" &&
        (c.typeName.includes("git") || /executeCommand/i.test(c.typeName)),
    );
    const q = hashEmbed("clone a git repository to a local path", 1536);
    const scored = corpus.map((c) => ({
      type: c.typeName,
      isShell: c.isShell,
      score:
        cosineSimilarity(q, hashEmbed(`${c.title}\n${c.body}`, 1536)) +
        (c.isShell ? -0.35 : 0.1),
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    expect(top).toBeTruthy();
    expect(top!.isShell).toBe(false);
    expect(top!.type.toLowerCase()).toMatch(/git/);
  });
});
