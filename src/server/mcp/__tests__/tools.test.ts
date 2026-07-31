import { describe, expect, it, vi, beforeEach } from "vitest";

const loadWorkflow = vi.fn();
const saveWorkflow = vi.fn();
const editorGetWorkflow = vi.fn();
const editorListNodeTypes = vi.fn();
const editorAddNode = vi.fn();
const editorConnect = vi.fn();

vi.mock("../../services/workflow-editor", () => ({
  loadWorkflow: (...a: unknown[]) => loadWorkflow(...a),
  saveWorkflow: (...a: unknown[]) => saveWorkflow(...a),
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
  editorListCredentials: vi.fn(async () => []),
  editorSelectNode: vi.fn((workflowId: string, name: string | null) => ({ nodeName: name })),
}));

import { callOpenflowTool, OPENFLOW_MCP_TOOLS } from "../tools";

describe("openflow MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a stable tool catalog", () => {
    const names = OPENFLOW_MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("get_workflow");
    expect(names).toContain("add_node");
    expect(names).toContain("connect_nodes");
    expect(names).toContain("execute_workflow");
    expect(new Set(names).size).toBe(names.length);
  });

  it("dispatches get_workflow and add_node", async () => {
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

  it("rejects unknown tools", async () => {
    await expect(callOpenflowTool("wf1", "local", "nope", {})).rejects.toThrow(/Unknown tool/);
  });
});
