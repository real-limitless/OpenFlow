import type { IBinaryData } from "../workflow/types";

/** Resolve inline base64 or a binary-store id to a Buffer. */
export async function binaryToBuffer(bin: IBinaryData): Promise<Buffer> {
  const id = typeof bin.id === "string" ? bin.id.trim() : "";
  if (id) {
    const { getBinary } = await import("./binary");
    const stored = await getBinary(id);
    if (!stored) {
      throw new Error(`Binary store has no object for id ${id}`);
    }
    return stored;
  }
  if (!bin.data) {
    throw new Error("Binary data is empty");
  }
  return Buffer.from(bin.data, "base64");
}

export async function binaryToBase64(bin: IBinaryData): Promise<string> {
  const buf = await binaryToBuffer(bin);
  return buf.toString("base64");
}
