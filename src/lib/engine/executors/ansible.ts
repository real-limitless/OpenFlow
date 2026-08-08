import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";
import { runAnsibleModuleWithTestHook, type AnsibleRunResult } from "./ansible-runner";
import { prepareAnsibleAuth, type AnsibleSshCredential } from "./ansible-auth";

function asArgs(value: unknown): Record<string, unknown> | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      throw new Error("args JSON must be an object");
    } catch (e) {
      throw new Error(`Invalid args JSON: ${(e as Error).message}`);
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("args must be a JSON object");
}

function hostItems(result: AnsibleRunResult, pairIdx: number) {
  const base = {
    module: result.module,
    checkMode: result.checkMode,
    exitCode: result.exitCode,
    argv: result.argv,
  };
  if (!result.hosts.length) {
    return [
      withPairedItem(
        {
          json: {
            ...base,
            host: "localhost",
            ok: !result.failed,
            changed: false,
            failed: result.failed,
            unreachable: false,
            skipped: false,
            result: {},
            stdout: result.stdout.slice(0, 8000),
            stderr: result.stderr.slice(0, 4000),
          },
        },
        pairIdx,
      ),
    ];
  }
  return result.hosts.map((h) =>
    withPairedItem(
      {
        json: {
          ...base,
          host: h.host,
          ok: h.ok,
          changed: h.changed,
          failed: h.failed,
          unreachable: h.unreachable,
          skipped: h.skipped,
          msg: h.msg,
          rc: h.rc,
          result: h.result,
        },
      },
      pairIdx,
    ),
  );
}

function mapSshCred(
  data: Record<string, unknown> | null,
  kind: "ansibleSsh" | "sshPassword" | "sshPrivateKey",
): AnsibleSshCredential | null {
  if (!data) return null;
  if (kind === "ansibleSsh") {
    return {
      host: data.host as string | undefined,
      port: data.port as number | string | undefined,
      username: data.username as string | undefined,
      password: data.password as string | undefined,
      privateKey: data.privateKey as string | undefined,
      passphrase: data.passphrase as string | undefined,
      becomePassword: data.becomePassword as string | undefined,
      becomeUser: data.becomeUser as string | undefined,
    };
  }
  if (kind === "sshPassword") {
    return {
      host: data.host as string | undefined,
      port: data.port as number | string | undefined,
      username: data.username as string | undefined,
      password: data.password as string | undefined,
    };
  }
  return {
    host: data.host as string | undefined,
    port: data.port as number | string | undefined,
    username: data.username as string | undefined,
    privateKey: data.privateKey as string | undefined,
    passphrase: data.passphrase as string | undefined,
  };
}

async function resolveCredential(
  ctx: Parameters<NodeExecutor>[0],
): Promise<AnsibleSshCredential | null> {
  const auth = ctx.getParam<string>("authentication", "none");
  if (auth === "none" || !auth) {
    // Still try ansibleSsh if bound without auth mode
    const loose = await ctx.getCredential("ansibleSsh").catch(() => null);
    if (loose) return mapSshCred(loose, "ansibleSsh");
    return null;
  }
  if (auth === "ansibleSsh") {
    const data = await ctx.getCredential("ansibleSsh");
    if (!data) throw new Error('Ansible: credential "ansibleSsh" is not configured on this node');
    return mapSshCred(data, "ansibleSsh");
  }
  if (auth === "sshPassword") {
    const data = await ctx.getCredential("sshPassword");
    if (!data) throw new Error('Ansible: credential "sshPassword" is not configured on this node');
    return mapSshCred(data, "sshPassword");
  }
  if (auth === "sshPrivateKey") {
    const data = await ctx.getCredential("sshPrivateKey");
    if (!data)
      throw new Error('Ansible: credential "sshPrivateKey" is not configured on this node');
    return mapSshCred(data, "sshPrivateKey");
  }
  return null;
}

export const ansibleExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items = inputItems.length ? inputItems : [{ json: {} }];
  const executeOnce = ctx.getParam<boolean>("executeOnce", true);
  const contOnFail = ctx.continueOnFail();

  const runFor = async (json: Record<string, unknown>, pairIdx: number) => {
    const moduleRaw = ctx.getParam<string>("module", "");
    const module = (ctx.evaluate(moduleRaw, json) as string) ?? moduleRaw;
    const hostsRaw = ctx.getParam<string>("hosts", "localhost");
    const hosts = String((ctx.evaluate(hostsRaw, json) as string) ?? hostsRaw);
    const inventoryRaw = ctx.getParam<string>("inventory", "");
    const inventory = String((ctx.evaluate(inventoryRaw, json) as string) ?? inventoryRaw);
    const argsParam = ctx.getParam<unknown>("args", {});
    let args = asArgs(argsParam);
    if (args) {
      const evaluated: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args)) {
        if (typeof v === "string") {
          evaluated[k] = ctx.evaluate(v, json) ?? v;
        } else {
          evaluated[k] = v;
        }
      }
      args = evaluated;
    }

    const checkMode = ctx.getParam<boolean>("checkMode", false);
    const become = ctx.getParam<boolean>("become", false);
    const becomeUser = ctx.getParam<string>("becomeUser", "");
    const connection = ctx.getParam<string>("connection", "");
    const timeout = ctx.getParam<number>("timeout", 120);

    let prepared: Awaited<ReturnType<typeof prepareAnsibleAuth>> = null;
    try {
      const cred = await resolveCredential(ctx);
      prepared = await prepareAnsibleAuth({
        credential: cred,
        hostsParam: hosts,
        inventoryParam: inventory,
        becomeParam: become,
        becomeUserParam: becomeUser,
        connectionParam: connection,
      });

      const result = await runAnsibleModuleWithTestHook({
        module,
        args,
        hosts: prepared?.hostPattern ?? hosts,
        inventory: prepared?.inventoryPath ?? (inventory || undefined),
        checkMode,
        become: prepared?.become ?? become,
        becomeUser: prepared?.becomeUser ?? (becomeUser || undefined),
        connection: prepared?.connection ?? (connection || undefined),
        timeoutSec: timeout,
        extraEnv: prepared?.env,
        redactArgv: true,
      });
      if (result.failed && !contOnFail) {
        const msg =
          result.hosts.find((h) => h.failed || h.unreachable)?.msg ||
          result.stderr ||
          `Ansible failed (exit ${result.exitCode})`;
        throw new Error(msg);
      }
      return hostItems(result, pairIdx);
    } catch (err) {
      if (contOnFail) {
        return [
          withPairedItem(
            {
              json: {
                ...json,
                error: (err as Error).message,
                failed: true,
              },
            },
            pairIdx,
          ),
        ];
      }
      throw err;
    } finally {
      if (prepared) await prepared.cleanup();
    }
  };

  if (executeOnce) {
    const out = await runFor(items[0]!.json as Record<string, unknown>, 0);
    return [out];
  }

  const all = [];
  for (let i = 0; i < items.length; i++) {
    const part = await runFor(items[i]!.json as Record<string, unknown>, i);
    all.push(...part);
  }
  return [all];
};
