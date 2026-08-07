import type { NodeExecutor } from "@/sdk";

const BASE_URL = "https://api.helpscout.net/v2";

function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out: Partial<Pick<T, K>> = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "" && obj[k] !== 0) {
      out[k] = obj[k];
    }
  }
  return out as Pick<T, K>;
}

export const helpScoutExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "");
  const operation = ctx.getParam<string>("operation", "");
  const cred = await ctx.getCredential("helpScoutOAuth2Api");
  const authToken = cred?.accessToken ?? "";

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
        const raw = ctx.getParam<number>(name, 0);
        const val = typeof raw === "number" ? raw : Number(raw);
        return val;
      };
      const evalBool = (name: string): boolean => {
        return !!ctx.getParam<boolean>(name, false);
      };
      const evalJson = (name: string): Record<string, unknown> | Array<unknown> | null => {
        const val = ctx.getParam<string>(name, "");
        if (!val) return null;
        if (typeof val === "string" && val.startsWith("={{")) {
          return evaluate(val) as Record<string, unknown>;
        }
        try {
          return typeof val === "string" ? JSON.parse(val) : val;
        } catch {
          return null;
        }
      };

      const headers: Record<string, string> = {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      let output: Record<string, unknown> | Array<Record<string, unknown>> | null = null;

      if (resource === "conversation") {
        if (operation === "create") {
          const body: Record<string, unknown> = {
            mailboxId: evalNum("mailboxId"),
            status: evalStr("status") || "active",
            type: evalStr("type") || "email",
            subject: evalStr("subject"),
            customer: evalJson("customer") ?? {},
            threads: (evalJson("threads") as Array<Record<string, unknown>>) ?? [],
          };
          const optionalFields = [
            "createdAt", "closedAt", "assignTo", "tags",
            "fields", "autoReply", "imported", "user",
          ] as const;
          for (const f of optionalFields) {
            if (f === "tags") {
              const raw = ctx.getParam<string>("tags", "");
              if (raw) body[f] = raw.split(",").map((t: string) => t.trim()).filter(Boolean);
            } else if (f === "autoReply" || f === "imported") {
              if (evalBool(f)) body[f] = true;
            } else if (f === "assignTo" || f === "user") {
              const v = evalNum(f);
              if (v > 0) body[f] = v;
            } else if (f === "createdAt" || f === "closedAt") {
              const v = evalStr(f);
              if (v) body[f] = v;
            } else if (f === "fields") {
              const raw = ctx.getParam<string>("fields", "");
              if (raw) {
                try {
                  body[f] = typeof raw === "string" ? JSON.parse(raw) : raw;
                } catch { /* ignore */ }
              }
            }
          }

          const res = await fetch(`${BASE_URL}/conversations`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }

          const location = res.headers.get("Resource-ID");
          if (location) {
            const getRes = await fetch(`${BASE_URL}/conversations/${location}`, { headers });
            if (getRes.ok) {
              const getData = await getRes.json();
              output = (getData as any)._embedded?.conversations?.[0] ?? (getData as any);
            } else {
              output = { id: Number(location) };
            }
          } else {
            output = {};
          }
        } else if (operation === "delete") {
          const id = evalNum("conversationId");
          const res = await fetch(`${BASE_URL}/conversations/${id}`, { method: "DELETE", headers });
          if (!res.ok && res.status !== 204) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          output = {};
        } else if (operation === "get") {
          const id = evalNum("conversationId");
          const res = await fetch(`${BASE_URL}/conversations/${id}`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json();
          output = data as Record<string, unknown>;
        } else if (operation === "getAll") {
          const params = new URLSearchParams();
          for (const [key, val] of Object.entries(
            pick(ctx.getParams() as Record<string, unknown>, [
              "mailboxId", "folderId", "status", "tag", "sortField",
              "sortOrder", "query", "assignedTo", "number", "modifiedSince",
            ]),
          )) {
            if (val !== undefined && val !== null && val !== "" && val !== 0) {
              params.set(key, String(val));
            }
          }
          const qs = params.toString();
          const res = await fetch(`${BASE_URL}/conversations${qs ? `?${qs}` : ""}`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json() as any;
          const conversations = data._embedded?.conversations ?? [];
          output = conversations.map((c: Record<string, unknown>) => ({
            ...c,
            page: data.page?.size ? data.page : undefined,
          }));
        }
      } else if (resource === "customer") {
        if (operation === "create") {
          const body: Record<string, unknown> = {
            firstName: evalStr("firstName"),
            lastName: evalStr("lastName"),
            email: evalStr("email"),
          };
          const optionalFields = [
            "phone", "photoUrl", "jobTitle", "photoType", "background",
            "location", "organization", "gender", "age",
          ] as const;
          for (const f of optionalFields) {
            const v = evalStr(f);
            if (v) body[f] = v;
          }
          for (const f of ["address", "emails", "phones", "websites", "chats", "socialProfiles"] as const) {
            const v = evalJson(f);
            if (v) body[f] = v;
          }

          const res = await fetch(`${BASE_URL}/customers`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }

          const location = res.headers.get("Resource-ID");
          if (location) {
            const getRes = await fetch(`${BASE_URL}/customers/${location}`, { headers });
            if (getRes.ok) {
              const getData = await getRes.json();
              output = getData as Record<string, unknown>;
            } else {
              output = { id: Number(location) };
            }
          } else {
            output = {};
          }
        } else if (operation === "get") {
          const id = evalNum("customerId");
          const res = await fetch(`${BASE_URL}/customers/${id}`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json();
          output = data as Record<string, unknown>;
        } else if (operation === "getAll") {
          const params = new URLSearchParams();
          for (const [key, val] of Object.entries(
            pick(ctx.getParams() as Record<string, unknown>, [
              "firstName", "lastName", "mailboxId", "modifiedSince",
              "query", "sortField", "sortOrder",
            ]),
          )) {
            if (val !== undefined && val !== null && val !== "" && val !== 0) {
              params.set(key, String(val));
            }
          }
          const qs = params.toString();
          const res = await fetch(`${BASE_URL}/customers${qs ? `?${qs}` : ""}`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json() as any;
          const customers = data._embedded?.customers ?? data.customers ?? [];
          output = customers;
        } else if (operation === "getPropertyDefinitions") {
          const res = await fetch(`${BASE_URL}/customers/property-definitions`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json() as any;
          output = data._embedded?.propertyDefinitions ?? data.propertyDefinitions ?? data;
        } else if (operation === "update") {
          const id = evalNum("customerId");
          const updateBodyRaw = ctx.getParam<string>("updateFields", "");
          const body: Record<string, unknown> = {};
          if (updateBodyRaw) {
            try {
              const parsed = typeof updateBodyRaw === "string" ? JSON.parse(updateBodyRaw) : updateBodyRaw;
              Object.assign(body, parsed);
            } catch {
              // fallback to individual fields
            }
          }
          // Also pick individual params that match customer fields
          const singleFields = [
            "firstName", "lastName", "email", "phone", "photoUrl",
            "jobTitle", "photoType", "background", "location", "organization",
          ] as const;
          for (const f of singleFields) {
            const v = ctx.getParam<string>(f, "");
            if (v) body[f] = v;
          }

          const res = await fetch(`${BASE_URL}/customers/${id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ ...body, id: undefined }),
          });

          if (!res.ok && res.status !== 204) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }

          const getRes = await fetch(`${BASE_URL}/customers/${id}`, { headers });
          if (getRes.ok) {
            const getData = await getRes.json();
            output = getData as Record<string, unknown>;
          } else {
            output = { id };
          }
        }
      } else if (resource === "mailbox") {
        if (operation === "get") {
          const id = evalNum("mailboxId");
          const res = await fetch(`${BASE_URL}/mailboxes/${id}`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json();
          output = data as Record<string, unknown>;
        } else if (operation === "getAll") {
          const res = await fetch(`${BASE_URL}/mailboxes`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json() as any;
          output = data._embedded?.mailboxes ?? [];
        }
      } else if (resource === "thread") {
        const convId = evalNum("conversationId");
        if (operation === "create") {
          const body: Record<string, unknown> = {
            customer: evalJson("customer") ?? {},
            text: evalStr("text"),
          };
          const ca = evalStr("createdAt");
          if (ca) body.createdAt = ca;

          const res = await fetch(`${BASE_URL}/conversations/${convId}/chat`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          output = {};
        } else if (operation === "getAll") {
          const res = await fetch(`${BASE_URL}/conversations/${convId}/threads`, { headers });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Help Scout: ${res.status} ${errBody}`);
          }
          const data = await res.json() as any;
          output = data._embedded?.threads ?? [];
        }
      }

      if (Array.isArray(output)) {
        for (const item of output) {
          results.push({ json: item as Record<string, unknown> });
        }
      } else {
        results.push({ json: output ?? {} });
      }
    } catch (err) {
      if (ctx.continueOnFail()) {
        results.push({ json: { error: (err as Error).message }, error: err as Error });
      } else {
        throw err;
      }
    }
  }

  return [results];
};
