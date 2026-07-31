import { exec } from "child_process";
import { promisify } from "util";
import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";

const execAsync = promisify(exec);

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runCommand(
  cmd: string,
): Promise<CommandResult> {
  try {
    const result = await execAsync(cmd);
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err) {
    const nodeErr = err as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    const stdout = nodeErr.stdout ?? "";
    const stderr = nodeErr.stderr ?? "";

    // Numeric exit code — not a system error; return result with exitCode
    // Exit code 127 usually means command not found via the shell — throw
    if (typeof nodeErr.code === "number" && nodeErr.code !== 127) {
      return { stdout, stderr, exitCode: nodeErr.code };
    }

    // System error: ENOENT, maxBuffer, etc. — throw
    throw err;
  }
}

export const executeCommandExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const executeOnce = ctx.getParam<boolean>("executeOnce", true);
  const commandTemplate = ctx.getParam<string>("command", "");
  const contOnFail = ctx.continueOnFail();

  if (!commandTemplate) {
    throw new Error("Command parameter is required");
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  if (executeOnce) {
    const evaluated =
      (ctx.evaluate(commandTemplate, inputItems[0].json) as string) ??
      commandTemplate;
    try {
      const result = await runCommand(evaluated);
      return [
        inputItems.map((item, idx) =>
          withPairedItem(
            {
              json: {
                ...item.json,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
              },
              binary: item.binary,
            },
            idx,
          ),
        ),
      ];
    } catch (err) {
      if (contOnFail) {
        return [
          inputItems.map((item, idx) =>
            withPairedItem(
              { json: { error: (err as Error).message }, binary: item.binary },
              idx,
            ),
          ),
        ];
      }
      throw err;
    }
  }

  const results = await Promise.all(
    inputItems.map(async (item, idx) => {
      const cmd =
        (ctx.evaluate(commandTemplate, item.json) as string) ??
        commandTemplate;
      try {
        const result = await runCommand(cmd);
        return withPairedItem(
          {
            json: {
              ...item.json,
              stdout: result.stdout,
              stderr: result.stderr,
              exitCode: result.exitCode,
            },
            binary: item.binary,
          },
          idx,
        );
      } catch (err) {
        if (contOnFail) {
          return withPairedItem(
            { json: { error: (err as Error).message, ...item.json }, binary: item.binary },
            idx,
          );
        }
        throw err;
      }
    }),
  );

  return [results];
};