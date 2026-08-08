import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedBuiltinExecutors } from "../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "./helpers";
import {
  __setAnsibleRunFnForTests,
  buildAnsibleArgv,
  parseJsonCallback,
} from "../executors/ansible-runner";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "openflow-node-base.ansible";

const pingFixture = readFileSync(
  join(__dirname, "fixtures/ansible-ping-json-callback.json"),
  "utf8",
);

afterEach(() => {
  __setAnsibleRunFnForTests(undefined);
});

describe("openflow-node-base.ansible", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Ansible");
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("registers ansibleTool with same runner", () => {
    const tool = "openflow-node-base.ansibleTool";
    expect(hasExecutor(tool)).toBe(true);
    expect(getNodeType(tool).displayName).toMatch(/Ansible/i);
    expect(getNodeType(tool).category).toBe("AI Tool");
  });

  it("builds argv with check and local connection", () => {
    const argv = buildAnsibleArgv({
      module: "ansible.builtin.ping",
      hosts: "localhost",
      args: { data: "pong" },
      checkMode: true,
    });
    expect(argv[0]).toBe("ansible");
    expect(argv).toContain("--check");
    expect(argv).toContain("local");
    expect(argv).toContain("-a");
  });

  it("parses shared ping JSON callback fixture", () => {
    const hosts = parseJsonCallback(pingFixture);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]!.result.ping).toBe("pong");
  });

  it("runs ping via mocked CLI (shared fixture)", async () => {
    __setAnsibleRunFnForTests(async (argv, env) => {
      expect(argv[0]).toBe("ansible");
      expect(env.ANSIBLE_STDOUT_CALLBACK).toBe("json");
      expect(argv).toContain("--check");
      return { code: 0, stdout: pingFixture, stderr: "" };
    });

    const out = await runNode(
      TYPE,
      {
        module: "ansible.builtin.ping",
        checkMode: true,
        args: {},
        hosts: "localhost",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0]![0]!.json.host).toBe("localhost");
    expect((out[0]![0]!.json.result as { ping?: string }).ping).toBe("pong");
    expect(out[0]![0]!.json.failed).toBe(false);
  });

  it("denies shell module", async () => {
    await expect(
      runNode(TYPE, { module: "ansible.builtin.shell", args: { _raw_params: "id" } }, [{}]),
    ).rejects.toThrow(/denied/i);
  });

  it("rejects invalid fqcn", async () => {
    await expect(runNode(TYPE, { module: "../evil" }, [{}])).rejects.toThrow(/Invalid/i);
  });

  it("continueOnFail returns error item", async () => {
    __setAnsibleRunFnForTests(async () => {
      throw new Error("spawn ansible ENOENT");
    });
    const out = await runNode(TYPE, { module: "ansible.builtin.ping" }, [{}], {
      continueOnFail: true,
    });
    expect(out[0]![0]!.json.error).toMatch(/ENOENT|ansible/i);
  });
});
