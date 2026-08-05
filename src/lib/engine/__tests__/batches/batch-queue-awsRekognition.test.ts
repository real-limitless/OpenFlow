import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsRekognition";

const MOCK_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        const map: Record<string, string> = {
          "content-type": "application/x-amz-json-1.1",
        };
        return map[name.toLowerCase()] ?? null;
      },
      forEach(cb: (v: string, k: string) => void) {
        cb("application/x-amz-json-1.1", "content-type");
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

function installFetch(response: ReturnType<typeof mockResponse>) {
  nextResponse = response;
  calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const req = init ?? {};
    const hdrs: Record<string, string> = {};
    if (req.headers && typeof req.headers === "object" && !Array.isArray(req.headers)) {
      for (const [k, v] of Object.entries(req.headers as Record<string, string>)) {
        hdrs[k] = v;
      }
    }
    calls.push({
      url: typeof url === "string" ? url : url.toString(),
      method: req.method ?? "GET",
      headers: hdrs,
      body: req.body as string | undefined,
    });
    return nextResponse;
  };
  return () => { globalThis.fetch = orig; };
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCredCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => {
      if (name === "aws") return MOCK_CRED;
      return null;
    },
  });
}

async function runRekognition(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCredCtx(items, node, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({
    Labels: [
      { Name: "Beach", Confidence: 99.5, Categories: [], Parents: [] },
    ],
  }));
});

afterEach(() => {
  vi.restoreAllMudules?.();
});

function assertFetchHasSigHeaders() {
  expect(calls).toHaveLength(1);
  const hdrs = calls[0].headers;
  expect(hdrs["x-amz-date"]).toBeDefined();
  expect(hdrs["authorization"]).toBeDefined();
  expect(hdrs["authorization"]).toMatch(/^AWS4-HMAC-SHA256 /);
  expect(hdrs["x-amz-content-sha256"]).toBeDefined();
}

describe("awsRekognition", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("AWS Rekognition");
  });

  it("detectLabels from S3 image", async () => {
    const [out] = await runRekognition(
      {
        resource: "image",
        operation: "analyze",
        type: "detectLabels",
        binaryData: false,
        bucket: "={{ $json.bucketName }}",
        name: "={{ $json.objectKey }}",
      },
      [{ json: { bucketName: "my-photos", objectKey: "vacation/beach.jpg" } }],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.bucketName).toBe("my-photos");
    expect(out[0].json.objectKey).toBe("vacation/beach.jpg");
    expect(out[0].json.rekognitionResult).toBeDefined();
    expect(out[0].json.rekognitionResult.Labels).toHaveLength(1);
    expect(out[0].json.rekognitionResult.Labels[0].Name).toBe("Beach");

    assertFetchHasSigHeaders();
    const body = JSON.parse(calls[0].body!);
    expect(body.Image.S3Object.Bucket).toBe("my-photos");
    expect(body.Image.S3Object.Name).toBe("vacation/beach.jpg");
  });

  it("detectFaces from binary data", async () => {
    installFetch(mockResponse({
      FaceDetails: [
        {
          BoundingBox: { Width: 0.2, Height: 0.3, Left: 0.1, Top: 0.2 },
          Confidence: 99.9,
          Landmarks: [{ Type: "eyeLeft", X: 0.2, Y: 0.3 }],
        },
      ],
    }));

    const [out] = await runRekognition(
      {
        resource: "image",
        operation: "analyze",
        type: "detectFaces",
        binaryData: true,
        additionalFields: { attributes: ["all"] },
      },
      [{ json: {}, binary: { data: { mimeType: "image/jpeg", data: "<base64-encoded-bytes>" } } }],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.rekognitionResult.FaceDetails).toHaveLength(1);
    expect(out[0].json.rekognitionResult.FaceDetails[0].Confidence).toBe(99.9);

    assertFetchHasSigHeaders();
    const body = JSON.parse(calls[0].body!);
    expect(body.Image.Bytes).toBe("<base64-encoded-bytes>");
    expect(body.Attributes).toEqual(["all"]);
  });

  it("detectModerationLabels from S3 image", async () => {
    installFetch(mockResponse({
      ModerationLabels: [
        { Name: "Explicit Nudity", Confidence: 85.2, ParentName: "Explicit" },
      ],
    }));

    const [out] = await runRekognition(
      {
        resource: "image",
        operation: "analyze",
        type: "detectModerationLabels",
        binaryData: false,
        bucket: "={{ $json.bucket }}",
        name: "={{ $json.key }}",
      },
      [{ json: { bucket: "content-bucket", key: "uploads/img001.jpg" } }],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.rekognitionResult.ModerationLabels).toHaveLength(1);
    expect(out[0].json.rekognitionResult.ModerationLabels[0].Name).toBe("Explicit Nudity");

    const body = JSON.parse(calls[0].body!);
    expect(body.Image.S3Object.Bucket).toBe("content-bucket");
    expect(body.Image.S3Object.Name).toBe("uploads/img001.jpg");
  });

  it("detectText from binary data", async () => {
    installFetch(mockResponse({
      TextDetections: [
        { DetectedText: "HELLO", Type: "LINE", Confidence: 98.7, Id: 0 },
      ],
    }));

    const [out] = await runRekognition(
      {
        resource: "image",
        operation: "analyze",
        type: "detectText",
        binaryData: true,
        binaryPropertyName: "photo",
      },
      [{ json: {}, binary: { photo: { mimeType: "image/png", data: "<base64-bytes>" } } }],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.rekognitionResult.TextDetections).toHaveLength(1);
    expect(out[0].json.rekognitionResult.TextDetections[0].DetectedText).toBe("HELLO");

    const body = JSON.parse(calls[0].body!);
    expect(body.Image.Bytes).toBe("<base64-bytes>");
  });

  it("throws on missing bucket when binaryData is false", async () => {
    await expect(
      runRekognition(
        {
          resource: "image",
          operation: "analyze",
          type: "detectLabels",
          binaryData: false,
        },
        [{}],
      ),
    ).rejects.toThrow(/bucket and name are required/);
  });

  it("outputs error item on continueOnFail", async () => {
    const [out] = await runRekognition(
      {
        resource: "image",
        operation: "analyze",
        type: "detectLabels",
        binaryData: true,
      },
      [{ json: {}, binary: {} }],
      true,
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.error).toBeDefined();
    expect(String(out[0].json.error)).toContain("binary property");
  });

  it("includes x-amz-security-token when sessionToken credential is present", async () => {
    const MOCK_CRED_WITH_SESSION: Record<string, string> = {
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "secret",
      sessionToken: "IQoJb3JpZ2luX2VjEPz",
    };

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { type: "detectLabels", binaryData: true, binaryPropertyName: "data" },
    });
    const items = toItems([
      { json: {}, binary: { data: { mimeType: "image/jpeg", data: "/9j/4AAQ==" } } },
    ]);
    const ctx = makeCredCtx(items, node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue(MOCK_CRED_WITH_SESSION);

    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    assertFetchHasSigHeaders();
    expect(calls[0].headers["x-amz-security-token"]).toBe("IQoJb3JpZ2luX2VjEPz");
  });

  it("uses region from credential", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { type: "detectLabels", binaryData: true, binaryPropertyName: "data" },
    });
    const items = toItems([
      { json: {}, binary: { data: { mimeType: "image/png", data: "aaBbCc==" } } },
    ]);
    const ctx = makeCredCtx(items, node);

    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    assertFetchHasSigHeaders();
    expect(calls[0].url).toContain("rekognition.us-east-1.amazonaws.com");
  });

  it("recognizeCelebrity from S3", async () => {
    installFetch(mockResponse({
      CelebrityFaces: [
        { Name: "Jane Doe", Id: "abc123", Urls: [], MatchConfidence: 95.0, Face: { BoundingBox: { Width: 0.1, Height: 0.2, Left: 0.3, Top: 0.4 }, Confidence: 95.0, Landmarks: [], Pose: {}, Quality: {}, Emotions: [] } },
      ],
      UnrecognizedFaces: [],
    }));

    const [out] = await runRekognition(
      {
        resource: "image",
        operation: "analyze",
        type: "recognizeCelebrity",
        binaryData: false,
        bucket: "celeb-bucket",
        name: "celeb.jpg",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.rekognitionResult.CelebrityFaces).toHaveLength(1);
    expect(out[0].json.rekognitionResult.CelebrityFaces[0].Name).toBe("Jane Doe");
    expect(out[0].json.rekognitionResult.UnrecognizedFaces).toEqual([]);
  });
});
