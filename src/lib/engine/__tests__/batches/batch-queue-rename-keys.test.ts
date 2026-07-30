import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.renameKeys";

describe("batch-queue renameKeys — n8n-nodes-base.renameKeys", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Rename Keys");
  });

  it("simple rename", async () => {
    const out = await runNode(TYPE, { keys: { key: [{ currentKey: "old", newKey: "new" }] } }, [
      { old: 1 },
    ]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ new: 1 });
  });

  it("multiple renames preserve values", async () => {
    const out = await runNode(
      TYPE,
      {
        keys: {
          key: [
            { currentKey: "first", newKey: "firstName" },
            { currentKey: "second", newKey: "lastName" },
          ],
        },
      },
      [{ first: "a", second: "b" }],
    );
    expect(out[0][0].json).toEqual({ firstName: "a", lastName: "b" });
  });

  it("dot-notation deep key rename", async () => {
    const out = await runNode(
      TYPE,
      { keys: { key: [{ currentKey: "user.oldName", newKey: "user.fullName" }] } },
      [{ user: { oldName: "Kim" } }],
    );
    expect(out[0][0].json).toEqual({ user: { fullName: "Kim" } });
  });

  it("regex rename with capture group", async () => {
    const out = await runNode(
      TYPE,
      {
        additionalOptions: {
          regexReplacement: {
            replacements: [
              {
                searchRegex: "^user_(.*)",
                replaceRegex: "$1",
                options: { caseInsensitive: false, depth: 0 },
              },
            ],
          },
        },
      },
      [{ user_name: "a", user_age: 30 }],
    );
    expect(out[0][0].json).toEqual({ name: "a", age: 30 });
  });

  it("regex case-insensitive with max depth 0 (top-level only)", async () => {
    const out = await runNode(
      TYPE,
      {
        additionalOptions: {
          regexReplacement: {
            replacements: [
              {
                searchRegex: "name",
                replaceRegex: "label",
                options: { caseInsensitive: true, depth: 0 },
              },
            ],
          },
        },
      },
      [{ Name: { SubKey: 1 } }],
    );
    expect(out[0][0].json).toEqual({ label: { SubKey: 1 } });
  });

  it("skip when currentKey equals newKey or key absent", async () => {
    const out = await runNode(
      TYPE,
      {
        keys: {
          key: [
            { currentKey: "same", newKey: "same" },
            { currentKey: "missing", newKey: "x" },
            { currentKey: "present", newKey: "value" },
          ],
        },
      },
      [{ same: 1, present: 2 }],
    );
    expect(out[0][0].json).toEqual({ same: 1, value: 2 });
  });

  it("empty input produces empty output", async () => {
    const out = await runNode(TYPE, { keys: { key: [{ currentKey: "a", newKey: "b" }] } }, []);
    expect(out[0]).toEqual([]);
  });

  it("regex descends into nested objects when depth permits", async () => {
    const out = await runNode(
      TYPE,
      {
        additionalOptions: {
          regexReplacement: {
            replacements: [
              {
                searchRegex: "^pre_(.*)",
                replaceRegex: "$1",
                options: { caseInsensitive: false, depth: -1 },
              },
            ],
          },
        },
      },
      [{ pre_outer: { pre_inner: 1 } }],
    );
    expect(out[0][0].json).toEqual({ outer: { inner: 1 } });
  });

  it("regex descends into array elements but never renames indices", async () => {
    const out = await runNode(
      TYPE,
      {
        additionalOptions: {
          regexReplacement: {
            replacements: [
              {
                searchRegex: "^k_(.*)",
                replaceRegex: "$1",
                options: { caseInsensitive: false, depth: -1 },
              },
            ],
          },
        },
      },
      [{ list: [{ k_a: 1 }, { k_b: 2 }] }],
    );
    expect(out[0][0].json).toEqual({ list: [{ a: 1 }, { b: 2 }] });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.renameKeys")).toBe(canonical);
  });
});
