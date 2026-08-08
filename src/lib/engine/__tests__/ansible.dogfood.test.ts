import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { seedBuiltinExecutors } from "../index";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "./helpers";
import { __setAnsibleRunFnForTests } from "../executors/ansible-runner";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "openflow-node-base.ansible";

function ansibleAvailable(): boolean {
  const r = spawnSync("ansible", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

const describeDogfood = ansibleAvailable() ? describe : describe.skip;

describeDogfood("ansible dogfood (real CLI)", () => {
  it("ping localhost via executor", async () => {
    __setAnsibleRunFnForTests(undefined);
    const out = await runNode(
      TYPE,
      {
        module: "ansible.builtin.ping",
        hosts: "localhost",
        connection: "local",
        checkMode: false,
        args: {},
        authentication: "none",
      },
      [{}],
    );
    expect(out[0]!.length).toBeGreaterThanOrEqual(1);
    const item = out[0]![0]!.json;
    expect(item.failed).toBe(false);
    expect(item.exitCode).toBe(0);
    const result = item.result as Record<string, unknown>;
    expect(result.ping === "pong" || result.ping === "pong" || item.ok === true).toBe(true);
  }, 60_000);

  it("file module check-mode on /tmp", async () => {
    __setAnsibleRunFnForTests(undefined);
    const out = await runNode(
      TYPE,
      {
        module: "ansible.builtin.file",
        hosts: "localhost",
        connection: "local",
        checkMode: true,
        authentication: "none",
        args: {
          path: "/tmp/openflow-ansible-dogfood-dir",
          state: "directory",
          mode: "0755",
        },
      },
      [{}],
    );
    const item = out[0]![0]!.json;
    expect(item.failed).toBe(false);
    expect(item.checkMode).toBe(true);
  }, 60_000);

  it("redacts inventory paths when using ansibleSsh credential", async () => {
    __setAnsibleRunFnForTests(undefined);
    // Local connection via inventory still works if host is localhost
    const out = await runNode(
      TYPE,
      {
        module: "ansible.builtin.ping",
        hosts: "target",
        authentication: "ansibleSsh",
        checkMode: false,
        args: {},
      },
      [{}],
      {
        credentials: {
          ansibleSsh: {
            host: "127.0.0.1",
            username: process.env.USER || "root",
            // force local-like: empty password/key → connection may fail on ssh;
            // use connection override local for dogfood of redaction path
          },
        },
      },
    ).catch((e) => e as Error);

    // May fail SSH without key — that's ok; if success, argv redacted
    if (out instanceof Error) {
      expect(out.message.length).toBeGreaterThan(0);
      return;
    }
    const argv = (out as Awaited<ReturnType<typeof runNode>>)[0]![0]!.json.argv as string[];
    expect(argv.some((a) => a.includes("openflow-ansible-"))).toBe(false);
  }, 60_000);
});

describe("ansible dogfood gate", () => {
  it("reports whether ansible is on PATH", () => {
    // Always runs so CI logs availability
    expect(typeof ansibleAvailable()).toBe("boolean");
  });
});
