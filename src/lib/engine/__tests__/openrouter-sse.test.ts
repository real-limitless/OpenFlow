import { describe, it, expect } from "vitest";
import { consumeOpenRouterSse, parseSseDataPayloads } from "../executors/openrouter-sse";

function sse(events: unknown[]): string {
  return events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`).join("");
}

describe("openrouter-sse", () => {
  it("parses content, reasoning, and [DONE]", async () => {
    const deltas: Array<{ text: string; reasoning?: string }> = [];
    const result = await consumeOpenRouterSse(
      (async function* () {
        yield sse([
          { choices: [{ delta: { reasoning_content: "think" } }] },
          { choices: [{ delta: { content: "Hel" } }] },
          {
            choices: [{ delta: { content: "lo" } }],
            model: "or/m",
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          },
          "[DONE]",
        ]);
      })(),
    );
    expect(result.text).toBe("Hello");
    expect(result.reasoning).toBe("think");
    expect(result.model).toBe("or/m");
    expect(result.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 });
    void deltas;
  });

  it("fires onDelta as chunks arrive", async () => {
    const texts: string[] = [];
    await consumeOpenRouterSse(
      (async function* () {
        yield sse([
          { choices: [{ delta: { content: "A" } }] },
          { choices: [{ delta: { content: "B" } }] },
          "[DONE]",
        ]);
      })(),
      { onDelta: (d) => texts.push(d.text) },
    );
    expect(texts).toEqual(["A", "AB"]);
  });

  it("assembles streamed tool_calls", async () => {
    const result = await consumeOpenRouterSse(
      (async function* () {
        yield sse([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, id: "call_1", function: { name: "read_file", arguments: "" } },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: '{"path":' } }],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: '"README.md"}' } }],
                },
              },
            ],
          },
          "[DONE]",
        ]);
      })(),
    );
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "read_file", args: { path: "README.md" } },
    ]);
  });

  it("throws when no first chunk arrives", async () => {
    await expect(
      consumeOpenRouterSse(
        (async function* () {
          await new Promise(() => {});
          yield "";
        })(),
        { firstChunkMs: 20 },
      ),
    ).rejects.toThrow(/no tokens in /);
  });

  it("throws when the stream goes silent after a chunk", async () => {
    await expect(
      consumeOpenRouterSse(
        (async function* () {
          yield sse([{ choices: [{ delta: { content: "hi" } }] }]);
          await new Promise(() => {});
        })(),
        { firstChunkMs: 20, gapMs: 20 },
      ),
    ).rejects.toThrow(/went silent/);
  });

  it("parseSseDataPayloads skips comments", () => {
    expect(parseSseDataPayloads(': ping\ndata: {"a":1}\n')).toEqual([{ a: 1 }]);
  });
});
