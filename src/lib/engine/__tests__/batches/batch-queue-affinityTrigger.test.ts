import { assertExecutorRegistered, runNode } from "../helpers";

const TYPE = "n8n-nodes-base.affinityTrigger";

beforeAll(() => {
  assertExecutorRegistered(TYPE);
});

describe("Affinity Trigger", () => {
  it("should pass through webhook payload items", async () => {
    const payload = {
      type: "person.created",
      data: {
        id: 12345,
        first_name: "John",
        last_name: "Doe",
      },
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
      [{ json: { event: "organization.updated" }, binary: { data: { data: "base64", mimeType: "application/json" } } }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].binary).toBeDefined();
    expect(out[0].binary!.data.mimeType).toBe("application/json");
  });
});
