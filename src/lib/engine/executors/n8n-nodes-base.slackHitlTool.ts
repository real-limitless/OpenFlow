import type { NodeExecutor } from "@/sdk";

export const slackHitlToolExecutor: NodeExecutor = async (ctx) => {
  const channel = ctx.getParam<string>("channel", "");
  if (!channel) {
    throw new Error("Slack HITL: channel parameter is required");
  }

  const rawMessage = ctx.getParam<string>("message", "The AI wants to use {{ $tool.name }} with:\n{{ JSON.stringify($tool.parameters, null, 2) }}");
  const approveButtonText = ctx.getParam<string>("approveButtonText", "Approve");
  const denyButtonText = ctx.getParam<string>("denyButtonText", "Deny");
  const authentication = ctx.getParam<string>("authentication", "accessToken");

  const credName = authentication === "oAuth2" ? "slackOAuth2Api" : "slackApi";
  const credential = await ctx.getCredential(credName);
  if (!credential) {
    throw new Error(`Slack HITL: Slack credentials required (${credName})`);
  }
  const accessToken = String((credential as Record<string, unknown>).accessToken ?? "");
  if (!accessToken) {
    throw new Error(`Slack HITL: Slack credentials required (${credName})`);
  }

  const toolName = (ctx as any).toolName ?? "Unknown Tool";
  const toolParamsRaw = (ctx as any).toolParameters ?? {};
  const toolParamsStr = typeof toolParamsRaw === "string" ? toolParamsRaw : JSON.stringify(toolParamsRaw, null, 2);

  const renderedMessage = rawMessage
    .replace(/\{\{\s*\$tool\.name\s*\}\}/g, toolName)
    .replace(/\{\{\s*\$tool\.parameters\s*\}\}/g, toolParamsStr)
    .replace(/\{\{\s*JSON\.stringify\(\s*\$tool\.parameters[^}]*\)\s*\}\}/g, toolParamsStr)
    .replace(/\$tool\.parameters/g, toolParamsStr)
    .replace(/\$tool\.name/g, toolName);

  const payload = {
    channel,
    text: renderedMessage,
    attachments: [
      {
        text: "Please approve or deny this tool execution request:",
        fallback: "Approve or deny the tool execution request.",
        callback_id: "slack_hitl_approval",
        color: "#3AA3E3",
        attachment_type: "default",
        actions: [
          {
            name: "approve",
            text: approveButtonText,
            type: "button",
            value: "approved",
            style: "primary",
          },
          {
            name: "deny",
            text: denyButtonText,
            type: "button",
            value: "denied",
            style: "danger",
          },
        ],
      },
    ],
  };

  const url = "https://slack.com/api/chat.postMessage";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Slack HITL: HTTP ${response.status} posting approval message: ${errorBody}`);
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(`Slack HITL: Slack API error: ${json.error ?? "unknown"}`);
  }

  return [[{ json: { channel, ts: Date.now(), status: "pending_approval", toolName, toolParameters: toolParamsStr } }]];
};
