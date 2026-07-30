import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { deflateRawSync, gzipSync, gunzipSync, inflateRawSync } from "node:zlib";

interface ZipEntry {
  name: string;
  data: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    central.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const centralOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

function readZip(buf: Buffer): ZipEntry[] {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Compression: invalid zip archive (end-of-central-directory not found)");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let pos = centralOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error("Compression: invalid zip central directory entry");
    }
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;

    let data: Buffer;
    if (method === 0) {
      data = buf.subarray(dataStart, dataStart + uncompressedSize);
    } else if (method === 8) {
      data = inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize));
    } else {
      throw new Error(`Compression: unsupported zip compression method ${method}`);
    }

    entries.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function makeTar(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    header.write(entry.name.slice(0, 100), 0, "utf8");
    header.write("0000644 \0", 100, "utf8");
    header.write("0000000 \0", 108, "utf8");
    header.write("0000000 \0", 116, "utf8");
    header.write(entry.data.length.toString(8).padStart(11, "0") + " ", 124, "utf8");
    header.write("00000000000 ", 136, "utf8");
    header.write("        ", 148, "utf8");
    header[156] = 0x30;
    header.write("ustar\0", 257, "utf8");
    header.write("00", 263, "utf8");

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, "0"), 148, "utf8");
    header[154] = 0;
    header[155] = 0x20;

    chunks.push(header, entry.data);
    const pad = (512 - (entry.data.length % 512)) % 512;
    if (pad > 0) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function readTar(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let pos = 0;
  while (pos + 512 <= buf.length) {
    const name = buf.toString("utf8", pos, pos + 100).replace(/\0/g, "");
    if (!name) break;
    const sizeStr = buf.toString("utf8", pos + 124, pos + 136).replace(/\0/g, "").trim();
    const size = parseInt(sizeStr, 8) || 0;
    const type = buf[pos + 156];
    pos += 512;
    if (type === 0x30 || type === 0) {
      entries.push({ name, data: buf.subarray(pos, pos + size) });
    }
    pos += size + ((512 - (size % 512)) % 512);
  }
  return entries;
}

const EXT_MIME: Record<string, string> = {
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  js: "text/javascript",
  css: "text/css",
  md: "text/markdown",
  zip: "application/zip",
  gz: "application/gzip",
  gzip: "application/gzip",
  tar: "application/x-tar",
  tgz: "application/gzip",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function isText(buf: Buffer): boolean {
  if (buf.length === 0) return true;
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  for (let i = start; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    if (b >= 0x20 && b <= 0x7e) continue;
    return false;
  }
  return true;
}

function guessMime(buf: Buffer, fileName: string): string {
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "";
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return isText(buf) ? "text/plain" : "application/octet-stream";
}

function decodeBinary(bin: IBinaryData): Buffer {
  return Buffer.from(bin.data, "base64");
}

function toBinary(buf: Buffer, fileName: string, mimeType: string): IBinaryData {
  return {
    data: buf.toString("base64"),
    mimeType,
    fileName,
    fileSize: buf.length,
  };
}

type ArchiveFormat = "zip" | "gzip" | "tar" | "tar.gz";

function detectFormat(fileName: string): ArchiveFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".gz") || lower.endsWith(".gzip")) return "gzip";
  if (lower.endsWith(".tar")) return "tar";
  throw new Error(
    `Compression: unsupported file extension "${fileName}". Supported: .zip, .gz, .gzip, .tar, .tar.gz, .tgz`,
  );
}

function extractArchive(buf: Buffer, format: ArchiveFormat, inputFileName: string): ZipEntry[] {
  switch (format) {
    case "zip":
      return readZip(buf);
    case "gzip": {
      const raw = gunzipSync(buf);
      const name = inputFileName.replace(/\.(gz|gzip)$/i, "");
      return [{ name, data: raw }];
    }
    case "tar":
      return readTar(buf);
    case "tar.gz": {
      const raw = gunzipSync(buf);
      return readTar(raw);
    }
  }
}

export const compressionExecutor: NodeExecutor = async (ctx, node) => {
  const rawItems = ctx.getInputItems(0);
  if (rawItems.length === 0) return [[]];

  const items = rawItems;
  const operation = ctx.getParam<string>("operation", "decompress");
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const outputFormat = ctx.getParam<string>("outputFormat", "zip") || "zip";
  const fileName = ctx.getParam<string>("fileName", "");
  const binaryPropertyOutput = ctx.getParam<string>("binaryPropertyOutput", "data");
  const outputPrefix = ctx.getParam<string>("outputPrefix", "file_");
  const nodeVersion = node.typeVersion ?? 1.1;
  const continueOnFail = ctx.continueOnFail();

  const fields = binaryPropertyName
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const output: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    try {
      if (operation === "compress") {
        const inputBins: { name: string; data: Buffer }[] = [];
        for (const field of fields) {
          const bin = item.binary?.[field];
          if (!bin) {
            throw new Error(
              `Compression: binary property "${field}" is missing on item ${itemIndex}`,
            );
          }
          inputBins.push({ name: bin.fileName ?? field, data: decodeBinary(bin) });
        }

        if (inputBins.length === 0) {
          throw new Error(
            `Compression: no binary fields to compress on item ${itemIndex}`,
          );
        }

        const preservedBinary: Record<string, IBinaryData> = {};
        for (const [key, val] of Object.entries(item.binary ?? {})) {
          if (!fields.includes(key)) preservedBinary[key] = val;
        }

        if (outputFormat === "zip") {
          if (!fileName) {
            throw new Error("Compression: fileName is required for zip output");
          }
          const archive = makeZip(inputBins);
          preservedBinary[binaryPropertyOutput] = toBinary(
            archive,
            fileName,
            "application/zip",
          );
        } else if (outputFormat === "gzip") {
          if (nodeVersion === 1) {
            const compressed = gzipSync(inputBins[0].data);
            const outName = `${outputPrefix}.gz`;
            preservedBinary[outputPrefix] = toBinary(
              compressed,
              outName,
              "application/gzip",
            );
          } else {
            const compressed = gzipSync(inputBins[0].data);
            const outName = fileName || inputBins[0].name;
            preservedBinary[binaryPropertyOutput] = toBinary(
              compressed,
              outName,
              "application/gzip",
            );
          }
        } else {
          throw new Error(`Compression: unsupported output format "${outputFormat}"`);
        }

        output.push({
          json: { ...item.json },
          binary: preservedBinary,
          pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
        });
      } else if (operation === "decompress") {
        const preservedBinary: Record<string, IBinaryData> = {};
        for (const [key, val] of Object.entries(item.binary ?? {})) {
          if (!fields.includes(key)) preservedBinary[key] = val;
        }

        for (const field of fields) {
          const bin = item.binary?.[field];
          if (!bin) {
            throw new Error(
              `Compression: binary property "${field}" is missing on item ${itemIndex}`,
            );
          }
          const buf = decodeBinary(bin);
          const inputFileName = bin.fileName ?? field;
          const format = detectFormat(inputFileName);
          const extracted = extractArchive(buf, format, inputFileName);

          extracted.forEach((entry, idx) => {
            const key = `${outputPrefix}${idx}`;
            preservedBinary[key] = toBinary(
              entry.data,
              entry.name,
              guessMime(entry.data, entry.name),
            );
          });
        }

        output.push({
          json: { ...item.json },
          binary: preservedBinary,
          pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
        });
      } else {
        throw new Error(`Compression: unknown operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      output.push({
        json: {
          ...item.json,
          error: err instanceof Error ? err.message : String(err),
        },
        binary: item.binary,
        pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
      });
    }
  }

  return [output];
};