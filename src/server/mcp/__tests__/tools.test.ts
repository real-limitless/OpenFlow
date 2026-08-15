import { describe, expect, it, vi, beforeEach } from "vitest";

const editorGetWorkflow = vi.fn();
const editorListNodeTypes = vi.fn();
const editorAddNode = vi.fn();
const editorConnect = vi.fn();
const editorListWorkflows = vi.fn();
const editorCreateWorkflow = vi.fn();
const assertWorkflowAccess = vi.fn();

vi.mock("../../services/workflow-editor", () => ({
  loadWorkflow: vi.fn(),
  saveWorkflow: vi.fn(),
  editorGetWorkflow: (...a: unknown[]) => editorGetWorkflow(...a),
  editorListNodeTypes: (...a: unknown[]) => editorListNodeTypes(...a),
  editorGetNodeType: vi.fn(),
  editorAddNode: (...a: unknown[]) => editorAddNode(...a),
  editorUpdateNode: vi.fn(),
  editorRenameNode: vi.fn(),
  editorDeleteNode: vi.fn(),
  editorConnect: (...a: unknown[]) => editorConnect(...a),
  editorDisconnect: vi.fn(),
  editorExecute: vi.fn(),
  editorGetExecution: vi.fn(),
  editorListCredentials: vi.fn(async () => ({ count: 0, items: [] })),
  editorSelectNode: vi.fn((workflowId: string, name: string | null) => ({ nodeName: name })),
}));

vi.mock("../../services/workflow-access", () => ({
  assertWorkflowAccess: (...a: unknown[]) => assertWorkflowAccess(...a),
  editorListWorkflows: (...a: unknown[]) => editorListWorkflows(...a),
  editorCreateWorkflow: (...a: unknown[]) => editorCreateWorkflow(...a),
  editorActivateWorkflow: vi.fn(),
  editorListExecutions: vi.fn(async () => ({ count: 0, items: [] })),
  loadWorkflowIfAllowed: vi.fn(),
}));

vi.mock("../../db", () => ({
  prisma: {
    execution: { findUnique: vi.fn() },
  },
}));

const listCredentialsCompact = vi.fn(async () => ({ count: 0, items: [] }));
const createCredential = vi.fn();
const updateCredential = vi.fn();
const deleteCredential = vi.fn();
const listCredentialTypeCatalog = vi.fn(() => ({ count: 0, items: [] }));
const listVariablesMeta = vi.fn(async () => []);
const createVariable = vi.fn();
const updateVariable = vi.fn();
const deleteVariable = vi.fn();

vi.mock("../../services/credentials-admin", () => ({
  listCredentialsCompact: (...a: unknown[]) =>
    (listCredentialsCompact as (...args: unknown[]) => unknown)(...a),
  listCredentialTypeCatalog: (...a: unknown[]) =>
    (listCredentialTypeCatalog as (...args: unknown[]) => unknown)(...a),
  createCredential: (...a: unknown[]) =>
    (createCredential as (...args: unknown[]) => unknown)(...a),
  updateCredential: (...a: unknown[]) =>
    (updateCredential as (...args: unknown[]) => unknown)(...a),
  deleteCredential: (...a: unknown[]) =>
    (deleteCredential as (...args: unknown[]) => unknown)(...a),
  isServiceError: (v: unknown) =>
    Boolean(v && typeof v === "object" && "error" in (v as object) && "status" in (v as object)),
}));

vi.mock("../../services/variables", () => ({
  listVariablesMeta: (...a: unknown[]) =>
    (listVariablesMeta as (...args: unknown[]) => unknown)(...a),
  createVariable: (...a: unknown[]) =>
    (createVariable as (...args: unknown[]) => unknown)(...a),
  updateVariable: (...a: unknown[]) =>
    (updateVariable as (...args: unknown[]) => unknown)(...a),
  deleteVariable: (...a: unknown[]) =>
    (deleteVariable as (...args: unknown[]) => unknown)(...a),
  isVariableServiceError: (v: unknown) =>
    Boolean(v && typeof v === "object" && "error" in (v as object) && "status" in (v as object)),
}));

import { callOpenflowTool, OPENFLOW_MCP_TOOLS } from "../tools";

describe("openflow MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertWorkflowAccess.mockResolvedValue(undefined);
  });

  it("exports a stable tool catalog", () => {
    const names = OPENFLOW_MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("get_workflow");
    expect(names).toContain("list_workflows");
    expect(names).toContain("create_workflow");
    expect(names).toContain("open_workflow");
    expect(names).toContain("add_node");
    expect(names).toContain("connect_nodes");
    expect(names).toContain("execute_workflow");
    expect(names).toContain("create_credential");
    expect(names).toContain("create_variable");
    expect(names).toContain("list_credential_types");
    expect(new Set(names).size).toBe(names.length);
  });

  it("denies create_credential without openflow:credentials scope", async () => {
    await expect(
      callOpenflowTool(
        {
          userId: "u1",
          scopes: ["openflow:read", "openflow:write", "openflow:execute"],
          authKind: "api_key",
        },
        "create_credential",
        {
          name: "x",
          type: "httpHeaderAuth",
          data: { name: "X", value: "s" },
        },
      ),
    ).rejects.toThrow(/openflow:credentials/);
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("allows create_credential with scope and returns metadata only path", async () => {
    createCredential.mockResolvedValue({
      id: "c1",
      name: "x",
      type: "httpHeaderAuth",
      projectId: "p1",
    });
    const r = await callOpenflowTool(
      {
        userId: "u1",
        scopes: ["openflow:credentials"],
        authKind: "api_key",
      },
      "create_credential",
      {
        name: "x",
        type: "httpHeaderAuth",
        data: { name: "X", value: "secret" },
      },
    );
    expect(r).toMatchObject({ id: "c1", name: "x" });
    expect(createCredential).toHaveBeenCalled();
  });

  it("denies create_variable without openflow:variables", async () => {
    await expect(
      callOpenflowTool(
        {
          userId: "u1",
          scopes: ["openflow:write"],
          authKind: "api_key",
        },
        "create_variable",
        { key: "FOO", value: "bar" },
      ),
    ).rejects.toThrow(/openflow:variables/);
  });

  it("dispatches get_workflow and add_node (legacy signature)", async () => {
    editorGetWorkflow.mockResolvedValue({ id: "wf1", nodes: [] });
    editorAddNode.mockResolvedValue({ result: { name: "HTTP Request", id: "n1" } });

    const g = await callOpenflowTool("wf1", "local", "get_workflow", {});
    expect(g).toEqual({ id: "wf1", nodes: [] });
    expect(editorGetWorkflow).toHaveBeenCalledWith("wf1");

    const a = await callOpenflowTool("wf1", "local", "add_node", {
      type: "n8n-nodes-base.httpRequest",
      x: 10,
      y: 20,
    });
    expect(a).toEqual({ name: "HTTP Request", id: "n1" });
    expect(editorAddNode).toHaveBeenCalledWith(
      "wf1",
      expect.objectContaining({ type: "n8n-nodes-base.httpRequest", x: 10, y: 20 }),
      "local",
    );
  });

  it("lists workflows without a bound workflow id", async () => {
    editorListWorkflows.mockResolvedValue({ items: [], total: 0 });
    const r = await callOpenflowTool(
      { userId: "u1", scopes: ["openflow:read"] },
      "list_workflows",
      { limit: 10 },
    );
    expect(editorListWorkflows).toHaveBeenCalledWith("u1", expect.objectContaining({ limit: 10 }));
    expect(r).toEqual({ items: [], total: 0 });
  });

  it("enforces scopes", async () => {
    await expect(
      callOpenflowTool(
        { userId: "u1", workflowId: "wf1", scopes: ["openflow:read"] },
        "add_node",
        { type: "x" },
      ),
    ).rejects.toThrow(/Missing OAuth scope/);
  });

  it("rejects unknown tools", async () => {
    await expect(callOpenflowTool("wf1", "local", "nope", {})).rejects.toThrow(/Unknown tool/);
  });
});
