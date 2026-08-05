import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { fetchAuthStatus, fetchSetupStatus } from "@/lib/auth/client";

const PUBLIC = new Set(["/login", "/register", "/setup", "/docs/compatibility", "/templates"]);

export function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // SSR: render children immediately (auth is cookie-based client check)
  const [ready, setReady] = useState(typeof window === "undefined");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const isPublic =
        PUBLIC.has(pathname) ||
        pathname.startsWith("/docs/") ||
        pathname.startsWith("/templates/") ||
        pathname === "/templates";

      const setup = await fetchSetupStatus();
      if (cancelled) return;

      if (setup.needsOwner) {
        if (pathname !== "/setup") {
          navigate({ to: "/setup" });
        }
        setReady(true);
        return;
      }

      if (pathname === "/setup") {
        navigate({ to: setup.hasUsers ? "/login" : "/", search: setup.hasUsers ? {} : undefined });
        setReady(true);
        return;
      }

      const { user, authDisabled } = await fetchAuthStatus();
      if (cancelled) return;

      if (!authDisabled && !user && !isPublic) {
        navigate({ to: "/login", search: { redirect: pathname } as never });
        setReady(true);
        return;
      }
      if (!authDisabled && user && (pathname === "/login" || pathname === "/register")) {
        navigate({ to: "/" });
        setReady(true);
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
