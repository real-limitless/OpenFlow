import type { INodeTypeDescription } from "../types";

const ES_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.elasticsearch/";

const OPERATIONS = [
  { name: "Create a Document", value: "create" },
  { name: "Delete a Document", value: "delete" },
  { name: "Get a Document", value: "get" },
  { name: "Search Documents", value: "search" },
  { name: "Update a Document", value: "update" },
];

export const elasticsearch: INodeTypeDescription = {
  name: "n8n-nodes-base.elasticsearch",
  displayName: "Elasticsearch",
  category: "Data & Storage",
  group: ["integration"],
  version: 1,
  description: "Perform operations on Elasticsearch documents and indices",
  defaults: { name: "Elasticsearch" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Search",
  credentials: [{ name: "elasticsearchApi", required: true }],
  sources: [ES_DOCS],
  properties: [
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      options: OPERATIONS,
    },
    {
      displayName: "Index",
      name: "resource",
      type: "string",
      default: "",
      required: true,
      placeholder: "my_index",
      displayOptions: {
        show: { operation: ["create", "get", "delete", "search", "update"] },
      },
    },
    {
      displayName: "Document ID",
      name: "id",
      type: "string",
      default: "",
      displayOptions: {
        show: { operation: ["create", "get", "delete", "update"] },
      },
    },
    {
      displayName: "Body",
      name: "body",
      type: "json",
      default: "",
      displayOptions: {
        show: { operation: ["create", "update"] },
      },
    },
    {
      displayName: "Query",
      name: "query",
      type: "json",
      default: '{\n  "match_all": {}\n}',
      displayOptions: {
        show: { operation: ["search"] },
      },
    },
    {
      displayName: "Size",
      name: "size",
      type: "number",
      default: 10,
      displayOptions: {
        show: { operation: ["search"] },
      },
    },
  ],
};
