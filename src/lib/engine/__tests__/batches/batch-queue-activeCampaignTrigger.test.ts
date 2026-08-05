import { assertExecutorRegistered, runNode } from "../helpers";

const TYPE = "n8n-nodes-base.activeCampaignTrigger";

beforeAll(() => {
  assertExecutorRegistered(TYPE);
});

describe("ActiveCampaign Trigger", () => {
  it("should pass through webhook payload items", async () => {
    const payload = {
      type: "subscribe",
      date: "2024-01-01T00:00:00+00:00",
      contact: {
        id: "3",
        email: "someone@example.com",
        first_name: "Someone",
        last_name: "",
      },
      list: "1",
    };
    const [out] = await runNode(TYPE, {}, [payload]);
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(payload);
  });

  it("should emit empty item when no input", async () => {
    const [out] = await runNode(TYPE, {}, [{}]);
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual({});
  });

  it("should pass through binary data", async () => {
    const [out] = await runNode(
      TYPE,
      {},
      [{ json: { event: "bounce" }, binary: { file: { data: "base64", mimeType: "text/plain" } } }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].binary).toBeDefined();
    expect(out[0].binary!.file.mimeType).toBe("text/plain");
  });
});
