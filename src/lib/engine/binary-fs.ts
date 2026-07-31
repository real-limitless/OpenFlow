import { promises as fs } from "fs";
import { join } from "path";
import type { BinaryStore } from "./binary-store";
import type { BinaryRef } from "./binary-types";

export function createFsBinaryStore(storageDir: string): BinaryStore {
  const dataPath = (id: string) => join(storageDir, id);
  const metaPath = (id: string) => join(storageDir, `${id}.meta.json`);

  return {
    async put(id, buffer, meta) {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(dataPath(id), buffer);
      await fs.writeFile(metaPath(id), JSON.stringify(meta), "utf8");
    },
    async get(id) {
      try {
        return await fs.readFile(dataPath(id));
      } catch {
        return null;
      }
    },
    async getMeta(id) {
      try {
        const raw = await fs.readFile(metaPath(id), "utf8");
        return JSON.parse(raw) as BinaryRef;
      } catch {
        return null;
      }
    },
    async delete(id) {
      await fs.unlink(dataPath(id)).catch(() => undefined);
      await fs.unlink(metaPath(id)).catch(() => undefined);
    },
  };
}
