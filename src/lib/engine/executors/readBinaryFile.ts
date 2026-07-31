import type { NodeExecutor } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { withPairedItem } from "@/sdk";
import * as fs from "node:fs";
import * as path from "node:path";

const MIME_MAP: Record<string, string> = {
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".csv": "text/csv",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".md": "text/markdown",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
};

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
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

export const readBinaryFileExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const rawFilePath = ctx.getParam<string>("filePath", "");
  const rawDataPropertyName = ctx.getParam<string>("dataPropertyName", "data");
  const continueOnFail = ctx.continueOnFail();
  const allowed = getAllowedDirs();

  if (!rawFilePath) {
    throw new Error("filePath parameter is required");
  }

  const output: typeof inputItems = [];

  for (let i = 0; i < inputItems.length; i++) {
    const item = inputItems[i];
    try {
      const filePath = String(ctx.evaluate(rawFilePath, item.json) ?? "");
      const dataPropertyName = String(ctx.evaluate(rawDataPropertyName, item.json) ?? "data");

      if (!filePath) {
        throw new Error("filePath parameter is required");
      }

      if (!isPathAllowed(filePath, allowed)) {
        throw new Error(`Access denied: path "${filePath}" is outside the allowed directories`);
      }

      const buf = fs.readFileSync(filePath);
      const stat = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath);
      const mimeType = guessMimeType(filePath);

      const binaryData: IBinaryData = {
        data: buf.toString("base64"),
        mimeType,
        fileName,
        fileExtension: ext.startsWith(".") ? ext.slice(1) : ext,
        fileSize: stat.size,
      };

      output.push(
        withPairedItem(
          {
            json: { ...item.json },
            binary: { [dataPropertyName]: binaryData },
          },
          i,
        ),
      );
    } catch (err) {
      if (continueOnFail) {
        output.push(
          withPairedItem(
            {
              json: { ...item.json, error: err instanceof Error ? err.message : String(err) },
              binary: item.binary ? { ...item.binary } : undefined,
            },
            i,
          ),
        );
      } else {
        throw err;
      }
    }
  }

  return [output];
};