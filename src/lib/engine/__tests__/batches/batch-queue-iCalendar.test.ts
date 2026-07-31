import { describe, it, expect } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.iCalendar";

function decode(bin: { data: string }): string {
  return Buffer.from(bin.data, "base64").toString("utf8");
}

describe("batch-queue iCalendar", () => {
  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("iCalendar");
  });

  it("basic event file", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "createEventFile",
        title: "Team Standup",
        start: "2025-01-13T09:00:00Z",
        end: "2025-01-13T09:30:00Z",
        binaryPropertyName: "data",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("text/calendar");
    const text = decode(bin!);
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("BEGIN:VEVENT");
    expect(text).toContain("SUMMARY:Team Standup");
    expect(text).toContain("DTSTART");
    expect(text).toContain("DTEND");
    expect(text).toContain("END:VEVENT");
    expect(text).toContain("END:VCALENDAR");
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("all-day event", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "createEventFile",
        title: "Holiday",
        start: "2025-12-25T00:00:00Z",
        allDay: true,
        binaryPropertyName: "data",
      },
      [{}],
    );

    const text = decode(out[0][0].binary!.data);
    expect(text).toContain("DTSTART;VALUE=DATE:20251225");
  });

  it("event with attendees and location", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "createEventFile",
        title: "Meeting",
        start: "2025-06-01T14:00:00Z",
        end: "2025-06-01T15:00:00Z",
        binaryPropertyName: "data",
        additionalFields: {
          attendeesUi: {
            attendeeValues: [
              { name: "Alice", email: "alice@example.com", rsvp: true },
            ],
          },
          location: "Conference Room A",
          description: "Quarterly review",
        },
      },
      [{}],
    );

    const text = decode(out[0][0].binary!.data);
    expect(text).toContain("ATTENDEE");
    expect(text).toContain("alice@example.com");
    expect(text).toContain("RSVP=TRUE");
    expect(text).toContain("LOCATION:Conference Room A");
    expect(text).toContain("DESCRIPTION:Quarterly review");
  });

  it("continue on fail with missing start", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "createEventFile",
        start: "",
        binaryPropertyName: "data",
      },
      [{}, {}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.error).toBeDefined();
    expect(out[0][1].json.error).toBeDefined();
  });
});