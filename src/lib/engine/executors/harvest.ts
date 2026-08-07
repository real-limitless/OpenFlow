import type { NodeExecutor } from "@/sdk";

const BASE_URL = "https://api.harvestapp.com/v2";

function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const out: Partial<Pick<T, K>> = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "" && obj[k] !== 0) {
      out[k] = obj[k];
    }
  }
  return out as Pick<T, K>;
}

function toUrl(parts: string[], query?: Record<string, string | number | undefined>): string {
  let url = `${BASE_URL}/${parts.join("/")}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, String(v));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function fetchAllPages(
  url: string,
  headers: Record<string, string>,
  returnAll: boolean,
): Promise<{ results: unknown[]; pageCount: number }> {
  const allResults: unknown[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const pageUrl = url.includes("?")
      ? `${url}&page=${page}&per_page=100`
      : `${url}?page=${page}&per_page=100`;
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Harvest API: ${res.status} ${body}`);
    }
    const data = (await res.json()) as {
      [key: string]: unknown;
      total_pages?: number;
      per_page?: number;
      total_entries?: number;
    };
    const key = Object.keys(data).find(
      (k) => Array.isArray(data[k]) && k !== "per_page",
    );
    const items = key ? (data[key] as unknown[]) : [];
    pageCount = data.total_pages ?? 1;
    allResults.push(...items);
    page++;
  } while (returnAll && page <= pageCount);

  return { results: allResults, pageCount: returnAll ? pageCount : 1 };
}

export const harvestExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "");
  const operation = ctx.getParam<string>("operation", "");

  const cred =
    (await ctx.getCredential("harvestApi")) ??
    (await ctx.getCredential("harvestOAuth2Api"));
  const accessToken = String(
    cred?.accessToken ?? cred?.apiToken ?? cred?.access_token ?? "",
  );
  const accountId = String(cred?.accountId ?? cred?.account_id ?? "");

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Harvest-Account-ID": accountId,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const resourceToEndpoint: Record<string, string> = {
    Client: "clients",
    Company: "company",
    Contact: "contacts",
    Estimate: "estimates",
    Expense: "expenses",
    Invoice: "invoices",
    Project: "projects",
    Task: "tasks",
    "Time Entry": "time_entries",
    User: "users",
  };

  const endpoint = resourceToEndpoint[resource];
  if (!endpoint) {
    throw new Error(`Harvest: unknown resource "${resource}"`);
  }

  const results = [];

  for (const item of items) {
    try {
      const json = item.json as Record<string, unknown>;
      const evaluate = (expr: string) => ctx.evaluate(expr, json ?? {});

      const evalStr = (name: string): string => {
        const val = ctx.getParam<string>(name, "");
        if (typeof val === "string" && val.startsWith("={{")) {
          return String(evaluate(val) ?? "");
        }
        return val ?? "";
      };
      const evalNum = (name: string): number => {
        const raw = ctx.getParam<number | string>(name, 0);
        if (typeof raw === "number") return raw;
        if (typeof raw === "string" && raw.startsWith("={{")) {
          const evaled = evaluate(raw);
          return typeof evaled === "number" ? evaled : Number(evaled);
        }
        return Number(raw);
      };
      const evalBool = (name: string): boolean => {
        return !!ctx.getParam<boolean>(name, false);
      };

      const returnAll = evalBool("returnAll");
      const limit = evalNum("limit") || 50;
      const filters = ctx.getParam<Record<string, unknown>>("filters", {});

      let output: unknown = null;

      if (operation === "getAll") {
        const query: Record<string, string | number | undefined> = {
          per_page: returnAll ? 100 : limit,
        };
        if (filters && typeof filters === "object") {
          for (const [k, v] of Object.entries(filters)) {
            if (v !== undefined && v !== null && v !== "") {
              query[k] = String(v);
            }
          }
        }
        const data = await fetchAllPages(
          toUrl([endpoint], query),
          authHeaders,
          returnAll,
        );
        output = data;
      } else if (operation === "get") {
        if (resource === "Company") {
          const res = await fetch(toUrl([endpoint]), { headers: authHeaders });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Harvest API: ${res.status} ${body}`);
          }
          output = await res.json();
        } else if (resource === "User") {
          const userId = evalNum("userId");
          if (userId > 0) {
            const res = await fetch(toUrl([endpoint, String(userId)]), {
              headers: authHeaders,
            });
            if (!res.ok) {
              const body = await res.text();
              throw new Error(`Harvest API: ${res.status} ${body}`);
            }
            output = await res.json();
          } else {
            throw new Error("Harvest: userId is required for User get");
          }
        } else {
          const singleId = evalNum(`${resource.toLowerCase()}Id`);
          const id =
            singleId > 0 ? singleId : evalNum(`${resource.charAt(0).toLowerCase()}${resource.slice(1)}Id`);
          if (!id) {
            throw new Error(`Harvest: ${resource} ID is required for get`);
          }
          const res = await fetch(toUrl([endpoint, String(id)]), {
            headers: authHeaders,
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Harvest API: ${res.status} ${body}`);
          }
          output = await res.json();
        }
      } else if (operation === "getMe") {
        const res = await fetch(toUrl(["users", "me"]), {
          headers: authHeaders,
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Harvest API: ${res.status} ${body}`);
        }
        output = await res.json();
      } else if (operation === "create") {
        const updateFields = ctx.getParam<Record<string, unknown>>(
          "updateFields",
          {},
        );
        const additionalFields = ctx.getParam<Record<string, unknown>>(
          "additionalFields",
          {},
        );

        let body: Record<string, unknown> = {};

        if (resource === "Time Entry") {
          body = {
            project_id: evalNum("project_id"),
            task_id: evalNum("task_id"),
            spent_date: evalStr("spent_date"),
          };
          const startedTime = evalStr("started_time");
          const endedTime = evalStr("ended_time");
          if (startedTime && endedTime) {
            body.started_time = startedTime;
            body.ended_time = endedTime;
          } else {
            body.hours = evalNum("hours");
          }
        } else {
          if (updateFields && typeof updateFields === "object") {
            body = { ...updateFields } as Record<string, unknown>;
          }
          if (additionalFields && typeof additionalFields === "object") {
            Object.assign(body, additionalFields);
          }
        }

        const res = await fetch(toUrl([endpoint]), {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Harvest API: ${res.status} ${errBody}`);
        }
        output = await res.json();
      } else if (operation === "update") {
        const singleId = evalNum(`${resource.toLowerCase()}Id`);
        const id =
          singleId > 0
            ? singleId
            : evalNum(
                `${resource.charAt(0).toLowerCase()}${resource.slice(1)}Id`,
              );
        const updateFields = ctx.getParam<Record<string, unknown>>(
          "updateFields",
          {},
        );
        const additionalFields = ctx.getParam<Record<string, unknown>>(
          "additionalFields",
          {},
        );

        let body: Record<string, unknown> = {};
        if (updateFields && typeof updateFields === "object") {
          body = { ...updateFields } as Record<string, unknown>;
        }
        if (additionalFields && typeof additionalFields === "object") {
          Object.assign(body, additionalFields);
        }

        const res = await fetch(toUrl([endpoint, String(id)]), {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Harvest API: ${res.status} ${errBody}`);
        }
        output = await res.json();
      } else if (operation === "delete") {
        const idNames: Record<string, string> = {
          Client: "client_id",
          Contact: "contact_id",
          Estimate: "estimate_id",
          Expense: "expense_id",
          Invoice: "invoice_id",
          Project: "project_id",
          Task: "task_id",
          "Time Entry": "timeEntryId",
          User: "user_id",
        };
        const idParam = idNames[resource] ?? `${resource.toLowerCase()}_id`;
        const singleId = evalNum(idParam);
        const res = await fetch(toUrl([endpoint, String(singleId)]), {
          method: "DELETE",
          headers: authHeaders,
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Harvest API: ${res.status} ${errBody}`);
        }
        output = { success: true };
      } else if (operation === "restart") {
        const timeEntryId = evalNum("timeEntryId");
        const res = await fetch(
          toUrl([endpoint, String(timeEntryId), "restart"]),
          { method: "PATCH", headers: authHeaders },
        );
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Harvest API: ${res.status} ${errBody}`);
        }
        output = await res.json();
      } else if (operation === "stop") {
        const timeEntryId = evalNum("timeEntryId");
        const res = await fetch(
          toUrl([endpoint, String(timeEntryId), "stop"]),
          { method: "PATCH", headers: authHeaders },
        );
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Harvest API: ${res.status} ${errBody}`);
        }
        output = await res.json();
      } else if (operation === "deleteExternalReference") {
        const timeEntryId = evalNum("timeEntryId");
        const res = await fetch(
          toUrl([endpoint, String(timeEntryId), "delete-external-reference"]),
          { method: "DELETE", headers: authHeaders },
        );
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Harvest API: ${res.status} ${errBody}`);
        }
        output = { success: true };
      }

      results.push({
        json: (output ?? {}) as Record<string, unknown>,
        pairedItem: item.pairedItem ?? {
          item: results.length,
          input: 0,
        },
      });
    } catch (err) {
      if (ctx.continueOnFail()) {
        results.push({
          json: { error: (err as Error).message },
          error: err as Error,
        });
      } else {
        throw err;
      }
    }
  }

  return [results];
};
