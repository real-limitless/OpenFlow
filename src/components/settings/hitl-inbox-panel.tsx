import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { apiFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

type InboxItem = {
  id: string;
  workflowId: string;
  workflowName: string;
  startedAt: string;
  nodeName: string | null;
  resume: string | null;
};

export function HitlInboxPanel() {
  const [items, setItems] = useState<InboxItem[] | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/executions/inbox");
    if (!res.ok) return;
    const body = (await res.json()) as { items?: InboxItem[] };
    setItems(body.items ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = async (id: string, decision: "approve" | "deny") => {
    await apiFetch(`/api/v1/executions/${id}/${decision}`, { method: "POST", body: JSON.stringify({}) });
    await refresh();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Approval inbox</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Waiting executions. Approve or deny to resume from the paused node with{" "}
          <code className="rounded bg-muted px-1">approved</code> on the item JSON.
        </p>
      </div>
      {items == null ? (
        <p className="text-[13px] text-muted-foreground">Loading inbox…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No waiting approvals.</p>
      ) : (
        <ul className="space-y-2 text-[13px]">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 border-b border-border/60 pb-2">
              <div className="min-w-0">
                <Link to="/executions/$id" params={{ id: item.id }} className="text-primary hover:underline">
                  {item.workflowName}
                </Link>
                <p className="text-muted-foreground">
                  {item.nodeName ?? "wait"} · {item.resume ?? "paused"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" onClick={() => void decide(item.id, "approve")}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void decide(item.id, "deny")}>
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
