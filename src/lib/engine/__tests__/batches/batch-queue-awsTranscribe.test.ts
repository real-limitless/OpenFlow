import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsTranscribe";

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

async function runTranscribe(
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

function assertFetchHasSigHeaders() {
  expect(calls).toHaveLength(1);
  const hdrs = calls[0].headers;
  expect(hdrs["x-amz-date"]).toBeDefined();
  expect(hdrs["authorization"]).toBeDefined();
  expect(hdrs["authorization"]).toMatch(/^AWS4-HMAC-SHA256 /);
  expect(hdrs["x-amz-content-sha256"]).toBeDefined();
}

beforeEach(() => {
  installFetch(mockResponse({
    TranscriptionJob: {
      TranscriptionJobName: "my-transcription-001",
      TranscriptionJobStatus: "QUEUED",
      Media: { MediaFileUri: "s3://my-audio-bucket/recordings/call-001.mp3" },
    },
  }));
});

afterEach(() => {
  vi.restoreAllMudules?.();
});

describe("awsTranscribe", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("AWS Transcribe");
  });

  it("creates a transcription job", async () => {
    const [out] = await runTranscribe(
      {
        operation: "create",
        transcriptionJobName: "my-transcription-001",
        mediaFileUri: "s3://my-audio-bucket/recordings/call-001.mp3",
        languageCode: "en-US",
        mediaFormat: "mp3",
        outputBucketName: "my-transcript-bucket",
        region: "us-east-1",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.TranscriptionJob.TranscriptionJobName).toBe("my-transcription-001");
    expect(out[0].json.TranscriptionJob.TranscriptionJobStatus).toBe("QUEUED");
    expect(out[0].json.TranscriptionJob.Media.MediaFileUri).toBe("s3://my-audio-bucket/recordings/call-001.mp3");

    assertFetchHasSigHeaders();
    expect(calls[0].headers["x-amz-target"]).toBe("AWSTranscribe.StartTranscriptionJob");
    const body = JSON.parse(calls[0].body!);
    expect(body.TranscriptionJobName).toBe("my-transcription-001");
    expect(body.Media.MediaFileUri).toBe("s3://my-audio-bucket/recordings/call-001.mp3");
    expect(body.LanguageCode).toBe("en-US");
    expect(body.MediaFormat).toBe("mp3");
  });

  it("creates with auto-detect language", async () => {
    const [out] = await runTranscribe(
      {
        operation: "create",
        transcriptionJobName: "auto-detect-job",
        mediaFileUri: "s3://my-audio-bucket/recordings/multi-lang.mp3",
        identifyLanguage: true,
        languageOptions: ["en-US", "es-US"],
        region: "us-east-1",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    assertFetchHasSigHeaders();
    const body = JSON.parse(calls[0].body!);
    expect(body.IdentifyLanguage).toBe(true);
    expect(body.LanguageOptions).toEqual(["en-US", "es-US"]);
    expect(body.TranscriptionJobName).toBe("auto-detect-job");
  });

  it("gets a transcription job", async () => {
    installFetch(mockResponse({
      TranscriptionJob: {
        TranscriptionJobName: "my-transcription-001",
        TranscriptionJobStatus: "COMPLETED",
        Media: { MediaFileUri: "s3://bucket/audio.mp3" },
        Transcript: { TranscriptFileUri: "https://s3.amazonaws.com/bucket/output.json" },
      },
    }));

    const [out] = await runTranscribe(
      {
        operation: "get",
        transcriptionJobName: "my-transcription-001",
        region: "us-east-1",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.TranscriptionJob.TranscriptionJobName).toBe("my-transcription-001");
    expect(out[0].json.TranscriptionJob.TranscriptionJobStatus).toBe("COMPLETED");
    expect(out[0].json.TranscriptionJob.Transcript.TranscriptFileUri).toBeDefined();

    assertFetchHasSigHeaders();
    expect(calls[0].headers["x-amz-target"]).toBe("AWSTranscribe.GetTranscriptionJob");
    const body = JSON.parse(calls[0].body!);
    expect(body.TranscriptionJobName).toBe("my-transcription-001");
  });

  it("lists transcription jobs", async () => {
    installFetch(mockResponse({
      TranscriptionJobSummaries: [
        {
          TranscriptionJobName: "job-1",
          TranscriptionJobStatus: "COMPLETED",
          LanguageCode: "en-US",
        },
        {
          TranscriptionJobName: "job-2",
          TranscriptionJobStatus: "IN_PROGRESS",
          LanguageCode: "en-US",
        },
      ],
      Status: "COMPLETED",
      NextToken: "next-page-token",
    }));

    const [out] = await runTranscribe(
      {
        operation: "getAll",
        status: "COMPLETED",
        maxResults: 50,
        region: "us-east-1",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.TranscriptionJobSummaries).toHaveLength(2);
    expect(out[0].json.TranscriptionJobSummaries[0].TranscriptionJobName).toBe("job-1");
    expect(out[0].json.NextToken).toBe("next-page-token");

    assertFetchHasSigHeaders();
    expect(calls[0].headers["x-amz-target"]).toBe("AWSTranscribe.ListTranscriptionJobs");
    const body = JSON.parse(calls[0].body!);
    expect(body.MaxResults).toBe(50);
    expect(body.Status).toBe("COMPLETED");
  });

  it("deletes a transcription job", async () => {
    installFetch(mockResponse({}));

    const [out] = await runTranscribe(
      {
        operation: "delete",
        transcriptionJobName: "my-transcription-001",
        region: "us-east-1",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.success).toBe(true);

    assertFetchHasSigHeaders();
    expect(calls[0].headers["x-amz-target"]).toBe("AWSTranscribe.DeleteTranscriptionJob");
    const body = JSON.parse(calls[0].body!);
    expect(body.TranscriptionJobName).toBe("my-transcription-001");
  });

  it("throws on API error", async () => {
    installFetch(mockResponse(
      { __type: "BadRequestException", message: "Invalid job name" },
      400,
    ));

    await expect(
      runTranscribe(
        {
          operation: "get",
          transcriptionJobName: "bad-job",
          region: "us-east-1",
        },
        [{}],
      ),
    ).rejects.toThrow(/BadRequestException|Invalid job name/);
  });

  it("outputs error item on continueOnFail", async () => {
    installFetch(mockResponse(
      { __type: "NotFoundException", message: "Job not found" },
      404,
    ));

    const [out] = await runTranscribe(
      {
        operation: "get",
        transcriptionJobName: "missing-job",
        region: "us-east-1",
      },
      [{}],
      true,
    );

    expect(out).toHaveLength(1);
    expect(out[0].json.error).toBeDefined();
    expect(String(out[0].json.error)).toMatch(/404|not found|NotFoundException/i);
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
      parameters: { operation: "create", transcriptionJobName: "test", mediaFileUri: "s3://bucket/audio.mp3", region: "us-east-1" },
    });
    const items = toItems([{}]);
    const ctx = makeCredCtx(items, node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue(MOCK_CRED_WITH_SESSION);

    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    assertFetchHasSigHeaders();
    expect(calls[0].headers["x-amz-security-token"]).toBe("IQoJb3JpZ2luX2VjEPz");
  });

  it("evaluates expression params per item", async () => {
    const [out] = await runTranscribe(
      {
        operation: "create",
        transcriptionJobName: "={{ $json.jobName }}",
        mediaFileUri: "={{ $json.uri }}",
        languageCode: "={{ $json.lang }}",
        region: "us-east-1",
      },
      [{ json: { jobName: "expr-job", uri: "s3://bucket/file.wav", lang: "fr-FR" } }],
    );

    expect(out).toHaveLength(1);
    assertFetchHasSigHeaders();
    const body = JSON.parse(calls[0].body!);
    expect(body.TranscriptionJobName).toBe("expr-job");
    expect(body.Media.MediaFileUri).toBe("s3://bucket/file.wav");
    expect(body.LanguageCode).toBe("fr-FR");
  });
});
