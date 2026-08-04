import type { INodeTypeDescription } from "../types";

export const awsIam: INodeTypeDescription = {
  name: "n8n-nodes-base.awsIam",
  displayName: "AWS IAM",
  category: "Development",
  group: ["input"],
  version: 1,
  description: "Manages AWS IAM users and groups.",
  defaults: { name: "AWS IAM" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "CloudKey",
  credentials: [{ name: "aws" }, { name: "awsAssumeRole" }],
  sources: [
    "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsiam/",
    "https://docs.n8n.io/integrations/builtin/credentials/aws/",
  ],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "user",
      noDataExpression: true,
      required: true,
      options: [
        { name: "User", value: "user" },
        { name: "Group", value: "group" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["user"] } },
      options: [
        { name: "Add to Group", value: "addToGroup" },
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get All", value: "getAll" },
        { name: "Remove from Group", value: "removeFromGroup" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "getAll",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["group"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get All", value: "getAll" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "User",
      name: "user",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      required: true,
      displayOptions: {
        show: {
          resource: ["user"],
          operation: ["addToGroup", "delete", "get", "update", "removeFromGroup"],
        },
      },
    },
    {
      displayName: "Group",
      name: "group",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      required: true,
      displayOptions: {
        show: {
          resource: ["user"],
          operation: ["addToGroup", "removeFromGroup"],
        },
      },
    },
    {
      displayName: "User Name",
      name: "userName",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["user"], operation: ["create", "update"] },
      },
    },
    {
      displayName: "Group Name",
      name: "groupName",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["group"], operation: ["create", "update"] },
      },
    },
    {
      displayName: "Group",
      name: "group",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      required: true,
      displayOptions: {
        show: {
          resource: ["group"],
          operation: ["delete", "get", "update"],
        },
      },
    },
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: {
        show: { operation: ["getAll"] },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      typeOptions: { minValue: 1 },
      displayOptions: {
        show: { operation: ["getAll"], returnAll: [false] },
      },
    },
    {
      displayName: "Include Users",
      name: "includeUsers",
      type: "boolean",
      default: false,
      displayOptions: {
        show: { resource: ["group"], operation: ["get", "getAll"] },
      },
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: {
          resource: ["user"],
          operation: ["create", "getAll", "update"],
        },
      },
      options: [],
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: {
          resource: ["group"],
          operation: ["create", "update"],
        },
      },
      options: [],
    },
    {
      displayName: "Request Options",
      name: "requestOptions",
      type: "collection",
      default: {},
      options: [],
    },
  ],
};
