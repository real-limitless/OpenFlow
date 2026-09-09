import type { INodeExecutionData } from "@/sdk";
export declare function runPythonPyodide(code: string, mode: string, items: INodeExecutionData[], activeItem?: INodeExecutionData): Promise<unknown>;
/** Test helper: drop cached interpreter so cold-load paths can be exercised. */
export declare function resetPyodideForTests(): void;
