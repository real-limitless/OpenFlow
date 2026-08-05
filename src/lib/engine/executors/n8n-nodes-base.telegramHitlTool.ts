import type { NodeExecutor } from "@/sdk";

export const telegramHitlToolExecutor: NodeExecutor = async (ctx) => {
  const chatId = ctx.getParam<string>("chatId", "");
  if (!chatId) {
    throw new Error("Telegram HITL: chatId parameter is required");
  }

  const rawMessage = ctx.getParam<string>("message", "The AI wants to use {{ $tool.name }} with:\n{{ JSON.stringify($tool.parameters, null, 2) }}");
  const approveButtonText = ctx.getParam<string>("approveButtonText", "Approve");
  const denyButtonText = ctx.getParam<string>("denyButtonText", "Deny");

  const credential = await ctx.getCredential("telegramApi");
  if (!credential) {
    throw new Error("Telegram HITL: telegramApi credential required");
  }
  const botToken = String((credential as Record<string, unknown>).accessToken ?? "");
  if (!botToken) {
    throw new Error("Telegram HITL: telegramApi credential required");
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

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: approveButtonText, callback_data: "approve" },
        { text: denyButtonText, callback_data: "deny" },
      ],
    ],
  };

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: renderedMessage,
      reply_markup: inlineKeyboard,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram HITL: HTTP ${response.status} sending approval message: ${errorBody}`);
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(`Telegram HITL: Telegram API error: ${json.description ?? "unknown"}`);
  }

  return [[{ json: { chatId, messageId: json.result?.message_id, status: "pending_approval", toolName, toolParameters: toolParamsStr } }]];
};
