import type { AwsCredentials } from "./sigv4";

export type AwsCredentialInput = {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
};

type Cached = { creds: AwsCredentials; expiresAt: number };
let cachedIam: Cached | null = null;

export async function resolveAwsCredentials(
  config: AwsCredentialInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AwsCredentials> {
  if (config.accessKeyId?.trim() && config.secretAccessKey?.trim()) {
    return {
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
      sessionToken: config.sessionToken?.trim() || undefined,
      source: "static",
    };
  }

  const envId = env.AWS_ACCESS_KEY_ID?.trim();
  const envSecret = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (envId && envSecret) {
    return {
      accessKeyId: envId,
      secretAccessKey: envSecret,
      sessionToken: env.AWS_SESSION_TOKEN?.trim() || undefined,
      source: "env",
    };
  }

  if (cachedIam && cachedIam.expiresAt > Date.now() + 60_000) {
    return cachedIam.creds;
  }

  const ecs = await tryEcsCredentials(env);
  if (ecs) {
    cachedIam = ecs;
    return ecs.creds;
  }

  const web = await tryWebIdentity(config.region || env.AWS_REGION || "us-east-1", env);
  if (web) {
    cachedIam = web;
    return web.creds;
  }

  throw new Error(
    "AWS Secrets Manager needs static access keys, AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, " +
      "or an IAM role (ECS task credentials or AWS_WEB_IDENTITY_TOKEN_FILE / IRSA).",
  );
}

export function clearAwsCredentialCache() {
  cachedIam = null;
}

async function tryEcsCredentials(env: NodeJS.ProcessEnv): Promise<Cached | null> {
  const relative = env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim();
  const full = env.AWS_CONTAINER_CREDENTIALS_FULL_URI?.trim();
  if (!relative && !full) return null;
  const url = full || `http://169.254.170.2${relative}`;
  try {
    const headers: Record<string, string> = {};
    const token = env.AWS_CONTAINER_AUTHORIZATION_TOKEN?.trim();
    if (token) headers.Authorization = token;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      AccessKeyId?: string;
      SecretAccessKey?: string;
      Token?: string;
      Expiration?: string;
    };
    if (!body.AccessKeyId || !body.SecretAccessKey) return null;
    const expiresAt = body.Expiration ? Date.parse(body.Expiration) : Date.now() + 15 * 60_000;
    return {
      creds: {
        accessKeyId: body.AccessKeyId,
        secretAccessKey: body.SecretAccessKey,
        sessionToken: body.Token,
        source: "ecs",
      },
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 15 * 60_000,
    };
  } catch {
    return null;
  }
}

async function tryWebIdentity(region: string, env: NodeJS.ProcessEnv): Promise<Cached | null> {
  const tokenFile = env.AWS_WEB_IDENTITY_TOKEN_FILE?.trim();
  const roleArn = env.AWS_ROLE_ARN?.trim();
  if (!tokenFile || !roleArn) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const token = (await readFile(tokenFile, "utf8")).trim();
    if (!token) return null;
    const sessionName = (env.AWS_ROLE_SESSION_NAME?.trim() || "openflow").slice(0, 64);
    const endpoint = `https://sts.${region}.amazonaws.com/`;
    const params = new URLSearchParams({
      Action: "AssumeRoleWithWebIdentity",
      Version: "2011-06-15",
      RoleArn: roleArn,
      RoleSessionName: sessionName,
      WebIdentityToken: token,
    });
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const accessKeyId = xml.match(/<AccessKeyId>([^<]+)<\/AccessKeyId>/)?.[1];
    const secretAccessKey = xml.match(/<SecretAccessKey>([^<]+)<\/SecretAccessKey>/)?.[1];
    const sessionToken = xml.match(/<SessionToken>([^<]+)<\/SessionToken>/)?.[1];
    const expiration = xml.match(/<Expiration>([^<]+)<\/Expiration>/)?.[1];
    if (!accessKeyId || !secretAccessKey || !sessionToken) return null;
    const expiresAt = expiration ? Date.parse(expiration) : Date.now() + 15 * 60_000;
    return {
      creds: { accessKeyId, secretAccessKey, sessionToken, source: "web-identity" },
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 15 * 60_000,
    };
  } catch {
    return null;
  }
}
