import type { INodeTypeDescription } from "../types";

const CORE = "https://docs.n8n.io/integrations/builtin/core-nodes/";

const conditionValues = [
  {
    name: "conditions",
    displayName: "Condition",
    values: [
      { displayName: "Left Value", name: "leftValue", type: "string" as const, default: "" },
      {
        displayName: "Operator",
        name: "operator",
        type: "options" as const,
        default: "equals",
        options: [
          { name: "Is Equal To", value: "equals" },
          { name: "Is Not Equal To", value: "notEquals" },
          { name: "Contains", value: "contains" },
          { name: "Does Not Contain", value: "notContains" },
          { name: "Starts With", value: "startsWith" },
          { name: "Ends With", value: "endsWith" },
          { name: "Is Empty", value: "isEmpty" },
          { name: "Is Not Empty", value: "isNotEmpty" },
          { name: "Larger Than", value: "gt" },
          { name: "Smaller Than", value: "lt" },
          { name: "Is True", value: "isTrue" },
          { name: "Is False", value: "isFalse" },
        ],
      },
      { displayName: "Right Value", name: "rightValue", type: "string" as const, default: "" },
    ],
  },
];

export const ifNode: INodeTypeDescription = {
  name: "n8n-nodes-base.if",
  displayName: "IF",
  category: "Flow",
  group: ["transform"],
  version: 2.2,
  description: "Routes items down a true or false branch.",
  defaults: { name: "IF" },
  inputs: ["main"],
  outputs: ["main", "main"],
  outputNames: ["true", "false"],
  icon: "GitBranch",
  sources: [`${CORE}n8n-nodes-base.if/`],
  properties: [
    {
      displayName: "Conditions",
      name: "conditions",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      options: conditionValues,
    },
    {
      displayName: "Combine",
      name: "combinator",
      type: "options",
      default: "and",
      options: [
        { name: "All conditions must match (AND)", value: "and" },
        { name: "Any condition may match (OR)", value: "or" },
      ],
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        { displayName: "Ignore Case", name: "ignoreCase", type: "boolean", default: true },
        {
          displayName: "Loose Type Validation",
          name: "looseTypeValidation",
          type: "boolean",
          default: false,
        },
      ],
    },
  ],
};

export const switchNode: INodeTypeDescription = {
  name: "n8n-nodes-base.switch",
  displayName: "Switch",
  category: "Flow",
  group: ["transform"],
  version: 3.2,
  description: "Routes items to one of several outputs based on rules.",
  defaults: { name: "Switch" },
  inputs: ["main"],
  outputs: ["main", "main"],
  icon: "Split",
  sources: [`${CORE}n8n-nodes-base.switch/`],
  dynamicOutputs: (parameters) => {
    const rules = parameters?.rules as { values?: unknown[] } | undefined;
    const count = Math.max(1, rules?.values?.length ?? 2);
    const fallback = parameters?.options as { fallbackOutput?: unknown } | undefined;
    const extra = fallback?.fallbackOutput === "extra" ? 1 : 0;
    return Array.from({ length: count + extra }, () => "main");
  },
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "rules",
      noDataExpression: true,
      options: [
        { name: "Rules", value: "rules" },
        { name: "Expression", value: "expression" },
      ],
    },
    {
      displayName: "Routing Rules",
      name: "rules",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: { show: { mode: ["rules"] } },
      options: [
        {
          name: "values",
          displayName: "Rule",
          values: [
            { displayName: "Left Value", name: "leftValue", type: "string", default: "" },
            {
              displayName: "Operator",
              name: "operator",
              type: "options",
              default: "equals",
              options: [
                { name: "Is Equal To", value: "equals" },
                { name: "Contains", value: "contains" },
                { name: "Larger Than", value: "gt" },
                { name: "Smaller Than", value: "lt" },
              ],
            },
            { displayName: "Right Value", name: "rightValue", type: "string", default: "" },
            { displayName: "Output Name", name: "outputKey", type: "string", default: "" },
          ],
        },
      ],
    },
    {
      displayName: "Output Index Expression",
      name: "output",
      type: "string",
      default: "={{ 0 }}",
      displayOptions: { show: { mode: ["expression"] } },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Fallback Output",
          name: "fallbackOutput",
          type: "options",
          default: "none",
          options: [
            { name: "Discard Item", value: "none" },
            { name: "Extra Output", value: "extra" },
          ],
        },
        {
          displayName: "Send To All Matching Outputs",
          name: "allMatchingOutputs",
          type: "boolean",
          default: false,
        },
      ],
    },
  ],
};

export const merge: INodeTypeDescription = {
  name: "n8n-nodes-base.merge",
  displayName: "Merge",
  category: "Flow",
  group: ["transform"],
  version: 3,
  description: "Combines items from two or more input branches.",
  defaults: { name: "Merge" },
  inputs: ["main", "main"],
  inputNames: ["Input 1", "Input 2"],
  outputs: ["main"],
  icon: "Merge",
  sources: [`${CORE}n8n-nodes-base.merge/`],
  dynamicInputs: (parameters) => {
    const count = Math.max(2, Number(parameters?.numberInputs ?? 2));
    return Array.from({ length: count }, () => "main");
  },
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "append",
      noDataExpression: true,
      options: [
        { name: "Append", value: "append" },
        { name: "Combine", value: "combine" },
        { name: "Choose Branch", value: "chooseBranch" },
      ],
    },
    {
      displayName: "Combine By",
      name: "combineBy",
      type: "options",
      default: "combineByFields",
      displayOptions: { show: { mode: ["combine"] } },
      options: [
        { name: "Matching Fields", value: "combineByFields" },
        { name: "Position", value: "combineByPosition" },
        { name: "All Combinations", value: "combineAll" },
      ],
    },
    {
      displayName: "Fields to Match",
      name: "fieldsToMatchString",
      type: "string",
      default: "",
      placeholder: "id, email",
      displayOptions: { show: { mode: ["combine"], combineBy: ["combineByFields"] } },
    },
    {
      displayName: "Number of Inputs",
      name: "numberInputs",
      type: "number",
      default: 2,
      typeOptions: { minValue: 2, maxValue: 10 },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Include Any Unpaired Items",
          name: "includeUnpaired",
          type: "boolean",
          default: false,
        },
      ],
    },
  ],
};

export const splitInBatches: INodeTypeDescription = {
  name: "n8n-nodes-base.splitInBatches",
  displayName: "Loop Over Items",
  category: "Flow",
  group: ["transform"],
  version: 3,
  description:
    "Splits items into batches for iterative processing, looping until all batches are consumed.",
  defaults: { name: "Loop Over Items" },
  inputs: ["main"],
  outputs: ["main", "main"],
  // typeVersion 3: output[0] = done, output[1] = loop (current descriptor order).
  // typeVersion 2 swaps these (loop = 0, done = 1); v1 is single-output (inferred).
  outputNames: ["done", "loop"],
  icon: "Repeat",
  sources: [`${CORE}n8n-nodes-base.splitinbatches/`],
  properties: [
    {
      displayName: "Not all nodes need this node. Many nodes already process each item separately.",
      name: "splitInBatchesNotice",
      type: "notice",
      default: "",
    },
    {
      displayName: "Batch Size",
      name: "batchSize",
      type: "number",
      default: 1,
      required: true,
      typeOptions: { minValue: 1 },
      description: "Number of items to emit on each loop iteration.",
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Reset",
          name: "reset",
          type: "boolean",
          default: false,
          description: "Restart batching from the beginning instead of resuming.",
        },
      ],
    },
  ],
};

export const notionTool: INodeTypeDescription = {
  name: "n8n-nodes-base.notionTool",
  displayName: "Notion Tool",
  category: "Productivity",
  group: ["transform"],
  version: 1,
  description: "Access Notion pages, databases, blocks, and users via the Notion API.",
  defaults: { name: "Notion Tool" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "BookOpen",
  credentials: [
    { name: "notionApi", required: true, testedBy: { request: { method: "GET", url: "/users" } } },
  ],
  sources: ["https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion/"],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "databasePage",
      noDataExpression: true,
      options: [
        { name: "Block", value: "block" },
        { name: "Data Source", value: "dataSource" },
        { name: "Database", value: "database" },
        { name: "Database Page", value: "databasePage" },
        { name: "Page", value: "page" },
        { name: "User", value: "user" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getMany",
      noDataExpression: true,
      displayOptions: { show: { resource: ["databasePage"] } },
      options: [
        { name: "Create", value: "create", action: "Create a database page" },
        { name: "Get", value: "get", action: "Get a database page" },
        { name: "Get Many", value: "getMany", action: "Get many database pages" },
        { name: "Update", value: "update", action: "Update a database page" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "get",
      noDataExpression: true,
      displayOptions: { show: { resource: ["page"] } },
      options: [
        { name: "Create", value: "create", action: "Create a page" },
        { name: "Get", value: "get", action: "Get a page" },
        { name: "Search", value: "search", action: "Search pages" },
        { name: "Archive", value: "archive", action: "Archive a page" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      noDataExpression: true,
      displayOptions: { show: { resource: ["block"] } },
      options: [
        { name: "Append After", value: "appendAfter", action: "Append block content" },
        { name: "Get All", value: "getAll", action: "Get all blocks" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getMany",
      noDataExpression: true,
      displayOptions: { show: { resource: ["user"] } },
      options: [
        { name: "Get Many", value: "getMany", action: "Get many users" },
        { name: "Get", value: "get", action: "Get a user" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "get",
      noDataExpression: true,
      displayOptions: { show: { resource: ["database"] } },
      options: [
        { name: "Get", value: "get", action: "Get a database" },
        { name: "Search", value: "search", action: "Search databases" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "search",
      noDataExpression: true,
      displayOptions: { show: { resource: ["dataSource"] } },
      options: [
        { name: "Search", value: "search", action: "Search" },
      ],
    },
    {
      displayName: "Database ID",
      name: "databaseId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["databasePage"], operation: ["create", "getMany"] },
      },
    },
    {
      displayName: "Database ID",
      name: "databaseId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["databasePage"], operation: ["get", "update"] } },
    },
    {
      displayName: "Page ID",
      name: "pageId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["page"], operation: ["get", "archive", "create"] },
      },
    },
    {
      displayName: "Page ID",
      name: "pageId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["databasePage"], operation: ["get", "update"] } },
    },
    {
      displayName: "Block ID",
      name: "blockId",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["block"], operation: ["appendAfter", "getAll"] } },
    },
    {
      displayName: "Title",
      name: "title",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["databasePage", "page"], operation: ["create"] },
      },
    },
    {
      displayName: "Properties",
      name: "properties",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: {
        show: { operation: ["create", "update", "appendAfter"] },
      },
      options: [
        {
          name: "values",
          displayName: "Property",
          values: [
            { displayName: "Name", name: "name", type: "string", default: "" },
            { displayName: "Value", name: "value", type: "string", default: "" },
          ],
        },
      ],
    },
    {
      displayName: "Filter",
      name: "filter",
      type: "json",
      default: "",
      displayOptions: { show: { operation: ["getMany", "search"] } },
    },
    {
      displayName: "Sorts",
      name: "sorts",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: { show: { operation: ["getMany", "search"] } },
      options: [
        {
          name: "values",
          displayName: "Sort",
          values: [
            { displayName: "Property", name: "property", type: "string", default: "" },
            {
              displayName: "Direction",
              name: "direction",
              type: "options",
              default: "ascending",
              options: [
                { name: "Ascending", value: "ascending" },
                { name: "Descending", value: "descending" },
              ],
            },
          ],
        },
      ],
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 100,
      typeOptions: { minValue: 1, maxValue: 100 },
      displayOptions: { show: { operation: ["getMany", "search", "getAll"] } },
    },
    {
      displayName: "Query",
      name: "query",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["dataSource", "page"], operation: ["search"] } },
    },
    {
      displayName: "Cursor",
      name: "cursor",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["getMany"] } },
    },
  ],
};

export const wait: INodeTypeDescription = {
  name: "n8n-nodes-base.wait",
  displayName: "Wait",
  category: "Actions",
  group: ["organization"],
  version: 1.1,
  description: "Pauses the workflow before continuing.",
  defaults: { name: "Wait" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Hourglass",
  sources: [`${CORE}n8n-nodes-base.wait/`],
  properties: [
    {
      displayName: "Resume",
      name: "resume",
      type: "options",
      default: "timeInterval",
      noDataExpression: true,
      options: [
        { name: "After Time Interval", value: "timeInterval" },
        { name: "At Specified Time", value: "specificTime" },
        { name: "On Webhook Call", value: "webhook" },
      ],
    },
    {
      displayName: "Wait Amount",
      name: "amount",
      type: "number",
      default: 1,
      typeOptions: { minValue: 0 },
      displayOptions: { show: { resume: ["timeInterval"] } },
    },
    {
      displayName: "Wait Unit",
      name: "unit",
      type: "options",
      default: "hours",
      displayOptions: { show: { resume: ["timeInterval"] } },
      options: [
        { name: "Seconds", value: "seconds" },
        { name: "Minutes", value: "minutes" },
        { name: "Hours", value: "hours" },
        { name: "Days", value: "days" },
      ],
    },
    {
      displayName: "Date and Time",
      name: "dateTime",
      type: "dateTime",
      default: "",
      displayOptions: { show: { resume: ["specificTime"] } },
    },
    {
      displayName: "Limit Wait Time",
      name: "limitWaitTime",
      type: "boolean",
      default: false,
      displayOptions: { show: { resume: ["webhook"] } },
    },
  ],
};

export const telegramTool: INodeTypeDescription = {
  name: "n8n-nodes-base.telegramTool",
  displayName: "Telegram Tool",
  category: "AI Tool",
  group: ["transform"],
  version: [1, 1.1, 1.2],
  description: "Send messages, manage chats, answer callbacks, and interact with the Telegram Bot API. Designed for AI agent tool use.",
  defaults: { name: "Telegram Tool" },
  inputs: ["main"],
  outputs: ["main", "main"],
  icon: "Send",
  credentials: [
    { name: "telegramApi", required: true },
  ],
  sources: [
    "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram.md",
  ],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "message",
      noDataExpression: true,
      options: [
        { name: "Chat", value: "chat" },
        { name: "Message", value: "message" },
        { name: "Callback", value: "callback" },
        { name: "File", value: "file" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "sendMessage",
      noDataExpression: true,
      displayOptions: { show: { resource: ["message"] } },
      options: [
        { name: "Delete Chat Message", value: "deleteMessage", action: "Delete a chat message" },
        { name: "Edit Message Text", value: "editMessageText", action: "Edit a message" },
        { name: "Pin Chat Message", value: "pinChatMessage", action: "Pin a message" },
        { name: "Send Animation", value: "sendAnimation", action: "Send an animation" },
        { name: "Send Audio", value: "sendAudio", action: "Send an audio file" },
        { name: "Send Chat Action", value: "sendChatAction", action: "Send a chat action" },
        { name: "Send Document", value: "sendDocument", action: "Send a document" },
        { name: "Send Location", value: "sendLocation", action: "Send a location" },
        { name: "Send Media Group", value: "sendMediaGroup", action: "Send a media group" },
        { name: "Send Message", value: "sendMessage", action: "Send a text message" },
        { name: "Send Photo", value: "sendPhoto", action: "Send a photo" },
        { name: "Send Sticker", value: "sendSticker", action: "Send a sticker" },
        { name: "Send Video", value: "sendVideo", action: "Send a video" },
        { name: "Unpin Chat Message", value: "unpinChatMessage", action: "Unpin a message" },
        { name: "Send and Wait for Response", value: "sendAndWait", action: "Send and wait for response" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "get",
      noDataExpression: true,
      displayOptions: { show: { resource: ["chat"] } },
      options: [
        { name: "Get", value: "get", action: "Get a chat" },
        { name: "Get Administrators", value: "getAdministrators", action: "Get chat administrators" },
        { name: "Get Member", value: "getMember", action: "Get a chat member" },
        { name: "Leave", value: "leave", action: "Leave a chat" },
        { name: "Set Description", value: "setDescription", action: "Set chat description" },
        { name: "Set Title", value: "setTitle", action: "Set chat title" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "answerQuery",
      noDataExpression: true,
      displayOptions: { show: { resource: ["callback"] } },
      options: [
        { name: "Answer Query", value: "answerQuery", action: "Answer a callback query" },
        { name: "Answer Inline Query", value: "answerInlineQuery", action: "Answer an inline query" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "get",
      noDataExpression: true,
      displayOptions: { show: { resource: ["file"] } },
      options: [
        { name: "Get", value: "get", action: "Get a file" },
      ],
    },
  ],
};
