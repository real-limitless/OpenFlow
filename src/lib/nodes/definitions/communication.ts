import type { INodeTypeDescription } from "../types";

const MAILGUN_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailgun/";

export const mailgun: INodeTypeDescription = {
  name: "n8n-nodes-base.mailgun",
  displayName: "Mailgun",
  category: "Communication",
  group: ["communication"],
  version: 1,
  description: "Sends transactional emails via Mailgun API",
  defaults: { name: "Mailgun" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Mail",
  sources: [MAILGUN_DOCS],
  properties: [
    {
      displayName: "From Email",
      name: "fromEmail",
      type: "string",
      default: "",
      required: true,
      placeholder: "Admin <admin@example.com>",
      description: "Sender address, optionally with display name",
    },
    {
      displayName: "To Email",
      name: "toEmail",
      type: "string",
      default: "",
      required: true,
      placeholder: "recipient@example.com",
      description: "Recipient address(es), comma-separated for multiple",
    },
    {
      displayName: "CC Email",
      name: "ccEmail",
      type: "string",
      default: "",
      description: "CC recipient address(es), comma-separated",
    },
    {
      displayName: "BCC Email",
      name: "bccEmail",
      type: "string",
      default: "",
      description: "BCC recipient address(es), comma-separated",
    },
    {
      displayName: "Subject",
      name: "subject",
      type: "string",
      default: "",
      description: "Email subject line",
    },
    {
      displayName: "Text",
      name: "text",
      type: "string",
      default: "",
      description: "Plain-text body (multi-line string)",
      typeOptions: { rows: 4 },
    },
    {
      displayName: "HTML",
      name: "html",
      type: "string",
      default: "",
      description: "HTML body (rich text editor)",
      typeOptions: { rows: 4 },
    },
    {
      displayName: "Attachments",
      name: "attachments",
      type: "string",
      default: "",
      placeholder: "myFile,report",
      description: "Comma-separated list of binary property names whose data should be attached",
    },
  ],
};

const MAILJET_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailjet/";

export const mailjet: INodeTypeDescription = {
  name: "n8n-nodes-base.mailjet",
  displayName: "Mailjet",
  category: "Communication",
  group: ["communication"],
  version: 1,
  description: "Sends transactional emails and SMS via Mailjet API",
  defaults: { name: "Mailjet" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Mail",
  sources: [MAILJET_DOCS],
  credentials: [
    { name: "mailjetEmailApi", required: false },
    { name: "mailjetSmsApi", required: false },
  ],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "email",
      required: true,
      options: [
        { name: "Email", value: "email" },
        { name: "SMS", value: "sms" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "send",
      required: true,
      displayOptions: {
        show: { resource: ["email"] },
      },
      options: [
        { name: "Send", value: "send" },
        { name: "Send Template", value: "sendTemplate" },
      ],
    },
    {
      displayName: "From Email",
      name: "fromEmail",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["email"] },
      },
      placeholder: "sender@example.com",
    },
    {
      displayName: "To Email",
      name: "toEmail",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["email"] },
      },
      placeholder: "recipient@example.com",
    },
    {
      displayName: "Subject",
      name: "subject",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["email"], operation: ["send"] },
      },
    },
    {
      displayName: "Text",
      name: "text",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["email"], operation: ["send"] },
      },
      typeOptions: { rows: 4 },
    },
    {
      displayName: "HTML",
      name: "html",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["email"], operation: ["send"] },
      },
      typeOptions: { rows: 4 },
    },
    {
      displayName: "JSON Parameters",
      name: "jsonParameters",
      type: "boolean",
      default: false,
      displayOptions: {
        show: { resource: ["email"] },
      },
    },
    {
      displayName: "Template ID",
      name: "templateId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["email"], operation: ["sendTemplate"] },
      },
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["email"] },
      },
      options: [
        {
          displayName: "BCC Email",
          name: "bccEmail",
          type: "string",
          default: "",
        },
        {
          displayName: "CC Addresses",
          name: "ccAddresses",
          type: "string",
          default: "",
        },
        {
          displayName: "From Name",
          name: "fromName",
          type: "string",
          default: "",
        },
        {
          displayName: "Priority",
          name: "priority",
          type: "number",
          default: 2,
          typeOptions: { minValue: 1, maxValue: 3 },
        },
        {
          displayName: "Reply To",
          name: "replyTo",
          type: "string",
          default: "",
        },
        {
          displayName: "Template Language",
          name: "templateLanguage",
          type: "boolean",
          default: false,
        },
        {
          displayName: "Track Clicks",
          name: "trackClicks",
          type: "options",
          default: "account_default",
          options: [
            { name: "Account Default", value: "account_default" },
            { name: "Enabled", value: "enabled" },
            { name: "Disabled", value: "disabled" },
          ],
        },
        {
          displayName: "Track Opens",
          name: "trackOpens",
          type: "options",
          default: "account_default",
          options: [
            { name: "Account Default", value: "account_default" },
            { name: "Enabled", value: "enabled" },
            { name: "Disabled", value: "disabled" },
          ],
        },
        {
          displayName: "Custom Campaign",
          name: "customCampaign",
          type: "string",
          default: "",
        },
        {
          displayName: "Deduplicate Campaign",
          name: "deduplicateCampaign",
          type: "boolean",
          default: false,
        },
      ],
    },
    {
      displayName: "Variables UI",
      name: "variablesUi",
      type: "fixedCollection",
      default: {},
      displayOptions: {
        show: { resource: ["email"], jsonParameters: [false] },
      },
      options: [
        {
          name: "variablesValues",
          displayName: "Variables",
          values: [
            {
              displayName: "Name",
              name: "name",
              type: "string",
              default: "",
            },
            {
              displayName: "Value",
              name: "value",
              type: "string",
              default: "",
            },
          ],
        },
      ],
    },
    {
      displayName: "Variables JSON",
      name: "variablesJson",
      type: "json",
      default: "",
      displayOptions: {
        show: { resource: ["email"], jsonParameters: [true] },
      },
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "send",
      required: true,
      displayOptions: {
        show: { resource: ["sms"] },
      },
      options: [{ name: "Send", value: "send" }],
    },
    {
      displayName: "From",
      name: "from",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["sms"], operation: ["send"] },
      },
      placeholder: "MyApp",
    },
    {
      displayName: "To",
      name: "to",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["sms"], operation: ["send"] },
      },
      placeholder: "+33612345678",
    },
    {
      displayName: "Text",
      name: "text",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["sms"], operation: ["send"] },
      },
      typeOptions: { rows: 4 },
    },
  ],
};

const GOOGLE_CHAT_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlechat/";

export const googleChat: INodeTypeDescription = {
  name: "n8n-nodes-base.googleChat",
  displayName: "Google Chat",
  category: "Communication",
  group: ["communication"],
  version: 1,
  description: "Send and receive messages via Google Chat API",
  defaults: { name: "Google Chat" },
  inputs: ["main"],
  outputs: ["main"],
  credentials: [
    { name: "googleChatOAuth2Api", required: false },
    { name: "googleApi", required: false },
  ],
  icon: "MessageSquare",
  sources: [GOOGLE_CHAT_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "message",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Member", value: "member" },
        { name: "Message", value: "message" },
        { name: "Space", value: "space" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      required: true,
      displayOptions: {
        show: { resource: ["member"] },
      },
      options: [
        { name: "Get All", value: "getAll" },
        { name: "Get", value: "get" },
      ],
    },
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: true,
      displayOptions: {
        show: { resource: ["member"], operation: ["getAll"] },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      displayOptions: {
        show: { resource: ["member"], operation: ["getAll"], returnAll: [false] },
      },
      typeOptions: { minValue: 1 },
    },
    {
      displayName: "Space ID",
      name: "spaceId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["member"] },
      },
      placeholder: "spaces/AAA",
    },
    {
      displayName: "Membership ID",
      name: "membershipId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["member"], operation: ["get"] },
      },
      placeholder: "spaces/AAA/members/123",
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      displayOptions: {
        show: { resource: ["message"] },
      },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Send and Wait", value: "sendAndWait" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "Space ID",
      name: "spaceId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["message"] },
      },
      placeholder: "spaces/AAA",
    },
    {
      displayName: "Text",
      name: "text",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["message"], operation: ["create", "update"] },
      },
      typeOptions: { rows: 4 },
    },
    {
      displayName: "Message ID",
      name: "messageId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["message"], operation: ["delete", "get", "update"] },
      },
      placeholder: "spaces/AAA/messages/123",
    },
    {
      displayName: "Update Fields",
      name: "updateFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["message"], operation: ["update"] },
      },
      options: [
        {
          displayName: "Text",
          name: "text",
          type: "string",
          default: "",
        },
      ],
    },
    {
      displayName: "Response Type",
      name: "responseType",
      type: "options",
      default: "approval",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"] },
      },
      options: [
        { name: "Approval", value: "approval" },
        { name: "Free Text", value: "freeText" },
        { name: "Custom Form", value: "customForm" },
      ],
    },
    {
      displayName: "Limit Wait Time",
      name: "limitWaitTime",
      type: "boolean",
      default: false,
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"] },
      },
    },
    {
      displayName: "Limit Wait Time Value",
      name: "limitWaitTimeValue",
      type: "number",
      default: 0,
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], limitWaitTime: [true] },
      },
      typeOptions: { minValue: 0 },
    },
    {
      displayName: "Append Attribution",
      name: "appendAttribution",
      type: "boolean",
      default: true,
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"] },
      },
    },
    {
      displayName: "Approve Button Label",
      name: "approveButtonLabel",
      type: "string",
      default: "Approve",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["approval"] },
      },
    },
    {
      displayName: "Disapprove Button Label",
      name: "disapproveButtonLabel",
      type: "string",
      default: "Disapprove",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["approval"] },
      },
    },
    {
      displayName: "Include Disapprove",
      name: "includeDissapprove",
      type: "boolean",
      default: true,
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["approval"] },
      },
    },
    {
      displayName: "Free Text Button Label",
      name: "freeTextButtonLabel",
      type: "string",
      default: "Reply",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["freeText"] },
      },
    },
    {
      displayName: "Free Text Form Title",
      name: "freeTextFormTitle",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["freeText"] },
      },
    },
    {
      displayName: "Free Text Form Description",
      name: "freeTextFormDescription",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["freeText"] },
      },
    },
    {
      displayName: "Response Button Label",
      name: "responseButtonLabel",
      type: "string",
      default: "Submit",
      displayOptions: {
        show: {
          resource: ["message"],
          operation: ["sendAndWait"],
          responseType: ["freeText", "customForm"],
        },
      },
    },
    {
      displayName: "Custom Form Button Label",
      name: "customFormButtonLabel",
      type: "string",
      default: "Open Form",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["customForm"] },
      },
    },
    {
      displayName: "Custom Form Title",
      name: "customFormTitle",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["customForm"] },
      },
    },
    {
      displayName: "Custom Form Description",
      name: "customFormDescription",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["customForm"] },
      },
    },
    {
      displayName: "Form Elements",
      name: "formElements",
      type: "json",
      default: "[]",
      displayOptions: {
        show: { resource: ["message"], operation: ["sendAndWait"], responseType: ["customForm"] },
      },
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      required: true,
      displayOptions: {
        show: { resource: ["space"] },
      },
      options: [
        { name: "Get All", value: "getAll" },
        { name: "Get", value: "get" },
      ],
    },
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: true,
      displayOptions: {
        show: { resource: ["space"], operation: ["getAll"] },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      displayOptions: {
        show: { resource: ["space"], operation: ["getAll"], returnAll: [false] },
      },
      typeOptions: { minValue: 1 },
    },
    {
      displayName: "Space ID",
      name: "spaceId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["space"], operation: ["get"] },
      },
      placeholder: "spaces/AAA",
    },
  ],
};

const ZENDESK_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zendesk/";

export const zendesk: INodeTypeDescription = {
  name: "n8n-nodes-base.zendesk",
  displayName: "Zendesk",
  category: "Communication",
  group: ["communication"],
  version: 1,
  description: "Access Zendesk ticket, user, and organization data",
  defaults: { name: "Zendesk" },
  inputs: ["main"],
  outputs: ["main"],
  credentials: [
    { name: "zendeskApi", required: false },
    { name: "zendeskOAuth2Api", required: false },
  ],
  icon: "Headphones",
  sources: [ZENDESK_DOCS],
  properties: [
    {
      displayName: "Authentication",
      name: "authentication",
      type: "options",
      default: "apiToken",
      required: true,
      options: [
        { name: "API Token", value: "apiToken" },
        { name: "OAuth2", value: "oAuth2" },
      ],
    },
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "ticket",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Organization", value: "organization" },
        { name: "Ticket", value: "ticket" },
        { name: "Ticket Field", value: "ticketField" },
        { name: "User", value: "user" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      required: true,
      displayOptions: {
        show: { resource: ["ticket"] },
      },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
        { name: "Recover a Suspended Ticket", value: "recover" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      required: true,
      displayOptions: {
        show: { resource: ["ticketField"] },
      },
      options: [
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      required: true,
      displayOptions: {
        show: { resource: ["user"] },
      },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
        { name: "Get Organizations", value: "getOrganizations" },
        { name: "Get User Data", value: "getUserData" },
        { name: "Search", value: "search" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      required: true,
      displayOptions: {
        show: { resource: ["organization"] },
      },
      options: [
        { name: "Count", value: "count" },
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
        { name: "Get Organization Data", value: "getOrganizationData" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "ID",
      name: "id",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          resource: ["ticket", "ticketField", "user", "organization"],
          operation: ["get", "delete", "update", "recover", "getUserData", "getOrganizationData"],
        },
      },
      description: "Resource identifier from Zendesk",
    },
    {
      displayName: "Request Fields",
      name: "requestFields",
      type: "json",
      default: "",
      displayOptions: {
        show: {
          resource: ["ticket", "user", "organization"],
          operation: ["create", "update"],
        },
      },
      placeholder: '{"ticket": {"subject": "...", "description": "..."}}',
      description: "JSON body with resource-specific fields for create/update operations",
    },
    {
      displayName: "Query Parameters",
      name: "queryParameters",
      type: "json",
      default: "",
      displayOptions: {
        show: {
          resource: ["ticket", "ticketField", "user", "organization"],
          operation: ["getAll", "search", "count"],
        },
      },
      placeholder: '{"limit": 100, "include": "users"}',
      description: "Optional query parameters for listing, search, and count operations",
    },
  ],
};
