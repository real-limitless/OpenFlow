import type { ExecutionRunData } from "@/lib/engine/types";

export type ExecutionStreamHandlers = {
  onStatus?: (payload: { status: string; runData?: ExecutionRunData }) => void;
  onComplete?: (payload: { status: string; data?: ExecutionRunData }) => void;
  onTimeout?: () => void;
  onError?: (message?: string) => void;
};

export function openExecutionStream(
  executionId: string,
  handlers: ExecutionStreamHandlers,
): EventSource {
  const sse = new EventSource(`/api/v1/executions/${executionId}/stream`);
  sse.onmessage = (event) => {
    let data: {
      type?: string;
      status?: string;
      runData?: unknown;
      data?: unknown;
      message?: string;
    };
    try {
      data = JSON.parse(event.data) as typeof data;
    } catch {
      return;
    }
    if (data.type === "complete") {
      handlers.onComplete?.({
        status: String(data.status ?? ""),
        data: data.data as ExecutionRunData | undefined,
      });
      sse.close();
    } else if (data.type === "error") {
      handlers.onError?.(typeof data.message === "string" ? data.message : undefined);
      sse.close();
    } else if (data.type === "timeout") {
      handlers.onTimeout?.();
      sse.close();
    } else if (data.type === "status") {
      handlers.onStatus?.({
        status: String(data.status ?? ""),
        runData: data.runData as ExecutionRunData | undefined,
      });
    }
  };
  sse.onerror = () => {
    handlers.onError?.("Execution stream failed");
    sse.close();
  };
  return sse;
}
