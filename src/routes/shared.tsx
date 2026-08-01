import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/shared")({
  head: () => ({ meta: [{ title: "Shared with me — OpenFlow" }] }),
  component: SharedPage,
});

type SharedItem = {
  resourceType: string;
  resourceId: string;
  name: string;
  permission: string;
  shareId: string;
};

function SharedPage() {
  const [items, setItems] = useState<SharedItem[] | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/shares/with-me");
    if (!res.ok) {
      setItems([]);
      return;
    }
    setItems((await res.json()) as SharedItem[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const workflows = (items ?? []).filter((i) => i.resourceType === "workflow");
  const credentials = (items ?? []).filter((i) => i.resourceType === "credential");

  return (
    <PageShell>
      <div className="flex items-center gap-2 text-primary">
        <Share2 className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Shared with me</h1>
      </div>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Workflows and credentials others have shared with you.
      </p>

      <section className="mt-8">
        <h2 className="text-[15px] font-medium">Workflows</h2>
        {items === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : workflows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No shared workflows.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {workflows.map((w) => (
              <li key={w.resourceId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/workflow/$id"
                    params={{ id: w.resourceId }}
                    className="text-[14px] font-medium hover:underline"
                  >
                    {w.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">permission: {w.permission}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-medium">Credentials</h2>
        {items === null ? null : credentials.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No shared credentials.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {credentials.map((c) => (
              <li key={c.resourceId} className="px-4 py-3 text-[14px]">
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  · {c.permission} (use at runtime without seeing secrets)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
