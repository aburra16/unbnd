// /auth routes per ADR 0003. Dependency-injected like buildHealthRouter so
// the endpoint suite can run with mocked db-touching helpers. Stub returns an
// empty router until the Implementer wires the handlers.
import express, { type Router } from "express";
import type { Config } from "../config";
import type { PublicUser } from "../auth/users";

export type AuthDeps = {
  readonly config: Config;
  /** Create a custodial user + issue a session, transactionally. Returns the public user + the cookie token. */
  readonly signup: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<{ user: PublicUser; token: string; expiresAt: Date }>;
  /** Verify credentials, rotate session. Returns null on bad credentials. */
  readonly login: (
    input: { email: string; password: string },
    existingCookie: string | undefined,
  ) => Promise<{ user: PublicUser; token: string; expiresAt: Date } | null>;
  /** Revoke the session referenced by the cookie. */
  readonly logout: (cookie: string | undefined) => Promise<void>;
  /** Resolve the cookie to a public user, or null. */
  readonly me: (cookie: string | undefined) => Promise<PublicUser | null>;
};

export function buildAuthRouter(_deps: AuthDeps): Router {
  // Stub: empty router. Tests hit the routes and get 404 until implemented.
  return express.Router();
}
