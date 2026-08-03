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
        | { user?: AuthUser | null; authDisabled?: boolean; id?: string; email?: string };

      // New shape: { user, authDisabled }
      if (body && typeof body === "object" && "user" in body) {
        const wrapped = body as { user?: AuthUser | null; authDisabled?: boolean };
        return {
          user: wrapped.user ?? null,
          authDisabled: Boolean(wrapped.authDisabled),
        };
      }

      // Legacy shape: bare user object (older servers)
      if (body && typeof body === "object" && "id" in body && "email" in body) {
        return {
          user: body as AuthUser,
          authDisabled: false,
        };
      }
    }

    // Legacy 401 = logged out
    if (res.status === 401) {
      return { user: null, authDisabled: false };
    }
  } catch {
    /* ignore */
  }

  // Fallback: probe readiness for AUTH_DISABLED when /me is unavailable
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
  return (await res.json()) as AuthUser;
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
  return (await res.json()) as AuthUser;
}

export async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

/** Authenticated fetch with project/env headers + cookies. */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(projectHeaders(init?.headers));
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}
