import type { NodeExecutor } from "@/sdk";

export const limitExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const rawMax = ctx.getParam<number>("maxItems", 0);
  const maxItems = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 0;
  const keep = ctx.getParam<string>("keep", "firstItems");

  if (inputItems.length <= maxItems) {
    return [inputItems];
  }

  if (keep === "lastItems" || keep === "last") {
    return [inputItems.slice(inputItems.length - maxItems)];
  }

  return [inputItems.slice(0, maxItems)];
};
