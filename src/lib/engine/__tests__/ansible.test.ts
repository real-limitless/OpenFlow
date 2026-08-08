import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedBuiltinExecutors } from "../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "./helpers";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  __setAnsibleRunFnForTests,
  aggregateHostResults,
  assertPlaybookPath,
  buildAnsibleArgv,
  buildPlaybookArgv,
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
      expect(String(env.ANSIBLE_STDOUT_CALLBACK)).toMatch(/json/);
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

  it("loads ansibleSsh credential and redacts inventory path in argv", async () => {
    __setAnsibleRunFnForTests(async (argv) => {
      expect(argv).toContain("-i");
      const invIdx = argv.indexOf("-i");
      const inv = argv[invIdx + 1] ?? "";
      expect(inv).toMatch(/inventory\.ini|openflow-ansible-/);
      return {
        code: 0,
        stdout: JSON.stringify({
          plays: [
            {
              tasks: [
                {
                  hosts: {
                    web: { ping: "pong", changed: false },
                  },
                },
              ],
            },
          ],
        }),
        stderr: "",
      };
    });

    const out = await runNode(
      TYPE,
      {
        module: "ansible.builtin.ping",
        hosts: "web",
        authentication: "ansibleSsh",
        become: true,
        args: {},
      },
      [{}],
      {
        credentials: {
          ansibleSsh: {
            host: "10.1.2.3",
            username: "deploy",
            password: "secret-pass",
            becomePassword: "become-secret",
          },
        },
      },
    );
    const argv = out[0]![0]!.json.argv as string[];
    expect(argv.join(" ")).not.toMatch(/secret-pass|become-secret|10\.1\.2\.3/);
    expect(argv.some((a) => a === "[redacted-path]" || a.includes("[redacted"))).toBe(true);
    expect((out[0]![0]!.json.result as { ping?: string }).ping).toBe("pong");
  });

  it("requires credential when authentication=sshPassword", async () => {
    await expect(
      runNode(TYPE, { module: "ansible.builtin.ping", authentication: "sshPassword" }, [{}]),
    ).rejects.toThrow(/sshPassword/);
  });

  it("builds playbook argv", () => {
    const argv = buildPlaybookArgv({
      playbook: "/data/ansible/playbooks/site.yml",
      inventory: "/tmp/inv",
      checkMode: true,
      become: true,
      extraVarsFile: "/tmp/vars.json",
      limit: "web",
      tags: "deploy",
      skipTags: "slow",
    });
    expect(argv[0]).toBe("ansible-playbook");
    expect(argv).toContain("--check");
    expect(argv).toContain("--become");
    expect(argv).toContain("--limit");
    expect(argv).toContain("-e");
    expect(argv).toContain("@/tmp/vars.json");
  });

  it("aggregates multi-task host results", () => {
    const rows = parseJsonCallback(
      JSON.stringify({
        plays: [
          {
            tasks: [
              { hosts: { web: { changed: true, msg: "a" } } },
              { hosts: { web: { changed: false, msg: "b" } } },
            ],
          },
        ],
      }),
    );
    const agg = aggregateHostResults(rows);
    expect(agg).toHaveLength(1);
    expect(agg[0]!.host).toBe("web");
    expect(agg[0]!.changed).toBe(true);
    expect((agg[0]!.result as { tasks: unknown[] }).tasks).toHaveLength(2);
  });

  it("rejects playbook outside jail", async () => {
    await expect(assertPlaybookPath("/etc/passwd")).rejects.toThrow();
  });

  it("runs playbook resource with mocked CLI", async () => {
    const dir = await mkdtemp(join(tmpdir(), "of-pb-"));
    const pb = join(dir, "site.yml");
    await writeFile(
      pb,
      "---\n- hosts: localhost\n  gather_facts: false\n  tasks:\n    - ping:\n",
      "utf8",
    );
    try {
      __setAnsibleRunFnForTests(async (argv) => {
        expect(argv[0]).toBe("ansible-playbook");
        expect(argv).toContain(pb);
        expect(argv).toContain("--check");
        return {
          code: 0,
          stdout: JSON.stringify({
            plays: [
              {
                tasks: [
                  {
                    hosts: {
                      localhost: { ping: "pong", changed: false },
                    },
                  },
                ],
              },
            ],
          }),
          stderr: "",
        };
      });
      const out = await runNode(
        TYPE,
        {
          resource: "playbook",
          playbook: pb,
          checkMode: true,
          authentication: "none",
          extraVars: { env: "test" },
        },
        [{}],
      );
      expect(out[0]![0]!.json.kind).toBe("playbook");
      expect(out[0]![0]!.json.failed).toBe(false);
      expect((out[0]![0]!.json.result as { ping?: string }).ping).toBe("pong");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
