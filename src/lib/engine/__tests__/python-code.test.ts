import { describe, expect, it } from "vitest";
import { runNode } from "./helpers";

const TYPE = "n8n-nodes-base.code";

describe("Code node Python (sandboxed subprocess)", () => {
  it("language=python maps items via _items", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "runOnceForAllItems",
        language: "python",
        pythonCode: `return [{"json": {"n": i["json"]["x"] * 10}} for i in _items]`,
      },
      [{ x: 2 }, { x: 3 }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.n).toBe(20);
    expect(out[0][1].json.n).toBe(30);
  });

  it("language=pythonNative shares the same runner", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "runOnceForAllItems",
        language: "pythonNative",
        pythonCode: `return [{"json": {"n": len(_items)}}]`,
      },
      [{ a: 1 }, { a: 2 }],
    );
    expect(out[0][0].json.n).toBe(2);
  });

  it("denies os and subprocess even when listed", async () => {
    await expect(
      runNode(
        TYPE,
        {
          mode: "runOnceForAllItems",
          language: "python",
          pythonCode: `import os\nreturn [{"json": {"home": os.environ.get("HOME")}}]`,
        },
        [{ a: 1 }],
      ),
    ).rejects.toThrow(/not allowed/i);

    await expect(
      runNode(
        TYPE,
        {
          mode: "runOnceForAllItems",
          language: "python",
          pythonCode: `import subprocess\nreturn [{"json": {}}]`,
        },
        [{ a: 1 }],
      ),
    ).rejects.toThrow(/not allowed/i);
  });

  it("allows safe stdlib json", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "runOnceForAllItems",
        language: "python",
        pythonCode: `import json\nreturn [{"json": {"ok": True, "has_dumps": hasattr(json, "dumps")}}]`,
      },
      [{ a: 1 }],
    );
    expect(out[0][0].json.ok).toBe(true);
    expect(out[0][0].json.has_dumps).toBe(true);
  });
});
