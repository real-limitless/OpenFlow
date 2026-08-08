import * as editor from "../services/workflow-editor";
import {
  assertWorkflowAccess,
  editorActivateWorkflow,
  editorCreateWorkflow,
  editorListExecutions,
  editorListWorkflows,
} from "../services/workflow-access";
import { hasScope, scopeForTool } from "../oauth/scopes";
import type { McpSessionState } from "./session";
import { setSessionWorkflow } from "./session";
import {
  permForTool,
  unrestrictedPolicy,
  type WorkflowPolicy,
} from "../services/agent-policy";
import { prisma } from "../db";

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type OpenflowToolContext = {
  userId: string;
  /** Bound workflow (header, session, or per-call). */
  workflowId?: string | null;
  scopes?: string[];
  session?: McpSessionState | null;
  workflowPolicy?: WorkflowPolicy;
};

const workflowIdProp = {
  type: "string",
  description:
    "Workflow id. Optional if open_workflow was used or X-OpenFlow-Workflow-Id / session default is set.",
};

export const OPENFLOW_MCP_TOOLS: McpToolDef[] = [
  {
    name: "list_workflows",
    description: "List workflows the user can access (id, name, active, nodeCount).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 40)" },
        offset: { type: "number", description: "Pagination offset" },
        projectId: { type: "string", description: "Optional project filter" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "create_workflow",
    description: "Create an empty workflow. Returns id — call open_workflow next.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        projectId: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { destructiveHint: false },
  },
  {
    name: "open_workflow",
    description:
      "Set the default workflow for subsequent tools in this MCP session. Pass null to clear.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: ["string", "null"], description: "Workflow id or null" },
      },
      required: ["workflowId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "activate_workflow",
    description: "Activate or deactivate a workflow (webhooks/schedules).",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: workflowIdProp,
        active: { type: "boolean" },
      },
      required: ["active"],
      additionalProperties: false,
    },
  },
  {
    name: "get_workflow",
    description: "Get the current workflow graph: nodes, connections, settings.",
    inputSchema: {
      type: "object",
      properties: { workflowId: workflowIdProp },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
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
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "get_node_type",
    description: "Get full parameter schema and defaults for one node type string.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: 'Fully-qualified type, e.g. "openflow-node-base.httpRequest"',
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "add_node",
    description: "Add a node to the workflow canvas. Returns the created node name.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: workflowIdProp,
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
        workflowId: workflowIdProp,
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
        workflowId: workflowIdProp,
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
      properties: {
        workflowId: workflowIdProp,
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "connect_nodes",
    description:
      'Connect two nodes. Handles default to main-0. AI sub-nodes use handles like "ai_languageModel-0".',
    inputSchema: {
      type: "object",
      properties: {
        workflowId: workflowIdProp,
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
        workflowId: workflowIdProp,
        edgeId: {
          type: "string",
          description: "Format: source::channel::outIdx->target::inIdx",
        },
      },
      required: ["edgeId"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "execute_workflow",
    description: "Run the current workflow. Returns executionId; poll get_execution for results.",
    inputSchema: {
      type: "object",
      properties: { workflowId: workflowIdProp },
      additionalProperties: false,
    },
    annotations: { openWorldHint: true },
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
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "list_executions",
    description: "List recent executions for a workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: workflowIdProp,
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "list_credentials",
    description:
      "List credential ids/names/types (never secrets). Use ids when setting node credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "select_node",
    description: "Focus a node in the open editor UI (or clear selection with null).",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: workflowIdProp,
        name: { type: ["string", "null"], description: "Node name or null" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
];

function resolveWorkflowId(
  ctx: OpenflowToolContext,
  args: Record<string, unknown>,
): string {
  const fromArgs = typeof args.workflowId === "string" ? args.workflowId : null;
  const id =
    fromArgs ||
    ctx.workflowId ||
    ctx.session?.defaultWorkflowId ||
    null;
  if (!id) {
    throw new Error(
      "No workflow selected. Call open_workflow or list_workflows, or pass workflowId.",
    );
  }
  return id;
}

/** @deprecated Prefer OpenflowToolContext overload via object first arg in new code */
export async function callOpenflowTool(
  workflowIdOrCtx: string | OpenflowToolContext,
  userIdOrName: string,
  nameOrArgs?: string | Record<string, unknown>,
  argsMaybe?: Record<string, unknown>,
): Promise<unknown> {
  let ctx: OpenflowToolContext;
  let name: string;
  let args: Record<string, unknown>;

  if (typeof workflowIdOrCtx === "string") {
    ctx = { workflowId: workflowIdOrCtx, userId: userIdOrName };
    name = String(nameOrArgs ?? "");
    args = (argsMaybe as Record<string, unknown>) ?? {};
  } else {
    ctx = workflowIdOrCtx;
    name = userIdOrName;
    args = (nameOrArgs as Record<string, unknown>) ?? {};
  }

  const policy = ctx.workflowPolicy ?? unrestrictedPolicy();
  const needed = scopeForTool(name);
  if (!hasScope(ctx.scopes, needed)) {
    throw new Error(`Missing OAuth scope: ${needed}`);
  }

  const gate = async (wid: string, need: "read" | "write" | "execute") => {
    await assertWorkflowAccess(
      wid,
      ctx.userId,
      need === "read" ? "viewer" : "editor",
      policy,
      need,
    );
  };

  const toolPerm = permForTool(name);
  if (toolPerm === "create") {
    // handled in create_workflow
  } else if (toolPerm === "none") {
    // catalog — allowed with any credential
  }

  switch (name) {
    case "list_workflows":
      return editorListWorkflows(ctx.userId, {
        limit: typeof args.limit === "number" ? args.limit : undefined,
        offset: typeof args.offset === "number" ? args.offset : undefined,
        projectId: typeof args.projectId === "string" ? args.projectId : undefined,
        policy,
      });
    case "create_workflow":
      return editorCreateWorkflow(
        ctx.userId,
        {
          name: typeof args.name === "string" ? args.name : undefined,
          projectId: typeof args.projectId === "string" ? args.projectId : undefined,
        },
        policy,
      );
    case "open_workflow": {
      const wid =
        args.workflowId === null || args.workflowId === undefined
          ? null
          : String(args.workflowId);
      if (wid) await gate(wid, "read");
      if (ctx.session) setSessionWorkflow(ctx.session, wid);
      return { workflowId: wid, sessionBound: Boolean(ctx.session) };
    }
    case "activate_workflow": {
      const wid = resolveWorkflowId(ctx, args);
      return editorActivateWorkflow(wid, ctx.userId, Boolean(args.active), policy);
    }
    case "get_workflow": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "read");
      return editor.editorGetWorkflow(wid);
    }
    case "list_node_types":
      return editor.editorListNodeTypes(
        typeof args.query === "string" ? args.query : undefined,
        typeof args.limit === "number" ? args.limit : 40,
      );
    case "get_node_type":
      return editor.editorGetNodeType(String(args.type ?? ""));
    case "add_node": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "write");
      const r = await editor.editorAddNode(
        wid,
        {
          type: String(args.type ?? ""),
          name: typeof args.name === "string" ? args.name : undefined,
          x: typeof args.x === "number" ? args.x : undefined,
          y: typeof args.y === "number" ? args.y : undefined,
        },
        ctx.userId,
      );
      return r.result;
    }
    case "update_node": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "write");
      const r = await editor.editorUpdateNode(
        wid,
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
        ctx.userId,
      );
      return r.result;
    }
    case "rename_node": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "write");
      const r = await editor.editorRenameNode(
        wid,
        String(args.from ?? ""),
        String(args.to ?? ""),
        ctx.userId,
      );
      return r.result;
    }
    case "delete_node": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "write");
      const r = await editor.editorDeleteNode(wid, String(args.name ?? ""), ctx.userId);
      return r.result;
    }
    case "connect_nodes": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "write");
      const r = await editor.editorConnect(
        wid,
        {
          source: String(args.source ?? ""),
          target: String(args.target ?? ""),
          sourceHandle: typeof args.sourceHandle === "string" ? args.sourceHandle : undefined,
          targetHandle: typeof args.targetHandle === "string" ? args.targetHandle : undefined,
        },
        ctx.userId,
      );
      return r.result;
    }
    case "disconnect": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "write");
      const r = await editor.editorDisconnect(wid, String(args.edgeId ?? ""), ctx.userId);
      return r.result;
    }
    case "execute_workflow": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "execute");
      return editor.editorExecute(wid, ctx.userId);
    }
    case "get_execution": {
      const executionId = String(args.executionId ?? "");
      const exec = await prisma.execution.findUnique({
        where: { id: executionId },
        select: { workflowId: true },
      });
      if (!exec) throw new Error(`Execution not found: ${executionId}`);
      await gate(exec.workflowId, "read");
      return editor.editorGetExecution(executionId);
    }
    case "list_executions": {
      const wid = resolveWorkflowId(ctx, args);
      return editorListExecutions(wid, ctx.userId, {
        limit: typeof args.limit === "number" ? args.limit : undefined,
        policy,
      });
    }
    case "list_credentials":
      return editor.editorListCredentials(ctx.userId);
    case "select_node": {
      const wid = resolveWorkflowId(ctx, args);
      await gate(wid, "read");
      const n = args.name === null || args.name === undefined ? null : String(args.name);
      return editor.editorSelectNode(wid, n);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
