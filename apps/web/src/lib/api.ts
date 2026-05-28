// Thin fetch wrapper for the apps/api auth endpoints, per ADR 0003.
// In dev the Vite proxy routes /auth/* to localhost:8787, so base is "".
const base = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? "");

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  npub: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(
      res.status,
      err?.code,
      err?.message ?? "Something went wrong. Try again.",
    );
  }
  return body as T;
}

export const api = {
  auth: {
    signup(input: { email: string; password: string; displayName: string }) {
      return authFetch<{ user: PublicUser }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    login(input: { email: string; password: string }) {
      return authFetch<{ user: PublicUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    logout() {
      return authFetch<void>("/auth/logout", { method: "POST" });
    },
    me() {
      return authFetch<{ user: PublicUser }>("/auth/me");
    },
  },
};
