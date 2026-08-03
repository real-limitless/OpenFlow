import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import {
  getNodeType,
  seedBuiltinDescriptions,
} from "@/lib/nodes/registry";
import { runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter";

interface CharacterTextSplitterHandle {
  type: string;
  chunkSize: number;
  chunkOverlap: number;
  separator: string;
  splitText(text: string): Promise<string[]>;
  splitDocuments(
    docs: Array<{
      pageContent: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<
    Array<{ pageContent: string; metadata: Record<string, unknown> }>
  >;
}

async function runSplitter(
  parameters: Record<string, unknown> = {},
): Promise<CharacterTextSplitterHandle> {
  const { out } = await runNodeWithCtx(TYPE, parameters, [{}]);
  return out[0][0].json as unknown as CharacterTextSplitterHandle;
}

describe(
  "batch-queue textSplitterCharacterTextSplitter — @n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter",
  () => {
    it("is registered as executor + description", () => {
      expect(hasExecutor(TYPE)).toBe(true);
      expect(getNodeType(TYPE).placeholder).not.toBe(true);
      expect(getNodeType(TYPE).displayName).toBe("Character Text Splitter");
    });

    it("exposes ai_textSplitter handle with correct type and defaults", async () => {
      const handle = await runSplitter();

      expect(handle.type).toBe(TYPE);
      expect(handle.chunkSize).toBe(1000);
      expect(handle.chunkOverlap).toBe(0);
      expect(handle.separator).toBe("");
      expect(typeof handle.splitText).toBe("function");
      expect(typeof handle.splitDocuments).toBe("function");
    });

    it("basic splitting with default separator — empty separator splits by character", async () => {
      const handle = await runSplitter({ chunkSize: 10, chunkOverlap: 0 });

      const chunks = await handle.splitText("abcdefghijklmno");

      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe("abcdefghij");
      expect(chunks[1]).toBe("klmno");
    });

    it("custom separator (newline)", async () => {
      const handle = await runSplitter({
        separator: "\n",
        chunkSize: 500,
        chunkOverlap: 50,
      });

      const text = "Line one.\nLine two.\nLine three.\nLine four.";
      const chunks = await handle.splitText(text);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(500);
      }
    });

    it("chunk overlap preservation", async () => {
      const handle = await runSplitter({ chunkSize: 100, chunkOverlap: 20 });

      const docs = await handle.splitDocuments([
        {
          pageContent: "A".repeat(200),
          metadata: {},
        },
      ]);

      expect(docs.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < docs.length; i++) {
        expect(docs[i].pageContent.slice(0, 20)).toBe(
          docs[i - 1].pageContent.slice(-20),
        );
      }
    });

    it("empty separator splits by individual characters", async () => {
      const handle = await runSplitter({ separator: "", chunkSize: 10, chunkOverlap: 0 });

      const chunks = await handle.splitText("Hello World");

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(10);
      }
    });

    it("splitDocuments preserves metadata", async () => {
      const handle = await runSplitter({
        separator: " ",
        chunkSize: 10,
        chunkOverlap: 0,
      });

      const docs = await handle.splitDocuments([
        { pageContent: "one two three four five", metadata: { source: "test" } },
      ]);

      expect(docs.length).toBeGreaterThan(1);
      for (const doc of docs) {
        expect(doc.metadata.source).toBe("test");
      }
    });

    it("error on chunkOverlap >= chunkSize", async () => {
      await expect(runSplitter({ chunkSize: 100, chunkOverlap: 100 })).rejects.toThrow(
        /overlap must be less than chunk size/i,
      );
    });

    it("error on chunkSize <= 0", async () => {
      await expect(runSplitter({ chunkSize: 0, chunkOverlap: 0 })).rejects.toThrow(
        /chunk size must be a positive number/i,
      );
    });

    it("empty input text — returns empty list", async () => {
      const handle = await runSplitter({ chunkSize: 100, chunkOverlap: 0 });

      const chunks = await handle.splitText("");
      expect(chunks).toEqual([]);
    });

    it("empty documents — returns empty chunk list", async () => {
      const handle = await runSplitter({ chunkSize: 100, chunkOverlap: 0 });

      const docs = await handle.splitDocuments([]);
      expect(docs).toEqual([]);
    });

    it("resolves the executor under the canonical type string", () => {
      const canonical = getExecutor(TYPE);
      expect(canonical).toBeDefined();
    });
  },
);
