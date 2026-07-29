import type { IBinaryData } from "../workflow/types";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { config } from "../../config";

export interface BinaryRef {
  id: string;
  fileName?: string;
  mimeType: string;
  fileExtension?: string;
  fileSize: number;
}

const refs = new Map<string, BinaryRef>();

export async function storeBinary(
  data: string,
  metadata: { mimeType: string; fileName?: string; fileExtension?: string },
): Promise<BinaryRef> {
  const id = randomUUID();
  const buffer = Buffer.from(data, "base64");
  const fileSize = buffer.length;

  await fs.mkdir(config.binary.storageDir, { recursive: true });
  await fs.writeFile(join(config.binary.storageDir, id), buffer);

  const ref: BinaryRef = {
    id,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    fileExtension: metadata.fileExtension,
    fileSize,
  };
  refs.set(id, ref);
  return ref;
}

export async function getBinary(id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(join(config.binary.storageDir, id));
  } catch {
    return null;
  }
}

export async function getBinaryData(id: string): Promise<IBinaryData | null> {
  const ref = refs.get(id);
  if (!ref) return null;
  const buffer = await getBinary(id);
  if (!buffer) return null;
  return {
    data: buffer.toString("base64"),
    mimeType: ref.mimeType,
    fileName: ref.fileName,
    fileExtension: ref.fileExtension,
    fileSize: ref.fileSize,
  };
}

export function getBinaryRef(id: string): BinaryRef | undefined {
  return refs.get(id);
}

export async function deleteBinary(id: string): Promise<void> {
  try {
    await fs.unlink(join(config.binary.storageDir, id));
    refs.delete(id);
  } catch {
    // already deleted
  }
}

export function toIBinaryData(ref: BinaryRef, data: string): IBinaryData {
  return {
    data,
    mimeType: ref.mimeType,
    fileName: ref.fileName,
    fileExtension: ref.fileExtension,
    fileSize: ref.fileSize,
  };
}
