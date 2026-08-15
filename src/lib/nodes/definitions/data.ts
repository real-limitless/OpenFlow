import type { INodeTypeDescription } from "../types";

const COCKPIT_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cockpit/";

export const cockpit: INodeTypeDescription = {
  name: "openflow-node-base.cockpit",
  displayName: "Cockpit",
  category: "Data & Content",
  group: ["output"],
  version: 1,
  description: "Access Cockpit CMS collections, singletons, and forms via the Cockpit REST API.",
  defaults: { name: "Cockpit" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Globe",
  credentials: [{ name: "cockpitApi" }],
  sources: [COCKPIT_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "collection",
      noDataExpression: true,
      required: true,
      options: [
        { name: "Collection", value: "collection" },
        { name: "Form", value: "form" },
        { name: "Singleton", value: "singleton" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["collection"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Get All", value: "getAll" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "store",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["form"] } },
      options: [{ name: "Store Data", value: "store" }],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "get",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["singleton"] } },
      options: [{ name: "Get", value: "get" }],
    },
    {
      displayName: "Collection",
      name: "collection",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["collection"] } },
    },
    {
      displayName: "Singleton",
      name: "singleton",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["singleton"] } },
    },
    {
      displayName: "Form",
      name: "form",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["form"] } },
    },
    {
      displayName: "Data",
      name: "data",
      type: "json",
      default: "",
      displayOptions: {
        show: {
          resource: ["collection"],
          operation: ["create", "update"],
        },
      },
    },
    {
      displayName: "Data",
      name: "data",
      type: "json",
      default: "",
      displayOptions: {
        show: {
          resource: ["form"],
          operation: ["store"],
        },
      },
    },
    {
      displayName: "Filter",
      name: "filter",
      type: "json",
      default: "",
      displayOptions: {
        show: {
          resource: ["collection"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 0,
      typeOptions: { minValue: 0 },
      displayOptions: {
        show: {
          resource: ["collection"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Skip",
      name: "skip",
      type: "number",
      default: 0,
      typeOptions: { minValue: 0 },
      displayOptions: {
        show: {
          resource: ["collection"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Sort",
      name: "sort",
      type: "json",
      default: "",
      displayOptions: {
        show: {
          resource: ["collection"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Populate",
      name: "populate",
      type: "boolean",
      default: false,
      displayOptions: {
        show: {
          resource: ["collection"],
          operation: ["getAll"],
        },
      },
    },
  ],
};

const QUICKBASE_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbase/";

export const quickbase: INodeTypeDescription = {
  name: "openflow-node-base.quickbase",
  displayName: "Quick Base",
  category: "Data & Storage",
  group: ["output"],
  version: 1,
  description: "Access Quick Base records, fields, files, and reports via the Quick Base REST API.",
  defaults: { name: "Quick Base" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Globe",
  credentials: [{ name: "quickbaseApi" }],
  usableAsTool: true,
  sources: [QUICKBASE_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "record",
      noDataExpression: true,
      required: true,
      options: [
        { name: "Field", value: "field" },
        { name: "File", value: "file" },
        { name: "Record", value: "record" },
        { name: "Report", value: "report" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["record"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get All", value: "getAll" },
        { name: "Update", value: "update" },
        { name: "Upsert", value: "upsert" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["field"] } },
      options: [{ name: "Get All", value: "getAll" }],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "download",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["file"] } },
      options: [
        { name: "Delete", value: "delete" },
        { name: "Download", value: "download" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "run",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["report"] } },
      options: [
        { name: "Get", value: "get" },
        { name: "Run", value: "run" },
      ],
    },
    {
      displayName: "Table ID",
      name: "tableId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          resource: ["record", "file"],
        },
      },
    },
    {
      displayName: "Record ID",
      name: "recordId",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["record"],
          operation: ["get", "delete", "update"],
        },
      },
    },
    {
      displayName: "Record ID",
      name: "recordId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          resource: ["file"],
        },
      },
    },
    {
      displayName: "Fields",
      name: "fields",
      type: "json",
      default: "{}",
      displayOptions: {
        show: {
          resource: ["record"],
          operation: ["create", "update", "upsert"],
        },
      },
    },
    {
      displayName: "Filter",
      name: "filter",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["record"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 0,
      typeOptions: { minValue: 0 },
      displayOptions: {
        show: {
          resource: ["record"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Sort By (Field ID)",
      name: "sortBy",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["record"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Sort Direction",
      name: "sortDirection",
      type: "options",
      default: "ASC",
      options: [
        { name: "ASC", value: "ASC" },
        { name: "DESC", value: "DESC" },
      ],
      displayOptions: {
        show: {
          resource: ["record"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Report ID",
      name: "reportId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["report"] },
      },
    },
    {
      displayName: "Field ID",
      name: "fieldId",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["file"] },
      },
    },
    {
      displayName: "File ID",
      name: "fileId",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["file"],
          operation: ["delete", "download"],
        },
      },
    },
    {
      displayName: "Upsert Key (comma-separated field IDs)",
      name: "upsertKey",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["record"],
          operation: ["upsert"],
        },
      },
    },
  ],
};
