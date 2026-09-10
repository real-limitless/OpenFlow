import type { INodeExecutionData } from "@/lib/workflow/types";
export declare function ensureItems(items: INodeExecutionData[], fallback?: INodeExecutionData): INodeExecutionData[];
export declare function mapItems(items: INodeExecutionData[], fn: (item: INodeExecutionData, index: number) => INodeExecutionData): INodeExecutionData[];
export declare function withPairedItem(item: INodeExecutionData, index: number, input?: number): INodeExecutionData;
