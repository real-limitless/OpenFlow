import type { NodeExecutor } from "@/sdk";

export const timeSavedExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "once");
  const minutesSaved = ctx.getParam<number>("minutesSaved", 0);

  const existing = ctx.getCustomData("timeSaved");
  const prev = existing ? Number(existing) : 0;
  let contribution = minutesSaved;
  if (mode === "perItem") {
    contribution = inputItems.length * minutesSaved;
  }
  ctx.setCustomData("timeSaved", String(prev + contribution));

  return [inputItems];
};
