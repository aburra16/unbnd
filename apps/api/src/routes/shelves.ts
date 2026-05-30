// /api/shelves write/read routes (ADR 0018, Story 18). Mirrors routes/tags.ts.
// Sovereign client-signs the membership assertion; custodial server-signs via
// the session wrap. One `polarity` field drives add (1) and remove (-1). The
// /mine read is single-author, so POV-first does not apply. No public browse
// route here — that is Story 19.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter, PagedResult } from "../nostr/query";
import type { SignedNostrEvent, NostrEventTemplate } from "@unbnd/schemas";
import { tokenToId } from "../auth/sessions";
import { validateSignedEvent } from "../nostr/validate";
import { buildShelfTemplate, ShelfError } from "../shelves/template";
import { groupOwnShelves } from "../shelves/aggregate";
import { parseBook, type PublicBook } from "./books";
import { toHex } from "../nostr/npub";

const COOKIE_NAME = "session";
const KIND = 39999;
// Chunk size for the #d catalog enrichment read — tracks strfry maxFilterLimit
// (same source the indexer's BATCH and the paginator's page size use).
const RELAY_PAGE_SIZE = 500;

/** A shelf with its books resolved to catalog records (ADR 0019 Decision 1). */
type EnrichedShelf = {
  readonly slug: string;
  readonly name: string;
  readonly count: number;
  readonly books: PublicBook[];
};

export type ShelvesSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type ShelvesDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<ShelvesSessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  // Paginating author-scoped read (ADR 0021) for the shelf-membership read so a
  // power-curator's full membership is grouped, not truncated at 500. The `#d`
  // catalog enrichment stays on the one-shot `query` (chunked, finite id set).
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
  // Injectable clock for the public-twin TTL cache (ADR 0020 Decision 4).
  readonly now?: () => number;
};

const PUBLIC_TTL_MS = 60_000;

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export function buildShelvesRouter(deps: ShelvesDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const shelvesConcept = () => `39998:${lib()}:book-shelves`;
  const booksConcept = () => `39998:${lib()}:books`;
  const now = deps.now ?? (() => Date.now());

  // Read one author's public shelves and enrich them to PublicBooks via ONE
  // batch catalog read (ADR 0019 Decision 1). Slugs with no resolved record are
  // omitted and the shelf count recounts to the survivors (AC-2). Shared by the
  // session-gated /mine read and the public by-pubkey twin.
  async function enrichedShelvesFor(author: string): Promise<EnrichedShelf[]> {
    // Membership read paginates past the 500 cap (ADR 0021); `.capped` is
    // discarded — no realistic author exceeds 10,000 shelf assertions and the
    // shelf view has no headline count to floor.
    const events = (
      await deps.queryPaged({
        kinds: [KIND],
        "#z": [shelvesConcept()],
        authors: [author],
      })
    ).events;
    const shelves = groupOwnShelves(events);

    const distinctSlugs = [
      ...new Set(shelves.flatMap((s) => s.books.map((b) => b.bookSlug))),
    ];
    const bySlug = new Map<string, PublicBook>();
    // The catalog enrichment is a fixed id set (one current event per slug), not
    // an author walk, so the until-cursor does not apply. Chunk into ≤500-slug
    // one-shot reads (each slice ≤ the cap, so no read is truncated) and merge.
    for (let i = 0; i < distinctSlugs.length; i += RELAY_PAGE_SIZE) {
      const slice = distinctSlugs.slice(i, i + RELAY_PAGE_SIZE);
      const bookEvents = await deps.query({
        kinds: [KIND],
        "#z": [booksConcept()],
        "#d": slice,
      });
      for (const e of bookEvents) {
        const b = parseBook(e);
        if (b && !bySlug.has(b.slug)) bySlug.set(b.slug, b);
      }
    }
    return shelves.map((s) => {
      const books = s.books
        .map((b) => bySlug.get(b.bookSlug))
        .filter((b): b is PublicBook => Boolean(b));
      return { slug: s.slug, name: s.name, count: books.length, books };
    });
  }

  // 60s in-memory TTL cache keyed by the resolved target hex (ADR 0020
  // Decision 4). Time-only invalidation; `now` is injectable for tests.
  const publicCache = new Map<string, { value: EnrichedShelf[]; at: number }>();

  // Build a template for the client to sign (sovereign).
  router.post("/api/shelves/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
      const { bookSlug, shelfSlug, shelfName, polarity } = req.body ?? {};
      const template = buildShelfTemplate(
        deps.config,
        { ownerPubkey: user.pubkeyHex, bookSlug, shelfSlug, shelfName, polarity },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof ShelfError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        return void res
          .status(status)
          .json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // Add/remove a book on a shelf. Sovereign posts {event}; custodial posts the
  // intent. The polarity field drives add (1) and remove (-1). A move across
  // default shelves is two of these calls (retract old, apply new) sequenced by
  // the web layer.
  router.post("/api/shelves", async (req, res, next) => {
    try {
      const cookie = cookieOf(req);
      const user = await deps.sessionUser(cookie);
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });

      if (user.tier === "custodial") {
        const { bookSlug, shelfSlug, shelfName, polarity } = req.body ?? {};
        let template;
        try {
          template = buildShelfTemplate(
            deps.config,
            {
              ownerPubkey: user.pubkeyHex,
              bookSlug,
              shelfSlug,
              shelfName,
              polarity,
            },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof ShelfError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            return void res
              .status(status)
              .json({ error: { code: err.code, message: err.message } });
          }
          throw err;
        }
        if (!deps.custodialSign) {
          return void res.status(501).json({
            error: {
              code: "not_supported",
              message: "Custodial signing unavailable.",
            },
          });
        }
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, template);
        if (!signed) {
          return void res.status(401).json({
            error: { code: "reauth_required", message: "Please sign in again." },
          });
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          return void res.status(502).json({
            error: { code: "publish_failed", message: "Could not publish." },
          });
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
            message:
              v.code === "pubkey_mismatch"
                ? "Must be signed by your own key."
                : "Invalid shelf event.",
          },
        });
      }
      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        return void res.status(502).json({
          error: { code: "publish_failed", message: "Could not publish." },
        });
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // The signed-in user's own shelves, grouped (AC-7). Single-author read.
  router.get("/api/shelves/mine", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
      if (!lib())
        return void res.status(503).json({
          error: {
            code: "feature_unavailable",
            message: "Shelves are not configured.",
          },
        });
      const enriched = await enrichedShelvesFor(user.pubkeyHex);
      res.status(200).json({ shelves: enriched });
    } catch (err) {
      next(err);
    }
  });

  // Any user's public shelves, by npub or hex (ADR 0020 Decision 1, AC-3).
  // Un-gated, author-scoped to the path param. Same EnrichedShelf shape as
  // /mine. A valid-but-empty target returns { shelves: [] }, not 404; an
  // unresolvable segment is 404 not_found (AC-6). A 60s TTL cache keyed by the
  // resolved hex collapses repeat hits (Decision 4).
  router.get("/api/profile/:npub/shelves", async (req, res, next) => {
    try {
      const hex = toHex(req.params.npub);
      if (!hex)
        return void res
          .status(404)
          .json({ error: { code: "not_found", message: "No such profile." } });
      if (!lib())
        return void res.status(503).json({
          error: {
            code: "feature_unavailable",
            message: "Shelves are not configured.",
          },
        });

      const hit = publicCache.get(hex);
      if (hit && now() - hit.at < PUBLIC_TTL_MS) {
        return void res.status(200).json({ shelves: hit.value });
      }
      const enriched = await enrichedShelvesFor(hex);
      publicCache.set(hex, { value: enriched, at: now() });
      res.status(200).json({ shelves: enriched });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
