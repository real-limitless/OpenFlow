import type { INodeExecutionData } from "../workflow/types";

export class WaitPausedError extends Error {
  readonly resume: string;
  readonly resumeAt: string | null;
  readonly items: INodeExecutionData[];
  readonly nodeName: string;

  constructor(opts: {
    resume: string;
    resumeAt?: Date | null;
    items: INodeExecutionData[];
    nodeName: string;
  }) {
    super("execution paused on Wait");
    this.name = "WaitPausedError";
    this.resume = opts.resume;
    this.resumeAt = opts.resumeAt ? opts.resumeAt.toISOString() : null;
    this.items = opts.items;
    this.nodeName = opts.nodeName;
  }
}

export function isWaitPausedError(err: unknown): err is WaitPausedError {
  return Boolean(err && typeof err === "object" && (err as Error).name === "WaitPausedError");
}

export function workflowExecutionId(workflow: { __executionId?: unknown } | undefined): string | undefined {
  const id = workflow?.__executionId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}
