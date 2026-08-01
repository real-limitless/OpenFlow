import type { INodeTypeDescription } from "../types";

const PAYPAL_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.paypal/";
const PAYPAL_CRED_DOCS = "https://docs.n8n.io/integrations/builtin/credentials/paypal";

const PAYPAL_OPERATIONS = [
  { name: "Create Batch Payout", value: "createBatchPayout" },
  { name: "Show Batch Payout Details", value: "showBatchPayoutDetails" },
  { name: "Cancel Unclaimed Payout Item", value: "cancelPayoutItem" },
  { name: "Show Payout Item Details", value: "showPayoutItemDetails" },
];

const QBO_RESOURCES = [
  { name: "Bill", value: "bill" },
  { name: "Customer", value: "customer" },
  { name: "Employee", value: "employee" },
  { name: "Estimate", value: "estimate" },
  { name: "Invoice", value: "invoice" },
  { name: "Item", value: "item" },
  { name: "Payment", value: "payment" },
  { name: "Purchase", value: "purchase" },
  { name: "Transaction", value: "transaction" },
  { name: "Vendor", value: "vendor" },
];

const QBO_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get All", value: "getAll" },
  { name: "Send", value: "send" },
  { name: "Update", value: "update" },
  { name: "Void", value: "void" },
];

export const snowflake: INodeTypeDescription = {
  name: "n8n-nodes-base.snowflake",
  displayName: "Snowflake",
  category: "Data & Storage",
  version: 1,
  description: "Snowflake node for executing queries and performing insert/update operations.",
  defaults: { name: "Snowflake" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Database",
  credentials: [{ name: "snowflake", required: true }],
  sources: [],
  properties: [
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "insert",
      required: true,
      options: ["executeQuery", "insert", "update"],
    },
    {
      displayName: "Query",
      name: "query",
      type: "string",
      default: "",
      displayedOptions: { operation: ["executeQuery"] },
    },
    {
      displayName: "Table",
      name: "table",
      type: "string",
      default: "",
      displayedOptions: { operation: ["insert", "update"] },
      description: "Target table name",
    },
    {
      displayName: "Columns",
      name: "columns",
      type: "string",
      default: "",
      displayedOptions: { operation: ["insert", "update"] },
      description: "Comma-separated list of columns",
    },
    {
      displayName: "Update Key",
      name: "updateKey",
      type: "string",
      default: "id",
      displayedOptions: { operation: ["update"] },
      description: "Key used for row matching",
    },
  ],
};

export const quickbooks: INodeTypeDescription = {
  name: "n8n-nodes-base.quickbooks",
  displayName: "QuickBooks Online",
  category: "Finance & Accounting",
  version: 1,
  description: "Create, update, get, and delete QuickBooks Online entities (invoices, customers, bills, etc.).",
  defaults: { name: "QuickBooks Online" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Briefcase",
  credentials: [{ name: "quickBooksOAuth2Api", required: true }],
  sources: [
    "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbooks.md",
    "https://docs.n8n.io/integrations/builtin/credentials/quickbooks.md",
  ],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "invoice",
      required: true,
      noDataExpression: true,
      options: QBO_RESOURCES,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      options: QBO_OPERATIONS,
    },
    {
      displayName: "ID",
      name: "id",
      type: "string",
      default: "",
      placeholder: "={{ $json.id }}",
      displayOptions: {
        show: { operation: ["get", "update", "delete", "send", "void"] },
      },
      description: "The QuickBooks Id of the target entity",
    },
    {
      displayName: "Query Filter",
      name: "queryFilter",
      type: "string",
      default: "",
      displayOptions: {
        show: { operation: ["getAll"] },
      },
      placeholder: "e.g. WHERE Active = true MAXRESULTS 10",
      description: "Optional QBO query filter string",
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { operation: ["create", "update"] },
      },
      description: "Resource-specific fields for the QBO request body",
      options: [
        {
          displayName: "Fields",
          name: "fields",
          type: "json",
          default: "{}",
          description: "Raw JSON object of additional fields to include in the payload",
        },
      ],
    },
    {
      displayName: "Update Fields",
      name: "updateFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { operation: ["update"] },
      },
      description: "Fields to modify on an existing resource (requires SyncToken)",
      options: [
        {
          displayName: "Fields",
          name: "fields",
          type: "json",
          default: "{}",
          description: "Raw JSON object with update fields, must include SyncToken",
        },
      ],
    },
  ],
};

export const payPal: INodeTypeDescription = {
  name: "n8n-nodes-base.payPal",
  displayName: "PayPal",
  category: "Payments",
  group: ["output"],
  version: 1,
  description: "Create and inspect PayPal batch payouts and individual payout items.",
  defaults: { name: "PayPal" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Wallet",
  credentials: [{ name: "payPal", required: true }],
  sources: [PAYPAL_DOCS, PAYPAL_CRED_DOCS],
  properties: [
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "createBatchPayout",
      required: true,
      noDataExpression: true,
      options: PAYPAL_OPERATIONS,
    },
    {
      displayName: "Batch Header",
      name: "batchHeader",
      type: "collection",
      default: {},
      displayOptions: {
        show: { operation: ["createBatchPayout", "showBatchPayoutDetails"] },
      },
      description: "Identifies the payout batch to create or retrieve.",
      options: [
        {
          displayName: "Payout Batch ID",
          name: "payout_batch_id",
          type: "string",
          default: "",
          placeholder: "={{ $json.batchId }}",
          description: "Identifier of an existing payout batch.",
        },
        {
          displayName: "Batch Status",
          name: "batch_status",
          type: "string",
          default: "",
          description: "Status to apply to or match against the payout batch.",
        },
      ],
    },
    {
      displayName: "Sender Batch Header",
      name: "senderBatchHeader",
      type: "collection",
      default: {},
      displayOptions: {
        show: { operation: ["createBatchPayout", "showBatchPayoutDetails"] },
      },
      description: "Optional sender-side identifiers for the payout batch.",
      options: [
        {
          displayName: "Sender Batch ID",
          name: "sender_batch_id",
          type: "string",
          default: "",
          description: "Your own reference for this batch, used to avoid duplicate payouts.",
        },
        {
          displayName: "Email Subject",
          name: "email_subject",
          type: "string",
          default: "",
          description: "Subject line of the notification email sent to recipients.",
        },
      ],
    },
    {
      displayName: "Payout Item ID",
      name: "payoutItemId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { operation: ["cancelPayoutItem", "showPayoutItemDetails"] },
      },
      placeholder: "={{ $json.itemId }}",
      description: "Identifier of the payout item to cancel or retrieve.",
    },
    {
      displayName: "Document ID",
      name: "documentId",
      type: "string",
      default: "",
      displayOptions: {
        show: { operation: ["cancelPayoutItem", "showPayoutItemDetails"] },
      },
      description: "Identifier of the payout item when it is tracked separately from the batch.",
    },
  ],
};

const BASEROW_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.baserow/";

export const baserow: INodeTypeDescription = {
  name: "n8n-nodes-base.baserow",
  displayName: "Baserow",
  category: "Data & Storage",
  group: ["app"],
  version: 1,
  description: "Access and manage Baserow database rows",
  defaults: { name: "Baserow" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Database",
  credentials: [{ name: "baserowApi", required: true }],
  sources: [BASEROW_DOCS],
  properties: [
    {
      displayName: "Table",
      name: "table",
      type: "string",
      default: "",
      required: true,
      description: "Name or ID of the Baserow table to operate on",
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Create a Row", value: "create" },
        { name: "Delete a Row", value: "delete" },
        { name: "Get a Row", value: "read" },
        { name: "Get Many Rows", value: "read" },
        { name: "Update a Row", value: "update" },
        { name: "Create Multiple Rows", value: "createMultiple" },
        { name: "Delete Multiple Rows", value: "deleteMultiple" },
        { name: "Update Multiple Rows", value: "updateMultiple" },
      ],
    },
    {
      displayName: "Row ID",
      name: "rowId",
      type: "number",
      default: 0,
      displayOptions: {
        show: {
          operation: ["delete", "read", "update"],
        },
      },
      description: "ID of the row to operate on",
    },
    {
      displayName: "Row Data",
      name: "rowData",
      type: "json",
      default: '{"field_1": "value"}',
      displayOptions: {
        show: {
          operation: ["create", "update", "createMultiple", "updateMultiple"],
        },
      },
      description: "Row data as JSON (field key-value pairs)",
    },
    {
      displayName: "Filters",
      name: "filters",
      type: "collection",
      default: {},
      displayOptions: {
        show: { operation: ["read"] },
      },
      options: [
        { displayName: "Order By", name: "orderBy", type: "string", default: "" },
        { displayName: "Search", name: "search", type: "string", default: "" },
        { displayName: "Page", name: "page", type: "number", default: 1 },
        { displayName: "Per Page", name: "perPage", type: "number", default: 100 },
      ],
    },
  ],
};

const DROPBOX_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dropbox.md";
const DROPBOX_CRED_DOCS = "https://docs.n8n.io/integrations/builtin/credentials/dropbox.md";

export const dropbox: INodeTypeDescription = {
  name: "n8n-nodes-base.dropbox",
  displayName: "Dropbox",
  category: "Data & Storage",
  group: ["storage"],
  version: 1,
  description: "Access and manage Dropbox files and folders",
  defaults: { name: "Dropbox" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "HardDrive",
  credentials: [
    { name: "dropboxApi", required: true },
    { name: "dropboxOAuth2Api", required: true },
  ],
  sources: [DROPBOX_DOCS, DROPBOX_CRED_DOCS],
  properties: [
    {
      displayName: "Authentication",
      name: "authentication",
      type: "options",
      default: "accessToken",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Access Token", value: "accessToken" },
        { name: "OAuth2", value: "oAuth2" },
      ],
    },
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "file",
      required: true,
      noDataExpression: true,
      options: [
        { name: "File", value: "file" },
        { name: "Folder", value: "folder" },
        { name: "Search", value: "search" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "upload",
      required: true,
      noDataExpression: true,
      displayOptions: {
        show: { resource: ["file"] },
      },
      options: [
        { name: "Upload", value: "upload" },
        { name: "Download", value: "download" },
        { name: "Copy", value: "copy" },
        { name: "Delete", value: "delete" },
        { name: "Move", value: "move" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: {
        show: { resource: ["folder"] },
      },
      options: [
        { name: "Create", value: "create" },
        { name: "Copy", value: "copy" },
        { name: "Delete", value: "delete" },
        { name: "Move", value: "move" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "query",
      required: true,
      noDataExpression: true,
      displayOptions: {
        show: { resource: ["search"] },
      },
      options: [
        { name: "Query", value: "query" },
      ],
    },
    {
      displayName: "Path",
      name: "path",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["file", "folder"] },
      },
      description: "Path to the file or folder in Dropbox",
    },
    {
      displayName: "Query",
      name: "query",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["search"] },
      },
      description: "Search query string",
    },
    {
      displayName: "To Path",
      name: "toPath",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["file", "folder"],
          operation: ["copy", "move"],
        },
      },
      description: "Destination path for copy or move",
    },
    {
      displayName: "Data",
      name: "data",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["file"], operation: ["upload"] },
      },
      description: "File content data for upload",
    },
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "add",
      displayOptions: {
        show: { resource: ["file"], operation: ["upload"] },
      },
      options: [
        { name: "Add", value: "add" },
        { name: "Overwrite", value: "overwrite" },
        { name: "Update", value: "update" },
      ],
      description: "Upload conflict resolution mode",
    },
    {
      displayName: "Auto Rename",
      name: "autorename",
      type: "boolean",
      default: true,
      displayOptions: {
        show: { resource: ["file", "folder"], operation: ["upload", "create"] },
      },
      description: "Automatically rename if a conflict arises",
    },
  ],
};

const AWS_S3_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awss3/";
const AWS_CRED_DOCS = "https://docs.n8n.io/integrations/builtin/credentials/aws/";

export const awsS3: INodeTypeDescription = {
  name: "n8n-nodes-base.awsS3",
  displayName: "AWS S3",
  category: "Data & Storage",
  group: ["storage"],
  version: 2,
  description: "Access and manage AWS S3 buckets and files",
  defaults: { name: "AWS S3" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "HardDrive",
  credentials: [{ name: "aws", required: true }],
  sources: [AWS_S3_DOCS, AWS_CRED_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "bucket",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Bucket", value: "bucket" },
        { name: "File", value: "file" },
        { name: "Folder", value: "folder" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["bucket"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get All", value: "getAll" },
        { name: "Search", value: "search" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "download",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["file"] } },
      options: [
        { name: "Copy", value: "copy" },
        { name: "Delete", value: "delete" },
        { name: "Download", value: "download" },
        { name: "Get All", value: "getAll" },
        { name: "Upload", value: "upload" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["folder"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get All", value: "getAll" },
      ],
    },
    {
      displayName: "Bucket Name",
      name: "bucketName",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["file", "folder"] },
      },
      description: "Name of the target S3 bucket",
    },
    {
      displayName: "Bucket Name",
      name: "name",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["bucket"], operation: ["create", "delete"] },
      },
      description: "Name of the S3 bucket",
    },
    {
      displayName: "File Key",
      name: "fileKey",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["file"], operation: ["download", "delete"] },
      },
      description: "Key of the file in S3",
    },
    {
      displayName: "File Name",
      name: "fileName",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["file"], operation: ["upload"] },
      },
      description: "Name of the uploaded file (required when binaryData=false)",
    },
    {
      displayName: "Binary Data",
      name: "binaryData",
      type: "boolean",
      default: true,
      displayOptions: {
        show: { resource: ["file"], operation: ["upload"] },
      },
    },
    {
      displayName: "File Content",
      name: "fileContent",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["file"], operation: ["upload"], binaryData: [false] },
      },
      description: "Text content when not using binary data",
    },
    {
      displayName: "Binary Property",
      name: "binaryPropertyName",
      type: "string",
      default: "data",
      displayOptions: {
        show: { resource: ["file"], operation: ["upload", "download"] },
      },
      description: "Name of the binary property for input (upload) or output (download)",
    },
    {
      displayName: "Source Path",
      name: "sourcePath",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["file"], operation: ["copy"] },
      },
      placeholder: "/bucket/key",
      description: "Source path in format /bucket/key",
    },
    {
      displayName: "Destination Path",
      name: "destinationPath",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["file"], operation: ["copy"] },
      },
      placeholder: "/bucket/key",
      description: "Destination path in format /bucket/key",
    },
    {
      displayName: "Folder Name",
      name: "folderName",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["folder"], operation: ["create"] },
      },
      description: "Name of the new folder",
    },
    {
      displayName: "Folder Key",
      name: "folderKey",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["folder"], operation: ["delete"] },
      },
      description: "Key of the folder to delete",
    },
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: {
        show: { resource: ["bucket", "file", "folder"], operation: ["getAll", "search"] },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 100,
      typeOptions: { minValue: 1, maxValue: 500 },
      displayOptions: {
        show: { resource: ["bucket", "file", "folder"], operation: ["getAll", "search"], returnAll: [false] },
      },
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["bucket"], operation: ["create", "search"] },
      },
      options: [
        { displayName: "ACL", name: "acl", type: "options", default: "", options: [
          { name: "Authenticated Read", value: "authenticatedRead" },
          { name: "Private", value: "Private" },
          { name: "Public Read", value: "publicRead" },
          { name: "Public Read Write", value: "publicReadWrite" },
        ]},
        { displayName: "Bucket Object Lock Enabled", name: "bucketObjectLockEnabled", type: "boolean", default: false },
        { displayName: "Grant Full Control", name: "grantFullControl", type: "boolean", default: false },
        { displayName: "Grant Read", name: "grantRead", type: "boolean", default: false },
        { displayName: "Grant Read ACP", name: "grantReadAcp", type: "boolean", default: false },
        { displayName: "Grant Write", name: "grantWrite", type: "boolean", default: false },
        { displayName: "Grant Write ACP", name: "grantWriteAcp", type: "boolean", default: false },
        { displayName: "Region", name: "region", type: "string", default: "" },
        { displayName: "Delimiter", name: "delimiter", type: "string", default: "" },
        { displayName: "Encoding Type", name: "encodingType", type: "options", default: "", options: [{ name: "URL", value: "url" }] },
        { displayName: "Fetch Owner", name: "fetchOwner", type: "boolean", default: false },
        { displayName: "Prefix", name: "prefix", type: "string", default: "" },
        { displayName: "Requester Pays", name: "requesterPays", type: "boolean", default: false },
        { displayName: "Start After", name: "startAfter", type: "string", default: "" },
      ],
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["file"], operation: ["copy", "upload"] },
      },
      options: [
        { displayName: "ACL", name: "acl", type: "options", default: "", options: [
          { name: "Authenticated Read", value: "authenticatedRead" },
          { name: "Private", value: "Private" },
          { name: "Public Read", value: "publicRead" },
          { name: "Public Read Write", value: "publicReadWrite" },
        ]},
      ],
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["file"], operation: ["delete", "getAll"] },
      },
      options: [
        { displayName: "Version ID", name: "versionId", type: "string", default: "" },
        { displayName: "Fetch Owner", name: "fetchOwner", type: "boolean", default: false },
        { displayName: "Folder Key", name: "folderKey", type: "string", default: "" },
      ],
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["folder"], operation: ["create"] },
      },
      options: [
        { displayName: "Parent Folder Key", name: "parentFolderKey", type: "string", default: "" },
        { displayName: "Requester Pays", name: "requesterPays", type: "boolean", default: false },
        { displayName: "Storage Class", name: "storageClass", type: "options", default: "", options: [
          { name: "Standard", value: "STANDARD" },
          { name: "Reduced Redundancy", value: "REDUCED_REDUNDANCY" },
          { name: "Glacier", value: "GLACIER" },
          { name: "Standard IA", value: "STANDARD_IA" },
          { name: "One Zone IA", value: "ONEZONE_IA" },
          { name: "Intelligent Tiering", value: "INTELLIGENT_TIERING" },
          { name: "Deep Archive", value: "DEEP_ARCHIVE" },
        ]},
      ],
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["folder"], operation: ["getAll"] },
      },
      options: [
        { displayName: "Fetch Owner", name: "fetchOwner", type: "boolean", default: false },
        { displayName: "Folder Key", name: "folderKey", type: "string", default: "" },
      ],
    },
  ],
};

const PERPLEXITY_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.perplexity/";
const PERPLEXITY_CRED_DOCS = "https://docs.n8n.io/integrations/builtin/credentials/perplexity/";

const perplexityResources = [
  { name: "Chat", value: "chat" },
  { name: "Agent", value: "agent" },
  { name: "Embedding", value: "embedding" },
  { name: "Search", value: "search" },
];

const perplexityOptions: Array<{
  displayName: string;
  name: string;
  type: string;
  default: unknown;
  [k: string]: unknown;
}> = [
  { displayName: "Disable Search", name: "disableSearch", type: "boolean", default: false },
  { displayName: "Enable Search Classifier", name: "enableSearchClassifier", type: "boolean", default: false },
  { displayName: "Frequency Penalty", name: "frequencyPenalty", type: "number", default: 0 },
  { displayName: "Max Tokens", name: "maxTokens", type: "number", default: 1 },
  { displayName: "Temperature", name: "temperature", type: "number", default: 0.2 },
  { displayName: "Presence Penalty", name: "presencePenalty", type: "number", default: 0 },
  { displayName: "Top P", name: "topP", type: "number", default: 0.9 },
  { displayName: "Top K", name: "topK", type: "number", default: 0 },
  { displayName: "Stop", name: "stop", type: "string", default: "" },
  { displayName: "Response Format", name: "responseFormat", type: "json", default: "" },
  { displayName: "Return Images", name: "returnImages", type: "boolean", default: false },
  { displayName: "Return Related Questions", name: "returnRelatedQuestions", type: "boolean", default: false },
  { displayName: "Search Domain Filter", name: "searchDomainFilter", type: "string", default: "" },
  { displayName: "Search Mode", name: "searchMode", type: "options", default: "web", options: [
    { name: "Web", value: "web" },
    { name: "Academic", value: "academic" },
    { name: "SEC", value: "sec" },
  ]},
  { displayName: "Search Recency", name: "searchRecency", type: "options", default: "month", options: [
    { name: "Hour", value: "hour" },
    { name: "Day", value: "day" },
    { name: "Week", value: "week" },
    { name: "Month", value: "month" },
    { name: "Year", value: "year" },
  ]},
  { displayName: "Language Preference", name: "languagePreference", type: "string", default: "" },
  { displayName: "Search Language Filter", name: "searchLanguageFilter", type: "string", default: "" },
  { displayName: "Search After Date", name: "searchAfterDate", type: "string", default: "" },
  { displayName: "Search Before Date", name: "searchBeforeDate", type: "string", default: "" },
  { displayName: "Last Updated After", name: "lastUpdatedAfter", type: "string", default: "" },
  { displayName: "Last Updated Before", name: "lastUpdatedBefore", type: "string", default: "" },
];

export const perplexity: INodeTypeDescription = {
  name: "n8n-nodes-base.perplexity",
  displayName: "Perplexity",
  category: "AI",
  group: ["output"],
  version: [1, 2],
  defaultVersion: 2,
  description: "Access Perplexity AI models and APIs for chat, agent, embedding, and search operations.",
  defaults: { name: "Perplexity" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Zap",
  credentials: [{ name: "perplexityApi", required: true }],
  sources: [PERPLEXITY_DOCS, PERPLEXITY_CRED_DOCS],
  properties: [
    {
      displayName: "Version",
      name: "version",
      type: "hidden",
      default: 2,
    },
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "chat",
      required: true,
      noDataExpression: true,
      options: perplexityResources,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "complete",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["chat"] } },
      options: [{ name: "Complete", value: "complete" }],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "createResponse",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["agent"] } },
      options: [{ name: "Create Response", value: "createResponse" }],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "createEmbedding",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["embedding"] } },
      options: [
        { name: "Create Embedding", value: "createEmbedding" },
        { name: "Create Contextualized Embedding", value: "createContextualized" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "search",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["search"] } },
      options: [{ name: "Search", value: "search" }],
    },
    {
      displayName: "Model",
      name: "model",
      type: "options",
      default: "sonar",
      required: true,
      displayOptions: { show: { resource: ["chat"] } },
      options: [
        { name: "Sonar", value: "sonar" },
        { name: "Sonar Deep Research", value: "sonar-deep-research" },
        { name: "Sonar Pro", value: "sonar-pro" },
        { name: "Sonar Reasoning Pro", value: "sonar-reasoning-pro" },
      ],
    },
    {
      displayName: "Messages",
      name: "messages",
      type: "fixedCollection",
      default: { message: [{ role: "user", content: "" }] },
      typeOptions: { multipleValues: true },
      required: true,
      displayOptions: { show: { resource: ["chat"] } },
      options: [
        {
          name: "message",
          displayName: "Message",
          values: [
            { displayName: "Role", name: "role", type: "options", default: "user", options: [
              { name: "System", value: "system" },
              { name: "User", value: "user" },
              { name: "Assistant", value: "assistant" },
            ]},
            { displayName: "Content", name: "content", type: "string", default: "" },
          ],
        },
      ],
    },
    {
      displayName: "Input",
      name: "input",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["agent", "embedding", "search"] } },
    },
    {
      displayName: "Query",
      name: "query",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["search"] } },
    },
    {
      displayName: "Simplify",
      name: "simplify",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["chat", "agent", "search"] } },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      description: "Perplexity API request options",
      options: perplexityOptions,
    },
    {
      displayName: "Timeout",
      name: "timeout",
      type: "number",
      default: 10000,
      description: "Request timeout in milliseconds",
    },
  ],
};
