import type { INodeTypeDescription } from "../types";

const ENTRA_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftentra/";

const GROUP_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
];

const USER_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
  { name: "Add to Group", value: "addToGroup" },
  { name: "Remove from Group", value: "removeFromGroup" },
];

export const microsoftEntra: INodeTypeDescription = {
  name: "n8n-nodes-base.microsoftEntra",
  displayName: "Microsoft Entra ID",
  category: "Development",
  group: ["integration"],
  version: 1,
  description: "Manage Microsoft Entra ID groups and users",
  defaults: { name: "Microsoft Entra ID" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Building2",
  credentials: [{ name: "microsoftEntraOAuth2Api", required: true }],
  sources: [ENTRA_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "group",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Group", value: "group" },
        { name: "User", value: "user" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["group"] } },
      options: GROUP_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["user"] } },
      options: USER_OPERATIONS,
    },
    // Group: create / update
    {
      displayName: "Display Name",
      name: "displayName",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["group"], operation: ["create", "update"] } },
    },
    {
      displayName: "Mail Enabled",
      name: "mailEnabled",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["group"], operation: ["create"] } },
    },
    {
      displayName: "Mail Nickname",
      name: "mailNickname",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["group"], operation: ["create"] } },
    },
    {
      displayName: "Security Enabled",
      name: "securityEnabled",
      type: "boolean",
      default: true,
      displayOptions: { show: { resource: ["group"], operation: ["create"] } },
    },
    {
      displayName: "Group Types",
      name: "groupTypes",
      type: "multiOptions",
      default: [],
      displayOptions: { show: { resource: ["group"], operation: ["create"] } },
      options: [
        { name: "Unified", value: "Unified" },
        { name: "DynamicMembership", value: "DynamicMembership" },
      ],
    },
    {
      displayName: "Visibility",
      name: "visibility",
      type: "options",
      default: "Private",
      displayOptions: { show: { resource: ["group"], operation: ["create"] } },
      options: [
        { name: "Private", value: "Private" },
        { name: "Public", value: "Public" },
      ],
    },
    // Group: get / delete / update by ID
    {
      displayName: "Group ID",
      name: "groupId",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["group"], operation: ["get", "delete", "update"] } },
    },
    // Group: getAll
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["group"], operation: ["getAll"] } },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      displayOptions: { show: { resource: ["group"], operation: ["getAll"], returnAll: [false] } },
    },
    {
      displayName: "Filters",
      name: "filters",
      type: "collection",
      default: {},
      displayOptions: { show: { resource: ["group"], operation: ["getAll"] } },
      options: [
        {
          displayName: "Query",
          name: "query",
          type: "string",
          default: "",
          placeholder: "startswith(displayName,'Engineering')",
        },
      ],
    },
    // User: create / update
    {
      displayName: "Account Enabled",
      name: "accountEnabled",
      type: "boolean",
      default: true,
      displayOptions: { show: { resource: ["user"], operation: ["create", "update"] } },
    },
    {
      displayName: "Display Name",
      name: "displayName",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["user"], operation: ["create", "update"] } },
    },
    {
      displayName: "Mail Nickname",
      name: "mailNickname",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["user"], operation: ["create"] } },
    },
    {
      displayName: "User Principal Name",
      name: "userPrincipalName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["user"], operation: ["create"] } },
      placeholder: "user@domain.com",
    },
    {
      displayName: "Password Profile",
      name: "passwordProfile",
      type: "fixedCollection",
      default: {},
      displayOptions: { show: { resource: ["user"], operation: ["create"] } },
      options: [
        {
          name: "passwordProfileValues",
          displayName: "Password",
          values: [
            {
              displayName: "Password",
              name: "password",
              type: "string",
              default: "",
              typeOptions: { password: true },
            },
            {
              displayName: "Force Change Password on Next Sign-In",
              name: "forceChangePasswordNextSignIn",
              type: "boolean",
              default: true,
            },
          ],
        },
      ],
    },
    // User: get / delete / update by ID
    {
      displayName: "User ID",
      name: "userId",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["user"], operation: ["get", "delete", "update"] } },
    },
    // User: getAll
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["user"], operation: ["getAll"] } },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      displayOptions: { show: { resource: ["user"], operation: ["getAll"], returnAll: [false] } },
    },
    {
      displayName: "Filters",
      name: "filters",
      type: "collection",
      default: {},
      displayOptions: { show: { resource: ["user"], operation: ["getAll"] } },
      options: [
        {
          displayName: "Query",
          name: "query",
          type: "string",
          default: "",
          placeholder: "startswith(displayName,'Jane')",
        },
      ],
    },
    // User: addToGroup / removeFromGroup
    {
      displayName: "Group ID",
      name: "groupId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["user"], operation: ["addToGroup", "removeFromGroup"] },
      },
    },
    {
      displayName: "User ID",
      name: "userId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["user"], operation: ["addToGroup", "removeFromGroup"] },
      },
    },
    // Additional fields (collection)
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: { show: { resource: ["group", "user"], operation: ["create", "update"] } },
      options: [
        { displayName: "Description", name: "description", type: "string", default: "" },
        { displayName: "Mail", name: "mail", type: "string", default: "" },
        {
          displayName: "Allow External Senders",
          name: "allowExternalSenders",
          type: "boolean",
          default: false,
        },
        {
          displayName: "Auto Subscribe New Members",
          name: "autoSubscribeNewMembers",
          type: "boolean",
          default: false,
        },
        { displayName: "Given Name", name: "givenName", type: "string", default: "" },
        { displayName: "Surname", name: "surname", type: "string", default: "" },
        { displayName: "Job Title", name: "jobTitle", type: "string", default: "" },
        { displayName: "Department", name: "department", type: "string", default: "" },
        { displayName: "Mobile Phone", name: "mobilePhone", type: "string", default: "" },
        { displayName: "Office Location", name: "officeLocation", type: "string", default: "" },
        {
          displayName: "Preferred Language",
          name: "preferredLanguage",
          type: "string",
          default: "",
        },
        { displayName: "Street Address", name: "streetAddress", type: "string", default: "" },
        { displayName: "City", name: "city", type: "string", default: "" },
        { displayName: "State", name: "state", type: "string", default: "" },
        { displayName: "Postal Code", name: "postalCode", type: "string", default: "" },
        { displayName: "Country", name: "country", type: "string", default: "" },
        { displayName: "Business Phones", name: "businessPhones", type: "string", default: "" },
        { displayName: "Usage Location", name: "usageLocation", type: "string", default: "" },
      ],
    },
  ],
};

const TODO_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsofttodo/";

const LINKED_RESOURCE_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
];

const LIST_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
];

const TASK_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
];

export const microsoftToDo: INodeTypeDescription = {
  name: "n8n-nodes-base.microsoftToDo",
  displayName: "Microsoft To Do",
  category: "Productivity",
  group: ["integration"],
  version: 1,
  description: "Access and manage Microsoft To Do lists, tasks, and linked resources",
  defaults: { name: "Microsoft To Do" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "ClipboardList",
  credentials: [
    { name: "microsoftToDoOAuth2Api" },
    { name: "microsoftEntraServicePrincipal" },
  ],
  sources: [TODO_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "linkedResource",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Linked Resource", value: "linkedResource" },
        { name: "List", value: "list" },
        { name: "Task", value: "task" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["linkedResource"] } },
      options: LINKED_RESOURCE_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["list"] } },
      options: LIST_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["task"] } },
      options: TASK_OPERATIONS,
    },
    // List ID (shared across list and task operations)
    {
      displayName: "List ID",
      name: "listId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          resource: ["list", "task", "linkedResource"],
          operation: ["create", "delete", "get", "getAll", "update"],
        },
      },
    },
    // Task ID (for task and linkedResource operations)
    {
      displayName: "Task ID",
      name: "taskId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          resource: ["task", "linkedResource"],
          operation: ["create", "delete", "get", "update"],
        },
      },
    },
    // Linked Resource ID
    {
      displayName: "Linked Resource ID",
      name: "linkedResourceId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["linkedResource"], operation: ["delete", "get", "update"] },
      },
    },
    // Linked Resource fields
    {
      displayName: "Linked Resource Web URL",
      name: "webUrl",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["linkedResource"], operation: ["create"] } },
    },
    {
      displayName: "Linked Resource Name",
      name: "displayName",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["linkedResource"], operation: ["create"] } },
    },
    // List display name
    {
      displayName: "Display Name",
      name: "displayName",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["list"], operation: ["create", "update"] } },
    },
    // Task title
    {
      displayName: "Title",
      name: "title",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["task"], operation: ["create"] } },
    },
    // Task optional fields
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
      options: [
        { displayName: "Body Content", name: "bodyContent", type: "string", default: "" },
        {
          displayName: "Body Content Type",
          name: "bodyContentType",
          type: "options",
          default: "text",
          options: [
            { name: "Text", value: "text" },
            { name: "HTML", value: "html" },
          ],
        },
        { displayName: "Due Date Time", name: "dueDateTime", type: "string", default: "" },
        {
          displayName: "Importance",
          name: "importance",
          type: "options",
          default: "normal",
          options: [
            { name: "Low", value: "low" },
            { name: "Normal", value: "normal" },
            { name: "High", value: "high" },
          ],
        },
        { displayName: "Is Reminder On", name: "isReminderOn", type: "boolean", default: false },
        { displayName: "Reminder Date Time", name: "reminderDateTime", type: "string", default: "" },
        { displayName: "Start Date Time", name: "startDateTime", type: "string", default: "" },
        {
          displayName: "Status",
          name: "status",
          type: "options",
          default: "notStarted",
          options: [
            { name: "Not Started", value: "notStarted" },
            { name: "In Progress", value: "inProgress" },
            { name: "Completed", value: "completed" },
            { name: "Waiting on Others", value: "waitingOnOthers" },
            { name: "Deferred", value: "deferred" },
          ],
        },
        { displayName: "Categories", name: "categories", type: "string", default: "" },
      ],
    },
    // Return All / Limit for getAll
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: {
        show: {
          resource: ["list", "task", "linkedResource"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      displayOptions: {
        show: {
          resource: ["list", "task", "linkedResource"],
          operation: ["getAll"],
          returnAll: [false],
        },
      },
    },
  ],
};

const SLIDES_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleslides/";

const PAGE_OPERATIONS = [
  { name: "Get", value: "get" },
  { name: "Get Thumbnail", value: "getThumbnail" },
];

const PRESENTATION_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Get", value: "get" },
  { name: "Get Slides", value: "getSlides" },
  { name: "Replace Text", value: "replaceText" },
];

export const googleSlides: INodeTypeDescription = {
  name: "n8n-nodes-base.googleSlides",
  displayName: "Google Slides",
  category: "Marketing",
  group: ["integration"],
  version: 1,
  description: "Access and manage Google Slides presentations and pages",
  defaults: { name: "Google Slides" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Presentation",
  credentials: [{ name: "googleSlidesOAuth2Api", required: true }],
  sources: [SLIDES_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "presentation",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Page", value: "page" },
        { name: "Presentation", value: "presentation" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "get",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["page"] } },
      options: PAGE_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["presentation"] } },
      options: PRESENTATION_OPERATIONS,
    },
    {
      displayName: "Presentation ID",
      name: "presentationId",
      type: "string",
      default: "",
      required: true,
      placeholder: "https://docs.google.com/presentation/d/...",
      displayOptions: {
        show: {
          resource: ["page"],
          operation: ["get", "getThumbnail"],
        },
      },
    },
    {
      displayName: "Presentation ID",
      name: "presentationId",
      type: "string",
      default: "",
      required: true,
      placeholder: "https://docs.google.com/presentation/d/...",
      displayOptions: {
        show: {
          resource: ["presentation"],
          operation: ["get", "getSlides", "replaceText"],
        },
      },
    },
    {
      displayName: "Page ID",
      name: "pageId",
      type: "options",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["page"], operation: ["get", "getThumbnail"] },
      },
      typeOptions: {
        loadOptionsMethod: "getPages",
      },
    },
    {
      displayName: "Title",
      name: "title",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["presentation"], operation: ["create"] },
      },
    },
    {
      displayName: "Text",
      name: "text",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["presentation"], operation: ["replaceText"] },
      },
    },
    {
      displayName: "Replacement",
      name: "replacement",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["presentation"], operation: ["replaceText"] },
      },
    },
    {
      displayName: "Replace All Matches",
      name: "replaceAllMatches",
      type: "boolean",
      default: true,
      displayOptions: {
        show: { resource: ["presentation"], operation: ["replaceText"] },
      },
    },
  ],
};

const BQ_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebigquery/";

export const googleBigQuery: INodeTypeDescription = {
  name: "n8n-nodes-base.googleBigQuery",
  displayName: "Google BigQuery",
  category: "Data & Storage",
  group: ["integration"],
  version: [1, 2, 2.1],
  description: "Execute SQL queries and insert rows into Google BigQuery",
  defaults: { name: "Google BigQuery" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Database",
  credentials: [
    { name: "googleBigQueryOAuth2Api", required: true },
    { name: "googleApi" },
  ],
  sources: [BQ_DOCS],
  properties: [
    {
      displayName: "Authentication",
      name: "authentication",
      type: "options",
      default: "oAuth2",
      required: true,
      noDataExpression: true,
      options: [
        { name: "OAuth2", value: "oAuth2" },
        { name: "Service Account", value: "serviceAccount" },
      ],
    },
    {
      displayName: "Resource",
      name: "resource",
      type: "hidden",
      default: "database",
      required: true,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "executeQuery",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["database"] } },
      options: [
        { name: "Execute Query", value: "executeQuery" },
        { name: "Insert", value: "insert" },
      ],
    },
    {
      displayName: "Project ID",
      name: "projectId",
      type: "resourceLocator",
      default: { mode: "list", value: "" },
      required: true,
      typeOptions: {
        loadOptionsMethod: "searchProjects",
      },
    },
    {
      displayName: "Dataset ID",
      name: "datasetId",
      type: "resourceLocator",
      default: { mode: "list", value: "" },
      required: true,
      typeOptions: {
        loadOptionsMethod: "searchDatasets",
      },
    },
    {
      displayName: "Table ID",
      name: "tableId",
      type: "resourceLocator",
      default: { mode: "list", value: "" },
      required: true,
      displayOptions: { show: { operation: ["insert"] } },
      typeOptions: {
        loadOptionsMethod: "searchTables",
      },
    },
    {
      displayName: "SQL Query",
      name: "sqlQuery",
      type: "string",
      default: "",
      noDataExpression: false,
      required: false,
      typeOptions: { editor: "code", rows: 5 },
      displayOptions: {
        show: { operation: ["executeQuery"] },
        hide: { "/options.useLegacySql": [true] },
      },
      placeholder: "SELECT * FROM dataset.table LIMIT 100",
    },
    {
      displayName: "SQL Query (Legacy)",
      name: "sqlQuery",
      type: "string",
      default: "",
      noDataExpression: false,
      required: false,
      typeOptions: { editor: "code", rows: 5 },
      displayOptions: {
        show: { operation: ["executeQuery"], "/options.useLegacySql": [true] },
      },
      placeholder: "SELECT * FROM [project:dataset.table] LIMIT 100",
    },
    {
      displayName: "Data Mode",
      name: "dataMode",
      type: "options",
      default: "autoMap",
      noDataExpression: true,
      displayOptions: { show: { operation: ["insert"] } },
      options: [
        { name: "Auto-Map Input Data to Columns", value: "autoMap" },
        { name: "Define Each Field Manually", value: "define" },
      ],
    },
    {
      displayName: "Fields",
      name: "fieldsUi",
      type: "fixedCollection",
      default: {},
      displayOptions: { show: { operation: ["insert"], dataMode: ["define"] } },
      typeOptions: { multipleValues: true },
      options: [
        {
          name: "values",
          displayName: "Field",
          values: [
            {
              displayName: "Field ID",
              name: "fieldId",
              type: "options",
              default: "",
              typeOptions: { loadOptionsMethod: "getSchema" },
            },
            {
              displayName: "Field Value",
              name: "fieldValue",
              type: "string",
              default: "",
            },
          ],
        },
      ],
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      displayOptions: { show: { operation: ["executeQuery"] } },
      options: [
        {
          displayName: "Default Dataset",
          name: "defaultDataset",
          type: "options",
          default: "",
          typeOptions: { loadOptionsMethod: "getDatasets" },
        },
        { displayName: "Dry Run", name: "dryRun", type: "boolean", default: false },
        { displayName: "Include Schema", name: "includeSchema", type: "boolean", default: false },
        { displayName: "Location", name: "location", type: "string", default: "" },
        { displayName: "Maximum Bytes Billed", name: "maximumBytesBilled", type: "string", default: "" },
        { displayName: "Max Results", name: "maxResults", type: "number", default: 1000 },
        { displayName: "Timeout (ms)", name: "timeoutMs", type: "number", default: 10000 },
        { displayName: "Raw Output", name: "rawOutput", type: "boolean", default: false },
        { displayName: "Use Legacy SQL", name: "useLegacySql", type: "boolean", default: false },
        { displayName: "Return as Numbers", name: "returnAsNumbers", type: "boolean", default: false },
        {
          displayName: "Query Parameters",
          name: "queryParameters",
          type: "fixedCollection",
          default: {},
          typeOptions: { multipleValues: true },
          options: [
            {
              name: "namedParameters",
              displayName: "Named",
              values: [
                { displayName: "Name", name: "name", type: "string", default: "" },
                { displayName: "Value", name: "value", type: "string", default: "" },
              ],
            },
          ],
        },
      ],
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      displayOptions: { show: { operation: ["insert"] } },
      options: [
        { displayName: "Batch Size", name: "batchSize", type: "number", default: 100 },
        { displayName: "Ignore Unknown Values", name: "ignoreUnknownValues", type: "boolean", default: false },
        { displayName: "Skip Invalid Rows", name: "skipInvalidRows", type: "boolean", default: false },
        { displayName: "Template Suffix", name: "templateSuffix", type: "string", default: "" },
        { displayName: "Trace ID", name: "traceId", type: "string", default: "" },
      ],
    },
  ],
};

const TASKS_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletasks/";

const GT_TASK_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
];

export const googleTasks: INodeTypeDescription = {
  name: "n8n-nodes-base.googleTasks",
  displayName: "Google Tasks",
  category: "Productivity",
  group: ["integration"],
  version: 1,
  description: "Access and manage Google Tasks",
  defaults: { name: "Google Tasks" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "CheckSquare",
  credentials: [{ name: "googleTasksOAuth2Api", required: true }],
  sources: [TASKS_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "task",
      required: true,
      noDataExpression: true,
      options: [{ name: "Task", value: "task" }],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["task"] } },
      options: GT_TASK_OPERATIONS,
    },
    {
      displayName: "Task List",
      name: "task",
      type: "options",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["task"], operation: ["create", "delete", "get", "getAll", "update"] } },
      typeOptions: { loadOptionsMethod: "getTasks" },
    },
    {
      displayName: "Title",
      name: "title",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create"] } },
    },
    {
      displayName: "Task ID",
      name: "taskId",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["task"], operation: ["delete", "get", "update"] } },
    },
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: { show: { resource: ["task"], operation: ["create"] } },
      options: [
        { displayName: "Completion Date", name: "completionDate", type: "dateTime", default: "" },
        { displayName: "Due Date", name: "dueDate", type: "dateTime", default: "" },
        { displayName: "Notes", name: "notes", type: "string", default: "" },
        {
          displayName: "Status",
          name: "status",
          type: "options",
          default: "needsAction",
          options: [
            { name: "Needs Action", value: "needsAction" },
            { name: "Completed", value: "completed" },
          ],
        },
        { displayName: "Show Completed", name: "showCompleted", type: "boolean", default: false },
        { displayName: "Show Deleted", name: "showDeleted", type: "boolean", default: false },
        { displayName: "Show Hidden", name: "showHidden", type: "boolean", default: false },
      ],
    },
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 20,
      displayOptions: { show: { resource: ["task"], operation: ["getAll"], returnAll: [false] } },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
      options: [
        { displayName: "Show Completed", name: "showCompleted", type: "boolean", default: true },
        { displayName: "Show Deleted", name: "showDeleted", type: "boolean", default: false },
        { displayName: "Show Hidden", name: "showHidden", type: "boolean", default: false },
        { displayName: "Max Results", name: "maxResults", type: "number", default: 0 },
      ],
    },
    {
      displayName: "Update Fields",
      name: "updateFields",
      type: "collection",
      default: {},
      displayOptions: { show: { resource: ["task"], operation: ["update"] } },
      options: [
        { displayName: "Title", name: "title", type: "string", default: "" },
        { displayName: "Completion Date", name: "completionDate", type: "dateTime", default: "" },
        { displayName: "Due Date", name: "dueDate", type: "dateTime", default: "" },
        { displayName: "Notes", name: "notes", type: "string", default: "" },
        {
          displayName: "Status",
          name: "status",
          type: "options",
          default: "needsAction",
          options: [
            { name: "Needs Action", value: "needsAction" },
            { name: "Completed", value: "completed" },
          ],
},
      ],
    },
  ],
};

const GBP_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebusinessprofile/";

export const googleBusinessProfile: INodeTypeDescription = {
  name: "n8n-nodes-base.googleBusinessProfile",
  displayName: "Google Business Profile",
  category: "Productivity",
  group: ["integration"],
  version: 1,
  description: "Manage Google Business Profile local posts and reviews",
  defaults: { name: "Google Business Profile" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "MapPin",
  credentials: [{ name: "googleBusinessProfileOAuth2Api", required: true }],
  sources: [GBP_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "post",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Post", value: "post" },
        { name: "Review", value: "review" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["post"] } },
      options: [
        { name: "Create", value: "create" },
        { name: "Delete", value: "delete" },
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
        { name: "Update", value: "update" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "get",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["review"] } },
      options: [
        { name: "Get", value: "get" },
        { name: "Get Many", value: "getAll" },
        { name: "Reply", value: "reply" },
        { name: "Delete Reply", value: "delete" },
      ],
    },
    // Account resource locator
    {
      displayName: "Account",
      name: "account",
      type: "resourceLocator",
      default: { mode: "name", value: "" },
      required: true,
      displayOptions: { show: { resource: ["post", "review"] } },
      modes: [
        { name: "By Name", value: "name", displayName: "Account name (e.g. accounts/123)" },
      ],
    },
    // Location resource locator
    {
      displayName: "Location",
      name: "location",
      type: "resourceLocator",
      default: { mode: "name", value: "" },
      required: true,
      displayOptions: { show: { resource: ["post", "review"] } },
      modes: [
        { name: "By Name", value: "name", displayName: "Location name (e.g. accounts/123/locations/456)" },
      ],
    },
    // Post resource locator (for get/delete/update)
    {
      displayName: "Post",
      name: "post",
      type: "resourceLocator",
      default: { mode: "name", value: "" },
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["get", "delete", "update"] },
      },
      modes: [
        { name: "By Name", value: "name", displayName: "Post name (e.g. accounts/.../localPosts/789)" },
      ],
    },
    // Review resource locator
    {
      displayName: "Review",
      name: "review",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      required: true,
      displayOptions: {
        show: { resource: ["review"], operation: ["get", "reply", "delete"] },
      },
      modes: [
        { name: "By ID", value: "id", displayName: "Review ID" },
        { name: "By Name", value: "name", displayName: "Review name (e.g. accounts/.../reviews/abc)" },
      ],
    },
    // Post Create: postType
    {
      displayName: "Post Type",
      name: "postType",
      type: "options",
      default: "STANDARD",
      required: true,
      displayOptions: { show: { resource: ["post"], operation: ["create"] } },
      options: [
        { name: "Standard", value: "STANDARD" },
        { name: "Event", value: "EVENT" },
        { name: "Offer", value: "OFFER" },
        { name: "Alert", value: "ALERT" },
      ],
    },
    // Post Create: summary
    {
      displayName: "Summary",
      name: "summary",
      type: "string",
      default: "",
      required: true,
      displayOptions: { show: { resource: ["post"], operation: ["create"] } },
    },
    // Post Create: Event fields
    {
      displayName: "Title",
      name: "title",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["create"], postType: ["EVENT"] },
      },
    },
    {
      displayName: "Start Date Time",
      name: "startDateTime",
      type: "dateTime",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["create"], postType: ["EVENT"] },
      },
    },
    {
      displayName: "End Date Time",
      name: "endDateTime",
      type: "dateTime",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["create"], postType: ["EVENT"] },
      },
    },
    // Post Create: Offer fields
    {
      displayName: "Title",
      name: "title",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["create"], postType: ["OFFER"] },
      },
    },
    {
      displayName: "Start Date",
      name: "startDate",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["create"], postType: ["OFFER"] },
      },
    },
    {
      displayName: "End Date",
      name: "endDate",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["create"], postType: ["OFFER"] },
      },
    },
    // Post Create: Alert type
    {
      displayName: "Alert Type",
      name: "alertType",
      type: "options",
      default: "COVID_19",
      required: true,
      displayOptions: {
        show: { resource: ["post"], operation: ["create"], postType: ["ALERT"] },
      },
      options: [{ name: "COVID-19", value: "COVID_19" }],
    },
    // Post Get Many: pagination
    {
      displayName: "Return All",
      name: "returnAll",
      type: "boolean",
      default: false,
      displayOptions: {
        show: { resource: ["post", "review"], operation: ["getAll"] },
      },
    },
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 20,
      displayOptions: {
        show: {
          resource: ["post", "review"],
          operation: ["getAll"],
          returnAll: [false],
        },
      },
    },
    // Post Create / Update: options
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["post"], operation: ["create", "update"] },
      },
      options: [
        { displayName: "Language Code", name: "languageCode", type: "string", default: "" },
        {
          displayName: "Call to Action Type",
          name: "callToActionType",
          type: "options",
          default: "",
          options: [
            { name: "Book", value: "BOOK" },
            { name: "Order", value: "ORDER" },
            { name: "Shop", value: "SHOP" },
            { name: "Learn More", value: "LEARN_MORE" },
            { name: "Sign Up", value: "SIGN_UP" },
            { name: "Call", value: "CALL" },
          ],
        },
        { displayName: "URL", name: "url", type: "string", default: "" },
        { displayName: "Coupon Code", name: "couponCode", type: "string", default: "" },
        { displayName: "Redeem Online URL", name: "redeemOnlineUrl", type: "string", default: "" },
        { displayName: "Terms and Conditions", name: "termsConditions", type: "string", default: "" },
      ],
    },
    // Post Update: update fields
    {
      displayName: "Update Fields",
      name: "updateFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["post"], operation: ["update"] },
      },
      options: [
        { displayName: "Summary", name: "summary", type: "string", default: "" },
        { displayName: "Language Code", name: "languageCode", type: "string", default: "" },
        {
          displayName: "Call to Action Type",
          name: "callToActionType",
          type: "options",
          default: "",
          options: [
            { name: "Book", value: "BOOK" },
            { name: "Order", value: "ORDER" },
            { name: "Shop", value: "SHOP" },
            { name: "Learn More", value: "LEARN_MORE" },
            { name: "Sign Up", value: "SIGN_UP" },
            { name: "Call", value: "CALL" },
          ],
        },
        { displayName: "URL", name: "url", type: "string", default: "" },
        { displayName: "Start Date Time", name: "startDateTime", type: "dateTime", default: "" },
        { displayName: "End Date Time", name: "endDateTime", type: "dateTime", default: "" },
        { displayName: "Title", name: "title", type: "string", default: "" },
        { displayName: "Start Date", name: "startDate", type: "string", default: "" },
        { displayName: "End Date", name: "endDate", type: "string", default: "" },
        { displayName: "Coupon Code", name: "couponCode", type: "string", default: "" },
        { displayName: "Redeem Online URL", name: "redeemOnlineUrl", type: "string", default: "" },
        { displayName: "Terms and Conditions", name: "termsConditions", type: "string", default: "" },
      ],
    },
    // Review Reply
    {
      displayName: "Reply",
      name: "reply",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["review"], operation: ["reply"] },
      },
    },
  ],
};

const GCS_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudstorage/";

const BUCKET_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
];

const OBJECT_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Update", value: "update" },
];

export const googleCloudStorage: INodeTypeDescription = {
  name: "n8n-nodes-base.googleCloudStorage",
  displayName: "Google Cloud Storage",
  category: "Data & Storage",
  group: ["integration"],
  version: 1,
  description: "Access and manage Google Cloud Storage buckets and objects",
  defaults: { name: "Google Cloud Storage" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Storage",
  credentials: [{ name: "googleCloudStorageOAuth2Api", required: true }],
  sources: [GCS_DOCS],
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
        { name: "Object", value: "object" },
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
      options: BUCKET_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["object"] } },
      options: OBJECT_OPERATIONS,
    },
    // Bucket: Create
    {
      displayName: "Project ID",
      name: "projectId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["bucket"], operation: ["create", "getAll"] },
      },
    },
    {
      displayName: "Name",
      name: "name",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["bucket"], operation: ["create", "delete", "get", "update"] },
      },
    },
    {
      displayName: "Bucket Type",
      name: "bucketType",
      type: "options",
      default: "",
      displayOptions: {
        show: { resource: ["bucket"], operation: ["create", "update"] },
      },
      options: [
        { name: "Regional", value: "regional" },
        { name: "Multi-Regional", value: "multi-regional" },
        { name: "Nearline", value: "nearline" },
        { name: "Coldline", value: "coldline" },
        { name: "Archive", value: "archive" },
      ],
    },
    {
      displayName: "Predefined ACL",
      name: "predefinedAcl",
      type: "options",
      default: "",
      displayOptions: {
        show: { resource: ["bucket"], operation: ["create"] },
      },
      options: [
        { name: "Authenticated Read", value: "authenticatedRead" },
        { name: "Private", value: "private" },
        { name: "Project Private", value: "projectPrivate" },
        { name: "Public Read", value: "publicRead" },
        { name: "Public Read Write", value: "publicReadWrite" },
      ],
    },
    // Bucket: Get Many
    {
      displayName: "Max Results",
      name: "maxResults",
      type: "number",
      default: 50,
      displayOptions: {
        show: { resource: ["bucket", "object"], operation: ["getAll"] },
      },
    },
    {
      displayName: "Page Token",
      name: "pageToken",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["bucket", "object"], operation: ["getAll"] },
      },
    },
    // Object: common params
    {
      displayName: "Bucket Name",
      name: "bucketName",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["object"], operation: ["create", "delete", "get", "getAll", "update"] },
      },
    },
    {
      displayName: "Object Name",
      name: "objectName",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["object"], operation: ["create", "delete", "get", "update"] },
      },
    },
    // Object: Create
    {
      displayName: "Binary Data",
      name: "binaryData",
      type: "boolean",
      default: false,
      displayOptions: {
        show: { resource: ["object"], operation: ["create"] },
      },
    },
    {
      displayName: "Binary Property Name",
      name: "binaryPropertyName",
      type: "string",
      default: "data",
      displayOptions: {
        show: { resource: ["object"], operation: ["create"], binaryData: [true] },
      },
    },
    {
      displayName: "Data",
      name: "data",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["object"], operation: ["create"], binaryData: [false] },
      },
    },
    {
      displayName: "Content Type",
      name: "contentType",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["object"], operation: ["create"] },
      },
    },
    {
      displayName: "Predefined ACL",
      name: "predefinedAcl",
      type: "options",
      default: "",
      displayOptions: {
        show: { resource: ["object"], operation: ["create"] },
      },
      options: [
        { name: "Authenticated Read", value: "authenticatedRead" },
        { name: "Bucket Owner Full Control", value: "bucketOwnerFullControl" },
        { name: "Bucket Owner Read", value: "bucketOwnerRead" },
        { name: "Private", value: "private" },
        { name: "Project Private", value: "projectPrivate" },
        { name: "Public Read", value: "publicRead" },
      ],
    },
    // Object: Get Many
    {
      displayName: "Prefix",
      name: "prefix",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["object"], operation: ["getAll"] },
      },
    },
    {
      displayName: "Delimiter",
      name: "delimiter",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["object"], operation: ["getAll"] },
      },
    },
  ],
};

const CLICKUP_DOCS =
  "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clickup/";

const CU_CHECKLIST_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Update", value: "update" },
];

const CU_CHECKLIST_ITEM_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Update", value: "update" },
];

const CU_COMMENT_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get All", value: "getAll" },
  { name: "Update", value: "update" },
];

const CU_FOLDER_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get All", value: "getAll" },
  { name: "Update", value: "update" },
];

const CU_GOAL_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get All", value: "getAll" },
  { name: "Update", value: "update" },
];

const CU_GOAL_KEY_RESULT_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Update", value: "update" },
];

const CU_LIST_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get All", value: "getAll" },
  { name: "Get Custom Fields", value: "getCustomFields" },
  { name: "Get Members", value: "getMembers" },
  { name: "Update", value: "update" },
];

const CU_SPACE_TAG_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get All", value: "getAll" },
  { name: "Update", value: "update" },
];

const CU_TASK_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get All", value: "getAll" },
  { name: "Get Members", value: "getMembers" },
  { name: "Set Custom Field", value: "setCustomField" },
  { name: "Update", value: "update" },
];

const CU_TASK_LIST_OPERATIONS = [
  { name: "Add", value: "add" },
  { name: "Remove", value: "remove" },
];

const CU_TASK_TAG_OPERATIONS = [
  { name: "Add", value: "add" },
  { name: "Remove", value: "remove" },
];

const CU_TASK_DEPENDENCY_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
];

const CU_TIME_ENTRY_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get All", value: "getAll" },
  { name: "Start", value: "start" },
  { name: "Stop", value: "stop" },
  { name: "Update", value: "update" },
];

const CU_TIME_ENTRY_TAG_OPERATIONS = [
  { name: "Add Tag", value: "addTag" },
  { name: "Get All", value: "getAll" },
  { name: "Remove Tag", value: "removeTag" },
];

export const clickUp: INodeTypeDescription = {
  name: "n8n-nodes-base.clickUp",
  displayName: "ClickUp",
  category: "Productivity",
  group: ["integration"],
  version: 1,
  description: "Access ClickUp API to manage tasks, lists, folders, comments, goals, time entries, and more",
  defaults: { name: "ClickUp" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "CheckSquare",
  credentials: [
    { name: "clickUpApi" },
    { name: "clickUpOAuth2Api" },
  ],
  sources: [CLICKUP_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "task",
      required: true,
      noDataExpression: true,
      options: [
        { name: "Checklist", value: "checklist" },
        { name: "Checklist Item", value: "checklistItem" },
        { name: "Comment", value: "comment" },
        { name: "Folder", value: "folder" },
        { name: "Goal", value: "goal" },
        { name: "Goal Key Result", value: "goalKeyResult" },
        { name: "List", value: "list" },
        { name: "Space Tag", value: "spaceTag" },
        { name: "Task", value: "task" },
        { name: "Task List", value: "taskList" },
        { name: "Task Tag", value: "taskTag" },
        { name: "Task Dependency", value: "taskDependency" },
        { name: "Time Entry", value: "timeEntry" },
        { name: "Time Entry Tag", value: "timeEntryTag" },
      ],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["checklist"] } },
      options: CU_CHECKLIST_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["checklistItem"] } },
      options: CU_CHECKLIST_ITEM_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["comment"] } },
      options: CU_COMMENT_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["folder"] } },
      options: CU_FOLDER_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["goal"] } },
      options: CU_GOAL_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["goalKeyResult"] } },
      options: CU_GOAL_KEY_RESULT_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["list"] } },
      options: CU_LIST_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["spaceTag"] } },
      options: CU_SPACE_TAG_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["task"] } },
      options: CU_TASK_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "add",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["taskList"] } },
      options: CU_TASK_LIST_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "add",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["taskTag"] } },
      options: CU_TASK_TAG_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["taskDependency"] } },
      options: CU_TASK_DEPENDENCY_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["timeEntry"] } },
      options: CU_TIME_ENTRY_OPERATIONS,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "addTag",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["timeEntryTag"] } },
      options: CU_TIME_ENTRY_TAG_OPERATIONS,
    },
    // Common hierarchy parameters
    {
      displayName: "Workspace (Team)",
      name: "workspace",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      required: true,
      description: "The ClickUp Workspace (team) to operate on",
    },
    {
      displayName: "Space",
      name: "space",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      required: true,
      description: "The ClickUp Space within the selected workspace",
    },
    {
      displayName: "Folder (or folderless)",
      name: "folder",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      description: "The ClickUp Folder. Leave empty for folderless lists",
      displayOptions: {
        show: {
          resource: ["checklist", "checklistItem", "list", "timeEntry", "timeEntryTag"],
        },
      },
    },
    {
      displayName: "Folderless",
      name: "folderless",
      type: "boolean",
      default: false,
      description: "Whether to target lists outside folders",
      displayOptions: {
        show: {
          resource: ["checklist", "checklistItem", "list", "timeEntry", "timeEntryTag"],
        },
      },
    },
    {
      displayName: "List",
      name: "list",
      type: "resourceLocator",
      default: { mode: "id", value: "" },
      description: "The ClickUp List",
      displayOptions: {
        show: {
          resource: ["checklist", "checklistItem", "task", "taskList", "taskTag", "taskDependency", "timeEntry", "timeEntryTag"],
        },
      },
    },
    {
      displayName: "Task ID",
      name: "task",
      type: "string",
      default: "",
      description: "The ClickUp Task ID",
      displayOptions: {
        show: {
          resource: ["checklist", "checklistItem", "comment", "task", "taskList", "taskTag", "taskDependency", "timeEntry", "timeEntryTag"],
        },
      },
    },
    // Checklist-specific parameters
    {
      displayName: "Checklist Name",
      name: "checklistName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["checklist"], operation: ["create", "update"] } },
    },
    {
      displayName: "Checklist ID",
      name: "checklistId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["checklist", "checklistItem", "comment"] } },
    },
    // Checklist Item parameters
    {
      displayName: "Item Name",
      name: "itemName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["checklistItem"], operation: ["create", "update"] } },
    },
    {
      displayName: "Item ID",
      name: "itemId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["checklistItem"], operation: ["delete", "update"] } },
    },
    {
      displayName: "Assignee",
      name: "assignee",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["checklistItem"], operation: ["create", "update"] } },
    },
    {
      displayName: "Resolved",
      name: "resolved",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["checklistItem", "comment"], operation: ["update"] } },
    },
    // Comment-specific parameters
    {
      displayName: "Comment Scope",
      name: "commentScope",
      type: "options",
      default: "task",
      options: [
        { name: "Task", value: "task" },
        { name: "Checklist", value: "checklist" },
        { name: "Chat", value: "chat" },
      ],
      displayOptions: { show: { resource: ["comment"], operation: ["create", "getAll"] } },
    },
    {
      displayName: "Comment Text",
      name: "commentText",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["comment"], operation: ["create", "update"] } },
    },
    {
      displayName: "Notify All",
      name: "notifyAll",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["comment"], operation: ["create"] } },
    },
    {
      displayName: "Comment ID",
      name: "commentId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["comment"], operation: ["delete", "getAll", "update"] } },
    },
    // Folder-specific
    {
      displayName: "Folder ID",
      name: "folderId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["folder"], operation: ["delete", "get", "update"] } },
    },
    {
      displayName: "Folder Name",
      name: "folderName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["folder"], operation: ["create", "update"] } },
    },
    // Goal-specific
    {
      displayName: "Goal ID",
      name: "goalId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goal", "goalKeyResult"], operation: ["delete", "get", "update", "create"] } },
    },
    {
      displayName: "Goal Name",
      name: "goalName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goal"], operation: ["create", "update"] } },
    },
    {
      displayName: "Due Date",
      name: "dueDate",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goal"], operation: ["create", "update"] } },
    },
    {
      displayName: "Goal Description",
      name: "goalDescription",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goal"], operation: ["create", "update"] } },
    },
    {
      displayName: "Color",
      name: "color",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goal"], operation: ["create", "update"] } },
    },
    {
      displayName: "Multiple Owners",
      name: "multipleOwners",
      type: "fixedCollection",
      typeOptions: { multipleValues: true },
      default: {},
      displayOptions: { show: { resource: ["goal"], operation: ["create", "update"] } },
      options: [{
        name: "owner",
        displayName: "Owner",
        values: [
          { displayName: "Team ID", name: "teamId", type: "string", default: "" },
          { displayName: "User ID", name: "userId", type: "string", default: "" },
        ],
      }],
    },
    // Goal Key Result parameters
    {
      displayName: "Key Result Name",
      name: "keyResultName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goalKeyResult"], operation: ["create", "update"] } },
    },
    {
      displayName: "Key Result ID",
      name: "keyResultId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goalKeyResult"], operation: ["delete", "update"] } },
    },
    {
      displayName: "Key Result Type",
      name: "keyResultType",
      type: "options",
      default: "number",
      options: [
        { name: "Number", value: "number" },
        { name: "Currency", value: "currency" },
        { name: "Percentage", value: "percentage" },
        { name: "Automatic", value: "automatic" },
      ],
      displayOptions: { show: { resource: ["goalKeyResult"], operation: ["create"] } },
    },
    {
      displayName: "Target Value",
      name: "targetValue",
      type: "number",
      default: 0,
      displayOptions: { show: { resource: ["goalKeyResult"], operation: ["create"] } },
    },
    {
      displayName: "Unit",
      name: "unit",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["goalKeyResult"], operation: ["create"] } },
    },
    // List-specific
    {
      displayName: "List ID",
      name: "listId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["list"], operation: ["delete", "get", "getCustomFields", "getMembers", "update"] } },
    },
    {
      displayName: "List Name",
      name: "listName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["list"], operation: ["create", "update"] } },
    },
    {
      displayName: "Content",
      name: "content",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["list"], operation: ["create"] } },
    },
    {
      displayName: "Priority",
      name: "priority",
      type: "number",
      default: 1,
      typeOptions: { minValue: 1, maxValue: 4 },
      displayOptions: { show: { resource: ["list"], operation: ["create", "update"] } },
    },
    {
      displayName: "Status",
      name: "status",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["list"], operation: ["create"] } },
    },
    // Space Tag parameters
    {
      displayName: "Tag Name",
      name: "tagName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["spaceTag"], operation: ["create", "delete", "update"] } },
    },
    {
      displayName: "New Tag Name",
      name: "newTagName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["spaceTag"], operation: ["update"] } },
    },
    {
      displayName: "Tag Foreground Color",
      name: "tagForegroundColor",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["spaceTag"], operation: ["create", "update"] } },
    },
    {
      displayName: "Tag Background Color",
      name: "tagBackgroundColor",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["spaceTag"], operation: ["create", "update"] } },
    },
    // Task parameters
    {
      displayName: "Task ID",
      name: "taskId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["delete", "get", "getMembers", "setCustomField", "update"] } },
    },
    {
      displayName: "Task Name",
      name: "taskName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Description",
      name: "taskDescription",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Assignees",
      name: "assignees",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update", "getAll"] } },
    },
    {
      displayName: "Tags (comma-separated)",
      name: "tags",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update", "getAll"] } },
    },
    {
      displayName: "Status",
      name: "taskStatus",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update", "getAll"] } },
    },
    {
      displayName: "Due Date",
      name: "taskDueDate",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Start Date",
      name: "startDate",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Time Estimate",
      name: "timeEstimate",
      type: "number",
      default: 0,
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Parent Task ID",
      name: "parentTask",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Links To",
      name: "linksTo",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Check Required Custom Fields",
      name: "checkRequiredCustomFields",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["create"] } },
    },
    {
      displayName: "Custom Fields JSON",
      name: "customFieldsJson",
      type: "json",
      default: "{}",
      displayOptions: { show: { resource: ["task"], operation: ["create", "update"] } },
    },
    {
      displayName: "Include Subtasks",
      name: "includeSubtasks",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["get", "getAll"] } },
    },
    {
      displayName: "Include Markdown Description",
      name: "includeMarkdownDescription",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["get", "getAll"] } },
    },
    {
      displayName: "Custom Field ID",
      name: "customFieldId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["setCustomField"] } },
    },
    {
      displayName: "Field Value",
      name: "fieldValue",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["setCustomField"] } },
    },
    // Task List parameters
    {
      displayName: "Task ID",
      name: "taskListTaskId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskList"] } },
    },
    {
      displayName: "List ID",
      name: "taskListId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskList"] } },
    },
    // Task Tag parameters
    {
      displayName: "Task ID",
      name: "taskTagTaskId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskTag"] } },
    },
    {
      displayName: "List ID",
      name: "taskTagListId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskTag"] } },
    },
    {
      displayName: "Tag Name",
      name: "taskTagName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskTag"] } },
    },
    // Task Dependency parameters
    {
      displayName: "Task ID",
      name: "depTaskId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskDependency"] } },
    },
    {
      displayName: "Depends On Task ID",
      name: "dependsOnTaskId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskDependency"], operation: ["create"] } },
    },
    {
      displayName: "Dependency Type",
      name: "dependencyType",
      type: "options",
      default: "waiting_on",
      options: [
        { name: "Waiting On", value: "waiting_on" },
        { name: "Blocking", value: "blocking" },
      ],
      displayOptions: { show: { resource: ["taskDependency"], operation: ["create"] } },
    },
    {
      displayName: "Dependency ID",
      name: "dependencyId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["taskDependency"], operation: ["delete"] } },
    },
    // Time Entry parameters
    {
      displayName: "Time Entry Task ID",
      name: "teTaskId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry"] } },
    },
    {
      displayName: "Start Time",
      name: "teStart",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry"], operation: ["create"] } },
    },
    {
      displayName: "Duration (ms)",
      name: "teDuration",
      type: "number",
      default: 0,
      displayOptions: { show: { resource: ["timeEntry"], operation: ["create"] } },
    },
    {
      displayName: "Time Entry Description",
      name: "teDescription",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry"], operation: ["create", "start", "update"] } },
    },
    {
      displayName: "Time Entry Tags (comma-separated)",
      name: "teTags",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry"], operation: ["create", "start"] } },
    },
    {
      displayName: "Billable",
      name: "teBillable",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["timeEntry"], operation: ["create", "start", "update"] } },
    },
    {
      displayName: "Time Entry Assignee",
      name: "teAssignee",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry"], operation: ["create", "start", "update"] } },
    },
    {
      displayName: "Time Entry ID",
      name: "teId",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry", "timeEntryTag"], operation: ["delete", "get", "update", "addTag", "getAll", "removeTag"] } },
    },
    // Time Entry Tag parameters
    {
      displayName: "Time Entry Tag Name",
      name: "teTagName",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntryTag"], operation: ["addTag", "removeTag"] } },
    },
    // Pagination / additional options
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      displayOptions: {
        show: {
          resource: ["comment", "list", "task", "timeEntry", "goal"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Page",
      name: "page",
      type: "number",
      default: 0,
      displayOptions: {
        show: {
          resource: ["comment", "list", "task", "timeEntry"],
          operation: ["getAll"],
        },
      },
    },
    {
      displayName: "Start Date (ms)",
      name: "teStartDate",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry"], operation: ["getAll"] } },
    },
    {
      displayName: "End Date (ms)",
      name: "teEndDate",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["timeEntry"], operation: ["getAll"] } },
    },
    // Additional options for task getAll
    {
      displayName: "Archived",
      name: "archived",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
    {
      displayName: "Order By",
      name: "orderBy",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
    {
      displayName: "Include Closed",
      name: "includeClosed",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
    {
      displayName: "Include Markdown Description in Tasks",
      name: "gteIncludeMarkdown",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
    {
      displayName: "Include Subtasks in Tasks",
      name: "gteIncludeSubtasks",
      type: "boolean",
      default: false,
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
    {
      displayName: "Due Date GT",
      name: "dueDateGt",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
    {
      displayName: "Due Date LT",
      name: "dueDateLt",
      type: "string",
      default: "",
      displayOptions: { show: { resource: ["task"], operation: ["getAll"] } },
    },
  ],
};

const TODOIST_DOCS = "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.todoist/";

const TODOIST_OPERATIONS = [
  { name: "Create", value: "create" },
  { name: "Close", value: "close" },
  { name: "Delete", value: "delete" },
  { name: "Get", value: "get" },
  { name: "Get Many", value: "getAll" },
  { name: "Reopen", value: "reopen" },
  { name: "Update", value: "update" },
];

export const todoist: INodeTypeDescription = {
  name: "n8n-nodes-base.todoist",
  displayName: "Todoist",
  category: "Productivity",
  group: ["integration"],
  version: 1,
  description: "Access and manage Todoist tasks",
  defaults: { name: "Todoist" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "CheckSquare",
  credentials: [
    { name: "todoistApi" },
    { name: "todoistOAuth2Api" },
  ],
  sources: [TODOIST_DOCS],
  properties: [
    {
      displayName: "Resource",
      name: "resource",
      type: "hidden",
      default: "task",
      required: true,
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "create",
      required: true,
      noDataExpression: true,
      displayOptions: { show: { resource: ["task"] } },
      options: TODOIST_OPERATIONS,
    },
    // Create / Update fields
    {
      displayName: "Content",
      name: "content",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { resource: ["task"], operation: ["create", "update"] },
      },
    },
    {
      displayName: "Description",
      name: "description",
      type: "string",
      default: "",
      displayOptions: {
        show: { resource: ["task"], operation: ["create", "update"] },
      },
    },
    {
      displayName: "Labels",
      name: "labels",
      type: "string",
      default: "",
      placeholder: "Comma-separated label names",
      displayOptions: {
        show: { resource: ["task"], operation: ["create", "update"] },
      },
    },
    {
      displayName: "Priority",
      name: "priority",
      type: "number",
      default: 1,
      typeOptions: { minValue: 1, maxValue: 4 },
      displayOptions: {
        show: { resource: ["task"], operation: ["create", "update"] },
      },
    },
    // Task ID for close / delete / get / reopen / update
    {
      displayName: "Task ID",
      name: "taskId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: {
          resource: ["task"],
          operation: ["close", "delete", "get", "reopen", "update"],
        },
      },
    },
    // Project ID for create / getAll / update
    {
      displayName: "Project ID",
      name: "projectId",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          resource: ["task"],
          operation: ["create", "getAll", "update"],
        },
      },
    },
    // Due date / time
    {
      displayName: "Due Date Time",
      name: "dueDateTime",
      type: "string",
      default: "",
      placeholder: "ISO 8601 datetime",
      displayOptions: {
        show: { resource: ["task"], operation: ["create", "update"] },
      },
    },
    {
      displayName: "Due Date",
      name: "dueDate",
      type: "string",
      default: "",
      placeholder: "YYYY-MM-DD",
      displayOptions: {
        show: { resource: ["task"], operation: ["create", "update"] },
      },
    },
    // Additional fields
    {
      displayName: "Additional Fields",
      name: "additionalFields",
      type: "collection",
      default: {},
      displayOptions: {
        show: { resource: ["task"], operation: ["create", "update"] },
      },
      options: [
        {
          displayName: "Section ID",
          name: "sectionId",
          type: "string",
          default: "",
        },
        {
          displayName: "Parent ID",
          name: "parentId",
          type: "string",
          default: "",
        },
        {
          displayName: "Order",
          name: "order",
          type: "number",
          default: 1,
          typeOptions: { minValue: 1 },
        },
        {
          displayName: "Assignee ID",
          name: "assigneeId",
          type: "string",
          default: "",
        },
        {
          displayName: "Duration (minutes)",
          name: "duration",
          type: "number",
          default: 0,
        },
        {
          displayName: "Due Language",
          name: "dueLang",
          type: "string",
          default: "",
          placeholder: "en",
        },
      ],
    },
    // getAll params
    {
      displayName: "Limit",
      name: "limit",
      type: "number",
      default: 50,
      displayOptions: {
        show: { resource: ["task"], operation: ["getAll"] },
      },
    },
    {
      displayName: "Filter",
      name: "filter",
      type: "string",
      default: "",
      placeholder: "today | overdue | p1",
      displayOptions: {
        show: { resource: ["task"], operation: ["getAll"] },
      },
    },
  ],
};
