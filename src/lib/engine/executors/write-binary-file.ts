import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";
import * as fs from "node:fs";
import * as path from "node:path";

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

export const writeBinaryFileExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const rawFileName = ctx.getParam<string>("fileName", "");
  const rawDataPropertyName = ctx.getParam<string>("dataPropertyName", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const append = Boolean(options?.append ?? false);
  const continueOnFail = ctx.continueOnFail();
  const allowed = getAllowedDirs();

  if (!rawFileName) {
    throw new Error("fileName parameter is required");
  }

  const output: typeof inputItems = [];

  for (let i = 0; i < inputItems.length; i++) {
    const item = inputItems[i];
    try {
      const fileName = String(ctx.evaluate(rawFileName, item.json) ?? "");
      const dataPropertyName = String(ctx.evaluate(rawDataPropertyName, item.json) ?? "data");

      if (!fileName) {
        throw new Error("fileName parameter is required");
      }

      if (!isPathAllowed(fileName, allowed)) {
        throw new Error(`Access denied: path "${fileName}" is outside the allowed directories`);
      }

      const binaryData = item.binary?.[dataPropertyName];
      if (!binaryData) {
        throw new Error(`No binary property found for "${dataPropertyName}" on input item`);
      }

      const dir = path.dirname(fileName);
      if (!fs.existsSync(dir)) {
        throw new Error(`Parent directory "${dir}" does not exist`);
      }

      const buf = Buffer.from(binaryData.data, "base64");
      fs.writeFileSync(fileName, buf, { flag: append ? "a" : "w" });

      output.push(withPairedItem({ json: { ...item.json }, binary: item.binary ? { ...item.binary } : undefined }, i));
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