import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

const API_VERSION = "/api/v1";

async function getBaseUrl(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("invoiceNinjaApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    return String(data.url ?? "https://invoicing.co");
  }
  return "https://invoicing.co";
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("invoiceNinjaApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    const token = String(data.apiToken ?? data.accessToken ?? "");
    const secret = data.secret ? String(data.secret) : "";
    const headers: Record<string, string> = {
      "X-API-Token": token,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (secret) headers["X-API-Secret"] = secret;
    return headers;
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function evalStr(raw: unknown, evaluate: (expr: string) => unknown): string {
  if (typeof raw === "string" && raw.startsWith("=")) {
    return String(evaluate(raw) ?? "");
  }
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

function resourcePath(resource: string): string {
  const map: Record<string, string> = {
    client: "clients",
    expense: "expenses",
    invoice: "invoices",
    payment: "payments",
    quote: "quotes",
    task: "tasks",
    bankTransaction: "bank_transactions",
    bank_transaction: "bank_transactions",
  };
  return map[resource] ?? `${resource}s`;
}

function idParam(resource: string): string {
  const map: Record<string, string> = {
    client: "client_id",
    expense: "expense_id",
    invoice: "invoice_id",
    payment: "payment_id",
    quote: "quote_id",
    task: "task_id",
    bankTransaction: "id",
    bank_transaction: "id",
  };
  return map[resource] ?? `${resource}_id`;
}

export const invoiceNinjaExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "client");
  const operation = ctx.getParam<string>("operation", "create");
  const continueOnFail = ctx.continueOnFail();
  const baseUrl = await getBaseUrl(ctx);
  const auth = await getAuthHeaders(ctx);

  const results: INodeExecutionData[] = [];

  for (const item of items) {
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: results.length, input: 0 };
    const evaluate = (expr: string) => ctx.evaluate(expr, itemJson ?? {});
    try {
      const path = resourcePath(resource);
      const idField = idParam(resource);
      let output: Record<string, unknown> | Array<Record<string, unknown>> | null = null;

      if (operation === "create") {
        const allParams = ctx.getParams();
        const body: Record<string, unknown> = {};
        const resourceFields: Record<string, string[]> = {
          client: [
            "name", "address1", "address2", "city", "state", "postal_code",
            "country_id", "shipping_address1", "shipping_address2",
            "shipping_city", "shipping_state", "shipping_postal_code",
            "shipping_country_id", "work_phone", "private_notes", "website",
            "vat_number", "id_number",
          ],
          expense: [
            "amount", "client_id", "expense_category_id", "expense_date",
            "payment_date", "payment_type_id", "private_notes", "public_notes",
            "should_be_invoiced", "tax_name1", "tax_name2", "tax_rate1", "tax_rate2",
            "transaction_reference", "vendor_id", "custom_value1", "custom_value2",
          ],
          invoice: [
            "client_id", "invoice_date", "due_date", "number", "po_number",
            "discount", "is_amount_discount", "partial", "partial_due_date",
            "auto_bill", "custom_value1", "custom_value2", "tax_name1", "tax_name2",
            "tax_rate1", "tax_rate2", "private_notes", "public_notes", "email",
            "email_invoice", "invoice_status_id", "paid",
          ],
          payment: [
            "invoice_id", "amount", "payment_type_id", "type_id",
            "transaction_reference", "private_notes", "client_id",
          ],
          quote: [
            "client_id", "number", "invoice_date", "due_date", "discount",
            "is_amount_discount", "po_number", "auto_bill", "custom_value1",
            "custom_value2", "tax_name1", "tax_name2", "tax_rate1", "tax_rate2",
            "private_notes", "public_notes", "email", "email_invoice",
            "invoice_status_id", "paid", "partial", "partial_due_date",
          ],
          task: [
            "client_id", "description", "project_id", "time_log",
            "custom_value1", "custom_value2",
          ],
          bankTransaction: [
            "amount", "bank_integration_id", "base_type", "currency_id", "date", "description",
          ],
        };
        const fields = resourceFields[resource] ?? [];
        for (const f of fields) {
          const raw = allParams[f];
          if (raw !== undefined && raw !== null && raw !== "") {
            const resolved = typeof raw === "string" && raw.startsWith("=") ? evaluate(raw) : raw;
            if (resolved !== undefined && resolved !== null && resolved !== "") {
              body[f] = resolved;
            }
          }
        }
        if (resource === "client") {
          const rawContacts = allParams.contacts;
          if (rawContacts) {
            const contacts = typeof rawContacts === "string" && rawContacts.startsWith("=")
              ? evaluate(rawContacts)
              : typeof rawContacts === "string"
                ? JSON.parse(rawContacts)
                : rawContacts;
            if (Array.isArray(contacts)) body.contacts = contacts;
          }
        }
        if (resource === "invoice" || resource === "quote") {
          const rawLineItems = allParams.line_items;
          if (rawLineItems) {
            const items = typeof rawLineItems === "string" && rawLineItems.startsWith("=")
              ? evaluate(rawLineItems)
              : typeof rawLineItems === "string"
                ? JSON.parse(rawLineItems)
                : rawLineItems;
            if (Array.isArray(items)) body.line_items = items;
          }
        }
        if (resource === "payment") {
          const rawInvoices = allParams.invoices;
          if (rawInvoices) {
            const invs = typeof rawInvoices === "string" && rawInvoices.startsWith("=")
              ? evaluate(rawInvoices)
              : typeof rawInvoices === "string"
                ? JSON.parse(rawInvoices)
                : rawInvoices;
            if (Array.isArray(invs)) body.invoices = invs;
          }
        }
        const res = await fetch(`${baseUrl}${API_VERSION}/${path}`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Invoice Ninja: ${res.status} ${errBody}`);
        }
        const data = await res.json();
        output = (data as Record<string, unknown>).data as Record<string, unknown> ?? data as Record<string, unknown>;
      } else if (operation === "delete") {
        const id = evalStr(ctx.getParam(idField, ""), evaluate);
        if (!id) throw new Error(`Invoice Ninja: ${idField} is required for ${resource} delete`);
        const res = await fetch(`${baseUrl}${API_VERSION}/${path}/${id}`, {
          method: "DELETE",
          headers: auth,
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Invoice Ninja: ${res.status} ${errBody}`);
        }
        const data = await res.json();
        output = (data as Record<string, unknown>).data as Record<string, unknown> ?? data as Record<string, unknown>;
      } else if (operation === "email") {
        const id = evalStr(ctx.getParam(idField, ""), evaluate);
        if (!id) throw new Error(`Invoice Ninja: ${idField} is required for ${resource} email`);
        const res = await fetch(`${baseUrl}${API_VERSION}/${path}/${id}/email`, {
          method: "POST",
          headers: auth,
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Invoice Ninja: ${res.status} ${errBody}`);
        }
        const data = await res.json();
        output = (data as Record<string, unknown>).data as Record<string, unknown> ?? data as Record<string, unknown>;
      } else if (operation === "get") {
        const id = evalStr(ctx.getParam(idField, ""), evaluate);
        if (!id) throw new Error(`Invoice Ninja: ${idField} is required for ${resource} get`);
        const res = await fetch(`${baseUrl}${API_VERSION}/${path}/${id}`, {
          method: "GET",
          headers: auth,
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Invoice Ninja: ${res.status} ${errBody}`);
        }
        const data = await res.json();
        output = (data as Record<string, unknown>).data as Record<string, unknown> ?? data as Record<string, unknown>;
      } else if (operation === "getAll") {
        const params = new URLSearchParams();
        const isDeleted = ctx.getParam("is_deleted", false);
        if (isDeleted) params.set("is_deleted", "true");
        const filters = ctx.getParam("filters", {}) as Record<string, unknown>;
        if (filters && typeof filters === "object") {
          for (const [k, v] of Object.entries(filters)) {
            if (v !== undefined && v !== null && v !== "") {
              params.set(k, String(v));
            }
          }
        }
        const qs = params.toString();
        const res = await fetch(`${baseUrl}${API_VERSION}/${path}${qs ? `?${qs}` : ""}`, {
          method: "GET",
          headers: auth,
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Invoice Ninja: ${res.status} ${errBody}`);
        }
        const data = await res.json() as Record<string, unknown>;
        const itemsList = (data.data as Array<Record<string, unknown>>) ?? [];
        output = itemsList;
      }

      if (Array.isArray(output)) {
        for (const item of output) {
          results.push({ json: item as Record<string, unknown>, pairedItem });
        }
      } else {
        results.push({ json: output ?? {}, pairedItem });
      }
    } catch (err) {
      if (continueOnFail) {
        results.push({ json: { error: (err as Error).message }, pairedItem });
      } else {
        throw err;
      }
    }
  }

  return [results];
};
