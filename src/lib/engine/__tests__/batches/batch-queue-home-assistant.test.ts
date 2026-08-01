import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.homeAssistant";

let fetchCalls: Array<{ url: string; method: string; headers: Record<string, string>; body: string | undefined }> = [];
let fetchResponse: { status: number; body: string; headers: Record<string, string> } = { status: 200, body: "{}", headers: { "content-type": "application/json" } };

function installFetch() {
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    fetchCalls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return {
      status: fetchResponse.status,
      ok: fetchResponse.status >= 200 && fetchResponse.status < 300,
      headers: {
        get(name: string) { return fetchResponse.headers[name.toLowerCase()] ?? null; },
        forEach(fn: (v: string, k: string) => void) {
          for (const [k, v] of Object.entries(fetchResponse.headers)) fn(v, k);
        },
      },
      async text() { return fetchResponse.body; },
      async arrayBuffer() { return Buffer.from(fetchResponse.body); },
    } as Response;
  }));
}

function setResponse(status: number, body: unknown, headers?: Record<string, string>) {
  fetchResponse = {
    status,
    body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
    headers: { "content-type": "application/json", ...headers },
  };
}

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  const node = makeNode({ name: "HATest", type: TYPE, parameters });
  const defaultCreds = {
    homeAssistantApi: {
      baseUrl: "home.example.com",
      apiKey: "test-token",
      port: 8123,
      ssl: true,
    },
  };
  const creds = credentials ?? defaultCreds;
  return createExecutionContext({
    node,
    workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => creds[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, parameters, opts?.continueOnFail, opts?.credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue home-assistant — n8n-nodes-base.homeAssistant", () => {
  beforeEach(() => {
    installFetch();
    setResponse(200, {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Home Assistant");
  });

  it("gets all states from /api/states", async () => {
    setResponse(200, [
      { entity_id: "sun.sun", state: "above_horizon", attributes: { friendly_name: "Sun" } },
    ]);
    const out = await run({ resource: "state", operation: "getAll" });
    expect(fetchCalls[0].url).toContain("/api/states");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("entity_id", "sun.sun");
  });

  it("calls a service via POST /api/services/{domain}/{service}", async () => {
    setResponse(200, [{ entity_id: "light.living_room", state: "on" }]);
    const out = await run({
      resource: "service",
      operation: "call",
      domain: "light",
      service: "turn_on",
      serviceData: { entity_id: "light.living_room" },
    });
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].url).toContain("/api/services/light/turn_on");
    expect(out[0][0].json).toEqual({ entity_id: "light.living_room", state: "on" });
  });

  it("renders a template via POST /api/template", async () => {
    setResponse(200, "It is 2026-08-01 12:00:00+00:00!");
    const out = await run({ resource: "template", operation: "create", template: "It is {{ now() }}!" });
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].url).toContain("/api/template");
    expect(out[0][0].json).toEqual({ rendered: "It is 2026-08-01 12:00:00+00:00!" });
  });

  it("creates an event via POST /api/events/{eventType}", async () => {
    setResponse(200, { message: "Event custom_test_event fired" });
    const out = await run({
      resource: "event",
      operation: "create",
      eventType: "custom_test_event",
      eventData: { key: "value" },
    });
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].url).toContain("/api/events/custom_test_event");
    expect(out[0][0].json).toHaveProperty("message");
  });

  it("handles continueOnFail for missing credential", async () => {
    const out = await run(
      { resource: "state", operation: "getAll" },
      [{}],
      { continueOnFail: true, credentials: {} },
    );
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("handles multi-item execution", async () => {
    setResponse(200, { entity_id: "sun.sun", state: "above_horizon" });
    const out = await run(
      { resource: "state", operation: "get", entityId: "sun.sun" },
      [{ json: {} }, { json: {} }],
    );
    expect(out[0]).toHaveLength(2);
    expect(fetchCalls).toHaveLength(2);
  });

  it("gets config via GET /api/config", async () => {
    setResponse(200, { version: "2024.1", location_name: "Home" });
    const out = await run({ resource: "config", operation: "get" });
    expect(fetchCalls[0].url).toContain("/api/config");
    expect(out[0][0].json).toHaveProperty("version");
  });

  it("checks config via POST /api/config/core/check_config", async () => {
    setResponse(200, { result: "valid", errors: [] });
    const out = await run({ resource: "config", operation: "check" });
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].url).toContain("/api/config/core/check_config");
    expect(out[0][0].json).toHaveProperty("result", "valid");
  });

  it("cameraProxy get emits binary output", async () => {
    const imageBytes = Buffer.from("fake-jpeg-bytes");
    setResponse(200, imageBytes.toString("utf-8"), { "content-type": "image/jpeg" });
    const out = await run({
      resource: "cameraProxy",
      operation: "get",
      entityId: "camera.my_sample_camera",
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.data).toBeDefined();
    expect(typeof out[0][0].binary!.data.data).toBe("string");
    expect(out[0][0].binary!.data.data.length).toBeGreaterThan(0);
    expect(out[0][0].binary!.data.mimeType).toBe("image/jpeg");
    expect(out[0][0].binary!.data.fileName).toBe("camera_my_sample_camera.jpg");
  });

  it("state getAll expands array to one item per element", async () => {
    setResponse(200, [
      { entity_id: "sun.sun", state: "above_horizon", attributes: {} },
      { entity_id: "sensor.temperature", state: "22.5", attributes: { unit: "°C" } },
    ]);
    const out = await run({ resource: "state", operation: "getAll" });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ entity_id: "sun.sun", state: "above_horizon", attributes: {} });
    expect(out[0][1].json).toEqual({ entity_id: "sensor.temperature", state: "22.5", attributes: { unit: "°C" } });
  });

  it("state upsert via POST /api/states/{entityId}", async () => {
    setResponse(200, {
      entity_id: "sensor.kitchen_temperature",
      state: "25",
      attributes: { unit_of_measurement: "°C" },
      last_changed: "2025-01-01T00:00:00Z",
    });
    const out = await run({
      resource: "state",
      operation: "upsert",
      entityId: "sensor.kitchen_temperature",
      state: "25",
      attributes: { unit_of_measurement: "°C" },
    });
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].url).toContain("/api/states/sensor.kitchen_temperature");
    expect(out[0][0].json).toHaveProperty("entity_id", "sensor.kitchen_temperature");
  });
});