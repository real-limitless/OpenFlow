import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";

type RuntimeInfo = {
  role: string;
  worker: boolean;
  scheduler: boolean;
  concurrency: number;
  queue: string;
  redis: string;
  schedulerBackend?: string;
};

export function WorkerRuntimePanel() {
  const [rt, setRt] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/v1/settings/security");
      if (!res.ok) return;
      const body = (await res.json()) as { runtime?: RuntimeInfo };
      if (body.runtime) setRt(body.runtime);
    })();
  }, []);

  if (!rt) {
    return <p className="text-[13px] text-muted-foreground">Loading worker role…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Worker process</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          <code className="rounded bg-muted px-1">OPENFLOW_ROLE</code> is{" "}
          <code className="rounded bg-muted px-1">all</code> (API + worker),{" "}
          <code className="rounded bg-muted px-1">main</code> (HTTP only, enqueue to Redis), or{" "}
          <code className="rounded bg-muted px-1">worker</code> (BullMQ consumer). Compose runs a
          worker replica alongside the API.
        </p>
      </div>
      <ul className="space-y-1 text-[13px]">
        <li>
          <span className="font-medium text-foreground">Role:</span> {rt.role}
        </li>
        <li>
          <span className="font-medium text-foreground">Worker loop:</span>{" "}
          {rt.worker ? "on" : "off"} (concurrency {rt.concurrency})
        </li>
        <li>
          <span className="font-medium text-foreground">Scheduler:</span>{" "}
          {rt.scheduler ? "on" : "off"}
          {rt.schedulerBackend ? ` (${rt.schedulerBackend})` : ""}
        </li>
        <li>
          <span className="font-medium text-foreground">Queue:</span> {rt.queue} ({rt.redis})
        </li>
      </ul>
    </div>
  );
}
