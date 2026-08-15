import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";
import {
  runAnsibleModuleWithTestHook,
  runAnsiblePlaybookWithTestHook,
  type AnsibleRunResult,
} from "./ansible-runner";
import { prepareAnsibleAuth, type AnsibleSshCredential } from "./ansible-auth";

function asObject(value: unknown, label: string): Record<string, unknown> | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      throw new Error(`${label} JSON must be an object`);
    } catch (e) {
      throw new Error(`Invalid ${label} JSON: ${(e as Error).message}`);
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${label} must be a JSON object`);
}

function hostItems(result: AnsibleRunResult, pairIdx: number) {
  const base = {
    kind: result.kind,
    module: result.module,
    playbook: result.playbook,
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

function evalObject(
  ctx: Parameters<NodeExecutor>[0],
  obj: Record<string, unknown> | null,
  json: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!obj) return null;
  const evaluated: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      evaluated[k] = ctx.evaluate(v, json) ?? v;
    } else {
      evaluated[k] = v;
    }
  }
  return evaluated;
}

export const ansibleExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items = inputItems.length ? inputItems : [{ json: {} }];
  const executeOnce = ctx.getParam<boolean>("executeOnce", true);
  const contOnFail = ctx.continueOnFail();

  const runFor = async (json: Record<string, unknown>, pairIdx: number) => {
    const resource = ctx.getParam<string>("resource", "module") || "module";
    const hostsRaw = ctx.getParam<string>("hosts", "localhost");
    const hosts = String((ctx.evaluate(hostsRaw, json) as string) ?? hostsRaw);
    const inventoryRaw = ctx.getParam<string>("inventory", "");
    const inventory = String((ctx.evaluate(inventoryRaw, json) as string) ?? inventoryRaw);
    const checkMode = ctx.getParam<boolean>("checkMode", false);
    const become = ctx.getParam<boolean>("become", false);
    const becomeUser = ctx.getParam<string>("becomeUser", "");
    const connection = ctx.getParam<string>("connection", "");
    const timeout = ctx.getParam<number>("timeout", resource === "playbook" ? 300 : 120);

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

      const inv = prepared?.inventoryPath ?? (inventory || undefined);
      const becomeFinal = prepared?.become ?? become;
      const becomeUserFinal = prepared?.becomeUser ?? (becomeUser || undefined);
      const connectionFinal = prepared?.connection ?? (connection || undefined);

      let result: AnsibleRunResult;
      if (resource === "playbook") {
        const playbookRaw = ctx.getParam<string>("playbook", "");
        const playbook = String((ctx.evaluate(playbookRaw, json) as string) ?? playbookRaw).trim();
        if (!playbook) throw new Error("Playbook path is required");
        const extraVars = evalObject(
          ctx,
          asObject(ctx.getParam<unknown>("extraVars", {}), "extraVars"),
          json,
        );
        const limit = String(
          (ctx.evaluate(ctx.getParam<string>("limit", ""), json) as string) ?? "",
        ).trim();
        const tags = String(
          (ctx.evaluate(ctx.getParam<string>("tags", ""), json) as string) ?? "",
        ).trim();
        const skipTags = String(
          (ctx.evaluate(ctx.getParam<string>("skipTags", ""), json) as string) ?? "",
        ).trim();

        result = await runAnsiblePlaybookWithTestHook({
          playbook,
          inventory: inv,
          checkMode,
          become: becomeFinal,
          becomeUser: becomeUserFinal,
          connection: connectionFinal,
          extraVars,
          limit: limit || undefined,
          tags: tags || undefined,
          skipTags: skipTags || undefined,
          timeoutSec: timeout,
          extraEnv: prepared?.env,
          redactArgv: true,
        });
      } else {
        const moduleRaw = ctx.getParam<string>("module", "");
        const module = (ctx.evaluate(moduleRaw, json) as string) ?? moduleRaw;
        const args = evalObject(ctx, asObject(ctx.getParam<unknown>("args", {}), "args"), json);
        result = await runAnsibleModuleWithTestHook({
          module,
          args,
          hosts: prepared?.hostPattern ?? hosts,
          inventory: inv,
          checkMode,
          become: becomeFinal,
          becomeUser: becomeUserFinal,
          connection: connectionFinal,
          timeoutSec: timeout,
          extraEnv: prepared?.env,
          redactArgv: true,
        });
      }

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
