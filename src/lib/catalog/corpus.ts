import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { allNodeTypes, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import type { INodeTypeDescription, INodeProperties } from "@/lib/nodes/types";
import { contentHash } from "./hash";
import { isShellNodeType } from "./shell";
import type { CatalogCorpusChunk } from "./types";

function collectOptionLabels(props: INodeProperties[] | undefined, depth = 0): string[] {
  if (!props || depth > 3) return [];
  const out: string[] = [];
  for (const p of props) {
    if (p.displayName) out.push(String(p.displayName));
    if (p.description) out.push(String(p.description));
    if (Array.isArray(p.options)) {
      for (const o of p.options) {
        if (o && typeof o === "object" && "name" in o) {
          const opt = o as { name?: string; value?: unknown; description?: string };
          if (opt.name) out.push(String(opt.name));
          if (opt.value != null && typeof opt.value !== "object") out.push(String(opt.value));
          if (opt.description) out.push(String(opt.description));
        }
        if (o && typeof o === "object" && "values" in o) {
          const col = o as { values?: INodeProperties[] };
          out.push(...collectOptionLabels(col.values, depth + 1));
        }
      }
    }
  }
  return out;
}

function shortTypeBase(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1) : name;
}

function loadSpecBlurb(typeName: string, specsDir: string): string {
  const candidates = [
    join(specsDir, `${typeName}.md`),
    join(specsDir, typeName.replace(/^openflow-node-base\./, "n8n-nodes-base.") + ".md"),
    join(specsDir, typeName.replace(/^openflow-node-langchain\./, "@n8n/n8n-nodes-langchain.") + ".md"),
    join(specsDir, `n8n-nodes-base.${shortTypeBase(typeName)}.md`),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = readFileSync(p, "utf8");
      // Take front matter-ish first paragraphs, cap length
      const body = raw
        .replace(/^---[\s\S]*?---\s*/m, "")
        .split("\n")
        .filter((l) => !l.startsWith("#") || l.startsWith("## "))
        .join("\n")
        .trim()
        .slice(0, 1800);
      if (body.length > 40) return body;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function findSpecsDir(): string {
  const roots = [
    join(process.cwd(), "docs/specs/nodes"),
    join(process.cwd(), "docs/specs"),
  ];
  for (const r of roots) {
    if (existsSync(r)) return r.endsWith("nodes") ? r : join(r, "nodes");
  }
  return join(process.cwd(), "docs/specs/nodes");
}

function chunkId(typeName: string, kind: string): string {
  return createHash("sha1").update(`${typeName}::${kind}`).digest("hex").slice(0, 24);
}

export function buildNodeCorpus(options?: { includeSpecs?: boolean }): CatalogCorpusChunk[] {
  seedBuiltinDescriptions();
  const specsDir = findSpecsDir();
  const includeSpecs = options?.includeSpecs !== false;
  const chunks: CatalogCorpusChunk[] = [];

  for (const d of allNodeTypes()) {
    if (!d || d.placeholder) continue;
    const typeName = d.name;
    const displayName = d.displayName || shortTypeBase(typeName);
    const description = d.description || "";
    const category = typeof d.category === "string" ? d.category : "Miscellaneous";
    const isShell = isShellNodeType(typeName, displayName, description);
    const ops = collectOptionLabels(d.properties as INodeProperties[] | undefined)
      .slice(0, 80)
      .join(" · ");

    const summaryBody = [
      `Node: ${displayName}`,
      `Type: ${typeName}`,
      `Category: ${category}`,
      description,
      isShell ? "Tier: shell-fallback host command execution" : "Tier: openflow-domain-or-core",
      `Capabilities keywords: ${shortTypeBase(typeName)} ${displayName}`,
    ]
      .filter(Boolean)
      .join("\n");

    chunks.push({
      id: chunkId(typeName, "summary"),
      typeName,
      chunkKind: "summary",
      title: displayName,
      body: summaryBody,
      contentHash: contentHash([typeName, "summary", summaryBody]),
      isShell,
      rankBoost: isShell ? -0.2 : category === "AI Tool" ? 0.05 : 0.1,
      category,
      displayName,
      metadata: {
        inputs: d.inputs,
        outputs: d.outputs,
        version: d.version,
      },
    });

    if (ops.length > 20) {
      const opsBody = [
        `${displayName} operations and parameters`,
        typeName,
        ops,
      ].join("\n");
      chunks.push({
        id: chunkId(typeName, "operations"),
        typeName,
        chunkKind: "operations",
        title: `${displayName} operations`,
        body: opsBody,
        contentHash: contentHash([typeName, "operations", opsBody]),
        isShell,
        rankBoost: isShell ? -0.15 : 0.08,
        category,
        displayName,
        metadata: {},
      });
    }

    if (includeSpecs) {
      const spec = loadSpecBlurb(typeName, specsDir);
      if (spec) {
        const specBody = `${displayName} (${typeName})\n${spec}`;
        chunks.push({
          id: chunkId(typeName, "spec"),
          typeName,
          chunkKind: "spec",
          title: `${displayName} spec`,
          body: specBody,
          contentHash: contentHash([typeName, "spec", specBody]),
          isShell,
          rankBoost: 0.05,
          category,
          displayName,
          metadata: { source: "docs/specs" },
        });
      }
    }
  }

  return chunks;
}

export function listSpecFilesSample(limit = 5): string[] {
  const dir = findSpecsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .slice(0, limit);
}

/** Expose description lookup for suggest enrichment without circular imports at call sites. */
export function describeType(typeName: string): INodeTypeDescription | undefined {
  seedBuiltinDescriptions();
  return allNodeTypes().find((t) => t.name === typeName);
}
