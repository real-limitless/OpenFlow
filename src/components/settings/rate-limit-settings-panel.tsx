import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";

type Limit = { limit: number; windowSec: number };
type SecuritySettings = {
  rateLimits: Record<"auth" | "webhook" | "form" | "api", Limit>;
};

const LABELS: Record<string, string> = {
  auth: "Login and register",
  webhook: "Incoming webhooks",
  form: "Public forms",
  api: "Authenticated API",
};

export function RateLimitSettingsPanel() {
  const [cfg, setCfg] = useState<SecuritySettings | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/v1/settings/security");
      if (res.ok) setCfg((await res.json()) as SecuritySettings);
    })();
  }, []);

  if (!cfg) {
    return <p className="text-[13px] text-muted-foreground">Loading rate limits…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Rate limits</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Auth, webhooks, forms, and the API are limited per client IP. Exceeding a
          bucket returns HTTP 429 with a Retry-After header.
        </p>
      </div>
      <ul className="space-y-2 text-[13px]">
        {Object.entries(cfg.rateLimits).map(([key, value]) => (
          <li key={key} className="flex justify-between gap-4 border-b border-border/60 py-1 last:border-0">
            <span>
              <span className="font-medium text-foreground">{LABELS[key] ?? key}</span>
              <span className="ml-2 text-muted-foreground">({key})</span>
            </span>
            <span className="tabular-nums text-foreground">
              {value.limit} / {value.windowSec}s
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
