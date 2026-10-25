import fs from "node:fs";

export type EnvSecretSource = "file" | "env" | "none";

export type EnvSecret = {
  value: string | null;
  source: EnvSecretSource;
  /** Error code when a `_FILE` path was set but could not be read. No file contents. */
  fileError?: string;
  /** Both the inline variable and `_FILE` were set. The file wins. */
  bothSet?: boolean;
  /** Inline variable was set and ignored because this secret is file-only. */
  ignoredInline?: boolean;
};

export type ReadEnvSecretOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (filePath: string) => string;
  /**
   * When true, the inline variable is never used as the secret.
   * `NAME_FILE` is the only source. A set inline value is reported as ignoredInline.
   */
  fileOnly?: boolean;
};

function defaultRead(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return err.code;
  }
  return "unreadable";
}

/**
 * Read a secret the way sibling deploys pass tokens: `NAME` or `NAME_FILE`.
 * A non-empty `NAME_FILE` wins and is trimmed. A failed file read does not
 * fall back to the inline value. The returned value is for the caller to
 * hash or compare; this helper does not log it.
 */
export function readEnvSecret(name: string, opts: ReadEnvSecretOptions = {}): EnvSecret {
  const env = opts.env ?? process.env;
  const readFile = opts.readFile ?? defaultRead;
  const inlineSet = Boolean(env[name]?.trim());
  const filePath = env[`${name}_FILE`]?.trim();

  if (filePath) {
    try {
      const value = readFile(filePath).trim();
      if (!value) {
        return {
          value: null,
          source: "file",
          fileError: "empty",
          bothSet: inlineSet && !opts.fileOnly,
        };
      }
      return {
        value,
        source: "file",
        bothSet: inlineSet && !opts.fileOnly,
      };
    } catch (err) {
      return {
        value: null,
        source: "file",
        fileError: errorCode(err),
        bothSet: inlineSet && !opts.fileOnly,
      };
    }
  }

  if (opts.fileOnly) {
    return { value: null, source: "none", ignoredInline: inlineSet };
  }

  const inline = env[name]?.trim() ?? "";
  if (!inline) return { value: null, source: "none" };
  return { value: inline, source: "env" };
}
