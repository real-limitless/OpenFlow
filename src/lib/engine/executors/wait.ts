import type { NodeExecutor } from "@/sdk";
import { WaitPausedError, workflowExecutionId } from "../wait-pause";

const MAX_WAIT_MS = 5 * 60 * 1000;
/** Unit tests and tiny waits stay in-process. */
const INLINE_WAIT_MS = 2_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

function waitMs(amount: number, unit: string): number {
  switch (unit) {
    case "seconds":
      return amount * 1000;
    case "minutes":
      return amount * 60 * 1000;
    case "hours":
      return amount * 60 * 60 * 1000;
    case "days":
      return amount * 24 * 60 * 60 * 1000;
    default:
      return amount * 1000;
  }
}

export const waitExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items = inputItems.length > 0 ? inputItems : [{ json: {} }];
  const resume = ctx.getParam<string>("resume", "timeInterval");
  const executionId = workflowExecutionId(ctx.getWorkflow() as { __executionId?: string });
  const nodeName = ctx.getNode().name;

  if (resume === "webhook" || resume === "form") {
    if (executionId) {
      throw new WaitPausedError({ resume, items, nodeName });
    }
    return [items];
  }

  let ms = 0;
  let resumeAt: Date | null = null;
  if (resume === "timeInterval") {
    const amount = Number(ctx.getParam("amount", 1)) || 0;
    const unit = ctx.getParam<string>("unit", "seconds");
    ms = waitMs(amount, unit);
    resumeAt = new Date(Date.now() + ms);
  } else if (resume === "specificTime") {
    const raw = ctx.getParam<string | number | undefined>("dateTime");
    const target = raw ? new Date(raw) : new Date();
    ms = Math.max(0, target.getTime() - Date.now());
    resumeAt = target;
  }

  if (executionId && ms > INLINE_WAIT_MS) {
    throw new WaitPausedError({ resume, resumeAt, items, nodeName });
  }

  await sleep(Math.min(ms, MAX_WAIT_MS));
  return [items];
};
