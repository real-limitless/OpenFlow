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

async function runCommand(cmd: string): Promise<CommandResult> {
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
    if (typeof nodeErr.code === "number" && nodeErr.code !== 127) {
      return { stdout, stderr, exitCode: nodeErr.code };
    }
    throw err;
  }
}

export const executeCommandToolExecutor: NodeExecutor = async (ctx) => {
  if (ctx.getInputItems(0).length === 0) {
    const handle = {
      type: "n8n-nodes-base.executeCommandTool",
      name: String(ctx.getParam("toolName", "execute_command")),
      description: String(
        ctx.getParam("description", "Run a shell command and return stdout/stderr/exitCode"),
      ),
      schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
      async invoke(args: Record<string, unknown>) {
        const command = String(args.command ?? ctx.getParam("command", "") ?? "");
        if (!command) throw new Error("Command parameter is required");
        const result = await runCommand(command);
        return {
          content: JSON.stringify({
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }),
        };
      },
    };
    return [
      [{ json: handle as unknown as Record<string, unknown>, pairedItem: { item: 0, input: 0 } }],
    ];
  }

  const inputItems = ctx.getInputItems(0);
  const executeOnce = ctx.getParam<boolean>("executeOnce", false);
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
      (ctx.evaluate(commandTemplate, inputItems[0].json) as string) ?? commandTemplate;
    try {
      const result = await runCommand(evaluated);
      return [
        [{ json: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } }],
      ];
    } catch (err) {
      if (contOnFail) {
        return [[{ json: { error: (err as Error).message } }]];
      }
      throw err;
    }
  }

  const results = await Promise.all(
    inputItems.map(async (item, idx) => {
      const cmd = (ctx.evaluate(commandTemplate, item.json) as string) ?? commandTemplate;
      try {
        const result = await runCommand(cmd);
        return withPairedItem(
          { json: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } },
          idx,
        );
      } catch (err) {
        if (contOnFail) {
          return withPairedItem({ json: { error: (err as Error).message } }, idx);
        }
        throw err;
      }
    }),
  );

  return [results];
};
