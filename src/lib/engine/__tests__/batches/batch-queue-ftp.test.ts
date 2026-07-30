import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setFtpClientFactory, type FtpClient, type FtpEntry } from "../../executors/ftp";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.ftp";

const FTP_CRED = { host: "h", port: 21, username: "u", password: "p" };
const SFTP_CRED = { host: "h", port: 22, username: "u", password: "p" };

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
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
    continueOnFail: false,
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

async function runFtp(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {
    ftp: FTP_CRED,
    sftp: SFTP_CRED,
  },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockClient(impl: Partial<FtpClient> = {}): FtpClient {
  return {
    list: impl.list ?? (async () => []),
    get: impl.get ?? (async () => Buffer.alloc(0)),
    put: impl.put ?? (async () => {}),
    delete: impl.delete ?? (async () => {}),
    deleteDir: impl.deleteDir ?? (async () => {}),
    stat: impl.stat ?? (async () => null),
    rename: impl.rename ?? (async () => {}),
    mkdir: impl.mkdir ?? (async () => {}),
    close: impl.close ?? (async () => {}),
  };
}

afterEach(() => setFtpClientFactory(null));

describe("batch-queue ftp — n8n-nodes-base.ftp", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("FTP");
  });

  it("throws when the required credential is missing", async () => {
    setFtpClientFactory(async () => mockClient());
    await expect(
      runFtp({ protocol: "ftp", operation: "list", path: "/x" }, [{}], {}),
    ).rejects.toThrow(/credential "ftp"/);
  });

  it("lists non-recursive — one item per direct child", async () => {
    const entries: FtpEntry[] = [
      { name: "a.txt", path: "/incoming/a.txt", type: "file", size: 10 },
      { name: "sub", path: "/incoming/sub", type: "directory", size: 0 },
    ];
    setFtpClientFactory(async () => mockClient({ list: async () => entries }));

    const out = await runFtp(
      { protocol: "ftp", operation: "list", path: "/incoming", recursive: false },
      [{}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({
      name: "a.txt",
      path: "/incoming/a.txt",
      type: "file",
      size: 10,
    });
    expect(out[0][1].json.type).toBe("directory");
  });

  it("download places file bytes on the named binary field", async () => {
    const payload = Buffer.from("col1,col2\n1,2\n", "utf8");
    setFtpClientFactory(async () => mockClient({ get: async () => payload }));

    const out = await runFtp(
      {
        protocol: "sftp",
        operation: "download",
        path: "/data/report.csv",
        binaryPropertyName: "data",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(Buffer.from(bin!.data, "base64").toString("utf8")).toBe("col1,col2\n1,2\n");
    expect(bin!.fileName).toBe("report.csv");
    expect(out[0][0].json.path).toBe("/data/report.csv");
  });

  it("uploads text content when binaryData is false", async () => {
    const puts: Array<{ path: string; data: Buffer }> = [];
    setFtpClientFactory(async () =>
      mockClient({
        put: async (path, data) => {
          puts.push({ path, data });
        },
      }),
    );

    const out = await runFtp(
      {
        protocol: "ftp",
        operation: "upload",
        path: "/outgoing/hello.txt",
        binaryData: false,
        fileContent: "hello",
      },
      [{ body: "hello" }],
    );

    expect(puts).toHaveLength(1);
    expect(puts[0].path).toBe("/outgoing/hello.txt");
    expect(puts[0].data.toString("utf8")).toBe("hello");
    expect(out[0][0].json).toMatchObject({ success: true, path: "/outgoing/hello.txt" });
  });

  it("uploads binary from a prior item property", async () => {
    const puts: Array<{ path: string; data: Buffer }> = [];
    setFtpClientFactory(async () =>
      mockClient({
        put: async (path, data) => {
          puts.push({ path, data });
        },
      }),
    );

    const out = await runFtp(
      {
        protocol: "sftp",
        operation: "upload",
        path: "/uploads/photo.png",
        binaryData: true,
        binaryPropertyName: "data",
      },
      [
        {
          json: { fileName: "photo.png" },
          binary: {
            data: {
              data: Buffer.from("PNGBYTES").toString("base64"),
              mimeType: "image/png",
              fileName: "photo.png",
            },
          },
        },
      ],
    );

    expect(puts).toHaveLength(1);
    expect(puts[0].data.toString("utf8")).toBe("PNGBYTES");
    expect(out[0][0].json.success).toBe(true);
  });

  it("upload fails when the binary property is missing", async () => {
    setFtpClientFactory(async () => mockClient());

    await expect(
      runFtp(
        {
          protocol: "ftp",
          operation: "upload",
          path: "/x",
          binaryData: true,
          binaryPropertyName: "data",
        },
        [{ json: {} }],
      ),
    ).rejects.toThrow(/binary property "data"/);
  });

  it("delete folder recursive removes the directory tree", async () => {
    const deleted: Array<{ path: string; recursive: boolean }> = [];
    setFtpClientFactory(async () =>
      mockClient({
        stat: async () => ({ isDirectory: true }),
        deleteDir: async (path, recursive) => {
          deleted.push({ path, recursive });
        },
      }),
    );

    const out = await runFtp(
      {
        protocol: "ftp",
        operation: "delete",
        path: "/tmp/job-42",
        options: { folder: true, recursive: true },
      },
      [{}],
    );

    expect(deleted).toEqual([{ path: "/tmp/job-42", recursive: true }]);
    expect(out[0][0].json).toMatchObject({
      success: true,
      path: "/tmp/job-42",
      directory: true,
    });
  });

  it("delete directory without options.folder fails", async () => {
    setFtpClientFactory(async () => mockClient({ stat: async () => ({ isDirectory: true }) }));

    await expect(
      runFtp({ protocol: "ftp", operation: "delete", path: "/tmp/job-42" }, [{}]),
    ).rejects.toThrow(/without options.folder/);
  });

  it("delete a plain file calls delete (not deleteDir)", async () => {
    const deletedFiles: string[] = [];
    setFtpClientFactory(async () =>
      mockClient({
        stat: async () => ({ isDirectory: false }),
        delete: async (path) => {
          deletedFiles.push(path);
        },
      }),
    );

    const out = await runFtp({ protocol: "ftp", operation: "delete", path: "/tmp/file.txt" }, [{}]);

    expect(deletedFiles).toEqual(["/tmp/file.txt"]);
    expect(out[0][0].json.directory).toBeUndefined();
  });

  it("rename with createDirectories creates parents then moves", async () => {
    const mkdirs: Array<{ path: string; recursive: boolean }> = [];
    const renames: Array<{ oldPath: string; newPath: string }> = [];
    setFtpClientFactory(async () =>
      mockClient({
        mkdir: async (path, recursive) => {
          mkdirs.push({ path, recursive });
        },
        rename: async (oldPath, newPath) => {
          renames.push({ oldPath, newPath });
        },
      }),
    );

    const out = await runFtp(
      {
        protocol: "sftp",
        operation: "rename",
        oldPath: "/a/file.txt",
        newPath: "/b/nested/file.txt",
        options: { createDirectories: true },
      },
      [{}],
    );

    expect(mkdirs).toContainEqual({ path: "/b/nested", recursive: true });
    expect(renames).toEqual([{ oldPath: "/a/file.txt", newPath: "/b/nested/file.txt" }]);
    expect(out[0][0].json).toMatchObject({
      success: true,
      oldPath: "/a/file.txt",
      newPath: "/b/nested/file.txt",
    });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.ftp")).toBe(canonical);
  });
});
