// /auth routes per ADR 0003. Dependency-injected like buildHealthRouter so
// the endpoint suite runs with mocked db-touching helpers.
import express, { type Request, type Router } from "express";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import type { Config } from "../config";
import type { PublicUser } from "../auth/users";
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "../auth/passwords";

const COOKIE_NAME = "session";
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

export type AuthDeps = {
  readonly config: Config;
  readonly signup: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<{ user: PublicUser; token: string; expiresAt: Date }>;
  readonly login: (
    input: { email: string; password: string },
    existingCookie: string | undefined,
  ) => Promise<{ user: PublicUser; token: string; expiresAt: Date } | null>;
  readonly logout: (cookie: string | undefined) => Promise<void>;
  readonly me: (cookie: string | undefined) => Promise<PublicUser | null>;
  /** Issue a NIP-07 login challenge for a pubkey. Optional until story 4 wires it. */
  readonly nostrChallenge?: (pubkey: string) => Promise<{ challenge: string }>;
  /** Verify a signed challenge; create/load the sovereign user; issue a session. */
  readonly nostrVerify?: (
    event: unknown,
  ) => Promise<{ user: PublicUser; token: string; expiresAt: Date } | null>;
};

function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[COOKIE_NAME];
}

function sessionCookie(token: string, isProduction: boolean): string {
  return serializeCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
    secure: isProduction,
  });
}

function clearCookie(isProduction: boolean): string {
  return serializeCookie(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: isProduction,
  });
}

export function buildAuthRouter(deps: AuthDeps): Router {
  const router = express.Router();
  const isProduction = process.env.NODE_ENV === "production";

  router.post("/auth/signup", async (req, res, next) => {
    try {
      const { email, password, displayName } = req.body ?? {};
      for (const check of [
        validateEmail(email),
        validatePassword(password),
        validateDisplayName(displayName),
      ]) {
        if (!check.ok) {
          res
            .status(400)
            .json({ error: { code: "validation_failed", message: check.message } });
          return;
        }
      }
      const { user, token } = await deps.signup({ email, password, displayName });
      res.setHeader("Set-Cookie", sessionCookie(token, isProduction));
      res.status(201).json({ user });
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "email_in_use") {
        res.status(409).json({
          error: {
            code: "email_in_use",
            message: "An account with this email already exists.",
          },
        });
        return;
      }
      next(err);
    }
  });

  router.post("/auth/login", async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      const result = await deps.login({ email, password }, readSessionCookie(req));
      if (!result) {
        res.status(401).json({
          error: {
            code: "invalid_credentials",
            message: "Email or password is incorrect.",
          },
        });
        return;
      }
      res.setHeader("Set-Cookie", sessionCookie(result.token, isProduction));
      res.status(200).json({ user: result.user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/logout", async (req, res, next) => {
    try {
      await deps.logout(readSessionCookie(req));
      res.setHeader("Set-Cookie", clearCookie(isProduction));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get("/auth/me", async (req, res, next) => {
    try {
      const user = await deps.me(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
