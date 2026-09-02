import { describe, it, expect } from "vitest";
import {
  applyStaleLlmFailure,
  inspectStaleLlm,
  STREAM_FIRST_CHUNK_MS,
  STREAM_GAP_MS,
} from "../llm-silence";
import { createDeltaThrottle } from "../agent-trace";

describe("inspectStaleLlm", () => {
  const started = "2026-08-15T00:00:00.000Z";
  const t0 = Date.parse(started);

  it("fails llm phase with no tokens after first-chunk window", () => {
    const found = inspectStaleLlm(
      {
        Agent: {
          status: "running",
          progress: { iteration: 0, stepCount: 0, phase: "llm", updatedAt: started },
        },
      },
      started,
      t0 + STREAM_FIRST_CHUNK_MS + 1,
    );
    expect(found.stale).toBe(true);
    if (found.stale) expect(found.nodeName).toBe("Agent");
  });

  it("fails llm phase when lastTokenAt is past the gap", () => {
    const last = new Date(t0 + 5_000).toISOString();
    const found = inspectStaleLlm(
      {
        Agent: {
          status: "running",
          progress: {
            iteration: 0,
            stepCount: 0,
            phase: "llm",
            lastTokenAt: last,
            updatedAt: last,
          },
        },
      },
      started,
      Date.parse(last) + STREAM_GAP_MS + 1,
    );
    expect(found.stale).toBe(true);
  });

  it("does not fail tools phase with an old updatedAt", () => {
    const found = inspectStaleLlm(
      {
        Agent: {
          status: "running",
          progress: { iteration: 0, stepCount: 1, phase: "tools", updatedAt: started },
        },
      },
      started,
      t0 + STREAM_FIRST_CHUNK_MS * 3,
    );
    expect(found.stale).toBe(false);
  });

  it("does not fail a fresh llm turn", () => {
    const found = inspectStaleLlm(
      {
        Agent: {
          status: "running",
          progress: { iteration: 0, stepCount: 0, phase: "llm", updatedAt: started },
        },
      },
      started,
      t0 + 1_000,
    );
    expect(found.stale).toBe(false);
  });

  it("applyStaleLlmFailure marks the llm node error and closes spans", () => {
    const next = applyStaleLlmFailure(
      {
        Agent: {
          status: "running",
          progress: { iteration: 0, stepCount: 0, phase: "llm" },
          trace: {
            turns: [
              { iteration: 0, toolCalls: [], observations: [], status: "running", phase: "llm" },
            ],
          },
        },
        Other: { status: "success" },
      },
      "silent",
    );
    expect((next.Agent as { status: string; error: string }).status).toBe("error");
    expect((next.Agent as { error: string }).error).toBe("silent");
    expect(
      (next.Agent as { trace: { turns: Array<{ status: string }> } }).trace.turns[0].status,
    ).toBe("error");
    expect((next.Other as { status: string }).status).toBe("success");
  });
});

describe("createDeltaThrottle", () => {
  it("does not flush once per token under the char threshold", async () => {
    let n = 0;
    const t = createDeltaThrottle(
      () => {
        n += 1;
      },
      { ms: 10_000, chars: 80 },
    );
    for (let i = 1; i <= 10; i++) t.push(i);
    expect(n).toBe(0);
    await t.flush();
    expect(n).toBe(1);
  });

  it("flushes when char threshold is crossed", async () => {
    let n = 0;
    const t = createDeltaThrottle(
      () => {
        n += 1;
      },
      { ms: 10_000, chars: 80 },
    );
    t.push(80);
    t.push(160);
    await t.flush();
    expect(n).toBe(2);
  });
});
