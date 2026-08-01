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
