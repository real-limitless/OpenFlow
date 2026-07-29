import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";

export const mergeExecutor: NodeExecutor = async (ctx, node) => {
  const mode = (node.parameters.mode as string) ?? "append";
  const inputCount = Math.max(2, Number(node.parameters.numberInputs ?? 2));

  const inputs: INodeExecutionData[][] = [];
  for (let i = 0; i < inputCount; i++) {
    inputs.push(ctx.getNodeInputItems(node.name, i));
  }

  if (mode === "append") {
    return [inputs.flat()];
  }

  if (mode === "combine") {
    const combineBy = (node.parameters.combineBy as string) ?? "combineByFields";
    const options = (node.parameters.options as Record<string, unknown>) ?? {};
    const includeUnpaired = options.includeUnpaired === true;

    if (combineBy === "combineByPosition") {
      const maxLen = Math.max(0, ...inputs.map((i) => i.length));
      const result: INodeExecutionData[] = [];
      const unpaired: INodeExecutionData[] = [];
      for (let idx = 0; idx < maxLen; idx++) {
        const present = inputs.filter((input) => idx < input.length);
        if (present.length === inputs.length) {
          const merged: Record<string, unknown> = {};
          for (const input of inputs) {
            Object.assign(merged, input[idx].json);
          }
          result.push({ json: merged });
        } else if (includeUnpaired) {
          for (const input of present) {
            unpaired.push({ json: { ...input[idx].json } });
          }
        }
      }
      result.push(...unpaired);
      return [result];
    }

    if (combineBy === "combineByFields") {
      const fieldsRaw = (node.parameters.fieldsToMatchString as string) ?? "";
      const fields = fieldsRaw
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      const keyOf = (json: Record<string, unknown>): string =>
        fields.map((f) => String(json[f] ?? "")).join("\u0000");

      const map = new Map<string, INodeExecutionData>();
      const unpaired: INodeExecutionData[] = [];
      for (const input of inputs) {
        for (const item of input) {
          const k = keyOf(item.json);
          if (!k) {
            unpaired.push(item);
            continue;
          }
          const existing = map.get(k);
          if (existing) {
            map.set(k, { json: { ...existing.json, ...item.json } });
          } else {
            map.set(k, { json: { ...item.json } });
          }
        }
      }
      const result = Array.from(map.values());
      if (includeUnpaired) result.push(...unpaired);
      return [result];
    }

    if (combineBy === "combineAll") {
      let result: INodeExecutionData[] =
        inputs[0]?.map((item) => ({ json: { ...item.json } })) ?? [];
      for (let i = 1; i < inputs.length; i++) {
        const next: INodeExecutionData[] = [];
        for (const a of result) {
          for (const b of inputs[i]) {
            next.push({ json: { ...a.json, ...b.json } });
          }
        }
        result = next;
      }
      return [result];
    }
  }

  if (mode === "chooseBranch") {
    const output = (node.parameters.output as string) ?? "0";
    const branchIdx = parseInt(String(output), 10);
    const idx = Number.isNaN(branchIdx) ? 0 : branchIdx;
    return [inputs[idx] ?? []];
  }

  return [inputs.flat()];
};
