import { AsyncLocalStorage } from "node:async_hooks";

export type RequestAccessNote = {
  event?: string;
  action?: string;
  outcome?: string;
  actor?: string;
  /** Route already wrote an AuditLog row for this request. */
  audited?: boolean;
};

export type RequestContext = {
  requestId: string;
  traceId: string;
  spanId: string;
  actor?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  host?: string | null;
  path?: string | null;
  method?: string | null;
  access?: RequestAccessNote;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function updateRequestContext(
  patch: Partial<Omit<RequestContext, "access">> & { access?: RequestAccessNote },
): void {
  const store = requestContext.getStore();
  if (!store) return;
  const { access, ...rest } = patch;
  Object.assign(store, rest);
  if (access) store.access = { ...store.access, ...access };
}

export function noteAccessLog(fields: RequestAccessNote): void {
  updateRequestContext({
    access: fields,
    ...(fields.actor ? { actor: fields.actor } : {}),
  });
}
