import type { INodeTypeDescription } from "../types";

const AZURE_STORAGE_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.azurestorage/";
const FIREBASE_RTDB_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudrealtimedatabase/";

export const azureStorage: INodeTypeDescription = {
  name: "openflow-node-base.azureStorage",
  displayName: "Azure Storage",
  category: "Data & Storage",
  group: ["output"],
  version: 1,
  description: "Interact with Azure Blob Storage: manage blobs and containers.",
  defaults: { name: "Azure Storage" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Cloud",
  credentials: [
    { name: "azureStorageOAuth2Api" },
    { name: "azureStorageSharedKeyApi" },
  ],
  sources: [AZURE_STORAGE_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "blob",
      noDataExpression: true,
      required: true,
      options: [
        { name: "Blob", value: "blob" },
        { name: "Container", value: "container" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["blob"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      noDataExpression: true,
      required: true,
      displayOptions: { show: { resource: ["container"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
      ],
    },
    {
      displayName: "Container",
      name: "container",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          operation: ["create", "delete", "get"],
        },
      },
    },
    {
      displayName: "Container",
      name: "container",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["blob"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Blob Name",
      name: "blob",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          resource: ["blob"],
          operation: ["create", "delete", "get"],
        },
      },
    },
    {
      displayName: "Blob Type",
      name: "blobType",
      type: "options",
      default: "BlockBlob",
      displayOptions: {
        show: {
          resource: ["blob"],
          operation: ["create"],
        },
      },
      options: [
        { name: "Block Blob", value: "BlockBlob" },
        { name: "Page Blob", value: "PageBlob" },
        { name: "Append Blob", value: "AppendBlob" },
      ],
    },
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: { show: { operation: ["getAll"] } },
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
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Access Tier",
          name: "accessTier",
          type: "options",
          default: "Hot",
          options: [
            { name: "Hot", value: "Hot" },
            { name: "Cool", value: "Cool" },
            { name: "Cold", value: "Cold" },
            { name: "Archive", value: "Archive" },
          ],
        },
        {
          displayName: "Access Level",
          name: "accessLevel",
          type: "options",
          default: "Private",
          options: [
            { name: "Private", value: "Private" },
            { name: "Blob", value: "Blob" },
            { name: "Container", value: "Container" },
            { name: "System", value: "System" },
          ],
        },
        { displayName: "Content Type", name: "contentType", type: "string", default: "" },
        { displayName: "Content Encoding", name: "contentEncoding", type: "string", default: "" },
        { displayName: "Content Language", name: "contentLanguage", type: "string", default: "" },
        { displayName: "Content MD5", name: "contentMd5", type: "string", default: "" },
        { displayName: "Cache Control", name: "cacheControl", type: "string", default: "" },
        { displayName: "Encryption Scope", name: "encryptionScope", type: "string", default: "" },
        { displayName: "Encryption Context", name: "encryptionContext", type: "string", default: "" },
        { displayName: "Lease ID", name: "leaseId", type: "string", default: "" },
        {
          displayName: "Expiry Option",
          name: "expiryOption",
          type: "options",
          default: "",
          options: [
            { name: "Never Expire", value: "NeverExpire" },
            { name: "Expire", value: "Expire" },
            { name: "Delete", value: "Delete" },
            { name: "Metadata", value: "Metadata" },
          ],
        },
        { displayName: "Expiry Time", name: "expiryTime", type: "string", default: "" },
        {
          displayName: "Immutability Policy Until Date",
          name: "immutabilityPolicyUntilDate",
          type: "string",
          default: "",
        },
        {
          displayName: "Immutability Policy Mode",
          name: "immutabilityPolicyMode",
          type: "options",
          default: "",
          options: [
            { name: "Locked", value: "Locked" },
            { name: "Unlocked", value: "Unlocked" },
          ],
        },
        { displayName: "Legal Hold", name: "legalHold", type: "boolean", default: false },
        { displayName: "Binary Property Name", name: "binaryPropertyName", type: "string", default: "data" },
        { displayName: "Simplify", name: "simplify", type: "boolean", default: false },
      ],
    },
  ],
};

export const googleFirebaseRealtimeDatabase: INodeTypeDescription = {
  name: "openflow-node-base.googleFirebaseRealtimeDatabase",
  displayName: "Google Cloud Realtime Database",
  category: "Data & Storage",
  group: ["output"],
  version: 1,
  description: "Read, write, update, delete, and push data to a Firebase Realtime Database.",
  defaults: { name: "Realtime Database" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Globe",
  credentials: [{ name: "googleFirebaseRealtimeDatabaseOAuth2Api" }],
  sources: [FIREBASE_RTDB_DOCS],
  properties: [
    {
      displayName: "Project ID",
      name: "projectId",
      type: "options",
      default: "",
      required: true,
      typeOptions: {
        loadOptionsMethod: "getProjects",
      },
      description: "Firebase project name/ID, dynamically loaded via getProjects; accepts expression",
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Push", value: "push" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "Path",
      name: "path",
      type: "string",
      default: "",
      required: true,
      placeholder: "/app/users",
      description: "Object path on database, e.g. /app/users. Do not append .json. For Get operation the path is optional (blank = whole database)",
    },
    {
      displayName: "Attributes",
      name: "attributes",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { operation: ["create", "push", "update"] },
      },
      placeholder: "age, name, city",
      description: "Comma-separated column/attribute names to write, e.g. age, name, city",
    },
  ],
};
