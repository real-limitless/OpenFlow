import type { INodeExecutionData } from "@/sdk";
export declare function runPythonNative(code: string, mode: string, items: INodeExecutionData[], activeItem?: INodeExecutionData): Promise<unknown>;
