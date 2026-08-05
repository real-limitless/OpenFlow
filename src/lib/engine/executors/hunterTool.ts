import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

const API_BASE = "https://api.hunter.io/v2";

export const hunterToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const operation = ctx.getParam<string>("operation", "domainSearch");
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, operation, itemJson);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("hunterApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Hunter: hunterApi credential is not configured");
  }
  return apiKey;
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  return raw;
}

async function runOperation(
  ctx: ExecutionContext,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === "domainSearch") {
    return domainSearch(ctx, itemJson);
  }
  if (operation === "emailFinder") {
    return emailFinder(ctx, itemJson);
  }
  if (operation === "emailVerifier") {
    return emailVerifier(ctx, itemJson);
  }
  throw new Error(`Hunter: unsupported operation "${operation}"`);
}

async function domainSearch(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const domain = String(ctx.getParam<string>("domain", "") ?? "");
  if (!domain) throw new Error("Hunter: domain is required for domainSearch");
  const onlyEmails = ctx.getParam<boolean>("onlyEmails", true) !== false;
  const returnAll = Boolean(ctx.getParam<boolean>("returnAll", false));
  const limit = Number(ctx.getParam<number>("limit", 100));
  const filters = ctx.getParam<Record<string, unknown>>("filters", {});
  const filterType = String(filters.type ?? "");
  const filterSeniority = filters.seniority;
  const filterDepartment = filters.department;

  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("domain", domain);

  if (returnAll) {
    let allEmails: unknown[] = [];
    let company: Record<string, unknown> | null = null;
    let offset = 0;
    const pageLimit = 100;

    while (true) {
      params.set("offset", String(offset));
      params.set("limit", String(pageLimit));
      if (filterType) params.set("type", filterType);
      if (filterSeniority) {
        const arr = Array.isArray(filterSeniority) ? filterSeniority : [filterSeniority];
        for (const s of arr) params.append("seniority", String(s));
      }
      if (filterDepartment) {
        const arr = Array.isArray(filterDepartment) ? filterDepartment : [filterDepartment];
        for (const d of arr) params.append("department", String(d));
      }
      const body = await hunterRequest(API_BASE + "/domain-search?" + params.toString());
      const data = asObj(body.data ?? body);
      const emails = (data.emails as unknown[]) ?? [];
      if (!company && data) {
        company = {
          domain: data.domain,
          organization: data.organization,
          country: data.country,
          industry: data.industry,
          company_type: data.company_type,
          linkedin: data.linkedin_url,
          twitter: data.twitter_url,
          phone: data.phone_number,
          technologies: data.technologies,
        };
      }
      allEmails = allEmails.concat(emails);
      const meta = asObj(data.meta ?? body.meta ?? {});
      const total = Number(meta.results ?? meta.total ?? 0);
      offset += emails.length;
      if (offset >= total || emails.length === 0) break;
    }

    if (onlyEmails) {
      return { emails: applyFilters(allEmails, filterType, filterSeniority, filterDepartment) };
    }
    return {
      ...company,
      emails: applyFilters(allEmails, filterType, filterSeniority, filterDepartment),
    };
  }

  params.set("limit", String(Math.max(1, Math.min(Math.floor(limit), 100))));
  if (filterType) params.set("type", filterType);
  if (filterSeniority) {
    const arr = Array.isArray(filterSeniority) ? filterSeniority : [filterSeniority];
    for (const s of arr) params.append("seniority", String(s));
  }
  if (filterDepartment) {
    const arr = Array.isArray(filterDepartment) ? filterDepartment : [filterDepartment];
    for (const d of arr) params.append("department", String(d));
  }

  const body = await hunterRequest(API_BASE + "/domain-search?" + params.toString());
  const data = asObj(body.data ?? body);

  if (onlyEmails) {
    return { emails: data.emails ?? [] };
  }

  return {
    domain: data.domain,
    organization: data.organization,
    country: data.country,
    industry: data.industry,
    company_type: data.company_type,
    linkedin: data.linkedin_url,
    twitter: data.twitter_url,
    phone: data.phone_number,
    technologies: data.technologies,
    emails: data.emails ?? [],
  };
}

function applyFilters(
  emails: unknown[],
  filterType: string,
  filterSeniority: unknown,
  filterDepartment: unknown,
): unknown[] {
  let filtered = emails;
  if (filterType) {
    filtered = filtered.filter((e: unknown) => {
      const email = e as Record<string, unknown>;
      return String(email.type ?? "") === filterType;
    });
  }
  const seniorityArr = Array.isArray(filterSeniority)
    ? filterSeniority.map(String)
    : filterSeniority
      ? [String(filterSeniority)]
      : [];
  if (seniorityArr.length > 0) {
    filtered = filtered.filter((e: unknown) => {
      const email = e as Record<string, unknown>;
      return seniorityArr.includes(String(email.seniority ?? ""));
    });
  }
  const deptArr = Array.isArray(filterDepartment)
    ? filterDepartment.map(String)
    : filterDepartment
      ? [String(filterDepartment)]
      : [];
  if (deptArr.length > 0) {
    filtered = filtered.filter((e: unknown) => {
      const email = e as Record<string, unknown>;
      return deptArr.includes(String(email.department ?? ""));
    });
  }
  return filtered;
}

async function emailFinder(
  ctx: ExecutionContext,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const domain = String(ctx.getParam<string>("domain", "") ?? "");
  const firstname = String(ctx.getParam<string>("firstname", "") ?? "");
  const lastname = String(ctx.getParam<string>("lastname", "") ?? "");
  if (!domain || !firstname || !lastname) {
    throw new Error("Hunter: domain, firstname, and lastname are required for emailFinder");
  }

  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("domain", domain);
  params.set("first_name", firstname);
  params.set("last_name", lastname);

  const body = await hunterRequest(API_BASE + "/email-finder?" + params.toString());
  const data = asObj(body.data ?? body);
  return data as Record<string, unknown>;
}

async function emailVerifier(
  ctx: ExecutionContext,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const email = String(ctx.getParam<string>("email", "") ?? "");
  if (!email) throw new Error("Hunter: email is required for emailVerifier");

  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("email", email);

  const body = await hunterRequest(API_BASE + "/email-verifier?" + params.toString());
  const data = asObj(body.data ?? body);
  return data as Record<string, unknown>;
}

async function hunterRequest(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
    }
    const obj = asObj(parsed);
    if (response.status === 429) {
      throw new Error("Hunter: rate limited (HTTP 429)");
    }
    if (response.status < 200 || response.status >= 300) {
      const desc = obj.message ? String(obj.message) : `HTTP ${response.status}`;
      throw new Error(`Hunter: ${desc}`);
    }
    if (obj.errors) {
      const errors = obj.errors as Array<{ detail?: string }>;
      const desc = errors[0]?.detail ?? "API error";
      throw new Error(`Hunter: ${desc}`);
    }
    return obj;
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}
