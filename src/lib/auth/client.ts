import { projectHeaders } from "@/lib/projects/client";

export type AuthUser = {
  id: string;
  email: string;
  role?: string;
};

export type AuthState = {
  user: AuthUser | null;
  /** true when server runs with AUTH_DISABLED */
  authDisabled: boolean;
  loading: boolean;
};

let csrfToken = "";

export function rememberCsrfToken(token: string | undefined) {
  if (token) csrfToken = token;
}

export function readCsrfToken(): string {
  if (csrfToken) return csrfToken;
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrf=([^;]*)/);
  if (!match?.[1]) return "";
  const raw = decodeURIComponent(match[1]);
  const cut = raw.lastIndexOf(".");
  return cut > 0 ? raw.slice(0, cut) : raw;
}

export function csrfHeaderMap(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

let csrfFetchInstalled = false;

/** Attach X-CSRF-Token on mutating fetch calls (cookie-session CSRF). */
export function installCsrfFetch(): void {
  if (csrfFetchInstalled || typeof window === "undefined") return;
  csrfFetchInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      const token = readCsrfToken();
      if (token && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", token);
      init = { ...init, credentials: init?.credentials ?? "include", headers };
    }
    return orig(input, init);
  };
}

export async function fetchAuthStatus(): Promise<{
  user: AuthUser | null;
  authDisabled: boolean;
}> {
  try {
    const res = await fetch("/api/v1/auth/me", {
      credentials: "include",
      headers: projectHeaders(),
    });
    if (res.ok) {
      const body = (await res.json()) as
        | AuthUser
        | {
            user?: AuthUser | null;
            authDisabled?: boolean;
            csrfToken?: string;
            id?: string;
            email?: string;
          };

      if (body && typeof body === "object" && "csrfToken" in body) {
        rememberCsrfToken((body as { csrfToken?: string }).csrfToken);
      }

      if (body && typeof body === "object" && "user" in body) {
        const wrapped = body as { user?: AuthUser | null; authDisabled?: boolean };
        return {
          user: wrapped.user ?? null,
          authDisabled: Boolean(wrapped.authDisabled),
        };
      }

      if (body && typeof body === "object" && "id" in body && "email" in body) {
        return {
          user: body as AuthUser,
          authDisabled: false,
        };
      }
    }

    if (res.status === 401) {
      return { user: null, authDisabled: false };
    }
  } catch {
    /* ignore */
  }

  try {
    const ready = await fetch("/health/ready");
    if (ready.ok) {
      const body = (await ready.json()) as { auth?: string };
      if (body.auth === "disabled") {
        return {
          user: { id: "local", email: "local@local", role: "owner" },
          authDisabled: true,
        };
      }
    }
  } catch {
    /* ignore */
  }

  return { user: null, authDisabled: false };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Login failed");
  }
  const user = (await res.json()) as AuthUser & { csrfToken?: string };
  rememberCsrfToken(user.csrfToken);
  return user;
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/v1/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Registration failed");
  }
  const user = (await res.json()) as AuthUser & { csrfToken?: string };
  rememberCsrfToken(user.csrfToken);
  return user;
}

export async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: csrfHeaderMap(),
  });
  csrfToken = "";
}

export type SetupStatus = {
  authDisabled: boolean;
  hasUsers: boolean;
  needsOwner: boolean;
  inviteOnly?: boolean;
  registrationOpen?: boolean;
  tryOut?: boolean;
};

export async function fetchSetupStatus(): Promise<SetupStatus> {
  try {
    const res = await fetch("/api/v1/setup/status", { credentials: "include" });
    if (res.ok) {
      return (await res.json()) as SetupStatus;
    }
  } catch {
    /* ignore */
  }
  return { authDisabled: false, hasUsers: true, needsOwner: false };
}

/** Authenticated fetch with project/env headers + cookies. */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(projectHeaders(init?.headers));
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const token = readCsrfToken();
    if (token && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", token);
  }
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}
