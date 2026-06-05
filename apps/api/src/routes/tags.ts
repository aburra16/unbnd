// /api/tags + classification read/write routes (ADR 0009). DI like the other
// routers. Sovereign client-signs assertions; custodial server-signs via the
// session wrap. Reads are honest raw consensus with accusatory tags hidden.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import { npubEncode, decode } from "nostr-tools/nip19";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import {
  fromAccusatoryRevealEvent,
  fromBookTagAssertionEvent,
  fromWireEvent,
  type SignedNostrEvent,
  type NostrEventTemplate,
} from "@unbnd/schemas";
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
  /**
   * Best-effort index-on-write hook (Story 60 / ADR 0059 §4). Fired
   * fire-and-forget AFTER a durable assertion publish succeeds, with the book
   * slug, on BOTH the sovereign and custodial branches. Absent → no live index
   * update (a deployment without search degrades cleanly; the batch indexer is
   * the backstop). The route decides WHETHER to reindex; the shared
   * @unbnd/search `reindexBook` helper decides HOW.
   */
  readonly reindexBook?: (bookSlug: string) => void;
};

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

/** The first `t` tag value of a signed assertion event = the tag slug (the
 * BookTagAssertion emits `["t", tagSlug]` before `["t", tagType]`). */
function firstTTag(tags: string[][] | undefined): string | undefined {
  return tags?.find((t) => t[0] === "t")?.[1];
}

/**
 * The CANONICAL asserted tag slug from a signed assertion event's parsed JSON
 * payload (`bookTagAssertion.tagSlug`) — the SAME field the read aggregate keys
 * visibility off (`fromBookTagAssertionEvent` → `aggregate.ts`). The write gate
 * resolves sensitivity from this so it can never diverge from the read.
 * Returns undefined if the payload can't be parsed (malformed event).
 */
function payloadTagSlug(event: SignedNostrEvent): string | undefined {
  try {
    const assertion = fromBookTagAssertionEvent(
      fromWireEvent({ kind: event.kind, content: event.content, tags: event.tags }) as never,
    );
    return assertion.tagSlug;
  } catch {
    return undefined;
  }
}

/**
 * The CANONICAL asserted BOOK slug from a signed assertion event's parsed JSON
 * payload (`bookTagAssertion.bookSlug`) — the SAME field the index-on-write
 * doc-build keys on. Returns undefined if the payload can't be parsed.
 */
function payloadBookSlug(event: SignedNostrEvent): string | undefined {
  try {
    const assertion = fromBookTagAssertionEvent(
      fromWireEvent({ kind: event.kind, content: event.content, tags: event.tags }) as never,
    );
    return assertion.bookSlug;
  } catch {
    return undefined;
  }
}

/**
 * Fire the best-effort index-on-write hook (ADR 0059 §4) fire-and-forget: only
 * when a slug + hook are present, and wrapped so a SYNCHRONOUS throw from the
 * injected hook never reaches the route (the 200 must return regardless — the
 * shared `reindexBook` helper already swallows async failures internally).
 */
function fireReindex(deps: TagsDeps, bookSlug: string | undefined): void {
  if (!deps.reindexBook || !bookSlug) return;
  try {
    deps.reindexBook(bookSlug);
  } catch {
    // best-effort: never fails the user write (ADR 0059 §7)
  }
}

/**
 * Reduce accusatory-reveal events to the set of tag slugs currently revealed
 * (ADR 0034 §3 / AC-4/AC-6). Keep the LATEST event per (book, tag) d-tag by
 * created_at; include a tag's slug only when that latest event's state is
 * `revealed` (a later `withdrawn` supersedes, hiding it again). Filter-at-read:
 * the canonical assertions are never consulted or mutated here.
 */
function resolveRevealedSlugs(
  revealEvents: SignedNostrEvent[],
): ReadonlySet<string> {
  const latest = new Map<
    string,
    { slug: string; state: string; createdAt: number }
  >();
  for (const e of revealEvents) {
    const dTag = e.tags.find((t) => t[0] === "d")?.[1];
    if (!dTag) continue;
    let reveal;
    try {
      reveal = fromAccusatoryRevealEvent(
        fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
      );
    } catch {
      continue;
    }
    const prior = latest.get(dTag);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(dTag, {
        slug: reveal.tagSlug,
        state: reveal.state,
        createdAt: e.created_at,
      });
    }
  }
  const revealed = new Set<string>();
  for (const v of latest.values()) {
    if (v.state === "revealed") revealed.add(v.slug);
  }
  return revealed;
}

export function buildTagsRouter(deps: TagsDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const tagsConcept = () => `39998:${lib()}:book-tags`;
  const assertConcept = () => `39998:${lib()}:book-tag-assertions`;
  const revealsConcept = () => `39998:${lib()}:accusatory-reveals`;
  const unavailable = (res: express.Response) =>
    res.status(503).json({ error: { code: "feature_unavailable", message: "Tagging is not configured." } });

  // The caller's own house-PoV trust weight (ADR 0034 §1, lifted from
  // submissions.ts). The gate is ALWAYS the house vantage over the SESSION
  // user's own key. Any degrade (no provider, no observer, empty map, throwing
  // seam) resolves to 0 so the accusatory gate CLOSES — the seam never 500s.
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

  // Whether a tag slug is accusatory per the librarian taxonomy. Unknown slugs
  // (absent from the taxonomy) are treated as non-accusatory — the existing
  // behavior (unknown tags are already dropped at read). Fail-open to
  // non-accusatory only on a taxonomy read failure (the write gate is the
  // accusatory branch; a missing taxonomy must not block the normal path).
  const isAccusatorySlug = async (slug: string | undefined): Promise<boolean> => {
    if (!slug) return false;
    try {
      const taxonomy = parseTaxonomy(
        await deps.query({ kinds: [KIND], "#z": [tagsConcept()] }),
      );
      return taxonomy.some((t) => t.slug === slug && t.sensitivity === "accusatory");
    } catch {
      return false;
    }
  };

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
      // ONE batched, #a-scoped reveal query per book read (no N+1) alongside
      // taxonomy + assertions (ADR 0034 §3).
      const [taxEvents, assertEvents, revealEvents] = await Promise.all([
        deps.query({ kinds: [KIND], "#z": [tagsConcept()] }),
        deps.query({ kinds: [KIND], "#z": [assertConcept()], "#a": [bookAddr] }),
        deps.query({ kinds: [KIND], "#z": [revealsConcept()], "#a": [bookAddr] }),
      ]);
      const taxonomy = parseTaxonomy(taxEvents);

      // Reduce reveal events to the LATEST per (book, tag) d-tag; surface only
      // those whose latest state is `revealed` (a later `withdrawn` supersedes —
      // AC-6). The signed event is the ground truth; canonical assertions are
      // never mutated.
      const revealedTagSlugs = resolveRevealedSlugs(revealEvents);

      // The picker affordance (AC-1): once-computed, fail-closed boolean. Anon
      // or any trust degrade → false. No raw weight is exposed.
      const sessionUser = await deps.sessionUser(cookieOf(req));
      let canAssertAccusatory = false;
      if (sessionUser) {
        const weight = await houseWeightOf(sessionUser.pubkeyHex);
        canAssertAccusatory = weight >= (deps.config.curatorThreshold ?? 0.5);
      }

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
        revealedTagSlugs,
      );
      res.status(200).json({
        genres,
        styles,
        signals,
        weighted,
        canAssertAccusatory,
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

      // On the sovereign path, validate the client-signed event FIRST so the gate
      // and the canonical-consistency check operate on a verified event. (The
      // custodial path has no client event; the server signs the body intent.)
      if (user.tier !== "custodial") {
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
        // Canonical-consistency (review hardening): the write gate resolves
        // sensitivity from the parsed payload `tagSlug` (the field the READ keys
        // on); the wire `["t", …]` tag must agree. A crafted sovereign event that
        // diverges the two (wire `t`=normal slips the gate while payload=accusatory
        // is what the read surfaces) is REJECTED at the write boundary as an
        // invalid event — regardless of the signer's curator weight, NOT published.
        const wireSlug = firstTTag((event as SignedNostrEvent).tags);
        const canonicalSlug = payloadTagSlug(event as SignedNostrEvent);
        if (canonicalSlug === undefined || wireSlug !== canonicalSlug) {
          return void res.status(400).json({
            error: { code: "tag_mismatch", message: "Invalid tag event." },
          });
        }
      }

      // ADR 0034 §1 — the sensitivity-conditional curator gate, run BEFORE either
      // tier path so it applies identically to sovereign and custodial writes.
      // The asserted tag slug is resolved from the SAME canonical field the read
      // keys off: the parsed payload `tagSlug` on the sovereign path (verified
      // above to equal the wire `t`, so the two can never diverge) and the body
      // intent on the custodial path (no client event exists).
      const assertedTagSlug =
        user.tier === "custodial"
          ? (req.body?.tagSlug as string | undefined)
          : payloadTagSlug(req.body?.event as SignedNostrEvent);
      if (await isAccusatorySlug(assertedTagSlug)) {
        const weight = await houseWeightOf(user.pubkeyHex);
        if (weight < (deps.config.curatorThreshold ?? 0.5)) {
          return void res
            .status(403)
            .json({ error: { code: "below_gate", message: "Not a curator." } });
        }
      }

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
        // Best-effort index-on-write (ADR 0059 §4): only on durable publish
        // success, fire-and-forget, never blocks or fails the 200.
        fireReindex(deps, bookSlug as string | undefined);
        return void res.status(200).json({ ok: true });
      }

      // sovereign: client-signed event (already validated + consistency-checked above)
      const { event } = req.body ?? {};
      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        return void res.status(502).json({ error: { code: "publish_failed", message: "Could not publish." } });
      }
      // Best-effort index-on-write (ADR 0059 §4): the book slug comes from the
      // SAME canonical payload field the read keys off (bookTagAssertion.bookSlug).
      fireReindex(deps, payloadBookSlug(event as SignedNostrEvent));
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
