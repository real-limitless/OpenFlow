import type { NodeExecutor } from "../types";

const MAX_WAIT_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const waitExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const resume = (node.parameters.resume as string) ?? "timeInterval";

  if (resume === "timeInterval") {
    const amount = (node.parameters.amount as number) ?? 1;
    const unit = (node.parameters.unit as string) ?? "hours";

    let ms: number;
    switch (unit) {
      case "seconds": ms = amount * 1000; break;
      case "minutes": ms = amount * 60 * 1000; break;
      case "hours": ms = amount * 60 * 60 * 1000; break;
      case "days": ms = amount * 24 * 60 * 60 * 1000; break;
      default: ms = amount * 1000;
    }

    await sleep(Math.min(ms, MAX_WAIT_MS));
  } else if (resume === "specificTime") {
    const raw = node.parameters.dateTime as string | number | undefined;
    const target = raw ? new Date(raw) : new Date();
    const now = new Date();
    let ms = target.getTime() - now.getTime();
    if (ms <= 0) ms = 0;

    await sleep(Math.min(ms, MAX_WAIT_MS));
  }

  // "webhook" resume mode — for now, pass through.
  // Full implementation would persist state and wait for an external resume signal.

  return [inputItems.length > 0 ? inputItems : [{ json: {} }]];
};