import { config } from "../config";
import {
  createFsBinaryStore,
  createS3BinaryStore,
  setBinaryStore,
} from "../lib/engine/binary";

/**
 * Configure engine binary storage from env.
 * BINARY_STORAGE=fs|s3 (default fs)
 */
export function initBinaryStorage(): void {
  const mode = (process.env.BINARY_STORAGE ?? "fs").trim().toLowerCase();

  if (mode === "s3") {
    const bucket = process.env.BINARY_S3_BUCKET?.trim();
    const accessKeyId = process.env.BINARY_S3_ACCESS_KEY?.trim() ?? "";
    const secretAccessKey = process.env.BINARY_S3_SECRET_KEY?.trim() ?? "";
    if (!bucket || !accessKeyId || !secretAccessKey) {
      console.warn(
        "[openflow] BINARY_STORAGE=s3 requires BINARY_S3_BUCKET, BINARY_S3_ACCESS_KEY, BINARY_S3_SECRET_KEY — falling back to fs",
      );
      setBinaryStore(createFsBinaryStore(config.binary.storageDir));
      return;
    }
    setBinaryStore(
      createS3BinaryStore({
        bucket,
        region: process.env.BINARY_S3_REGION?.trim() || "us-east-1",
        endpoint: process.env.BINARY_S3_ENDPOINT?.trim() || undefined,
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.BINARY_S3_SESSION_TOKEN?.trim() || undefined,
        prefix: process.env.BINARY_S3_PREFIX?.trim() || "openflow/binary/",
        forcePathStyle:
          process.env.BINARY_S3_FORCE_PATH_STYLE !== "false" &&
          process.env.BINARY_S3_FORCE_PATH_STYLE !== "0",
      }),
    );
    console.log(`[openflow] Binary storage: s3 bucket=${bucket}`);
    return;
  }

  setBinaryStore(createFsBinaryStore(config.binary.storageDir));
}
