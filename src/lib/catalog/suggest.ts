import { config } from "@/config";
import { fuzzyScore } from "@/lib/nodes/search";
import { createEmbedClient } from "./embed";
import { loadIndexFromDb, searchMemory, searchPgvector, catalogStats } from "./index-store";
import { describeType } from "./corpus";
import { rankTierFor } from "./shell";
import type { SuggestNodesOptions, SuggestNodesResult, SuggestedNode } from "./types";
import { seedBuiltinDescriptions, allNodeTypes } from "@/lib/nodes/registry";

function shortBase(typeName: string): string {
  const i = typeName.lastIndexOf(".");
  return i >= 0 ? typeName.slice(i + 1) : typeName;
}

function keywordFallback(intent: string, limit: number): SuggestedNode[] {
  seedBuiltinDescriptions();
  const q = intent.trim();
  const types = allNodeTypes().filter((t) => !t.placeholder);
  const scored = types
    .map((t) => ({
      t,
      score: fuzzyScore(q, {
        name: t.name,
        displayName: t.displayName,
        description: t.description ?? "",
      }),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ t, score }) => {
    const isShell = /executeCommand|ssh/i.test(t.name);
    return {
      type: t.name,
      displayName: t.displayName,
      description: t.description ?? "",
      category: typeof t.category === "string" ? t.category : "",
      score: score / 100,
      rankTier: rankTierFor(t.name, String(t.category ?? ""), isShell),
      reason: "keyword match (catalog not indexed or cold start)",
      isShell,
      inputs: t.inputs as string | string[],
      outputs: t.outputs as string | string[],
    };
  });
}

function snippetReason(body: string, intent: string): string {
  const q = intent.toLowerCase();
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => l.toLowerCase().includes(q.slice(0, 24))) || lines[0] || "";
  return hit.slice(0, 160);
}

export async function suggestNodes(options: SuggestNodesOptions): Promise<SuggestNodesResult> {
  const intent = (options.intent ?? "").trim();
  const limit = Math.min(40, Math.max(1, options.limit ?? 8));
  const includeShell = options.includeShell !== false;

  if (!intent) {
    return { mode: "empty", count: 0, items: [], indexed: false, note: "empty intent" };
  }

  if (!config.catalog.enabled) {
    const items = keywordFallback(intent, limit);
    return {
      mode: "keyword",
      count: items.length,
      items,
      indexed: false,
      note: "OPENFLOW_CATALOG_RAG_ENABLED=false; keyword only",
    };
  }

  const stats = await catalogStats().catch(() => ({
    chunkCount: 0,
    modelId: null as string | null,
    lastReindexAt: null as string | null,
  }));

  if (stats.chunkCount === 0) {
    const items = keywordFallback(intent, limit);
    return {
      mode: "keyword",
      count: items.length,
      items,
      indexed: false,
      note: "Catalog empty — run npm run catalog:reindex",
    };
  }

  const client = createEmbedClient();
  let queryVec: number[];
  try {
    [queryVec] = await client.embed([intent]);
  } catch (err) {
    const items = keywordFallback(intent, limit);
    return {
      mode: "keyword",
      count: items.length,
      items,
      indexed: true,
      note: `Embed failed (${err instanceof Error ? err.message : String(err)}); keyword fallback`,
    };
  }

  const chunks = await loadIndexFromDb();
  const memHits = searchMemory(queryVec!, chunks, Math.max(40, limit * 5));

  // Optional pgvector blend
  const pgHits = await searchPgvector(queryVec!, 40);
  const scoreByType = new Map<
    string,
    { score: number; reason: string; isShell: boolean; category: string; displayName: string }
  >();

  for (const h of memHits) {
    const prev = scoreByType.get(h.chunk.typeName);
    const score = h.score;
    if (!prev || score > prev.score) {
      scoreByType.set(h.chunk.typeName, {
        score,
        reason: snippetReason(h.chunk.body, intent),
        isShell: h.chunk.isShell,
        category: h.chunk.category,
        displayName: h.chunk.displayName,
      });
    }
  }

  if (pgHits) {
    for (const h of pgHits) {
      const prev = scoreByType.get(h.typeName);
      const score = h.score;
      if (!prev || score > prev.score) {
        const desc = describeType(h.typeName);
        scoreByType.set(h.typeName, {
          score,
          reason: prev?.reason || "vector similarity",
          isShell: prev?.isShell ?? /executeCommand|ssh/i.test(h.typeName),
          category: prev?.category ?? String(desc?.category ?? ""),
          displayName: prev?.displayName ?? desc?.displayName ?? h.typeName,
        });
      } else {
        prev.score = Math.max(prev.score, score * 0.98);
      }
    }
  }

  // Keyword hybrid boost (token overlap + fuzzy)
  seedBuiltinDescriptions();
  const intentL = intent.toLowerCase();
  const intentTokens = new Set(
    intentL
      .replace(/[^a-z0-9./_\-\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );

  for (const t of allNodeTypes()) {
    if (t.placeholder) continue;
    const kw = fuzzyScore(intent, {
      name: t.name,
      displayName: t.displayName,
      description: t.description ?? "",
    });
    const base = shortBase(t.name).toLowerCase();
    const display = (t.displayName || "").toLowerCase();
    let tokenHits = 0;
    for (const tok of intentTokens) {
      if (base === tok || base.includes(tok) || display === tok || display.includes(tok)) {
        tokenHits += tok.length >= 4 ? 2 : 1;
      }
      if (t.name.toLowerCase().includes(tok) && tok.length >= 3) tokenHits += 0.5;
    }
    const tokenBoost = Math.min(0.85, tokenHits * 0.12);
    const boost = (kw / 100) * 0.45 + tokenBoost;
    if (boost <= 0.02) continue;
    const prev = scoreByType.get(t.name);
    const isShell = /executeCommand|ssh/i.test(t.name);
    if (!prev) {
      scoreByType.set(t.name, {
        score: boost,
        reason: tokenBoost > 0 ? "token/name hybrid match" : "keyword hybrid boost",
        isShell,
        category: String(t.category ?? ""),
        displayName: t.displayName,
      });
    } else {
      prev.score += boost;
      if (kw >= 60 || tokenBoost >= 0.24) prev.reason = `${prev.reason}; strong name match`;
    }
  }

  // Ensure known capability anchors exist even if vector miss
  const ensureType = (typeName: string, baseScore: number, reason: string) => {
    const desc = describeType(typeName);
    if (!desc) return;
    const isShell = /executeCommand|ssh/i.test(typeName);
    const prev = scoreByType.get(typeName);
    if (!prev) {
      scoreByType.set(typeName, {
        score: baseScore,
        reason,
        isShell,
        category: String(desc.category ?? ""),
        displayName: desc.displayName,
      });
    } else {
      prev.score = Math.max(prev.score, baseScore);
    }
  };
  if (/\b(git|clone|commit|repository)\b/.test(intentL)) {
    ensureType("openflow-node-base.git", 0.4, "capability anchor: git");
  }
  if (/\bgithub\b/.test(intentL)) {
    ensureType("openflow-node-base.github", 0.4, "capability anchor: github");
  }
  if (/\b(email|smtp)\b/.test(intentL)) {
    ensureType("openflow-node-base.emailSend", 0.4, "capability anchor: email");
  }
  if (
    /\b(shell|bash|zsh|powershell|ssh|execute command|host command|arbitrary)\b/.test(intentL) ||
    (/\bhost\b/.test(intentL) && /\b(command|script)\b/.test(intentL))
  ) {
    ensureType("openflow-node-base.executeCommand", 0.5, "capability anchor: shell");
    ensureType("openflow-node-base.executeCommandTool", 0.45, "capability anchor: shell tool");
  }

  const shellPenalty = config.catalog.shellPenalty;
  const items: SuggestedNode[] = [];

  for (const [typeName, v] of scoreByType) {
    if (!includeShell && v.isShell) continue;
    let score = v.score;
    if (v.isShell) score -= shellPenalty;

    // Capability priors (domain over shell / unrelated AI models)
    if (/\b(git|clone|commit|branch|push|repo|repository)\b/.test(intentL)) {
      if (/(^|[.])git$/i.test(typeName) && !/github|gitlab/i.test(typeName)) score += 0.55;
      if (/github/i.test(typeName) && /\bgithub\b/.test(intentL)) score += 0.45;
      if (/gitlab/i.test(typeName) && /\bgitlab\b/.test(intentL)) score += 0.45;
      if (/executeCommand/i.test(typeName)) score -= 0.15;
      if (/lmChat|embeddings|vectorStore|textSplitter/i.test(typeName)) score -= 0.2;
    }
    if (/\b(github|issue|pull request|\bpr\b)\b/.test(intentL)) {
      if (/github/i.test(typeName) && !/gitlab/i.test(typeName)) score += 0.5;
      if (/executeCommand/i.test(typeName)) score -= 0.2;
    }
    if (/\b(email|smtp|mail)\b/.test(intentL)) {
      if (/email|gmail|mailgun|ses|smtp/i.test(typeName)) score += 0.45;
      if (/executeCommand/i.test(typeName)) score -= 0.2;
    }
    if (/\b(http|rest|api request|webhook call)\b/.test(intentL)) {
      if (/httpRequest/i.test(typeName)) score += 0.5;
    }
    if (
      /\b(shell|bash|zsh|cmd\.exe|powershell|ssh|host command|arbitrary command|run a command|execute command)\b/.test(
        intentL,
      ) ||
      (/\bhost\b/.test(intentL) && /\b(command|script)\b/.test(intentL))
    ) {
      if (/executeCommand/i.test(typeName)) score += 0.85;
      if (/(^|[.])ssh(Tool)?$/i.test(typeName)) score += 0.5;
    }

    const desc = describeType(typeName);
    const category = v.category || String(desc?.category ?? "");
    items.push({
      type: typeName,
      displayName: v.displayName || desc?.displayName || typeName,
      description: desc?.description ?? "",
      category,
      score,
      rankTier: rankTierFor(typeName, category, v.isShell),
      reason: v.reason,
      isShell: v.isShell,
      inputs: desc?.inputs as string | string[] | undefined,
      outputs: desc?.outputs as string | string[] | undefined,
    });
  }

  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // tie-break: non-shell first
    if (a.isShell !== b.isShell) return a.isShell ? 1 : -1;
    return a.displayName.localeCompare(b.displayName);
  });

  const top = items.slice(0, limit);
  return {
    mode: "hybrid",
    count: top.length,
    items: top,
    indexed: true,
    modelId: stats.modelId ?? client.modelId,
  };
}
