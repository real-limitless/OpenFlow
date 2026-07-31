import type { NodeExecutor } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";

function getDeep(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function deleteDeep(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current == null || typeof current !== "object") return;
    current = current[parts[i]] as Record<string, unknown>;
  }
  if (current) {
    delete current[parts[parts.length - 1]];
  }
}

export const moveBinaryDataExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "binaryToJson");
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const encoding = (options.encoding as string) || "utf8";
  const keepSource = options.keepSource === true;
  const continueOnFail = ctx.continueOnFail();

  const output: Array<typeof inputItems[0]> = [];

  for (const item of inputItems) {
    try {
      if (mode === "binaryToJson") {
        const sourceKey = ctx.getParam<string>("sourceKey", "data");
        const setAllData = ctx.getParam<boolean>("setAllData", true);
        const destinationKey = ctx.getParam<string>("destinationKey", "data");
        const jsonParse = options.jsonParse === true;
        const keepAsBase64 = options.keepAsBase64 === true;
        const stripBOM = options.stripBOM !== false;

        const binary = item.binary?.[sourceKey];
        if (!binary) {
          continue;
        }

        const raw = Buffer.from(binary.data, "base64");
        let decoded: string;
        if (stripBOM && encoding.toLowerCase() === "utf8") {
          decoded = raw.toString("utf8").replace(/^\uFEFF/, "");
        } else {
          decoded = Buffer.isEncoding(encoding)
            ? raw.toString(encoding as BufferEncoding)
            : raw.toString("utf8");
        }

        const newItem = { json: { ...item.json }, binary: item.binary ? { ...item.binary } : undefined };

        if (setAllData) {
          newItem.json = keepAsBase64
            ? { [destinationKey]: binary.data } as unknown as Record<string, unknown>
            : JSON.parse(decoded) as Record<string, unknown>;
        } else {
          newItem.json = { ...item.json };
          if (keepAsBase64) {
            setDeep(newItem.json, destinationKey, binary.data);
          } else if (jsonParse) {
            try {
              setDeep(newItem.json, destinationKey, JSON.parse(decoded));
            } catch {
              setDeep(newItem.json, destinationKey, decoded);
            }
          } else {
            setDeep(newItem.json, destinationKey, decoded);
          }
        }

        if (!keepSource && newItem.binary) {
          delete newItem.binary[sourceKey];
          if (Object.keys(newItem.binary).length === 0) {
            delete newItem.binary;
          }
        }

        output.push(newItem);
      } else if (mode === "jsonToBinary") {
        const sourceKey = ctx.getParam<string>("sourceKey", "data");
        const destinationKey = ctx.getParam<string>("destinationKey", "data");
        const convertAllData = ctx.getParam<boolean>("convertAllData", true);
        const dataIsBase64 = options.dataIsBase64 === true;
        const useRawData = options.useRawData === true;
        const fileName = (options.fileName as string) || "";
        const mimeType = (options.mimeType as string) || "application/json";
        const addBOM = options.addBOM === true;

        let value: unknown;
        if (convertAllData) {
          value = { ...item.json };
        } else {
          value = getDeep(item.json, sourceKey);
          if (value === undefined) {
            continue;
          }
        }

        let encoded: string;
        if (dataIsBase64) {
          encoded = typeof value === "string" ? value : "";
        } else if (useRawData && typeof value !== "object") {
          const raw = addBOM && encoding.toLowerCase() === "utf8"
            ? "\uFEFF" + String(value)
            : String(value);
          const buf = Buffer.isEncoding(encoding)
            ? Buffer.from(raw, encoding as BufferEncoding)
            : Buffer.from(raw, "utf8");
          encoded = buf.toString("base64");
        } else {
          const str = JSON.stringify(value);
          const raw = addBOM && encoding.toLowerCase() === "utf8" ? "\uFEFF" + str : str;
          const buf = Buffer.isEncoding(encoding)
            ? Buffer.from(raw, encoding as BufferEncoding)
            : Buffer.from(raw, "utf8");
          encoded = buf.toString("base64");
        }

        const newItem: typeof item = {
          json: { ...item.json },
          binary: { ...(item.binary || {}) },
        };

        const binaryData: IBinaryData = {
          data: encoded,
          mimeType,
        };
        if (fileName) {
          binaryData.fileName = fileName;
        }
        newItem.binary[destinationKey] = binaryData;

        if (convertAllData && !keepSource) {
          newItem.json = {};
        } else if (!convertAllData && !keepSource) {
          deleteDeep(newItem.json, sourceKey);
        }

        output.push(newItem);
      } else {
        throw new Error(`Unrecognized mode: ${mode}`);
      }
    } catch (err) {
      if (continueOnFail) {
        output.push({ json: { ...item.json, error: err instanceof Error ? err.message : String(err) }, binary: item.binary ? { ...item.binary } : undefined });
      } else {
        throw err;
      }
    }
  }

  return [output];
};