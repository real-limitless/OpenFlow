import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/settings/logs")({
  head: () => ({ meta: [{ title: "Logs — OpenFlow" }] }),
  component: LogsPage,
});

type LogRow = {
  ts: string;
  level: string;
  msg: string;
  service?: string;
  [key: string]: unknown;
};

function LogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [level, setLevel] = useState("all");
  const [stream, setStream] = useState("—");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/logs/recent?limit=100");
    if (res.ok) {
      const body = (await res.json()) as { logs: LogRow[] };
      setLogs(body.logs ?? []);
    }
    try {
      const ready = await fetch("/health/ready");
      if (ready.ok) {
        const b = (await ready.json()) as { logStream?: string };
        setStream(b.logStream ?? "none");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const filtered =
    level === "all" ? logs : logs.filter((l) => l.level === level);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-medium">Recent logs</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            In-process ring buffer. Stream sink: <code className="rounded bg-muted px-1">{stream}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-[12px]"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="all">all levels</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-border font-mono text-[11px]">
        {filtered.length === 0 ? (
          <p className="p-4 text-muted-foreground">No log lines yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-muted/80">
              <tr>
                <th className="px-2 py-1.5 font-medium">Time</th>
                <th className="px-2 py-1.5 font-medium">Level</th>
                <th className="px-2 py-1.5 font-medium">Message</th>
                <th className="px-2 py-1.5 font-medium">Fields</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].reverse().map((l, i) => {
                const extra = { ...l };
                delete extra.ts;
                delete extra.level;
                delete extra.msg;
                delete extra.service;
                return (
                  <tr key={`${l.ts}-${i}`} className="border-t border-border/60">
                    <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                      {l.ts?.slice(11, 19)}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={
                          l.level === "error"
                            ? "text-destructive"
                            : l.level === "warn"
                              ? "text-amber-600"
                              : ""
                        }
                      >
                        {l.level}
                      </span>
                    </td>
                    <td className="px-2 py-1">{l.msg}</td>
                    <td className="max-w-xs truncate px-2 py-1 text-muted-foreground">
                      {Object.keys(extra).length ? JSON.stringify(extra) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
