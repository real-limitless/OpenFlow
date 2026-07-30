import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { getFormResponse, clearAllFormResponses } from "../../executors/form-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.formTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  executionId = "exec-form",
  settings: Record<string, unknown> = {},
): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings,
    __executionId: executionId,
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runForm(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string; settings?: Record<string, unknown> } = {},
) {
  const node = makeNode({ name: "Form", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-form", opts.settings);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue formTrigger — n8n-nodes-base.formTrigger", () => {
  beforeEach(() => {
    clearAllFormResponses();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("n8n Form");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(getExecutor("nodes-base.formTrigger")).toBe(canonical);
  });

  it("resolves documented aliases (table, submit, post)", () => {
    expect(getExecutor("table")).toBe(getExecutor(TYPE));
    expect(getExecutor("submit")).toBe(getExecutor(TYPE));
    expect(getExecutor("post")).toBe(getExecutor(TYPE));
  });

  it("text field submission maps to output json with submittedAt", async () => {
    const { out } = await runForm(
      {
        formTitle: "Sign Up",
        formElements: {
          values: [
            {
              fieldLabel: "Name",
              fieldName: "name",
              elementType: "text",
              requiredField: true,
            },
          ],
        },
        responseMode: "formSubmitted",
      },
      [
        {
          body: { name: "Jane Doe" },
          headers: {},
          query: {},
          submittedAt: "2026-07-29T19:32:40.000Z",
          executionMode: "test",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      name: "Jane Doe",
      submittedAt: "2026-07-29T19:32:40.000Z",
    });
  });

  it("submittedAt defaults to now when host does not provide it", async () => {
    const before = Date.now();
    const { out } = await runForm({ formTitle: "T", formElements: { values: [] } }, [
      { body: { x: 1 }, headers: {}, query: {} },
    ]);
    const after = Date.now();

    const ts = out[0][0].json.submittedAt as string;
    const parsed = Date.parse(ts);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("useWorkflowTimezone formats submittedAt in the workflow timezone", async () => {
    const { out } = await runForm(
      {
        formTitle: "T",
        formElements: { values: [] },
        options: { useWorkflowTimezone: true },
      },
      [
        {
          body: {},
          headers: {},
          query: {},
          submittedAt: "2026-07-29T19:32:40.000Z",
        },
      ],
      { settings: { timezone: "America/New_York" } },
    );

    const ts = out[0][0].json.submittedAt as string;
    expect(ts).toBe("2026-07-29T15:32:40-04:00");
  });

  it("ignoreBots drops requests from bot user agents", async () => {
    const { out } = await runForm(
      {
        formTitle: "T",
        formElements: { values: [] },
        options: { ignoreBots: true },
      },
      [
        {
          body: { a: 1 },
          headers: { "user-agent": "GoogleBot/2.1" },
          query: {},
        },
      ],
    );

    expect(out[0]).toHaveLength(0);
  });

  it("ignoreBots allows non-bot requests through", async () => {
    const { out } = await runForm(
      {
        formTitle: "T",
        formElements: { values: [] },
        options: { ignoreBots: true },
      },
      [
        {
          body: { a: 1 },
          headers: { "user-agent": "Mozilla/5.0" },
          query: {},
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
  });

  it("formSubmitted mode stores an immediate response with formSubmittedText", async () => {
    await runForm(
      {
        formTitle: "T",
        formElements: { values: [] },
        responseMode: "formSubmitted",
        options: { formSubmittedText: "<p>Thank you!</p>" },
      },
      [{ body: {}, headers: {}, query: {} }],
      { executionId: "form-submitted" },
    );

    const res = getFormResponse("form-submitted");
    expect(res?.statusCode).toBe(200);
    expect(res?.body).toBe("<p>Thank you!</p>");
    expect(res?.headers["content-type"]).toBe("text/html; charset=utf-8");
  });

  it("formSubmitted mode uses default text when formSubmittedText is empty", async () => {
    await runForm(
      {
        formTitle: "T",
        formElements: { values: [] },
        responseMode: "formSubmitted",
      },
      [{ body: {}, headers: {}, query: {} }],
      { executionId: "form-default-text" },
    );

    const res = getFormResponse("form-default-text");
    expect(res?.body).toBe("Form submitted");
  });

  it("workflowFinishes mode does not store an immediate response", async () => {
    await runForm(
      {
        formTitle: "T",
        formElements: { values: [] },
        responseMode: "workflowFinishes",
      },
      [{ body: {}, headers: {}, query: {} }],
      { executionId: "form-finishes" },
    );

    expect(getFormResponse("form-finishes")).toBeUndefined();
  });

  it("preserves binary data (file uploads) on the output item", async () => {
    const { out } = await runForm({ formTitle: "T", formElements: { values: [] } }, [
      {
        json: { body: { name: "Jane" }, headers: {}, query: {} },
        binary: {
          data: { data: "aGVsbG8=", mimeType: "text/plain", fileName: "a.txt" },
        },
      },
    ]);

    expect(out[0][0].binary).toEqual({
      data: { data: "aGVsbG8=", mimeType: "text/plain", fileName: "a.txt" },
    });
  });

  it("maps multiple form fields to top-level output keys", async () => {
    const { out } = await runForm(
      {
        formTitle: "Contact",
        formElements: {
          values: [
            { fieldLabel: "Name", fieldName: "name", elementType: "text" },
            { fieldLabel: "Email", fieldName: "email", elementType: "email" },
            { fieldLabel: "Age", fieldName: "age", elementType: "number" },
          ],
        },
      },
      [
        {
          body: { name: "Jane", email: "jane@example.com", age: 30 },
          headers: {},
          query: {},
          submittedAt: "2026-07-29T19:32:40.000Z",
        },
      ],
    );

    expect(out[0][0].json).toEqual({
      name: "Jane",
      email: "jane@example.com",
      age: 30,
      submittedAt: "2026-07-29T19:32:40.000Z",
    });
  });

  it("empty input emits a single empty item", async () => {
    const { out } = await runForm({ formTitle: "T", formElements: { values: [] } }, []);

    expect(out[0]).toEqual([{ json: {} }]);
  });
});
