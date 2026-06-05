// Book-read API (ADR 0010): live catalog reads off the local relay. Read-only,
// public. Books are kind-39999 records z-tagged to the `books` concept,
// d-tag = slug.
import express, { type Router } from "express";
import { npubEncode } from "nostr-tools/nip19";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import type { TrustProvider } from "../trust";
import { projectClaimantHexes } from "../claims/claimants";
import { computeVerification } from "../author-verified/verify";
import { mergeEffectiveBook, parseBook, type PublicBook } from "../books/effective";

export type { PublicBook };
export { parseBook };

const KIND = 39999;
const DEFAULT_RECENT = 24;

export type BooksDeps = {
  readonly config: Config;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /** Trust seam (ADR 0014). Optional: absent → no verification (honest degrade). */
  readonly trust?: TrustProvider;
};

/**
 * A claimant projected for the badge (npub-out). `verified` is present only when
 * the trust seam is wired (Story 31 reads with no trust stay `{ npub }`).
 */
export type PublicClaimant = { readonly npub: string; readonly verified?: boolean };

export function buildBooksRouter(deps: BooksDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const booksConcept = () => `39998:${lib()}:books`;
  const claimsConcept = () => `39998:${lib()}:book-claims`;
  const verifiedConcept = () => `39998:${lib()}:author-verified`;
  const editsConcept = () => `39998:${lib()}:author-edits`;
  const bookAtag = (slug: string) => `${KIND}:${lib()}:${slug}`;

  router.get("/api/books/:slug", async (req, res, next) => {
    try {
      if (!lib()) {
        return void res.status(503).json({ error: { code: "feature_unavailable", message: "Catalog not configured." } });
      }
      // FOUR parallel reads (ADR 0033 §5): canonical, claims, author-verified
      // assertions, author overlays. The verification + overlay merge composes
      // `effectiveBook` at read time — the canonical record is NEVER mutated.
      const slug = req.params.slug;
      const [bookEvents, claimEvents, verifiedEvents, overlayEvents] = await Promise.all([
        deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": [slug] }),
        deps.query({ kinds: [KIND], "#z": [claimsConcept()], "#a": [bookAtag(slug)] }),
        deps.query({ kinds: [KIND], "#z": [verifiedConcept()], "#a": [bookAtag(slug)] }),
        deps.query({ kinds: [KIND], "#z": [editsConcept()], "#a": [bookAtag(slug)] }),
      ]);
      const book = bookEvents.map((e) => parseBook(e)).find((b): b is PublicBook => b !== null);
      if (!book) {
        return void res.status(404).json({ error: { code: "not_found", message: "No such book." } });
      }

      const claimantHexes = projectClaimantHexes(claimEvents);
      const verifiedHexes = deps.trust
        ? await computeVerification(
            verifiedEvents,
            claimantHexes,
            deps.config.houseObserverPubkey,
            deps.config.curatorThreshold ?? 0.5,
            deps.config.verifiedAuthorMinCurators ?? 2,
            deps.trust,
          )
        : [];
      const verifiedSet = new Set(verifiedHexes);

      // none-on-conflict (ADR 0033 D5): the shared merge applies an overlay only
      // when EXACTLY ONE claimant is verified. The canonical record is never
      // mutated — a new effective book is derived.
      const { effectiveBook, authorProvided } = mergeEffectiveBook(
        book,
        verifiedHexes,
        overlayEvents,
      );

      const claimants: PublicClaimant[] = claimantHexes.map((hex) =>
        deps.trust
          ? { npub: npubEncode(hex), verified: verifiedSet.has(hex) }
          : { npub: npubEncode(hex) },
      );

      res.status(200).json({ book: effectiveBook, claimants, authorProvided });
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/books", async (req, res, next) => {
    try {
      if (!lib()) {
        return void res.status(503).json({ error: { code: "feature_unavailable", message: "Catalog not configured." } });
      }
      const slugsParam = typeof req.query.slugs === "string" ? req.query.slugs : "";
      if (slugsParam) {
        const slugs = slugsParam.split(",").map((s) => s.trim()).filter(Boolean);
        const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": slugs });
        const bySlug = new Map<string, PublicBook>();
        for (const e of events) {
          const b = parseBook(e);
          if (b && !bySlug.has(b.slug)) bySlug.set(b.slug, b);
        }
        // Return in requested order, skipping any not found.
        const books = slugs.map((s) => bySlug.get(s)).filter((b): b is PublicBook => Boolean(b));
        return void res.status(200).json({ books });
      }
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || DEFAULT_RECENT));
      const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], limit });
      const books = events
        .slice()
        .sort((a, b) => b.created_at - a.created_at)
        .map((e) => parseBook(e))
        .filter((b): b is PublicBook => b !== null)
        .slice(0, limit);
      res.status(200).json({ books });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
