import * as editor from "../services/workflow-editor";

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const OPENFLOW_MCP_TOOLS: McpToolDef[] = [
  {
    name: "get_workflow",
    description: "Get the current workflow graph: nodes, connections, settings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_node_types",
    description:
      "Search the OpenFlow node type catalog. Use before adding nodes. Returns type name, displayName, description.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search string (name, displayName, category)" },
        limit: { type: "number", description: "Max results (default 40)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_node_type",
    description: "Get full parameter schema and defaults for one node type string.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: 'Fully-qualified type, e.g. "n8n-nodes-base.httpRequest"',
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "add_node",
    description: "Add a node to the workflow canvas. Returns the created node name.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Node type string from list_node_types" },
        name: { type: "string", description: "Optional preferred display name" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "update_node",
    description:
      "Update a node: merge parameters, set credentials by id/name, notes, disabled, or position.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Current node name on the canvas" },
        parameters: { type: "object", description: "Parameter fields to set (merged by default)" },
        mergeParameters: { type: "boolean", description: "Default true" },
        credentials: {
          type: "object",
          description: "Map of credential slot → { id?, name }. Pass null to clear.",
        },
        notes: { type: "string" },
        disabled: { type: "boolean" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "rename_node",
    description: "Rename a node and rewrite connections that reference it.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_node",
    description: "Delete a node and its connections.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "connect_nodes",
    description:
      'Connect two nodes. Handles default to main-0. AI sub-nodes use handles like "ai_languageModel-0".',
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string" },
        target: { type: "string" },
        sourceHandle: { type: "string", description: 'e.g. "main-0"' },
        targetHandle: { type: "string", description: 'e.g. "main-0" or "ai_tool-0"' },
      },
      required: ["source", "target"],
      additionalProperties: false,
    },
  },
  {
    name: "disconnect",
    description: "Remove a connection by edge id (from get_workflow connections / UI format).",
    inputSchema: {
      type: "object",
      properties: {
        edgeId: {
          type: "string",
          description: "Format: source::channel::outIdx->target::inIdx",
        },
      },
      required: ["edgeId"],
      additionalProperties: false,
    },
  },
  {
    name: "execute_workflow",
    description: "Run the current workflow. Returns executionId; poll get_execution for results.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_execution",
    description: "Get execution status and runData for an executionId.",
    inputSchema: {
      type: "object",
      properties: { executionId: { type: "string" } },
      required: ["executionId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_credentials",
    description:
      "List credential ids/names/types (never secrets). Use ids when setting node credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "select_node",
    description: "Focus a node in the open editor UI (or clear selection with null).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: ["string", "null"], description: "Node name or null" },
      },
      additionalProperties: false,
    },
  },
];

export async function callOpenflowTool(
  workflowId: string,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_workflow":
      return editor.editorGetWorkflow(workflowId);
    case "list_node_types":
      return editor.editorListNodeTypes(
        typeof args.query === "string" ? args.query : undefined,
        typeof args.limit === "number" ? args.limit : 40,
      );
    case "get_node_type":
      return editor.editorGetNodeType(String(args.type ?? ""));
    case "add_node": {
      const r = await editor.editorAddNode(
        workflowId,
        {
          type: String(args.type ?? ""),
          name: typeof args.name === "string" ? args.name : undefined,
          x: typeof args.x === "number" ? args.x : undefined,
          y: typeof args.y === "number" ? args.y : undefined,
        },
        userId,
      );
      return r.result;
    }
    case "update_node": {
      const r = await editor.editorUpdateNode(
        workflowId,
        {
          name: String(args.name ?? ""),
          parameters:
            args.parameters && typeof args.parameters === "object"
              ? (args.parameters as Record<string, unknown>)
              : undefined,
          mergeParameters: args.mergeParameters !== false,
          credentials:
            args.credentials === null
              ? null
              : args.credentials && typeof args.credentials === "object"
                ? (args.credentials as Record<string, { id?: string | null; name: string }>)
                : undefined,
          notes: typeof args.notes === "string" ? args.notes : undefined,
          disabled: typeof args.disabled === "boolean" ? args.disabled : undefined,
          x: typeof args.x === "number" ? args.x : undefined,
          y: typeof args.y === "number" ? args.y : undefined,
        },
        userId,
      );
      return r.result;
    }
    case "rename_node": {
      const r = await editor.editorRenameNode(
        workflowId,
        String(args.from ?? ""),
        String(args.to ?? ""),
        userId,
      );
      return r.result;
    }
    case "delete_node": {
      const r = await editor.editorDeleteNode(workflowId, String(args.name ?? ""), userId);
      return r.result;
    }
    case "connect_nodes": {
      const r = await editor.editorConnect(
        workflowId,
        {
          source: String(args.source ?? ""),
          target: String(args.target ?? ""),
          sourceHandle: typeof args.sourceHandle === "string" ? args.sourceHandle : undefined,
          targetHandle: typeof args.targetHandle === "string" ? args.targetHandle : undefined,
        },
        userId,
      );
      return r.result;
    }
    case "disconnect": {
      const r = await editor.editorDisconnect(workflowId, String(args.edgeId ?? ""), userId);
      return r.result;
    }
    case "execute_workflow":
      return editor.editorExecute(workflowId, userId);
    case "get_execution":
      return editor.editorGetExecution(String(args.executionId ?? ""));
    case "list_credentials":
      return editor.editorListCredentials(userId);
    case "select_node": {
      const n = args.name === null || args.name === undefined ? null : String(args.name);
      return editor.editorSelectNode(workflowId, n);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
