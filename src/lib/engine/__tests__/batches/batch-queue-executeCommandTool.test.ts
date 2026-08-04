import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.executeCommandTool";

describe("batch-queue executeCommandTool — n8n-nodes-base.executeCommandTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Execute Command (AI Tool)");
  });

  it("basic command execution (acceptance: basic command)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "echo hello",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.exitCode).toBe(0);
    expect(out[0][0].json.stdout).toBe("hello\n");
    expect(out[0][0].json.stderr).toBe("");
  });

  it("execute once for all items (acceptance: execute once)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "echo executed once",
    }, [{ x: "1" }, { x: "2" }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.exitCode).toBe(0);
    expect(out[0][0].json.stdout).toBe("executed once\n");
  });

  it("execute once per item (acceptance: per-item)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: false,
      command: "echo {{ $json.name }}",
    }, [{ name: "alice" }, { name: "bob" }]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.exitCode).toBe(0);
    expect(out[0][0].json.stdout).toBe("alice\n");
    expect(out[0][1].json.exitCode).toBe(0);
    expect(out[0][1].json.stdout).toBe("bob\n");
  });

  it("command producing stderr and non-zero exit (acceptance: failure)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "ls /nonexistent_path_xyz",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.exitCode).toBe(2);
    expect(out[0][0].json.stdout).toBe("");
    expect(out[0][0].json.stderr).toContain("No such file or directory");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.executeCommandTool")).toBe(canonical);
  });
});
