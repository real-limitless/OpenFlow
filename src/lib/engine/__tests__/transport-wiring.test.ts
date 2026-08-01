import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BUILTIN_EXECUTOR_MODULES,
  getExecutorUnavailability,
  listUnavailableExecutorTypes,
} from "../node-runtime";

/**
 * Guards the gap between "an executor is registered" and "the node can run".
 *
 * Several executors take their out-of-process transport through a module-level
 * `setXFactory` seam. When nothing calls the setter, the fallback throws on
 * first use -- yet `hasBuiltinExecutor` still reports true and the migration
 * report used to show a green "Supported" badge. node-breadth-gate.test.ts
 * cannot catch this: it only checks that each manifest entry resolves to a
 * function, which a throwing default does.
 *
 * The contract enforced here: an executor whose default factory throws MUST
 * carry an `unavailable` tag in BUILTIN_EXECUTOR_MODULES, and one that is
 * tagged MUST actually throw. Adding a new dead transport fails this test.
 */

const EXECUTOR_DIR = join(__dirname, "..", "executors");

/** Sentinels used by the throwing DEFAULT_FACTORY implementations. */
const UNWIRED_SENTINEL =
  /Wire a real|no (?:\w+ )?transport (?:client )?configured|no transport client configured|client factory configured/i;

/**
 * The known-dead set. Deliberately an exact-match assertion rather than a
 * subset check: a new entry means someone shipped an unusable node, and a
 * removed entry means a transport got wired and this list should shrink.
 */
const EXPECTED_UNAVAILABLE = ["n8n-nodes-base.emailReadImap", "n8n-nodes-base.ldap"];

describe("transport wiring", () => {
  it("has exactly the expected set of unavailable node types", () => {
    expect(listUnavailableExecutorTypes()).toEqual(EXPECTED_UNAVAILABLE);
  });

  it("gives every unavailable entry a setter name and a reason", () => {
    for (const type of EXPECTED_UNAVAILABLE) {
      const info = getExecutorUnavailability(type);
      expect(info, `${type} should be tagged`).toBeTruthy();
      expect(info!.setter, `${type} setter`).toMatch(/^set[A-Z]\w+$/);
      expect(info!.reason.length, `${type} reason`).toBeGreaterThan(20);
    }
  });

  it("names a setter that the executor module actually exports", () => {
    for (const entry of BUILTIN_EXECUTOR_MODULES) {
      if (!entry.unavailable) continue;
      const file = join(EXECUTOR_DIR, `${entry.modulePath.replace("./executors/", "")}.ts`);
      const src = readFileSync(file, "utf8");
      expect(src, `${entry.type} must export ${entry.unavailable.setter}`).toContain(
        `export function ${entry.unavailable.setter}(`,
      );
    }
  });

  it("tags every executor whose default factory throws", () => {
    const tagged = new Set(
      BUILTIN_EXECUTOR_MODULES.filter((e) => e.unavailable).map(
        (e) => `${e.modulePath.replace("./executors/", "")}.ts`,
      ),
    );

    const offenders: string[] = [];
    for (const file of readdirSync(EXECUTOR_DIR)) {
      if (!file.endsWith(".ts") || tagged.has(file)) continue;
      const src = readFileSync(join(EXECUTOR_DIR, file), "utf8");
      // Only the throwing-default sentinel counts. A module that merely
      // *mentions* a setter is fine -- that is the healthy lazy-import pattern.
      if (UNWIRED_SENTINEL.test(src)) offenders.push(file);
    }

    expect(
      offenders,
      `these executors fail at runtime with no transport but are not tagged ` +
        `\`unavailable\` in BUILTIN_EXECUTOR_MODULES:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("resolves a real default transport for the wired-up nodes", async () => {
    const s3 = await import("../executors/s3-transport");
    expect(typeof s3.defaultS3ClientFactory).toBe("function");

    const ssh = await import("../executors/ssh-transport");
    expect(typeof ssh.defaultSshClientFactory).toBe("function");

    const smtp = await import("../executors/email-send-transport");
    expect(typeof smtp.defaultSmtpTransportFactory).toBe("function");
  });

  it("builds an smtp transport from a credential without connecting", async () => {
    const { defaultSmtpTransportFactory } = await import("../executors/email-send-transport");
    expect(typeof (await defaultSmtpTransportFactory({ host: "mail.test" }, {}))).toBe("function");

    await expect(defaultSmtpTransportFactory({ user: "u" }, {})).rejects.toThrow(
      /missing host/,
    );
  });

  it("builds an s3 client from a credential without touching the network", async () => {
    const { defaultS3ClientFactory } = await import("../executors/s3-transport");
    const client = await defaultS3ClientFactory({
      accessKeyId: "AK",
      secretAccessKey: "SK",
      region: "us-east-1",
    } as never);
    expect(typeof client.listBuckets).toBe("function");
    await client.close();

    await expect(defaultS3ClientFactory({ region: "us-east-1" } as never)).rejects.toThrow(
      /missing accessKeyId/,
    );
  });

  it("builds an ssh client from a credential without connecting", async () => {
    const { defaultSshClientFactory } = await import("../executors/ssh-transport");
    const client = await defaultSshClientFactory(
      { host: "h", username: "u", password: "p" } as never,
      {},
    );
    expect(typeof client.execCommand).toBe("function");

    await expect(
      defaultSshClientFactory({ username: "u", password: "p" } as never, {}),
    ).rejects.toThrow(/host is required/);
    await expect(
      defaultSshClientFactory({ host: "h", username: "u" } as never, {}),
    ).rejects.toThrow(/password or a privateKey/);
  });
});
