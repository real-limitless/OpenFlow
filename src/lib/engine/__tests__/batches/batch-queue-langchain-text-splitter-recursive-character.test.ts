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

const TYPE = "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter";

interface TextSplitterHandle {
  type: string;
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
  keepSeparator: boolean;
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
): Promise<TextSplitterHandle> {
  const { out } = await runNodeWithCtx(TYPE, parameters, [{}]);
  return out[0][0].json as unknown as TextSplitterHandle;
}

describe(
  "batch-queue textSplitterRecursiveCharacterTextSplitter — @n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
  () => {
    it("is registered as executor + description", () => {
      expect(hasExecutor(TYPE)).toBe(true);
      expect(getNodeType(TYPE).placeholder).not.toBe(true);
      expect(getNodeType(TYPE).displayName).toBe("Recursive Character Text Splitter");
    });

    it("exposes ai_textSplitter handle with correct type and defaults", async () => {
      const handle = await runSplitter();

      expect(handle.type).toBe(TYPE);
      expect(handle.chunkSize).toBe(1000);
      expect(handle.chunkOverlap).toBe(200);
      expect(handle.separators).toEqual(["\n\n", "\n", " ", ""]);
      expect(handle.keepSeparator).toBe(true);
      expect(typeof handle.splitText).toBe("function");
      expect(typeof handle.splitDocuments).toBe("function");
    });

    it("basic split — paragraph boundaries, chunkSize/overlap respected, metadata preserved", async () => {
      const handle = await runSplitter({
        chunkSize: 100,
        chunkOverlap: 20,
        separators: ["\n\n", "\n", " ", ""],
        keepSeparator: true,
      });

      const docs = await handle.splitDocuments([
        {
          pageContent:
            "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
          metadata: { source: "test" },
        },
      ]);

      expect(docs.length).toBeGreaterThanOrEqual(1);
      for (const doc of docs) {
        expect(doc.pageContent.length).toBeLessThanOrEqual(100);
        expect(doc.metadata.source).toBe("test");
      }
    });

    it("chunk size smaller than paragraph — falls back to word-level split", async () => {
      const handle = await runSplitter({
        chunkSize: 50,
        chunkOverlap: 10,
      });

      const text =
        "This is a very long paragraph without any double newlines that should force splitting at single newlines or spaces.";
      const chunks = await handle.splitText(text);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(50);
      }
      const reassembled = chunks.join("");
      expect(reassembled.length).toBeGreaterThan(0);
      for (const word of text.split(" ")) {
        if (word.length > 0) {
          expect(reassembled.replace(/\s/g, "")).toContain(
            word.replace(/\s/g, ""),
          );
        }
      }
    });

    it("default separators — uses built-in hierarchy when separators param omitted", async () => {
      const handle = await runSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const docs = await handle.splitDocuments([
        {
          pageContent: "Para 1.\n\nPara 2.\nLine A\nLine B",
          metadata: {},
        },
      ]);

      expect(docs.length).toBeGreaterThanOrEqual(1);
      expect(handle.separators).toEqual(["\n\n", "\n", " ", ""]);
    });

    it("keepSeparator false — chunks do not include separator at end", async () => {
      const handle = await runSplitter({
        chunkSize: 10,
        chunkOverlap: 0,
        keepSeparator: false,
      });

      const chunks = await handle.splitText("Para 1.\n\nPara 2.");

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.endsWith("\n\n")).toBe(false);
      }
    });

    it("keepSeparator true — separator kept at end of non-final chunks", async () => {
      const handle = await runSplitter({
        chunkSize: 10,
        chunkOverlap: 0,
        keepSeparator: true,
        separators: ["\n\n", "\n", " ", ""],
      });

      const chunks = await handle.splitText("Para 1.\n\nPara 2.");

      expect(chunks.length).toBeGreaterThan(1);
      const nonLast = chunks.slice(0, -1);
      const hasSeparator = nonLast.some((c) => c.endsWith("\n\n"));
      expect(hasSeparator).toBe(true);
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

    it("empty input documents — returns empty chunk list", async () => {
      const handle = await runSplitter({ chunkSize: 100, chunkOverlap: 20 });

      const docs = await handle.splitDocuments([]);
      expect(docs).toEqual([]);
    });

    it("splitText on empty string — returns empty list", async () => {
      const handle = await runSplitter({ chunkSize: 100, chunkOverlap: 20 });

      const chunks = await handle.splitText("");
      expect(chunks).toEqual([]);
    });

    it("custom separators — overrides default hierarchy", async () => {
      const handle = await runSplitter({
        chunkSize: 5,
        chunkOverlap: 0,
        separators: ["|", ""],
        keepSeparator: false,
      });

      const chunks = await handle.splitText("ab|cd|ef");
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(5);
      }
    });

    it("splitDocuments preserves metadata across chunks", async () => {
      const handle = await runSplitter({
        chunkSize: 10,
        chunkOverlap: 0,
        keepSeparator: false,
      });

      const docs = await handle.splitDocuments([
        { pageContent: "First chunk here.\n\nSecond chunk here.", metadata: { id: 1 } },
      ]);

      expect(docs.length).toBeGreaterThan(1);
      for (const doc of docs) {
        expect(doc.metadata.id).toBe(1);
      }
    });

    it("resolves the executor under the canonical type string", () => {
      const canonical = getExecutor(TYPE);
      expect(canonical).toBeDefined();
    });
  },
);