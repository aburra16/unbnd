// /api/ratings + /api/books/:slug/ratings routes. ADR 0005. Dependency-
// injected like buildAuthRouter so the endpoint suite runs with mocked
// session/publish/query.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { npubEncode, decode } from "nostr-tools/nip19";
import {
  buildRatingTemplate,
  buildRetractionTemplate,
  RatingError,
} from "../ratings/template";
import {
  validateSignedRating,
  validateSignedRetraction,
} from "../ratings/validate";
import {
  summarizeRatings,
  dedupeRatings,
  rawFromParsed,
  weightedRatings,
  type PublicRating,
} from "../ratings/summary";
import type { TrustProvider } from "../trust";
import { tokenToId } from "../auth/sessions";

const HEX64 = /^[0-9a-f]{64}$/i;

/** npub or hex → lowercase hex, or null. */
function toObserverHex(id: string): string | null {
  if (HEX64.test(id)) return id.toLowerCase();
  try {
    const d = decode(id);
    if (d.type === "npub" && typeof d.data === "string") return d.data;
  } catch {
    // not an npub
  }
  return null;
}

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
  /** Trust-weighting source (ADR 0014). Absent → raw-only reads. */
  readonly trust?: TrustProvider;
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

/**
 * Story 28 / ADR 0029 §1–2: resolve the signed-in caller's OWN current rating
 * for this book as a `PublicRating`, sourced from the deduped RAW set (never the
 * trust-weighted subset). Returns null for anon or never-rated. When the caller's
 * own event is absent from the (un-paginated, 500-capped) book-address read, it
 * does ONE author-scoped fallback read so a high-traffic book can never blank a
 * user's own rating (the honesty seam). hex matching is server-internal; the
 * returned PublicRating carries only the npub.
 */
async function resolveYourRating(
  deps: RatingsDeps,
  cookie: string | undefined,
  addr: string | null,
  deduped: ReturnType<typeof dedupeRatings>,
): Promise<PublicRating | null> {
  if (!cookie) return null;
  const user = await deps.sessionUser(cookie);
  if (!user) return null;

  let own = deduped.find((r) => r.pubkey === user.pubkeyHex) ?? null;

  if (!own && addr) {
    // The own event may have fallen outside the truncated book-address page.
    // One targeted, author-scoped read guarantees presence past the 500 cap.
    const ownEvents = await deps.query({
      kinds: [BOOK_RATING_KIND],
      authors: [user.pubkeyHex],
      "#a": [addr],
    });
    own = dedupeRatings(ownEvents).find((r) => r.pubkey === user.pubkeyHex) ?? null;
  }

  if (!own) return null;
  return rawFromParsed([own]).ratings[0] ?? null;
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

  // Story 79 / ADR 0077: build the unsigned RETRACTION template for a
  // sovereign client to sign (mirrors /api/ratings/template).
  router.post("/api/ratings/remove/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }
      const { bookSlug } = req.body ?? {};
      const template = buildRetractionTemplate(
        deps.config,
        { raterPubkey: user.pubkeyHex, bookSlug },
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

  // Story 79 / ADR 0077: remove (retract) the caller's OWN rating. Mirrors
  // POST /api/ratings per tier: sovereign posts a self-signed retraction
  // event; custodial posts { bookSlug } and the server signs with the
  // session's ephemeral-wrapped key (the same ADR 0006 branch as rate).
  // Idempotent: no current rating means 200 { removed: false } and NO publish
  // (a double remove never spams tombstones — relay-cap discipline).
  router.post("/api/ratings/remove", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      // Resolve the target book; the sovereign body is validated up front so
      // a forged or malformed retraction is refused before any relay read.
      let bookSlug: string;
      let retractionEvent: SignedNostrEvent | null = null;
      if (user.tier === "custodial") {
        const slug = (req.body ?? {}).bookSlug;
        if (typeof slug !== "string" || slug === "") {
          res.status(400).json({
            error: { code: "invalid_book", message: "A book slug is required." },
          });
          return;
        }
        bookSlug = slug;
      } else {
        const { event } = req.body ?? {};
        const result = validateSignedRetraction(event, user.pubkeyHex);
        if (!result.ok) {
          const status = result.code === "pubkey_mismatch" ? 403 : 400;
          res.status(status).json({
            error: {
              code: result.code,
              message:
                result.code === "pubkey_mismatch"
                  ? "A rating can only be removed by its own key."
                  : "The retraction event could not be validated.",
            },
          });
          return;
        }
        bookSlug = result.bookSlug;
        retractionEvent = event as SignedNostrEvent;
      }

      // Idempotent short-circuit (AC-4): no current rating, nothing to remove.
      const addr = bookAddress(deps.config, bookSlug);
      const events = addr
        ? await deps.query({ kinds: [BOOK_RATING_KIND], "#a": [addr] })
        : [];
      const deduped = dedupeRatings(events);
      const current = await resolveYourRating(deps, cookie, addr, deduped);
      if (!current) {
        res.status(200).json({
          removed: false,
          summary: rawFromParsed(deduped),
          yourRating: null,
        });
        return;
      }

      // Custodial: server-sign the retraction with the session key.
      if (!retractionEvent) {
        const template = buildRetractionTemplate(
          deps.config,
          { raterPubkey: user.pubkeyHex, bookSlug },
          Math.floor(Date.now() / 1000),
        );
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
              message: "Please sign in again to remove your rating.",
            },
          });
          return;
        }
        retractionEvent = signed;
      }

      const published = await deps.publish(retractionEvent);
      if (!published.ok) {
        res.status(502).json({
          error: {
            code: "publish_failed",
            message: "Could not publish the removal to the relay.",
          },
        });
        return;
      }

      // The retraction replaced the rating at the relay (same d-tag);
      // re-read for the honest post-removal summary.
      const after = addr
        ? await deps.query({ kinds: [BOOK_RATING_KIND], "#a": [addr] })
        : [];
      res.status(200).json({
        removed: true,
        summary: summarizeRatings(after),
        yourRating: null,
      });
    } catch (err) {
      if (err instanceof RatingError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        res.status(status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  // Public read-back for a book. Always returns the raw summary; when trust is
  // configured, also a trust-weighted view for the observer (ADR 0014).
  // `?observer=<npub|hex>` picks the vantage; default = the house observer.
  router.get("/api/books/:slug/ratings", async (req, res, next) => {
    try {
      const addr = bookAddress(deps.config, req.params.slug);
      const events = addr
        ? await deps.query({ kinds: [BOOK_RATING_KIND], "#a": [addr] })
        : [];
      const deduped = dedupeRatings(events);
      const raw = rawFromParsed(deduped);

      // Resolve the observer: explicit param, else the house observer.
      const observerParam = typeof req.query.observer === "string" ? req.query.observer : "";
      const observerHex = observerParam
        ? toObserverHex(observerParam)
        : (deps.config.houseObserverPubkey ?? null);

      let weighted = null;
      if (deps.trust && observerHex && deduped.length > 0) {
        try {
          const weights = await deps.trust.weights(
            observerHex,
            deduped.map((r) => r.pubkey),
          );
          weighted = weightedRatings(deduped, weights, npubEncode(observerHex));
        } catch {
          weighted = null; // degrade to raw on any trust failure
        }
      }

      // Story 28 / ADR 0029: the signed-in caller's OWN current rating, sourced
      // from the deduped RAW set (never the trust-filtered `weighted` subset —
      // the honesty seam), so it is observer-independent. The GET stays public:
      // an absent/unresolvable session simply yields `yourRating: null`.
      const yourRating = await resolveYourRating(
        deps,
        readSessionCookie(req),
        addr,
        deduped,
      );

      res.status(200).json({ ...raw, weighted, yourRating });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
