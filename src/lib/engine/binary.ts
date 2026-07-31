import type { IBinaryData } from "../workflow/types";
import { randomUUID } from "crypto";
import { config } from "../../config";
import type { BinaryStore } from "./binary-store";
import type { BinaryRef } from "./binary-types";
import { createFsBinaryStore } from "./binary-fs";

export type { BinaryRef } from "./binary-types";
export type { BinaryStore } from "./binary-store";
export { createFsBinaryStore } from "./binary-fs";
export { createS3BinaryStore } from "./binary-s3";
export type { S3BinaryStoreConfig } from "./binary-s3";

const memoryCache = new Map<string, BinaryRef>();

let store: BinaryStore = createFsBinaryStore(config.binary.storageDir);

/** Replace the active binary backend (FS default; S3/MinIO in production). */
export function setBinaryStore(next: BinaryStore): void {
  store = next;
  memoryCache.clear();
}

export function getBinaryStore(): BinaryStore {
  return store;
}

export async function storeBinary(
  data: string,
  metadata: { mimeType: string; fileName?: string; fileExtension?: string },
): Promise<BinaryRef> {
  const id = randomUUID();
  const buffer = Buffer.from(data, "base64");
  const ref: BinaryRef = {
    id,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    fileExtension: metadata.fileExtension,
    fileSize: buffer.length,
  };
  await store.put(id, buffer, ref);
  memoryCache.set(id, ref);
  return ref;
}

export async function getBinary(id: string): Promise<Buffer | null> {
  return store.get(id);
}

export async function getBinaryData(id: string): Promise<IBinaryData | null> {
  let ref = memoryCache.get(id) ?? undefined;
  if (!ref) {
    const meta = await store.getMeta(id);
    if (!meta) return null;
    ref = meta;
    memoryCache.set(id, ref);
  }
  const buffer = await store.get(id);
  if (!buffer) return null;
  return {
    data: buffer.toString("base64"),
    mimeType: ref.mimeType,
    fileName: ref.fileName,
    fileExtension: ref.fileExtension,
    fileSize: ref.fileSize || buffer.length,
  };
}

export function getBinaryRef(id: string): BinaryRef | undefined {
  return memoryCache.get(id);
}

export async function getBinaryRefAsync(id: string): Promise<BinaryRef | null> {
  const cached = memoryCache.get(id);
  if (cached) return cached;
  const meta = await store.getMeta(id);
  if (meta) memoryCache.set(id, meta);
  return meta;
}

export async function deleteBinary(id: string): Promise<void> {
  await store.delete(id);
  memoryCache.delete(id);
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
