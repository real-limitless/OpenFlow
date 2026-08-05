import type { INodeTypeDescription } from "../types";

const COCKPIT_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cockpit/";

export const cockpit: INodeTypeDescription = {
  name: "n8n-nodes-base.cockpit",
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
