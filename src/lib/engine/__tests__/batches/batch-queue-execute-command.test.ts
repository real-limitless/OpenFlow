import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.executeCommand";

describe("batch-queue executeCommand — n8n-nodes-base.executeCommand", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Execute Command");
  });

  it("runs a single command (acceptance: happy path)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "echo hello",
    }, [{ name: "test" }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("test");
    expect(out[0][0].json.stdout).toBe("hello\n");
    expect(out[0][0].json.stderr).toBe("");
    expect(out[0][0].json.exitCode).toBe(0);
  });

  it("per-item execution with expression (acceptance: per-item)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: false,
      command: "echo {{ $json.id }}",
    }, [{ id: "a" }, { id: "b" }]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.stdout).toBe("a\n");
    expect(out[0][0].json.exitCode).toBe(0);
    expect(out[0][1].json.stdout).toBe("b\n");
    expect(out[0][1].json.exitCode).toBe(0);
  });

  it("non-zero exit returns exitCode (acceptance: command failure)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "sh -c 'exit 42'",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.stdout).toBe("");
    expect(out[0][0].json.stderr).toBe("");
    expect(out[0][0].json.exitCode).toBe(42);
  });

  it("throws on command not found when continueOnFail is false", async () => {
    await expect(runNode(TYPE, {
      executeOnce: true,
      command: "nonexistent_command_xyz123",
    }, [{}])).rejects.toThrow();
  });

  it("continueOnFail with non-zero exit returns exitCode", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "sh -c 'exit 1'",
    }, [{}], { continueOnFail: true });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.stdout).toBe("");
    expect(out[0][0].json.stderr).toBe("");
    expect(out[0][0].json.exitCode).toBe(1);
  });

  it("continueOnFail with system error passes error item", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "nonexistent_command_xyz",
    }, [{}], { continueOnFail: true });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });

  it("multi-line command (acceptance: multi-line)", async () => {
    const out = await runNode(TYPE, {
      executeOnce: true,
      command: "echo first\necho second",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.stdout).toBe("first\nsecond\n");
    expect(out[0][0].json.exitCode).toBe(0);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.executeCommand")).toBe(canonical);
  });
});