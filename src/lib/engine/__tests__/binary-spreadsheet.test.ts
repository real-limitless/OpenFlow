import { describe, expect, it } from "vitest";
import { runNode } from "./helpers";
import { initXlsx, parseXlsxBase64 } from "../executors/spreadsheet-file";
import { binaryToBuffer } from "../binary-buffer";
import { createFsBinaryStore, setBinaryStore, storeBinary, getBinaryStore } from "../binary";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("binary + spreadsheet paths", () => {
  it("round-trips json rows through xlsx convert and extract", async () => {
    const converted = await runNode("n8n-nodes-base.convertToFile", { operation: "xlsx" }, [
      { name: "Ada", n: 1 },
    ]);
    const bin = converted[0][0].binary!.data;
    expect(bin.fileExtension).toBe("xlsx");
    const extracted = await runNode("n8n-nodes-base.extractFromFile", { operation: "xlsx" }, [
      { json: {}, binary: { data: bin } },
    ]);
    expect(extracted[0][0].json.name).toBe("Ada");
    await initXlsx();
    const rows = parseXlsxBase64(bin.data, { headerRow: true }, "xlsx");
    expect(rows[0]).toMatchObject({ name: "Ada" });
  });

  it("reads binary-store ids for SSH-style buffers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "of-bin-"));
    const prev = getBinaryStore();
    setBinaryStore(createFsBinaryStore(dir));
    try {
      const ref = await storeBinary(Buffer.from("hello-store").toString("base64"), {
        mimeType: "text/plain",
        fileName: "hello.txt",
      });
      const buf = await binaryToBuffer({
        data: "",
        mimeType: "text/plain",
        id: ref.id,
      });
      expect(buf.toString("utf8")).toBe("hello-store");
    } finally {
      setBinaryStore(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
