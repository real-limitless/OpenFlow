import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.calTrigger";

const BOOKING_CREATED_BODY = {
  triggerEvent: "BOOKING_CREATED",
  createdAt: "2026-08-03T10:00:00Z",
  payload: {
    uid: "abc123",
    title: "15 Min Meeting",
    startTime: "2026-08-03T14:00:00Z",
    endTime: "2026-08-03T14:15:00Z",
    attendees: [{ email: "alice@example.com", name: "Alice", timeZone: "America/New_York" }],
    organizer: { email: "bob@example.com", name: "Bob", timeZone: "America/New_York" },
    location: "https://meet.google.com/abc-defg-hij",
    status: "ACCEPTED",
    eventTypeId: 1,
  },
};

const BOOKING_CANCELLED_BODY = {
  triggerEvent: "BOOKING_CANCELLED",
  createdAt: "2026-08-03T11:00:00Z",
  payload: {
    uid: "def456",
    title: "Cancelled Meeting",
    status: "CANCELLED",
    eventTypeId: 2,
  },
};

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runCalTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
) {
  const node = makeNode({
    name: "Cal Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue calTrigger — n8n-nodes-base.calTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Cal Trigger");
  });

  it("emits item with triggerEvent and payload from BOOKING_CREATED body", async () => {
    const { out } = await runCalTrigger(
      { events: ["BOOKING_CREATED"] },
      [BOOKING_CREATED_BODY],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.triggerEvent).toBe("BOOKING_CREATED");
    expect(out[0][0].json.payload).toEqual(BOOKING_CREATED_BODY.payload);
    expect(out[0][0].json.createdAt).toBe("2026-08-03T10:00:00Z");
  });

  it("filters events when events param is set", async () => {
    const { out } = await runCalTrigger(
      { events: ["BOOKING_CREATED"] },
      [BOOKING_CANCELLED_BODY, BOOKING_CREATED_BODY],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.triggerEvent).toBe("BOOKING_CREATED");
  });

  it("defaults to all four events when events list is empty", async () => {
    const { out } = await runCalTrigger(
      {},
      [BOOKING_CANCELLED_BODY, BOOKING_CREATED_BODY],
    );

    expect(out[0]).toHaveLength(2);
  });

  it("applies payloadTemplate to transform output payload", async () => {
    const { ctx, out } = await runCalTrigger(
      {
        events: ["BOOKING_CREATED"],
        options: { payloadTemplate: '{"summary": "{{$json.payload.title}} with {{$json.payload.attendees[0].email}}"}' },
      },
      [BOOKING_CREATED_BODY],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.payload).toEqual({
      summary: "15 Min Meeting with alice@example.com",
    });
  });

  it("filters by eventTypeId option", async () => {
    const { out } = await runCalTrigger(
      {
        events: ["BOOKING_CREATED"],
        options: { eventTypeId: "42" },
      },
      [
        {
          triggerEvent: "BOOKING_CREATED",
          createdAt: "2026-08-03T10:00:00Z",
          payload: { eventTypeId: 42, title: "42 Booking" },
        },
        {
          triggerEvent: "BOOKING_CREATED",
          createdAt: "2026-08-03T11:00:00Z",
          payload: { eventTypeId: 1, title: "Other Booking" },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.payload.title).toBe("42 Booking");
  });

  it("falls back to raw payload when payloadTemplate evaluation throws", async () => {
    const { out } = await runCalTrigger(
      {
        events: ["BOOKING_CREATED"],
        options: { payloadTemplate: "invalid {{$json.nonexistent.path]" },
      },
      [BOOKING_CREATED_BODY],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.payload).toEqual(BOOKING_CREATED_BODY.payload);
    expect(out[0][0].json.triggerEvent).toBe("BOOKING_CREATED");
  });

  it("emits empty item for empty input", async () => {
    const { out } = await runCalTrigger(
      { events: ["BOOKING_CREATED"] },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runCalTrigger(
      { events: ["BOOKING_CREATED"] },
      [
        {
          json: BOOKING_CREATED_BODY,
          binary: { attachment: { data: "aGVsbG8=", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toEqual({
      attachment: { data: "aGVsbG8=", mimeType: "text/plain" },
    });
  });
});
