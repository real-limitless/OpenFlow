import type { INodeTypeDescription } from "../types";

const CORE = "https://docs.n8n.io/integrations/builtin/core-nodes/";

export const httpRequest: INodeTypeDescription = {
  name: "n8n-nodes-base.httpRequest",
  displayName: "HTTP Request",
  category: "Actions",
  group: ["input"],
  version: 4.2,
  description: "Makes an HTTP request and returns the response.",
  defaults: { name: "HTTP Request" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Globe",
  credentials: [{ name: "httpBasicAuth" }, { name: "httpHeaderAuth" }],
  sources: [`${CORE}n8n-nodes-base.httprequest/`],
  properties: [
    {
      displayName: "Method",
      name: "method",
      type: "options",
      default: "GET",
      noDataExpression: true,
      options: [
        { name: "GET", value: "GET" },
        { name: "POST", value: "POST" },
        { name: "PUT", value: "PUT" },
        { name: "PATCH", value: "PATCH" },
        { name: "DELETE", value: "DELETE" },
        { name: "HEAD", value: "HEAD" },
        { name: "OPTIONS", value: "OPTIONS" },
      ],
    },
    {
      displayName: "URL",
      name: "url",
      type: "string",
      default: "",
      required: true,
      placeholder: "https://api.example.com/resource",
    },
    {
      displayName: "Authentication",
      name: "authentication",
      type: "options",
      default: "none",
      options: [
        { name: "None", value: "none" },
        { name: "Predefined Credential Type", value: "predefinedCredentialType" },
        { name: "Generic Credential Type", value: "genericCredentialType" },
      ],
    },
    {
      displayName: "Send Query Parameters",
      name: "sendQuery",
      type: "boolean",
      default: false,
    },
    {
      displayName: "Query Parameters",
      name: "queryParameters",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: { show: { sendQuery: [true] } },
      options: [
        {
          name: "parameters",
          displayName: "Parameter",
          values: [
            { displayName: "Name", name: "name", type: "string", default: "" },
            { displayName: "Value", name: "value", type: "string", default: "" },
          ],
        },
      ],
    },
    {
      displayName: "Send Headers",
      name: "sendHeaders",
      type: "boolean",
      default: false,
    },
    {
      displayName: "Headers",
      name: "headerParameters",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: { show: { sendHeaders: [true] } },
      options: [
        {
          name: "parameters",
          displayName: "Header",
          values: [
            { displayName: "Name", name: "name", type: "string", default: "" },
            { displayName: "Value", name: "value", type: "string", default: "" },
          ],
        },
      ],
    },
    {
      displayName: "Send Body",
      name: "sendBody",
      type: "boolean",
      default: false,
      displayOptions: { hide: { method: ["GET", "HEAD"] } },
    },
    {
      displayName: "Body Content Type",
      name: "contentType",
      type: "options",
      default: "json",
      displayOptions: { show: { sendBody: [true] } },
      options: [
        { name: "JSON", value: "json" },
        { name: "Form Urlencoded", value: "form-urlencoded" },
        { name: "Raw", value: "raw" },
      ],
    },
    {
      displayName: "JSON Body",
      name: "jsonBody",
      type: "json",
      default: "{}",
      displayOptions: { show: { sendBody: [true], contentType: ["json"] } },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        { displayName: "Timeout (ms)", name: "timeout", type: "number", default: 10000 },
        { displayName: "Ignore SSL Issues", name: "allowUnauthorizedCerts", type: "boolean", default: false },
        { displayName: "Full Response", name: "fullResponse", type: "boolean", default: false },
        { displayName: "Follow Redirects", name: "followRedirect", type: "boolean", default: true },
      ],
    },
  ],
};

export const set: INodeTypeDescription = {
  name: "n8n-nodes-base.set",
  displayName: "Edit Fields (Set)",
  category: "Transform",
  group: ["transform"],
  version: 3.4,
  description: "Adds, renames or removes fields on each item.",
  defaults: { name: "Edit Fields" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "PencilLine",
  sources: [`${CORE}n8n-nodes-base.set/`],
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "manual",
      noDataExpression: true,
      options: [
        { name: "Manual Mapping", value: "manual" },
        { name: "JSON Output", value: "raw" },
      ],
    },
    {
      displayName: "Fields to Set",
      name: "fields",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: { show: { mode: ["manual"] } },
      options: [
        {
          name: "values",
          displayName: "Field",
          values: [
            { displayName: "Name", name: "name", type: "string", default: "" },
            {
              displayName: "Type",
              name: "type",
              type: "options",
              default: "stringValue",
              options: [
                { name: "String", value: "stringValue" },
                { name: "Number", value: "numberValue" },
                { name: "Boolean", value: "booleanValue" },
                { name: "Array", value: "arrayValue" },
                { name: "Object", value: "objectValue" },
              ],
            },
            { displayName: "Value", name: "value", type: "string", default: "" },
          ],
        },
      ],
    },
    {
      displayName: "JSON",
      name: "jsonOutput",
      type: "json",
      default: "{\n  \"key\": \"value\"\n}",
      displayOptions: { show: { mode: ["raw"] } },
    },
    {
      displayName: "Include Other Input Fields",
      name: "includeOtherFields",
      type: "boolean",
      default: false,
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        { displayName: "Ignore Type Conversion Errors", name: "ignoreConversionErrors", type: "boolean", default: false },
        { displayName: "Dot Notation", name: "dotNotation", type: "boolean", default: true },
      ],
    },
  ],
};

export const code: INodeTypeDescription = {
  name: "n8n-nodes-base.code",
  displayName: "Code",
  category: "Transform",
  group: ["transform"],
  version: 2,
  description: "Runs custom JavaScript against the incoming items.",
  defaults: { name: "Code" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Braces",
  sources: [`${CORE}n8n-nodes-base.code/`],
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "runOnceForAllItems",
      noDataExpression: true,
      options: [
        { name: "Run Once for All Items", value: "runOnceForAllItems" },
        { name: "Run Once for Each Item", value: "runOnceForEachItem" },
      ],
    },
    {
      displayName: "JavaScript",
      name: "jsCode",
      type: "string",
      default: "// Each item is { json: {...} }\nreturn $input.all();",
      noDataExpression: true,
      typeOptions: { editor: "code", rows: 16 },
    },
    {
      displayName:
        "Code runs in a sandbox. Network access is disabled by default in this build.",
      name: "notice",
      type: "notice",
      default: "",
    },
  ],
};

export const stopAndError: INodeTypeDescription = {
  name: "n8n-nodes-base.stopAndError",
  displayName: "Stop and Error",
  category: "Flow",
  group: ["transform"],
  version: 1,
  description: "Stops the workflow and throws a custom error message or object.",
  defaults: { name: "Stop and Error" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "OctagonAlert",
  sources: [`${CORE}n8n-nodes-base.stopanderror/`],
  properties: [
    {
      displayName: "Error Type",
      name: "errorType",
      type: "options",
      default: "errorMessage",
      noDataExpression: true,
      options: [
        { name: "Error Message", value: "errorMessage" },
        { name: "Error Object", value: "errorObject" },
      ],
    },
    {
      displayName: "Error Message",
      name: "errorMessage",
      type: "string",
      default: "Workflow stopped with an error",
      displayOptions: { show: { errorType: ["errorMessage"] } },
    },
    {
      displayName: "Error Object",
      name: "errorObject",
      type: "json",
      default: '{"message":"Stopped"}',
      displayOptions: { show: { errorType: ["errorObject"] } },
    },
  ],
};

export const noOp: INodeTypeDescription = {
  name: "n8n-nodes-base.noOp",
  displayName: "No Operation",
  category: "Helpers",
  group: ["organization"],
  version: 1,
  description: "Passes items through unchanged. Useful as a join or marker.",
  defaults: { name: "No Operation" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "CircleDashed",
  sources: [`${CORE}n8n-nodes-base.noop/`],
  properties: [
    {
      displayName: "This node does nothing. Items pass through untouched.",
      name: "notice",
      type: "notice",
      default: "",
    },
  ],
};

export const stickyNote: INodeTypeDescription = {
  name: "n8n-nodes-base.stickyNote",
  displayName: "Sticky Note",
  category: "Helpers",
  group: ["organization"],
  version: 1,
  description: "A canvas annotation. Not part of execution.",
  defaults: { name: "Sticky Note" },
  inputs: [],
  outputs: [],
  icon: "StickyNote",
  sources: [`${CORE}n8n-nodes-base.stickynote/`],
  properties: [
    {
      displayName: "Content",
      name: "content",
      type: "string",
      default: "## Note\nAdd context for your team here.",
      typeOptions: { rows: 8 },
      noDataExpression: true,
    },
    { displayName: "Width", name: "width", type: "number", default: 320 },
    { displayName: "Height", name: "height", type: "number", default: 180 },
    {
      displayName: "Color",
      name: "color",
      type: "options",
      default: 1,
      options: [
        { name: "Sand", value: 1 },
        { name: "Teal", value: 2 },
        { name: "Amber", value: 3 },
        { name: "Rose", value: 4 },
      ],
    },
  ],
};
