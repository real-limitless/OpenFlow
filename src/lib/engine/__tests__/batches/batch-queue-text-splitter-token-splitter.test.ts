import { assertExecutorRegistered, runNode } from "../helpers";

const TYPE = "@n8n/n8n-nodes-langchain.textSplitterTokenSplitter";

beforeAll(() => {
  assertExecutorRegistered(TYPE);
});

describe("TokenSplitter", () => {
  it("produces an AiTextSplitter handle", async () => {
    const [[out]] = await runNode(TYPE, { chunkSize: 1000, chunkOverlap: 0 }, [{}]);
    expect(out).toBeDefined();
    expect(out.json?.type).toBe(TYPE);
    expect(out.json?.chunkSize).toBe(1000);
    expect(out.json?.chunkOverlap).toBe(0);
    expect(typeof (out.json as any)?.splitText).toBe("function");
    expect(typeof (out.json as any)?.splitDocuments).toBe("function");
  });

  it("splitText returns token-based chunks with default params", async () => {
    const [[out]] = await runNode(TYPE, { chunkSize: 1000, chunkOverlap: 0 }, [{}]);
    const handle = out.json as any;
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(200);
    const chunks = await handle.splitText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const joined = chunks.join("");
    expect(joined.length).toBeGreaterThan(0);
  });

  it("splitText respects chunkSize", async () => {
    const [[out]] = await runNode(TYPE, { chunkSize: 5, chunkOverlap: 0 }, [{}]);
    const handle = out.json as any;
    const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const chunks = await handle.splitText(text);
    for (const c of chunks) {
      const tokenCount = Math.ceil(c.length);
      expect(tokenCount).toBeLessThanOrEqual(5);
    }
  });

  it("splitText handles empty string", async () => {
    const [[out]] = await runNode(TYPE, { chunkSize: 100, chunkOverlap: 0 }, [{}]);
    const handle = out.json as any;
    const chunks = await handle.splitText("");
    expect(chunks).toEqual([]);
  });

  it("splitDocuments returns chunked documents", async () => {
    const [[out]] = await runNode(TYPE, { chunkSize: 50, chunkOverlap: 0 }, [{}]);
    const handle = out.json as any;
    const docs = [
      { pageContent: "Hello world, this is a test document.", metadata: { source: "test" } },
    ];
    const result = await handle.splitDocuments(docs);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].metadata).toEqual({ source: "test" });
  });

  it("rejects invalid parameters", async () => {
    await expect(runNode(TYPE, { chunkSize: 0 }, [{}])).rejects.toThrow(
      "Chunk Size must be a positive number",
    );
    await expect(runNode(TYPE, { chunkSize: 10, chunkOverlap: 10 }, [{}])).rejects.toThrow(
      "Chunk Overlap must be less than Chunk Size",
    );
  });
});
