import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";
import { runAnsibleModuleWithTestHook, type AnsibleRunResult } from "./ansible-runner";

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
    // Allow expression strings inside args object values via re-parse after stringify evaluate — keep simple: if string args already handled
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

    try {
      const result = await runAnsibleModuleWithTestHook({
        module,
        args,
        hosts,
        inventory: inventory || undefined,
        checkMode,
        become,
        becomeUser: becomeUser || undefined,
        connection: connection || undefined,
        timeoutSec: timeout,
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
