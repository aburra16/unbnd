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
  bookAddressOf,
  buildRemovalTemplateFor,
  buildReviewTemplateFor,
  currentReview,
  RatingError,
} from "../ratings/template";
import { validateSignedRemoval, validateSignedReview } from "../ratings/validate";
import {
  dedupeRatings,
  rawFromParsed,
  reviewScope,
  weightedRatings,
  type ParsedRating,
  type PublicRating,
} from "../ratings/summary";
import { readBookReviews } from "../reviews/read";
import { BOOK_REVIEW_KIND } from "@unbnd/schemas";
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

export type SessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type RatingsDeps = {
  readonly config: Config;
  /** Resolve the signed-in user (with hex pubkey) from the session cookie. */
  readonly sessionUser: (cookie: string | undefined) => Promise<SessionUser | null>;
  /**
   * Publish a review or its removal (Story 99 / ADR 0089 §4): Unbnd's relay
   * first, then the writer's relays and the review set, never the hub.
   */
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /**
   * Sign a template server-side for a custodial session, using that session's
   * ephemeral-wrapped key (ADR 0006). Returns null when the session has no
   * live key (post-restart / evicted) — the route maps that to 401
   * reauth_required.
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

const nowSec = () => Math.floor(Date.now() / 1000);

/** A book's standing reviews (books actions contract §4, §6). */
async function bookReviews(deps: RatingsDeps, address: string): Promise<ParsedRating[]> {
  return dedupeRatings(await readBookReviews(deps.query, { book: address }), reviewScope(deps.config));
}

/**
 * Story 28 / ADR 0029 §1–2: the signed-in caller's OWN standing review of this
 * book, from the unweighted set (never the trust-weighted subset). When it is
 * absent from the (500-capped) book read, ONE author-scoped read guarantees it
 * past the cap. hex matching stays server-internal; the result carries the npub.
 */
async function resolveYourRating(
  deps: RatingsDeps,
  cookie: string | undefined,
  address: string,
  deduped: readonly ParsedRating[],
): Promise<PublicRating | null> {
  if (!cookie) return null;
  const user = await deps.sessionUser(cookie);
  if (!user) return null;
  let own = deduped.find((r) => r.pubkey === user.pubkeyHex) ?? null;
  if (!own) {
    const events = await readBookReviews(deps.query, { book: address, authors: [user.pubkeyHex] });
    own = dedupeRatings(events, reviewScope(deps.config)).find((r) => r.pubkey === user.pubkeyHex) ?? null;
  }
  return own ? (rawFromParsed([own]).ratings[0] ?? null) : null;
}

function ratingErrorResponse(res: express.Response, err: RatingError): void {
  const status = err.code === "feature_unavailable" ? 503 : 400;
  res.status(status).json({ error: { code: err.code, message: err.message } });
}

/** The book a removal names: its `a` is `34259:<me>:book:39999:<librarian>:<slug>`. */
function removedSlug(event: unknown, me: string, librarian: string): string | null {
  const tags = (event as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(tags)) return null;
  const prefix = `${BOOK_REVIEW_KIND}:${me}:book:39999:${librarian}:`;
  for (const t of tags as unknown[]) {
    if (Array.isArray(t) && t[0] === "a" && typeof t[1] === "string" && t[1].startsWith(prefix)) {
      return t[1].slice(prefix.length) || null;
    }
  }
  return null;
}

export function buildRatingsRouter(deps: RatingsDeps): Router {
  const router = express.Router();

  const noSession = (res: express.Response) =>
    res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });

  // The unsigned review for a sovereign client to sign, built on their current one.
  router.post("/api/ratings/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) return void noSession(res);
      const { bookSlug, score, reviewText } = req.body ?? {};
      const template = await buildReviewTemplateFor(
        deps.config,
        deps.query,
        { pubkey: user.pubkeyHex, bookSlug, score, reviewText },
        nowSec(),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof RatingError) return void ratingErrorResponse(res, err);
      next(err);
    }
  });

  // Publish a review. Sovereign sessions post a client-signed `{ event }`;
  // custodial sessions post the review and the server signs it with the
  // session's ephemeral-wrapped key (ADR 0006).
  router.post("/api/ratings", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) return void noSession(res);

      let event: SignedNostrEvent;
      let bookSlug: string;
      if (user.tier === "custodial") {
        const { score, reviewText } = req.body ?? {};
        bookSlug = (req.body ?? {}).bookSlug;
        const template = await buildReviewTemplateFor(
          deps.config,
          deps.query,
          { pubkey: user.pubkeyHex, bookSlug, score, reviewText },
          nowSec(),
        );
        if (!deps.custodialSign) {
          res.status(501).json({ error: { code: "not_supported", message: "Custodial signing is unavailable." } });
          return;
        }
        const signed = await deps.custodialSign(cookie ? tokenToId(cookie).toString("hex") : "", template);
        if (!signed) {
          res.status(401).json({ error: { code: "reauth_required", message: "Please sign in again to rate." } });
          return;
        }
        event = signed;
      } else {
        const candidate = (req.body ?? {}).event;
        const result = validateSignedReview(candidate, user.pubkeyHex, deps.config.librarianPubkey ?? "");
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
        event = candidate as SignedNostrEvent;
        bookSlug = result.bookSlug;
      }

      const published = await deps.publish(event);
      if (!published.ok) {
        res.status(502).json({ error: { code: "publish_failed", message: "Could not publish the rating to the relay." } });
        return;
      }

      const deduped = await bookReviews(deps, bookAddressOf(deps.config, bookSlug));
      const mine = deduped.find((r) => r.id === event.id);
      res.status(200).json({
        rating: mine
          ? { score: mine.score, reviewText: mine.reviewText, reviewDate: mine.reviewDate }
          : null,
        summary: rawFromParsed(deduped),
      });
    } catch (err) {
      if (err instanceof RatingError) return void ratingErrorResponse(res, err);
      next(err);
    }
  });

  // The unsigned removal of the caller's current review, for a sovereign client
  // to sign. No current review: `{ template: null }`.
  router.post("/api/ratings/remove/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) return void noSession(res);
      const address = bookAddressOf(deps.config, (req.body ?? {}).bookSlug);
      const { standing } = await currentReview(deps.config, deps.query, user.pubkeyHex, address);
      res.status(200).json({ template: standing ? buildRemovalTemplateFor(standing, user.pubkeyHex, nowSec()) : null });
    } catch (err) {
      if (err instanceof RatingError) return void ratingErrorResponse(res, err);
      next(err);
    }
  });

  // Remove the caller's OWN review with a NIP-09 kind 5 (books actions contract
  // §6). Sovereign posts the signed removal; custodial posts { bookSlug } and the
  // server signs. Idempotent: no current review → 200 { removed: false }, no publish.
  router.post("/api/ratings/remove", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) return void noSession(res);
      const librarian = deps.config.librarianPubkey ?? "";

      const sovereign = user.tier !== "custodial";
      const candidate = (req.body ?? {}).event;
      const slug = sovereign ? removedSlug(candidate, user.pubkeyHex, librarian) : (req.body ?? {}).bookSlug;
      if (sovereign && !slug) {
        res.status(400).json({ error: { code: "malformed", message: "The removal event could not be validated." } });
        return;
      }
      const address = bookAddressOf(deps.config, slug);

      const { standing } = await currentReview(deps.config, deps.query, user.pubkeyHex, address);
      if (!standing) {
        res.status(200).json({ removed: false, summary: rawFromParsed(await bookReviews(deps, address)), yourRating: null });
        return;
      }

      let removal: SignedNostrEvent;
      if (sovereign) {
        const result = validateSignedRemoval(candidate, user.pubkeyHex, standing);
        if (!result.ok) {
          const status = result.code === "pubkey_mismatch" ? 403 : 400;
          res.status(status).json({
            error: {
              code: result.code,
              message:
                result.code === "pubkey_mismatch"
                  ? "A rating can only be removed by its own key."
                  : "The removal event could not be validated.",
            },
          });
          return;
        }
        removal = candidate as SignedNostrEvent;
      } else {
        if (!deps.custodialSign) {
          res.status(501).json({ error: { code: "not_supported", message: "Custodial signing is unavailable." } });
          return;
        }
        const signed = await deps.custodialSign(
          cookie ? tokenToId(cookie).toString("hex") : "",
          buildRemovalTemplateFor(standing, user.pubkeyHex, nowSec()),
        );
        if (!signed) {
          res.status(401).json({ error: { code: "reauth_required", message: "Please sign in again to remove your rating." } });
          return;
        }
        removal = signed;
      }

      const published = await deps.publish(removal);
      if (!published.ok) {
        res.status(502).json({ error: { code: "publish_failed", message: "Could not publish the removal to the relay." } });
        return;
      }
      res.status(200).json({ removed: true, summary: rawFromParsed(await bookReviews(deps, address)), yourRating: null });
    } catch (err) {
      if (err instanceof RatingError) return void ratingErrorResponse(res, err);
      next(err);
    }
  });

  // Public read-back for a book. Always returns the raw summary; when trust is
  // configured, also a trust-weighted view for the observer (ADR 0014).
  // `?observer=<npub|hex>` picks the vantage; default = the house observer.
  router.get("/api/books/:slug/ratings", async (req, res, next) => {
    try {
      const address = bookAddressOf(deps.config, req.params.slug);
      const deduped = await bookReviews(deps, address);
      const raw = rawFromParsed(deduped);

      const observerParam = typeof req.query.observer === "string" ? req.query.observer : "";
      const observerHex = observerParam ? toObserverHex(observerParam) : (deps.config.houseObserverPubkey ?? null);

      let weighted = null;
      if (deps.trust && observerHex && deduped.length > 0) {
        try {
          const weights = await deps.trust.weights(observerHex, deduped.map((r) => r.pubkey));
          weighted = weightedRatings(deduped, weights, npubEncode(observerHex));
        } catch {
          weighted = null; // degrade to raw on any trust failure
        }
      }

      // Story 28 / ADR 0029: the caller's own review, from the unweighted set.
      const yourRating = await resolveYourRating(deps, readSessionCookie(req), address, deduped);
      res.status(200).json({ ...raw, weighted, yourRating });
    } catch (err) {
      if (err instanceof RatingError) return void ratingErrorResponse(res, err);
      next(err);
    }
  });

  return router;
}
