// /api/author-verified write route (Story 32 / ADR 0033 §1). A DI'd router cloning
// the claims.ts two-tier path (sovereign template→sign→submit; custodial
// template→custodialSign→publish, no new crypto) WITH the Story-30 curator gate
// added: only a session user whose own house-PoV weight ≥ CURATOR_THRESHOLD may
// assert/dispute. The gate is server-enforced on BOTH the template and the write.
// The curator signs; the author being verified is the #p target.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { TrustProvider } from "../trust";
import { tokenToId } from "../auth/sessions";
import {
  buildAuthorVerifiedTemplate,
  AuthorVerifiedError,
} from "../author-verified/template";
import { validateSignedAuthorVerified } from "../author-verified/validate";

const COOKIE_NAME = "session";

export type AuthorVerifiedSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type AuthorVerifiedDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<AuthorVerifiedSessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly trust?: TrustProvider;
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
};

function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[COOKIE_NAME];
}

export function buildAuthorVerifiedRouter(deps: AuthorVerifiedDeps): Router {
  const router = express.Router();

  // The caller's own house-PoV weight (ADR 0031). Any degrade (no provider, no
  // observer, empty map, throwing seam) → weight 0 → the gate CLOSES.
  const houseWeightOf = async (callerHex: string): Promise<number> => {
    const house = deps.config.houseObserverPubkey;
    if (!deps.trust || !house) return 0;
    try {
      const map = await deps.trust.weights(house, [callerHex]);
      return map.get(callerHex) ?? 0;
    } catch {
      return 0;
    }
  };

  const threshold = () => deps.config.curatorThreshold ?? 0.5;

  router.post("/api/author-verified/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }
      const weight = await houseWeightOf(user.pubkeyHex);
      if (weight < threshold()) {
        res
          .status(403)
          .json({ error: { code: "below_gate", message: "Not a curator." } });
        return;
      }
      const { bookSlug, authorPubkey, polarity } = req.body ?? {};
      const template = buildAuthorVerifiedTemplate(
        deps.config,
        { curatorPubkey: user.pubkeyHex, authorPubkey, bookSlug, polarity },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof AuthorVerifiedError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        res.status(status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  router.post("/api/author-verified", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }
      // Re-check the curator gate server-side on the write (AC-1).
      const weight = await houseWeightOf(user.pubkeyHex);
      if (weight < threshold()) {
        res
          .status(403)
          .json({ error: { code: "below_gate", message: "Not a curator." } });
        return;
      }

      if (user.tier === "custodial") {
        const { bookSlug, authorPubkey, polarity } = req.body ?? {};
        let template;
        try {
          template = buildAuthorVerifiedTemplate(
            deps.config,
            { curatorPubkey: user.pubkeyHex, authorPubkey, bookSlug, polarity },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof AuthorVerifiedError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            res
              .status(status)
              .json({ error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }
        if (!deps.custodialSign) {
          res.status(501).json({
            error: { code: "not_supported", message: "Custodial signing is unavailable." },
          });
          return;
        }
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, template);
        if (!signed) {
          res.status(401).json({
            error: { code: "reauth_required", message: "Please sign in again." },
          });
          return;
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          res.status(502).json({
            error: { code: "publish_failed", message: "Could not publish the assertion." },
          });
          return;
        }
        res.status(200).json({ ok: true });
        return;
      }

      const { event } = req.body ?? {};
      const result = validateSignedAuthorVerified(event, user.pubkeyHex);
      if (!result.ok) {
        const status = result.code === "pubkey_mismatch" ? 403 : 400;
        res.status(status).json({
          error: {
            code: result.code,
            message:
              result.code === "pubkey_mismatch"
                ? "An assertion must be signed by your own key."
                : "The assertion event could not be validated.",
          },
        });
        return;
      }

      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        res.status(502).json({
          error: { code: "publish_failed", message: "Could not publish the assertion." },
        });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
