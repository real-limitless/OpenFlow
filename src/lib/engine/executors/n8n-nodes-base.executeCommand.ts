import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

/** Resolve a possible expression string using the item JSON context. */
function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  // n8n expressions are wrapped in {{ }} or start with =
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

/** Execute a shell command, capturing stdout, stderr and exit code. */
async function runShell(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
    return { exitCode: 0, stdout, stderr };
  } catch (err: any) {
    // exec throws on non‑zero exit codes; err.code holds the exit status
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? "";
    const exitCode = typeof err.code === "number" ? err.code : 1;
    return { exitCode, stdout, stderr };
  }
}

export const executeCommandExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const executeOnce = ctx.getParam<boolean>("executeOnce", false);
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];
  const indices = executeOnce ? [0] : items.map((_, i) => i);

  for (const i of indices) {
    const item = items[i];
    try {
      const rawCmd = ctx.getParam<string>("command", "");
      const cmd = String(resolveValue(rawCmd, item.json));
      const result = await runShell(cmd);
      out.push({
        json: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        pairedItem: { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: { item: i, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }

  return [out];
};
