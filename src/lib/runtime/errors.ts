export class LiteRuntimeError extends Error {
  readonly code: "unsupported_nodes" | "invalid_workflow" | "missing_executor" | "tool_policy";
  readonly unsupportedNodes?: Array<{ name: string; type: string }>;

  constructor(
    message: string,
    code: LiteRuntimeError["code"],
    unsupportedNodes?: Array<{ name: string; type: string }>,
  ) {
    super(message);
    this.name = "LiteRuntimeError";
    this.code = code;
    this.unsupportedNodes = unsupportedNodes;
  }
}
