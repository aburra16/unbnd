// /api/tags + classification read/write routes (ADR 0009). DI like the other
// routers. Sovereign client-signs assertions; custodial server-signs via the
// session wrap. Reads are honest raw consensus with accusatory tags hidden.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import { npubEncode, decode } from "nostr-tools/nip19";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { SignedNostrEvent, NostrEventTemplate } from "@unbnd/schemas";
import { tokenToId } from "../auth/sessions";
import { validateSignedEvent } from "../nostr/validate";
import { buildTagAssertionTemplate, TagError } from "../tags/template";
import {
  aggregateBookTagsWeighted,
  aggregateGenreBooks,
  parseTaxonomy,
} from "../tags/aggregate";
import type { TrustProvider } from "../trust";

const COOKIE_NAME = "session";
const KIND = 39999;
const HEX64 = /^[0-9a-f]{64}$/i;

/** npub or hex → lowercase hex, or null. Mirrors the ratings route. */
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

export type TagsSessionUser = { readonly id: string; readonly pubkeyHex: string; readonly tier: string };

export type TagsDeps = {
  readonly config: Config;
  readonly sessionUser: (cookie: string | undefined) => Promise<TagsSessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
  /** Trust-weighting source (ADR 0014/0025). Absent → raw community reads. */
  readonly trust?: TrustProvider;
};

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export function buildTagsRouter(deps: TagsDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const tagsConcept = () => `39998:${lib()}:book-tags`;
  const assertConcept = () => `39998:${lib()}:book-tag-assertions`;
  const unavailable = (res: express.Response) =>
    res.status(503).json({ error: { code: "feature_unavailable", message: "Tagging is not configured." } });

  // The taxonomy (for the apply/dispute picker).
  router.get("/api/tags", async (_req, res, next) => {
    try {
      if (!lib()) return unavailable(res);
      const els = parseTaxonomy(await deps.query({ kinds: [KIND], "#z": [tagsConcept()] }));
      res.status(200).json({ tags: els });
    } catch (err) {
      next(err);
    }
  });

  // A book's classification consensus (accusatory hidden). Observer-aware like
  // the ratings route: `?observer=<npub|hex>` else the house observer. With a
  // trust provider we surface the trust-weighted consensus (each tag's `trusted`
  // flag + a section-level `weighted` flag) from that vantage; on any trust
  // failure, no observer, or no asserters, it degrades to the raw community view
  // (every `trusted: false`, `weighted: false`) — never throws, always 200.
  router.get("/api/books/:slug/tags", async (req, res, next) => {
    try {
      if (!lib()) return unavailable(res);
      const bookAddr = `${KIND}:${lib()}:${req.params.slug}`;
      const [taxEvents, assertEvents] = await Promise.all([
        deps.query({ kinds: [KIND], "#z": [tagsConcept()] }),
        deps.query({ kinds: [KIND], "#z": [assertConcept()], "#a": [bookAddr] }),
      ]);
      const taxonomy = parseTaxonomy(taxEvents);

      // Resolve the observer: explicit param, else the house observer.
      const observerParam =
        typeof req.query.observer === "string" ? req.query.observer : "";
      const observerHex = observerParam
        ? toObserverHex(observerParam)
        : (deps.config.houseObserverPubkey ?? null);

      const asserters = [...new Set(assertEvents.map((e) => e.pubkey))];
      let weights: Map<string, number> = new Map();
      if (deps.trust && observerHex && asserters.length > 0) {
        try {
          weights = await deps.trust.weights(observerHex, asserters);
        } catch {
          weights = new Map(); // degrade to raw community view on any trust failure
        }
      }

      const { genres, styles, signals, weighted } = aggregateBookTagsWeighted(
        assertEvents,
        taxonomy,
        weights,
      );
      res.status(200).json({
        genres,
        styles,
        signals,
        weighted,
        observer: observerHex ? npubEncode(observerHex) : undefined,
      });
    } catch (err) {
      next(err);
    }
  });

  // Books with net-positive consensus for a genre (browse).
  router.get("/api/genres/:slug/books", async (req, res, next) => {
    try {
      if (!lib()) return unavailable(res);
      const events = await deps.query({
        kinds: [KIND],
        "#z": [assertConcept()],
        "#t": [req.params.slug],
      });
      res.status(200).json({ books: aggregateGenreBooks(events) });
    } catch (err) {
      next(err);
    }
  });

  // Build a template for the client to sign (sovereign).
  router.post("/api/tags/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const { bookSlug, tagSlug, tagType, polarity } = req.body ?? {};
      const template = buildTagAssertionTemplate(
        deps.config,
        { asserterPubkey: user.pubkeyHex, bookSlug, tagSlug, tagType, polarity },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof TagError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        return void res.status(status).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // Apply/dispute. Sovereign posts {event}; custodial posts the intent.
  router.post("/api/tags", async (req, res, next) => {
    try {
      const cookie = cookieOf(req);
      const user = await deps.sessionUser(cookie);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });

      if (user.tier === "custodial") {
        const { bookSlug, tagSlug, tagType, polarity } = req.body ?? {};
        let template;
        try {
          template = buildTagAssertionTemplate(
            deps.config,
            { asserterPubkey: user.pubkeyHex, bookSlug, tagSlug, tagType, polarity },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof TagError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            return void res.status(status).json({ error: { code: err.code, message: err.message } });
          }
          throw err;
        }
        if (!deps.custodialSign) {
          return void res.status(501).json({ error: { code: "not_supported", message: "Custodial signing unavailable." } });
        }
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, template);
        if (!signed) {
          return void res.status(401).json({ error: { code: "reauth_required", message: "Please sign in again." } });
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          return void res.status(502).json({ error: { code: "publish_failed", message: "Could not publish." } });
        }
        return void res.status(200).json({ ok: true });
      }

      // sovereign: client-signed event
      const { event } = req.body ?? {};
      const v = validateSignedEvent(event, user.pubkeyHex, KIND);
      if (!v.ok) {
        const status = v.code === "pubkey_mismatch" ? 403 : 400;
        return void res.status(status).json({
          error: {
            code: v.code,
            message: v.code === "pubkey_mismatch" ? "Must be signed by your own key." : "Invalid tag event.",
          },
        });
      }
      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        return void res.status(502).json({ error: { code: "publish_failed", message: "Could not publish." } });
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
