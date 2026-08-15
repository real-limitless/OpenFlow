import { describe, expect, it } from "vitest";
import { redactRunData } from "../redact-run-data";

describe("redactRunData", () => {
  it("masks secret keys and leaves other fields", () => {
    const out = redactRunData({
      apiKey: "sk-secret-value",
      token: "abc",
      authorization: "Bearer real-token",
      title: "ok",
    });
    expect(out).toEqual({
      apiKey: "********",
      token: "********",
      authorization: "********",
      title: "ok",
    });
  });

  it("redacts Bearer and OpenFlow key strings inside items", () => {
    const out = redactRunData({
      Agent: {
        status: "success",
        items: [
          [
            {
              json: {
                header: "Bearer of_deadbeefdeadbeef",
                note: "hello",
              },
            },
          ],
        ],
      },
    });
    const json = (out as { Agent: { items: Array<Array<{ json: Record<string, string> }>> } }).Agent
      .items[0]![0]!.json;
    expect(json.header).toBe("Bearer ********");
    expect(json.note).toBe("hello");
  });

  it("walks nested arrays", () => {
    expect(redactRunData([{ password: "x" }, { n: 1 }])).toEqual([
      { password: "********" },
      { n: 1 },
    ]);
  });
});
