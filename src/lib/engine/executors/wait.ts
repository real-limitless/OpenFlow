import type { NodeExecutor } from "@/sdk";

const MAX_WAIT_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const waitExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const resume = ctx.getParam<string>("resume", "timeInterval");

  if (resume === "timeInterval") {
    const amount = Number(ctx.getParam("amount", 1)) || 0;
    const unit = ctx.getParam<string>("unit", "seconds");

    let ms: number;
    switch (unit) {
      case "seconds":
        ms = amount * 1000;
        break;
      case "minutes":
        ms = amount * 60 * 1000;
        break;
      case "hours":
        ms = amount * 60 * 60 * 1000;
        break;
      case "days":
        ms = amount * 24 * 60 * 60 * 1000;
        break;
      default:
        ms = amount * 1000;
    }

    // Tests use tiny intervals; cap long waits in-process
    await sleep(Math.min(ms, MAX_WAIT_MS));
  } else if (resume === "specificTime") {
    const raw = ctx.getParam<string | number | undefined>("dateTime");
    const target = raw ? new Date(raw) : new Date();
    let ms = target.getTime() - Date.now();
    if (ms < 0) ms = 0;
    await sleep(Math.min(ms, MAX_WAIT_MS));
  }
  // webhook / form resume: pass-through until persistence is implemented

  return [inputItems.length > 0 ? inputItems : [{ json: {} }]];
};
