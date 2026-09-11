import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";

type AuditRow = {
  id: string;
  at: string;
  actorEmail: string;
  action: string;
  resource: string;
  resourceId: string;
  detail: Record<string, unknown>;
};

export function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/v1/admin/audit?limit=50");
      if (!res.ok) return;
      const body = (await res.json()) as { events?: AuditRow[] };
      setRows(body.events ?? []);
    })();
  }, []);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Audit log</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Append-only trail for invites, role changes, shares, credential metadata, and security
          settings. Secrets are never stored.
        </p>
      </div>
      {rows == null ? (
        <p className="text-[13px] text-muted-foreground">Loading audit events…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No audit events yet.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-auto text-[13px]">
          {rows.map((row) => (
            <li key={row.id} className="border-b border-border/60 pb-2 last:border-0">
              <p className="font-medium text-foreground">
                {row.action}
                <span className="ml-2 font-normal text-muted-foreground">
                  {row.resource}
                  {row.resourceId ? `:${row.resourceId}` : ""}
                </span>
              </p>
              <p className="text-[12px] text-muted-foreground">
                {row.actorEmail || "unknown"} · {new Date(row.at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
