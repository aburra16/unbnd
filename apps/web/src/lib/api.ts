// Thin fetch wrapper for the apps/api auth endpoints, per ADR 0003.
// In dev the Vite proxy routes /auth/* to localhost:8787, so base is "".
const base = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? "");

export type PublicUser = {
  id: string;
  email: string | null;
  displayName: string;
  npub: string;
};

export type SignedEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type NostrEventTemplate = {
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
};

export type PublicRating = {
  npub: string;
  score: number;
  reviewText?: string;
  reviewDate: string;
};

export type RatingsSummary = {
  count: number;
  average: number | null;
  ratings: PublicRating[];
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
    nostr: {
      challenge(pubkey: string) {
        return authFetch<{ challenge: string }>("/auth/nostr/challenge", {
          method: "POST",
          body: JSON.stringify({ pubkey }),
        });
      },
      verify(event: SignedEvent) {
        return authFetch<{ user: PublicUser }>("/auth/nostr/verify", {
          method: "POST",
          body: JSON.stringify({ event }),
        });
      },
    },
  },
  ratings: {
    template(input: {
      bookSlug: string;
      score: number;
      reviewText?: string;
      reviewDate: string;
    }) {
      return authFetch<{ template: NostrEventTemplate }>(
        "/api/ratings/template",
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    submit(event: SignedEvent) {
      return authFetch<{ rating: PublicRating; summary: RatingsSummary }>(
        "/api/ratings",
        { method: "POST", body: JSON.stringify({ event }) },
      );
    },
    list(bookSlug: string) {
      return authFetch<RatingsSummary>(
        `/api/books/${encodeURIComponent(bookSlug)}/ratings`,
      );
    },
  },
};
