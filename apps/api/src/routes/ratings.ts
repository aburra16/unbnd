// /api/ratings + /api/books/:slug/ratings routes. ADR 0005. Dependency-
// injected like buildAuthRouter so the endpoint suite runs with mocked
// session/publish/query.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { buildRatingTemplate, RatingError } from "../ratings/template";
import { validateSignedRating } from "../ratings/validate";
import { summarizeRatings } from "../ratings/summary";
import { tokenToId } from "../auth/sessions";

const COOKIE_NAME = "session";
const BOOK_RATING_KIND = 39999;

export type SessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type RatingsDeps = {
  readonly config: Config;
  /** Resolve the signed-in user (with hex pubkey) from the session cookie. */
  readonly sessionUser: (cookie: string | undefined) => Promise<SessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /**
   * Sign a template server-side for a custodial session, using that session's
   * ephemeral-wrapped key (ADR 0006). Returns null when the session has no
   * live key (post-restart / evicted) — the route maps that to 401
   * reauth_required. Optional until story 5b wires it.
   */
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

function bookAddress(config: Config, slug: string): string | null {
  if (!config.librarianPubkey) return null;
  return `${BOOK_RATING_KIND}:${config.librarianPubkey}:${slug}`;
}

export function buildRatingsRouter(deps: RatingsDeps): Router {
  const router = express.Router();

  // Build the unsigned template for the client to sign.
  router.post("/api/ratings/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }
      const { bookSlug, score, reviewText, reviewDate } = req.body ?? {};
      const template = buildRatingTemplate(
        deps.config,
        {
          raterPubkey: user.pubkeyHex,
          bookSlug,
          score,
          reviewText,
          reviewDate,
        },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof RatingError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        res.status(status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  // Publish a rating. Sovereign sessions post a client-signed `{ event }`;
  // custodial sessions post a rating intent and the server signs it with the
  // session's ephemeral-wrapped key (ADR 0006). Branched by tier.
  router.post("/api/ratings", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      if (user.tier === "custodial") {
        const { bookSlug, score, reviewText, reviewDate } = req.body ?? {};
        let template;
        try {
          template = buildRatingTemplate(
            deps.config,
            { raterPubkey: user.pubkeyHex, bookSlug, score, reviewText, reviewDate },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof RatingError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            res.status(status).json({ error: { code: err.code, message: err.message } });
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
          // The session's signing key is gone (process restart / evicted).
          res.status(401).json({
            error: {
              code: "reauth_required",
              message: "Please sign in again to rate.",
            },
          });
          return;
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          res.status(502).json({
            error: {
              code: "publish_failed",
              message: "Could not publish the rating to the relay.",
            },
          });
          return;
        }
        const addr = bookAddress(deps.config, bookSlug);
        const events = addr
          ? await deps.query({ kinds: [BOOK_RATING_KIND], "#a": [addr] })
          : [];
        res.status(200).json({
          rating: { score, reviewText, reviewDate },
          summary: summarizeRatings(events),
        });
        return;
      }

      const { event } = req.body ?? {};
      const result = validateSignedRating(event, user.pubkeyHex);
      if (!result.ok) {
        const status = result.code === "pubkey_mismatch" ? 403 : 400;
        res.status(status).json({
          error: {
            code: result.code,
            message:
              result.code === "pubkey_mismatch"
                ? "A rating must be signed by your own key."
                : "The rating event could not be validated.",
          },
        });
        return;
      }

      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        res.status(502).json({
          error: {
            code: "publish_failed",
            message: "Could not publish the rating to the relay.",
          },
        });
        return;
      }

      const addr = bookAddress(deps.config, result.rating.bookSlug);
      const events = addr
        ? await deps.query({ kinds: [BOOK_RATING_KIND], "#a": [addr] })
        : [];
      const summary = summarizeRatings(events);
      // Echo the user's own submission (npub lives per-entry in `summary`).
      res.status(200).json({
        rating: {
          score: result.rating.score,
          reviewText: result.rating.reviewText,
          reviewDate: result.rating.reviewDate,
        },
        summary,
      });
    } catch (err) {
      next(err);
    }
  });

  // Public raw read-back for a book.
  router.get("/api/books/:slug/ratings", async (req, res, next) => {
    try {
      const addr = bookAddress(deps.config, req.params.slug);
      const events = addr
        ? await deps.query({ kinds: [BOOK_RATING_KIND], "#a": [addr] })
        : [];
      res.status(200).json(summarizeRatings(events));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
