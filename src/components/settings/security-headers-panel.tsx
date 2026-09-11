import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";

type CorsInfo = {
  origins: string[];
  mode: "allowlist" | "try-out-reflect";
  envConfigured: boolean;
  headers: string[];
};

type CsrfInfo = {
  cookie: string;
  header: string;
  required: boolean;
  note: string;
};

export function SecurityHeadersPanel() {
  const [cors, setCors] = useState<CorsInfo | null>(null);
  const [csrf, setCsrf] = useState<CsrfInfo | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/v1/settings/security");
      if (!res.ok) return;
      const body = (await res.json()) as { cors?: CorsInfo; csrf?: CsrfInfo };
      if (body.cors) setCors(body.cors);
      if (body.csrf) setCsrf(body.csrf);
    })();
  }, []);

  if (!cors) {
    return <p className="text-[13px] text-muted-foreground">Loading security headers…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Security headers and CORS</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Every API response sets nosniff, referrer policy, frame options (except
          embeddable forms/chat), and HSTS when the request is HTTPS. Cross-origin
          browser calls must match <code className="rounded bg-muted px-1">OPENFLOW_CORS_ORIGINS</code>.
        </p>
      </div>
      <p className="text-[13px]">
        <span className="font-medium text-foreground">CORS mode:</span>{" "}
        {cors.mode === "allowlist" ? "production allowlist" : "try-out (reflect request origin)"}
      </p>
      <p className="text-[13px]">
        <span className="font-medium text-foreground">Allowlist:</span>{" "}
        {cors.origins.length > 0 ? cors.origins.join(", ") : cors.envConfigured ? "(empty)" : "not set — try-out reflects Origin"}
      </p>
      <ul className="list-inside list-disc text-[13px] text-muted-foreground">
        {cors.headers.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      {csrf && (
        <div className="border-t border-border pt-3">
          <h3 className="text-[14px] font-medium">CSRF</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">{csrf.note}</p>
          <p className="mt-2 text-[13px]">
            Header <code className="rounded bg-muted px-1">{csrf.header}</code> must match cookie{" "}
            <code className="rounded bg-muted px-1">{csrf.cookie}</code>.{" "}
            {csrf.required ? "Enforced for this session." : "Not enforced in try-out (AUTH_DISABLED)."}
          </p>
        </div>
      )}
    </div>
  );
}
