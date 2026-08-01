import type { NodeExecutor } from "@/sdk";

export const kafkaExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const topic = ctx.getParam<string>("topic", "");
  const sendInputData = ctx.getParam<boolean>("sendInputData", true);
  const message = ctx.getParam<string>("message", "");
  const useSchemaRegistry = ctx.getParam<boolean>("useSchemaRegistry", false);
  const schemaRegistryUrl = ctx.getParam<string>("schemaRegistryUrl", "");
  const eventName = ctx.getParam<string>("eventName", "");
  const useKey = ctx.getParam<boolean>("useKey", false);
  const key = ctx.getParam<string>("key", "");
  const headers = ctx.getParam<any>("headers", {});
  const acks = ctx.getParam<boolean>("acks", false);
  const compression = ctx.getParam<boolean>("compression", false);
  const timeout = ctx.getParam<number>("timeout", 30000);
  // Simple passthrough for now; real publishing would be added later
  return items;
};