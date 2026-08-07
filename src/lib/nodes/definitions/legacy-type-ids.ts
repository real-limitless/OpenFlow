import type { INodeTypeDescription } from "../types";

/**
 * Alternate type ids that appear in imported workflows / factory jobs.
 * Each is a real non-placeholder description so runtime gates pass; executors
 * are wired in node-runtime (often sharing the canonical module).
 */
function alt(
  name: string,
  displayName: string,
  category: INodeTypeDescription["category"],
  description: string,
): INodeTypeDescription {
  return {
    name,
    displayName,
    category,
    group: ["transform"],
    version: 1,
    description,
    defaults: { name: displayName },
    inputs: ["main"],
    outputs: ["main"],
    icon: "Package",
    properties: [],
    sources: [],
  };
}

export const discourseTool = alt(
  "n8n-nodes-base.discourseTool",
  "Discourse Tool",
  "Communication",
  "Discourse as an AI tool (same operations as Discourse).",
);

export const humanticAiTool = alt(
  "n8n-nodes-base.humanticAiTool",
  "Humantic AI Tool",
  "AI Tool",
  "Humantic AI as an AI tool.",
);

export const microsoftGraphSecurityTool = alt(
  "n8n-nodes-base.microsoftGraphSecurityTool",
  "Microsoft Graph Security Tool",
  "AI Tool",
  "Microsoft Graph Security as an AI tool.",
);

export const microsoftOneDriveTool = alt(
  "n8n-nodes-base.microsoftOneDriveTool",
  "Microsoft OneDrive Tool",
  "AI Tool",
  "Microsoft OneDrive as an AI tool.",
);

export const ouraTool = alt(
  "n8n-nodes-base.ouraTool",
  "Oura Tool",
  "AI Tool",
  "Oura as an AI tool.",
);

export const postHog = alt(
  "n8n-nodes-base.postHog",
  "PostHog",
  "Analytics",
  "Send events and identify users in PostHog.",
);

export const schedule = alt(
  "n8n-nodes-base.schedule",
  "Schedule",
  "Triggers",
  "Legacy id for Schedule Trigger.",
);

export const sendEmail = alt(
  "n8n-nodes-base.sendEmail",
  "Send Email",
  "Communication",
  "Legacy id for Email Send.",
);

export const venafiTlsProtectCloud = alt(
  "n8n-nodes-base.venafiTlsProtectCloud",
  "Venafi TLS Protect Cloud",
  "Development",
  "Venafi TLS Protect Cloud certificate operations.",
);

export const wordPress = alt(
  "n8n-nodes-base.wordPress",
  "WordPress",
  "Marketing",
  "Legacy casing for WordPress.",
);

export const telegramBot = alt(
  "n8n-nodes-base.telegramBot",
  "Telegram Bot",
  "Communication",
  "Legacy id for Telegram (aliases to Telegram).",
);
