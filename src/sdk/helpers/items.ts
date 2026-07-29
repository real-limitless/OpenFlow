import type { INodeExecutionData } from "@/lib/workflow/types";

export function ensureItems(
  items: INodeExecutionData[],
  fallback: INodeExecutionData = { json: {} },
): INodeExecutionData[] {
  return items.length > 0 ? items : [fallback];
}

export function mapItems(
  items: INodeExecutionData[],
  fn: (item: INodeExecutionData, index: number) => INodeExecutionData,
): INodeExecutionData[] {
  return items.map(fn);
}

export function withPairedItem(
  item: INodeExecutionData,
  index: number,
  input = 0,
): INodeExecutionData {
  if (item.pairedItem) return item;
  return { ...item, pairedItem: { item: index, input } };
}
