import type { NodeExecutor } from "@/sdk";

export const orbitExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const continueOnFail = ctx.continueOnFail();

  const deprecationMsg =
    "Orbit (orbit.love) was shut down on July 11, 2025 after joining Postman. " +
    "This node is deprecated and no longer functional.";

  if (continueOnFail) {
    return [
      items.map((item) => ({
        json: {},
        error: { message: deprecationMsg },
        pairedItem: { item: 0 },
      })),
    ];
  }

  const err = new Error(deprecationMsg);
  (err as Record<string, unknown>).errorType = "NodeApiError";
  (err as Record<string, unknown>).level = "warning";
  throw err;
};
