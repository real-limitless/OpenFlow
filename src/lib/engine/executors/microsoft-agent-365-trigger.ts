import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const MCP_TOOL_IDS = [
  "mcp_Admin365_GraphTools",
  "mcp_AdminTools",
  "mcp_CalendarTools",
  "mcp_DASearch",
  "mcp_ExcelServer",
  "mcp_KnowledgeTools",
  "mcp_M365Copilot",
  "mcp_MailTools",
  "mcp_OneDriveRemoteServer",
  "mcp_ODSPRemoteServer",
  "mcp_PlannerServer",
  "mcp_SharePointRemoteServer",
  "mcp_SharePointListsTools",
  "mcp_TaskPersonalizationServer",
  "mcp_TeamsServer",
  "mcp_TeamsCanaryServer",
  "mcp_TeamsServerV1",
  "mcp_WebSearchTools",
  "mcp_W365ComputerUse",
  "mcp_WordServer",
];

/**
 * Microsoft Agent 365 Trigger — receives incoming HTTP requests from the
 * Microsoft Bot Framework (webhook). Passes the parsed Bot Framework Activity
 * payload through as the output item.
 *
 * This is a trigger node: it does not consume items from a previous node.
 * Input items come from the webhook host layer, each representing one inbound
 * request.
 *
 * Gaps (documented TODOs):
 * - Bot Framework JWT token validation against credential's Client ID
 *   (n8n >= 2.25.7 / 2.26.2). Host-level concern, not implemented here.
 * - Webhook URL registration/unregistration on activate/deactivate.
 * - Actual MCP tool invocation for Microsoft Work IQ (useMcpTools). The
 *   executor passes the selected tool IDs as metadata; MCP routing is a
 *   host-level concern.
 * - Memory session scoping per conversation.id — delegated to the memory
 *   sub-node's session ID key configuration.
 */
export const microsoftAgent365TriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const systemPrompt = ctx.getParam<string>("systemPrompt");
  const useMcpTools = ctx.getParam<boolean>("useMcpTools", false);
  const include = ctx.getParam<string>("include", "all");
  const includeTools = ctx.getParam<unknown[]>("includeTools", []);
  const hasOutputParser = ctx.getParam<boolean>("hasOutputParser", false);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const maxIterations = options.maxIterations as number | undefined;
  const welcomeMessage = options.welcomeMessage as string | undefined;

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const req = (item.json ?? {}) as Record<string, unknown>;

    const activityFields: Record<string, unknown> = {
      activityId: req.activityId ?? "",
      from: req.from ?? { id: "", name: "" },
      conversation: req.conversation ?? { id: "", conversationType: "" },
      text: req.text ?? "",
      type: req.type ?? "message",
      timestamp: req.timestamp ?? new Date().toISOString(),
      channelId: req.channelId ?? "msteams",
      serviceUrl: req.serviceUrl ?? "",
    };

    const metadata: Record<string, unknown> = {};

    if (systemPrompt) {
      metadata.systemPrompt = systemPrompt;
    }

    if (welcomeMessage) {
      metadata.welcomeMessage = welcomeMessage;
    }

    metadata.hasOutputParser = hasOutputParser;

    if (maxIterations != null) {
      metadata.maxIterations = maxIterations;
    }

    if (useMcpTools) {
      metadata.useMcpTools = true;
      if (include === "selected" && Array.isArray(includeTools)) {
        metadata.includeTools = includeTools.filter(
          (t): t is string => typeof t === "string" && MCP_TOOL_IDS.includes(t),
        );
      } else {
        metadata.includeTools = MCP_TOOL_IDS;
      }
    }

    out.push({
      json: {
        ...activityFields,
        ...metadata,
        headers: req.headers ?? {},
        query: req.query ?? {},
        webhookUrl: req.webhookUrl ?? "",
        executionMode: req.executionMode ?? "test",
      },
      binary: item.binary,
    });
  }

  return [out];
};
