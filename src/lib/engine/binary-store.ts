import type { BinaryRef } from "./binary-types";

export type { BinaryRef } from "./binary-types";

export interface BinaryStore {
  put(id: string, buffer: Buffer, meta: BinaryRef): Promise<void>;
  get(id: string): Promise<Buffer | null>;
  getMeta(id: string): Promise<BinaryRef | null>;
  delete(id: string): Promise<void>;
}
