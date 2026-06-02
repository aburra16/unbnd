// "Books by this author" by-author read (Story 31 / ADR 0032 §2b).
// GET /api/profile/:npub/claimed-books reads the PATH author's claim events
// (cap-safe via queryPaged, ADR 0021), resolves each claim's book slug, dedupes,
// then hydrates the catalog records via the existing batch read (deps.query over
// the `#d` slugs). Returns `{ books: PublicBook[] }` in claim order; an
// unresolvable slug (a claim whose book was removed) is skipped; zero claims →
// `{ books: [] }`. Read by the path npub, never a session.
import express, { type Router } from "express";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter, PagedResult } from "../nostr/query";
import { toHex } from "../nostr/npub";
import { parseBook, type PublicBook } from "./books";

const KIND = 39999;

export type ProfileClaimsDeps = {
  readonly config: Config;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
};

/** The slug a claim references — from its `#t` tag, falling back to the `#a` d-tag. */
function claimSlug(event: SignedNostrEvent): string | null {
  const t = event.tags.find((tag) => tag[0] === "t");
  if (t && typeof t[1] === "string") return t[1];
  const a = event.tags.find((tag) => tag[0] === "a");
  if (a && typeof a[1] === "string") {
    const parts = a[1].split(":");
    if (parts.length >= 3) return parts.slice(2).join(":");
  }
  return null;
}

export function buildProfileClaimsRouter(deps: ProfileClaimsDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const booksConcept = () => `39998:${lib()}:books`;
  const claimsConcept = () => `39998:${lib()}:book-claims`;

  router.get("/api/profile/:npub/claimed-books", async (req, res, next) => {
    try {
      const hex = toHex(req.params.npub);
      if (!hex) {
        return void res
          .status(404)
          .json({ error: { code: "not_found", message: "No such profile." } });
      }
      if (!lib()) {
        return void res.status(503).json({
          error: { code: "feature_unavailable", message: "Claimed books are not configured." },
        });
      }

      const paged = await deps.queryPaged({
        kinds: [KIND],
        "#z": [claimsConcept()],
        authors: [hex],
      });

      // Dedupe slugs, preserving first-seen (claim) order.
      const slugs: string[] = [];
      const seen = new Set<string>();
      for (const e of paged.events) {
        const slug = claimSlug(e);
        if (slug && !seen.has(slug)) {
          seen.add(slug);
          slugs.push(slug);
        }
      }

      if (slugs.length === 0) {
        return void res.status(200).json({ books: [] });
      }

      const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": slugs });
      const bySlug = new Map<string, PublicBook>();
      for (const e of events) {
        const b = parseBook(e);
        if (b && !bySlug.has(b.slug)) bySlug.set(b.slug, b);
      }
      // Return in claim order, skipping any catalog record that no longer resolves.
      const books = slugs.map((s) => bySlug.get(s)).filter((b): b is PublicBook => Boolean(b));
      res.status(200).json({ books });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
