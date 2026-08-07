import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";

interface OktaApiError {
  status: number;
  message: string;
}

function buildOktaBaseUrl(cred: Record<string, unknown> | null): string {
  if (!cred?.url) {
    throw new Error("Okta credentials missing: url is required");
  }
  const base = String(cred.url).replace(/\/+$/, "");
  return `${base}/api/v1`;
}

function buildAuthHeader(cred: Record<string, unknown> | null): Record<string, string> {
  if (!cred?.accessToken) {
    throw new Error("Okta credentials missing: accessToken is required");
  }
  return { Authorization: `SSWS ${cred.accessToken}`, "Content-Type": "application/json" };
}

async function oktaFetch(url: string, options: RequestInit): Promise<unknown> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error: OktaApiError = {
      status: response.status,
      message: `Okta API error: ${response.status} ${response.statusText}`,
    };
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function* paginateAll(
  baseUrl: string,
  headers: Record<string, string>,
): AsyncGenerator<Record<string, unknown>> {
  let url: string | null = `${baseUrl}?limit=200`;
  while (url) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw { status: response.status, message: `Okta API error: ${response.status}` };
    }
    const items = (await response.json()) as Record<string, unknown>[];
    for (const item of items) {
      yield item;
    }
    const linkHeader = response.headers.get("link");
    url = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      }
    }
  }
}

function buildProfile(options: Record<string, unknown>): Record<string, unknown> {
  const profile: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    firstName: "firstName",
    lastName: "lastName",
    email: "email",
    login: "login",
    displayName: "displayName",
    city: "city",
    countryCode: "countryCode",
    department: "department",
    manager: "manager",
    managerEmail: "managerEmail",
    organization: "organization",
    site: "site",
    startDate: "startDate",
    timezone: "timezone",
    title: "title",
    userType: "userType",
  };
  for (const [optKey, profileKey] of Object.entries(fieldMap)) {
    if (options[optKey] != null && options[optKey] !== "") {
      profile[profileKey] = options[optKey];
    }
  }
  return profile;
}

export const oktaToolExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const params = node.parameters ?? {};
  const operation = String(params.operation ?? "create");
  const options = (params.options as Record<string, unknown>) ?? {};
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("oktaApi");
  const baseUrl = buildOktaBaseUrl(cred);
  const headers = buildAuthHeader(cred);

  const results: Array<{ json: unknown }> = [];

  for (let idx = 0; idx < inputItems.length; idx++) {
    const item = inputItems[idx];
    const itemJson = (item.json ?? {}) as Record<string, unknown>;

    try {
      switch (operation) {
        case "create": {
          const activate = options.activate !== false;
          const password = options.password as string | undefined;
          const profile = buildProfile(options);

          if (!profile.email && !itemJson.email) {
            throw { status: 400, message: "Okta create user: email is required" };
          }
          if (!profile.login && !itemJson.login) {
            throw { status: 400, message: "Okta create user: login is required" };
          }

          profile.email = profile.email || itemJson.email;
          profile.login = profile.login || itemJson.login;
          profile.firstName = profile.firstName || itemJson.firstName;
          profile.lastName = profile.lastName || itemJson.lastName;

          const body: Record<string, unknown> = { profile };
          if (password) {
            body.credentials = { password: { value: password } };
          }

          const created = await oktaFetch(
            `${baseUrl}/users?activate=${activate}`,
            { method: "POST", headers, body: JSON.stringify(body) },
          );

          results.push({ json: created as Record<string, unknown> });
          break;
        }

        case "get": {
          const userId = String(params.userId ?? itemJson.userId ?? "");
          if (!userId) {
            throw { status: 400, message: "Okta get user: userId is required" };
          }
          const user = await oktaFetch(`${baseUrl}/users/${encodeURIComponent(userId)}`, { headers });
          results.push({ json: user as Record<string, unknown> });
          break;
        }

        case "getAll": {
          const returnAll = params.returnAll === true || params.returnAll === "true";
          const limit = Number(params.limit ?? 50);
          const users: Record<string, unknown>[] = [];

          if (returnAll) {
            for await (const u of paginateAll(`${baseUrl}/users`, headers)) {
              users.push(u);
            }
          } else {
            const response = await fetch(`${baseUrl}/users?limit=${Math.min(limit, 200)}`, { headers });
            if (!response.ok) {
              throw { status: response.status, message: `Okta API error: ${response.status}` };
            }
            const data = (await response.json()) as Record<string, unknown>[];
            users.push(...data.slice(0, limit));
          }

          results.push({ json: users });
          break;
        }

        case "update": {
          const userId = String(params.userId ?? itemJson.userId ?? "");
          if (!userId) {
            throw { status: 400, message: "Okta update user: userId is required" };
          }
          const profile = buildProfile(options);
          const updated = await oktaFetch(
            `${baseUrl}/users/${encodeURIComponent(userId)}`,
            { method: "POST", headers, body: JSON.stringify({ profile }) },
          );
          results.push({ json: updated as Record<string, unknown> });
          break;
        }

        case "delete": {
          const userId = String(params.userId ?? itemJson.userId ?? "");
          if (!userId) {
            throw { status: 400, message: "Okta delete user: userId is required" };
          }
          await oktaFetch(
            `${baseUrl}/users/${encodeURIComponent(userId)}`,
            { method: "DELETE", headers },
          );
          results.push({ json: itemJson });
          break;
        }

        default: {
          throw { status: 400, message: `Unknown operation: ${operation}` };
        }
      }
    } catch (err) {
      if (continueOnFail) {
        results.push({
          json: {
            ...itemJson,
            error: err instanceof Error ? err.message : (err as OktaApiError).message ?? String(err),
          },
        });
      } else {
        throw err;
      }
    }
  }

  return [results.map((item, idx) => withPairedItem({ json: item.json as Record<string, unknown> }, idx))];
};
