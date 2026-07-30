import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setSshClientFactory, type SshClient, type SshExecResult } from "../../executors/ssh";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.ssh";

const SSH_PASSWORD_CRED = { host: "h", port: 22, username: "u", password: "p" };
const SSH_PRIVATE_KEY_CRED = { host: "h", port: 22, username: "u", privateKey: "key", passphrase: "" };

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
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
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runSsh(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {
    sshPassword: SSH_PASSWORD_CRED,
    sshPrivateKey: SSH_PRIVATE_KEY_CRED,
  },
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, opts?.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockClient(impl: Partial<SshClient> = {}): SshClient {
  let homeDir = "/home/user";
  const defaultExecCommand = async (cmd: string) => {
    if (cmd === "echo $HOME") return { code: 0, signal: null, stdout: homeDir, stderr: "" };
    return { code: 0, signal: null, stdout: "", stderr: "" };
  };
  return {
    connect: impl.connect ?? (async () => {}),
    execCommand: impl.execCommand ?? defaultExecCommand,
    downloadFile: impl.downloadFile ?? (async () => Buffer.alloc(0)),
    uploadFile: impl.uploadFile ?? (async () => {}),
    close: impl.close ?? (async () => {}),
  };
}

afterEach(() => setSshClientFactory(null));

describe("batch-queue ssh — n8n-nodes-base.ssh", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("SSH");
  });

  it("throws when the required credential is missing", async () => {
    setSshClientFactory(async () => mockClient());
    await expect(
      runSsh({ authentication: "password", resource: "command", operation: "execute", command: "echo hi" }, [{}], {}),
    ).rejects.toThrow(/credential "sshPassword"/);
  });

  it("execute command returns exec result shape", async () => {
    const execResults: Array<{ cmd: string; cwd?: string }> = [];
    setSshClientFactory(async () =>
      mockClient({
        execCommand: async (cmd, opts) => {
          execResults.push({ cmd, cwd: opts?.cwd });
          if (cmd === "echo hello") return { code: 0, signal: null, stdout: "hello\n", stderr: "" };
          return { code: 0, signal: null, stdout: "", stderr: "" };
        },
      }),
    );

    const out = await runSsh(
      { authentication: "password", resource: "command", operation: "execute", command: "echo hello", cwd: "/" },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      code: 0,
      signal: null,
      stderr: "",
      stdout: "hello\n",
    });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(execResults[1].cwd).toBe("/");
  });

  it("execute with bare ~ throws invalid path error", async () => {
    setSshClientFactory(async () => mockClient());
    await expect(
      runSsh(
        { authentication: "password", resource: "command", operation: "execute", command: "ls", cwd: "~" },
        [{}],
      ),
    ).rejects.toThrow(/Invalid path. Replace "~" with home directory or "~\/"/);
  });

  it("execute expands ~/... against session $HOME", async () => {
    const execs: Array<{ cmd: string; cwd?: string }> = [];
    setSshClientFactory(async () =>
      mockClient({
        execCommand: async (cmd, opts) => {
          execs.push({ cmd, cwd: opts?.cwd });
          if (cmd === "echo $HOME") return { code: 0, signal: null, stdout: "/home/user\n", stderr: "" };
          return { code: 0, signal: null, stdout: "ok", stderr: "" };
        },
      }),
    );

    await runSsh(
      { authentication: "password", resource: "command", operation: "execute", command: "ls", cwd: "~/projects" },
      [{}],
    );

    expect(execs[1].cwd).toBe("/home/user/projects");
  });

  it("download writes binary property with correct fileName", async () => {
    const payload = Buffer.from("col1,col2\n1,2\n", "utf8");
    setSshClientFactory(async () =>
      mockClient({
        downloadFile: async (path) => {
          if (path === "/data/report.csv") return payload;
          return Buffer.alloc(0);
        },
      }),
    );

    const out = await runSsh(
      {
        authentication: "privateKey",
        resource: "file",
        operation: "download",
        path: "/data/report.csv",
        binaryPropertyName: "data",
      },
      [{ json: { label: "report" } }],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(Buffer.from(bin!.data, "base64").toString("utf8")).toBe("col1,col2\n1,2\n");
    expect(bin!.fileName).toBe("report.csv");
    expect(out[0][0].json.label).toBe("report");
  });

  it("download with options.fileName overrides name", async () => {
    const payload = Buffer.from("data", "utf8");
    setSshClientFactory(async () =>
      mockClient({
        downloadFile: async () => payload,
      }),
    );

    const out = await runSsh(
      {
        authentication: "password",
        resource: "file",
        operation: "download",
        path: "/data/report.csv",
        binaryPropertyName: "data",
        options: { fileName: "Q3-report.csv" },
      },
      [{}],
    );

    expect(out[0][0].binary?.data.fileName).toBe("Q3-report.csv");
  });

it("download with continueOnFail replaces item with error (no binary)", async () => {
    setSshClientFactory(async () =>
      mockClient({
        downloadFile: async () => {
          throw new Error("No such file");
        },
      }),
    );

    const out = await runSsh(
      {
        authentication: "password",
        resource: "file",
        operation: "download",
        path: "/does/not/exist.bin",
        binaryPropertyName: "data",
      },
      [{ json: { label: "x" } }],
      { sshPassword: SSH_PASSWORD_CRED },
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: "No such file" });
    expect(out[0][0].binary).toEqual({});
    // spec: download continueOnFail has no pairedItem
    expect(out[0][0].pairedItem).toBeUndefined();
  });

  it("upload from input binary writes to target dir + sanitized fileName", async () => {
    const uploads: Array<{ path: string; data: Buffer }> = [];
    setSshClientFactory(async () =>
      mockClient({
        uploadFile: async (data, path) => {
          uploads.push({ path, data });
        },
      }),
    );

    const out = await runSsh(
      {
        authentication: "password",
        resource: "file",
        operation: "upload",
        path: "/uploads",
        binaryPropertyName: "data",
      },
      [
        {
          json: { id: 1 },
          binary: {
            data: {
              data: "aGVsbG8=",
              mimeType: "text/plain",
              fileName: "hello.txt",
            },
          },
        },
      ],
    );

    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe("/uploads/hello.txt");
    expect(uploads[0].data.toString("utf8")).toBe("hello");
    expect(out[0][0].json).toEqual({ success: true });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("upload with options.fileName overrides binary fileName", async () => {
    const uploads: Array<{ path: string }> = [];
    setSshClientFactory(async () =>
      mockClient({
        uploadFile: async (_data, path) => {
          uploads.push({ path });
        },
      }),
    );

    await runSsh(
      {
        authentication: "password",
        resource: "file",
        operation: "upload",
        path: "/uploads",
        binaryPropertyName: "data",
        options: { fileName: "custom.txt" },
      },
      [
        {
          json: {},
          binary: {
            data: { data: "aGVsbG8=", mimeType: "text/plain", fileName: "original.txt" },
          },
        },
      ],
    );

    expect(uploads[0].path).toBe("/uploads/custom.txt");
  });

  it("upload sanitizes fileName (removes invalid chars)", async () => {
    const uploads: Array<{ path: string }> = [];
    setSshClientFactory(async () =>
      mockClient({
        uploadFile: async (_data, path) => {
          uploads.push({ path });
        },
      }),
    );

    await runSsh(
      {
        authentication: "password",
        resource: "file",
        operation: "upload",
        path: "/uploads",
        binaryPropertyName: "data",
      },
      [
        {
          json: {},
          binary: {
            data: { data: "aGVsbG8=", mimeType: "text/plain", fileName: 'bad<>:name.txt' },
          },
        },
      ],
    );

    expect(uploads[0].path).toBe("/uploads/bad___name.txt");
  });

  it("upload fails when binary property is missing", async () => {
    setSshClientFactory(async () => mockClient());

    await expect(
      runSsh(
        {
          authentication: "password",
          resource: "file",
          operation: "upload",
          path: "/x",
          binaryPropertyName: "data",
        },
        [{ json: {} }],
      ),
    ).rejects.toThrow(/binary property "data" not found/);
  });

  it("execute with continueOnFail pushes error and continues", async () => {
    let callCount = 0;
    setSshClientFactory(async () =>
      mockClient({
        execCommand: async (cmd) => {
          if (cmd === "echo $HOME") return { code: 0, signal: null, stdout: "/home/user\n", stderr: "" };
          callCount++;
          if (callCount === 1) throw new Error("connection failed");
          return { code: 0, signal: null, stdout: "ok", stderr: "" };
        },
      }),
    );

    const out = await runSsh(
      {
        authentication: "password",
        resource: "command",
        operation: "execute",
        command: "fail",
      },
      [{ json: { i: 1 } }, { json: { i: 2 } }],
      { sshPassword: SSH_PASSWORD_CRED, sshPrivateKey: SSH_PRIVATE_KEY_CRED },
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ error: "connection failed" });
    expect(out[0][1].json).toMatchObject({ code: 0, stdout: "ok" });
  });

  it("resolves executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.ssh")).toBe(canonical);
  });
});