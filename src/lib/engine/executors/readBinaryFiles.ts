import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import * as fs from "node:fs";
import * as path from "node:path";

const MIME_BY_EXT: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  xml: "application/xml",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ics: "text/calendar",
  rtf: "application/rtf",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function inferMime(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

function getAllowedDirs(): string[] | null {
  const raw = process.env.N8N_RESTRICT_FILE_ACCESS_TO;
  if (!raw) return null;
  return raw
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
}

function isPathAllowed(filePath: string, allowed: string[] | null): boolean {
  if (!allowed) return true;
  const resolved = path.resolve(filePath);
  return allowed.some((dir) => {
    const d = path.resolve(dir);
    return resolved === d || resolved.startsWith(d + path.sep);
  });
}

function hasGlobChars(pattern: string): boolean {
  return /[*?\[]/.test(pattern);
}

function globToRegex(pattern: string): RegExp {
  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        regex += ".*";
        i += 2;
      } else {
        regex += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      regex += "[^/]";
      i++;
    } else if (ch === "[") {
      let j = i + 1;
      const close = pattern.indexOf("]", j);
      if (close === -1) {
        regex += "\\[";
        i++;
      } else {
        regex += "[" + pattern.slice(j, close) + "]";
        i = close + 1;
      }
    } else if ("\\^$.|+(){}".includes(ch)) {
      regex += "\\" + ch;
      i++;
    } else {
      regex += ch;
      i++;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

function findGlobRoot(pattern: string): string {
  const sep = "/";
  const parts = pattern.split(sep);
  const rootParts: string[] = [];
  for (const part of parts) {
    if (hasGlobChars(part)) break;
    rootParts.push(part);
  }
  if (rootParts.length === 0) return ".";
  return rootParts.join(sep);
}

function matchFiles(selector: string): string[] {
  const normalized = selector.replace(/\\/g, "/");

  if (!hasGlobChars(normalized)) {
    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
      return [normalized];
    }
    return [];
  }

  const root = findGlobRoot(normalized);
  const regex = globToRegex(normalized);
  const results: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && regex.test(full)) {
        results.push(full);
      }
    }
  }

  if (fs.existsSync(root)) {
    walk(root);
  }

  results.sort();
  return results;
}

export const readBinaryFilesExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ensureItems(ctx.getInputItems(0));
  const fileSelector = ctx.getParam<string>("fileSelector", "");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const dataPropertyName = (options.dataPropertyName as string) || "data";
  const overrideFileName = options.fileName as string | undefined;
  const overrideFileExtension = options.fileExtension as string | undefined;
  const overrideMimeType = options.mimeType as string | undefined;
  const continueOnFail = ctx.continueOnFail();

  if (!fileSelector) {
    throw new Error("fileSelector parameter is required");
  }

  const allowed = getAllowedDirs();
  if (!isPathAllowed(fileSelector, allowed)) {
    const msg = `Access denied: path "${fileSelector}" is outside the allowed directories`;
    if (!continueOnFail) throw new Error(msg);
    return [inputItems.map((item, i) => ({
      json: { ...item.json, error: msg },
      binary: item.binary,
      pairedItem: item.pairedItem ?? { item: i, input: 0 },
    }))];
  }

  const matched = matchFiles(fileSelector);
  if (matched.length === 0) {
    const msg = `No files match selector "${fileSelector}"`;
    if (!continueOnFail) throw new Error(msg);
    return [inputItems.map((item, i) => ({
      json: { ...item.json, error: msg },
      binary: item.binary,
      pairedItem: item.pairedItem ?? { item: i, input: 0 },
    }))];
  }

  const output: INodeExecutionData[] = [];
  for (const filePath of matched) {
    const sourceItem = inputItems[0] ?? { json: {} };
    let content: Buffer;
    try {
      content = fs.readFileSync(filePath);
    } catch (err) {
      const msg = `Failed to read "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
      if (!continueOnFail) throw new Error(msg);
      output.push({
        json: { ...sourceItem.json, error: msg },
        binary: sourceItem.binary,
        pairedItem: sourceItem.pairedItem ?? { item: 0, input: 0 },
      });
      continue;
    }

    const baseName = path.basename(filePath);
    const ext = path.extname(filePath).slice(1);

    const bin: IBinaryData = {
      data: content.toString("base64"),
      mimeType: overrideMimeType || inferMime(ext),
      fileName: overrideFileName || baseName,
      fileExtension: overrideFileExtension || ext,
      fileSize: content.length,
    };

    output.push({
      json: { ...sourceItem.json },
      binary: { [dataPropertyName]: bin },
      pairedItem: sourceItem.pairedItem ?? { item: 0, input: 0 },
    });
  }

  return [output];
};