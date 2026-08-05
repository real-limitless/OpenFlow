import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.figmaTrigger";

const FILE_COMMENT_PAYLOAD = {
  event_type: "FILE_COMMENT",
  timestamp: "2025-01-15T12:00:00Z",
  file_key: "abc123",
  comment_id: "cmt_xyz",
  passcode: "",
};

const FILE_UPDATE_PAYLOAD = {
  event_type: "FILE_UPDATE",
  timestamp: "2025-01-15T12:05:00Z",
  file_key: "abc123",
};

const LIBRARY_PUBLISH_PAYLOAD = {
  event_type: "LIBRARY_PUBLISH",
  timestamp: "2025-01-15T13:00:00Z",
  file_key: "",
  team_id: "team456",
};

describe("batch-queue figmaTrigger — n8n-nodes-base.figmaTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Figma Trigger (Beta)");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("file comment — wraps payload with event_type, timestamp, file_key", async () => {
    const out = await runNode(
      TYPE,
      { event: "fileComment", fileId: "abc123" },
      [FILE_COMMENT_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._payload).toEqual(FILE_COMMENT_PAYLOAD);
    expect(out[0][0].json.event_type).toBe("FILE_COMMENT");
    expect(out[0][0].json.file_key).toBe("abc123");
  });

  it("file update — wraps update payload", async () => {
    const out = await runNode(
      TYPE,
      { event: "fileUpdated", fileId: "abc123" },
      [FILE_UPDATE_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._payload).toEqual(FILE_UPDATE_PAYLOAD);
    expect(out[0][0].json.event_type).toBe("FILE_UPDATE");
  });

  it("library publish — wraps publish payload", async () => {
    const out = await runNode(
      TYPE,
      { event: "libraryPublish", teamId: "team456" },
      [LIBRARY_PUBLISH_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._payload).toEqual(LIBRARY_PUBLISH_PAYLOAD);
    expect(out[0][0].json.event_type).toBe("LIBRARY_PUBLISH");
  });

  it("multiple payloads — each produces one output item", async () => {
    const out = await runNode(
      TYPE,
      { event: "fileComment", fileId: "abc123" },
      [FILE_COMMENT_PAYLOAD, FILE_UPDATE_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.event_type).toBe("FILE_COMMENT");
    expect(out[0][1].json.event_type).toBe("FILE_UPDATE");
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(
      TYPE,
      { event: "fileComment", fileId: "abc123" },
      [],
    );
    expect(out).toEqual([[]]);
  });
});
