/**
 * UI field catalog for credential types.
 * Executors read these keys from decrypted credential data.
 */

export type CredentialFieldType = "text" | "password" | "number" | "textarea";

export interface CredentialFieldDef {
  key: string;
  label: string;
  type?: CredentialFieldType;
  placeholder?: string;
  required?: boolean;
}

export interface CredentialTypeDef {
  name: string;
  displayName: string;
  fields: CredentialFieldDef[];
}

export interface CredentialMeta {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  shared?: boolean;
  projectId?: string;
}

const CATALOG: Record<string, CredentialTypeDef> = {
  httpBasicAuth: {
    name: "httpBasicAuth",
    displayName: "HTTP Basic Auth",
    fields: [
      { key: "user", label: "Username", required: true },
      { key: "password", label: "Password", type: "password", required: true },
    ],
  },
  httpHeaderAuth: {
    name: "httpHeaderAuth",
    displayName: "HTTP Header Auth",
    fields: [
      { key: "name", label: "Header Name", required: true, placeholder: "Authorization" },
      { key: "value", label: "Header Value", type: "password", required: true },
    ],
  },
  httpQueryAuth: {
    name: "httpQueryAuth",
    displayName: "HTTP Query Auth",
    fields: [
      { key: "name", label: "Parameter Name", required: true },
      { key: "value", label: "Parameter Value", type: "password", required: true },
    ],
  },
  httpBearerAuth: {
    name: "httpBearerAuth",
    displayName: "HTTP Bearer Auth",
    fields: [{ key: "token", label: "Token", type: "password", required: true }],
  },
  httpMultipleHeadersAuth: {
    name: "httpMultipleHeadersAuth",
    displayName: "Multiple Headers",
    fields: [
      {
        key: "headers",
        label: "Headers (JSON object)",
        type: "textarea",
        required: true,
        placeholder: '{\n  "X-RapidAPI-Key": "…",\n  "X-RapidAPI-Host": "…"\n}',
      },
    ],
  },
  httpCustomAuth: {
    name: "httpCustomAuth",
    displayName: "Custom Headers",
    fields: [
      {
        key: "headers",
        label: "Headers (JSON object)",
        type: "textarea",
        required: true,
        placeholder: '{\n  "X-Api-Key": "…"\n}',
      },
    ],
  },
  ftp: {
    name: "ftp",
    displayName: "FTP",
    fields: [
      { key: "host", label: "Host", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "21" },
      { key: "username", label: "Username", required: true },
      { key: "password", label: "Password", type: "password" },
    ],
  },
  sftp: {
    name: "sftp",
    displayName: "SFTP",
    fields: [
      { key: "host", label: "Host", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "22" },
      { key: "username", label: "Username", required: true },
      { key: "password", label: "Password", type: "password" },
      { key: "privateKey", label: "Private Key (OpenSSH)", type: "textarea" },
      { key: "passphrase", label: "Passphrase", type: "password" },
    ],
  },
  smtp: {
    name: "smtp",
    displayName: "SMTP",
    fields: [
      { key: "host", label: "Host", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "587" },
      { key: "user", label: "User", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "fromEmail", label: "From Email" },
    ],
  },
  openAiApi: {
    name: "openAiApi",
    displayName: "OpenAI API",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "url", label: "Base URL", placeholder: "https://api.openai.com/v1" },
    ],
  },
  mcpClientApi: {
    name: "mcpClientApi",
    displayName: "MCP Client (STDIO)",
    fields: [
      { key: "command", label: "Command", required: true, placeholder: "npx" },
      { key: "args", label: "Args (space-separated or JSON array)", type: "textarea" },
      { key: "env", label: "Env (JSON object)", type: "textarea" },
    ],
  },
  mcpClientHttpApi: {
    name: "mcpClientHttpApi",
    displayName: "MCP Client (HTTP)",
    fields: [
      { key: "url", label: "Server URL", required: true },
      { key: "headers", label: "Headers (JSON object)", type: "textarea" },
    ],
  },
  telegramApi: {
    name: "telegramApi",
    displayName: "Telegram",
    fields: [{ key: "accessToken", label: "Access Token", type: "password", required: true }],
  },
  anthropicApi: {
    name: "anthropicApi",
    displayName: "Anthropic",
    fields: [{ key: "apiKey", label: "API Key", type: "password", required: true }],
  },
  ollamaApi: {
    name: "ollamaApi",
    displayName: "Ollama",
    fields: [{ key: "baseUrl", label: "Base URL", placeholder: "http://localhost:11434" }],
  },
  openRouterApi: {
    name: "openRouterApi",
    displayName: "OpenRouter",
    fields: [{ key: "apiKey", label: "API Key", type: "password", required: true }],
  },
  postgres: {
    name: "postgres",
    displayName: "Postgres",
    fields: [
      { key: "host", label: "Host", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "5432" },
      { key: "database", label: "Database", required: true },
      { key: "user", label: "User", required: true },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "ssl", label: "SSL (true/false)", placeholder: "false" },
    ],
  },
  redis: {
    name: "redis",
    displayName: "Redis",
    fields: [
      { key: "host", label: "Host", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "6379" },
      { key: "password", label: "Password", type: "password" },
      { key: "database", label: "Database index", type: "number", placeholder: "0" },
    ],
  },
};

/** Generic fallback when type has no dedicated form. */
const GENERIC_FIELDS: CredentialFieldDef[] = [
  {
    key: "data",
    label: "Credential data (JSON object)",
    type: "textarea",
    required: true,
    placeholder: '{\n  "apiKey": "…"\n}',
  },
];

export function getCredentialTypeDef(type: string): CredentialTypeDef {
  if (CATALOG[type]) return CATALOG[type];
  return {
    name: type,
    displayName: humanizeType(type),
    fields: GENERIC_FIELDS,
  };
}

export function listCredentialTypes(): CredentialTypeDef[] {
  return Object.values(CATALOG).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function humanizeType(type: string): string {
  return type
    .replace(/Api$/, " API")
    .replace(/OAuth2/gi, " OAuth2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Normalize form field values into the object stored encrypted.
 * Handles JSON textareas and generic `data` blob.
 */
export function buildCredentialData(
  type: string,
  fields: Record<string, string>,
): Record<string, unknown> {
  const def = getCredentialTypeDef(type);
  const out: Record<string, unknown> = {};

  if (def.fields.length === 1 && def.fields[0].key === "data") {
    const raw = fields.data?.trim() ?? "";
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error("Credential data must be a JSON object");
    }
    throw new Error("Credential data must be a JSON object");
  }

  for (const f of def.fields) {
    const raw = fields[f.key];
    if (raw == null || raw === "") continue;
    if (f.type === "number") {
      const n = Number(raw);
      out[f.key] = Number.isFinite(n) ? n : raw;
      continue;
    }
    if (f.type === "textarea" && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try {
        out[f.key] = JSON.parse(raw);
        continue;
      } catch {
        /* keep as string */
      }
    }
    out[f.key] = raw;
  }

  // httpMultipleHeadersAuth: accept headers as object
  if (type === "httpMultipleHeadersAuth" && typeof out.headers === "string") {
    try {
      out.headers = JSON.parse(out.headers);
    } catch {
      /* leave string */
    }
  }

  return out;
}
