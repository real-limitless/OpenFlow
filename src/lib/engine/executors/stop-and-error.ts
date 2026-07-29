import type { NodeExecutor } from "@/sdk";

export const stopAndErrorExecutor: NodeExecutor = async (ctx) => {
  const errorType = ctx.getParam<string>("errorType", "errorMessage");

  if (errorType === "errorObject") {
    const raw = ctx.getParam<unknown>("errorObject", {});
    let obj: unknown = raw;
    if (typeof raw === "string") {
      try {
        obj = JSON.parse(raw);
      } catch {
        obj = { message: raw };
      }
    }
    const message =
      obj && typeof obj === "object" && obj !== null && "message" in obj
        ? String((obj as { message: unknown }).message)
        : JSON.stringify(obj);
    const err = new Error(message || "Stop and Error");
    (err as Error & { errorObject?: unknown }).errorObject = obj;
    throw err;
  }

  const message = String(ctx.getParam("errorMessage", "Workflow stopped with an error"));
  throw new Error(message);
};
