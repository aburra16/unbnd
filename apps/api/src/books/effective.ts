// Shared effective-book merge (ADR 0033 §5). The canonical librarian record is
// NEVER mutated: we derive a new object applying the verified author's overlay
// (blurb / coverUrl / purchaseUrl), tracking which fields the author provided.
//
// Both the public read (`GET /api/books/:slug`) and the author-edits write
// read-back (ADR §4: `{ ok: true, book: effectiveBook }`) use this — one merge,
// no duplication. none-on-conflict (ADR 0033 D5): an overlay is applied only when
// EXACTLY ONE claimant is verified; 0 or >1 → canonical, authorProvided [].
import {
  fromBookAuthorOverlayEvent,
  fromBookRecordEvent,
  fromWireEvent,
  isDelistedRecord,
  isJunkRecord,
  type BookAuthorOverlay,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";

export const OVERLAY_FIELDS = ["blurb", "coverUrl", "purchaseUrl"] as const;
export type OverlayField = (typeof OVERLAY_FIELDS)[number];

/** The book fields the UI consumes — no hex, no parent header. */
export type PublicBook = Pick<
  BookRecord,
  | "slug"
  | "title"
  | "authorName"
  | "blurb"
  | "coverUrl"
  | "publishYear"
  | "pageCount"
  | "language"
  | "subjects"
  | "openLibraryId"
  | "isbn13"
  | "purchaseUrl"
  | "format"
  // Story 80 / ADR 0078: provenance, so the web can gate the curator-only
  // remove-from-catalog action to community-promoted books.
  | "source"
>;

function toPublicBook(record: BookRecord): PublicBook {
  return {
    slug: record.slug,
    title: record.title,
    authorName: record.authorName,
    blurb: record.blurb,
    coverUrl: record.coverUrl,
    publishYear: record.publishYear,
    pageCount: record.pageCount,
    language: record.language,
    subjects: record.subjects,
    openLibraryId: record.openLibraryId,
    isbn13: record.isbn13,
    purchaseUrl: record.purchaseUrl,
    format: record.format,
    source: record.source,
  };
}

export function parseBook(
  event: SignedNostrEvent,
  currentYear: number = new Date().getUTCFullYear(),
): PublicBook | null {
  // Story 80 / ADR 0078: a DELISTED record never resolves to a book: the
  // intentional predicate (checked before any parse), so detail 404s and
  // browse/hydration drop it on every surface.
  if (isDelistedRecord(event)) return null;
  try {
    const unsigned = fromWireEvent({ kind: event.kind, content: event.content, tags: event.tags });
    const record = fromBookRecordEvent(unsigned as never);
    // Read-time prune (Story 56, ADR 0055 §3): junk never resolves to a book,
    // so every direct-relay surface drops it and a junk slug's detail 404s.
    if (isJunkRecord(record, currentYear)) return null;
    return toPublicBook(record);
  } catch {
    return null;
  }
}

/** The latest author overlay per author hex (replaceable per (author, book)). */
export function parseLatestOverlays(
  events: SignedNostrEvent[],
): Map<string, BookAuthorOverlay> {
  const latest = new Map<string, { overlay: BookAuthorOverlay; createdAt: number }>();
  for (const e of events) {
    let overlay: BookAuthorOverlay;
    try {
      const unsigned = fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags });
      overlay = fromBookAuthorOverlayEvent(unsigned as never);
    } catch {
      continue;
    }
    const hex = overlay.authorPubkey;
    const prior = latest.get(hex);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(hex, { overlay, createdAt: e.created_at });
    }
  }
  const out = new Map<string, BookAuthorOverlay>();
  for (const [hex, v] of latest) out.set(hex, v.overlay);
  return out;
}

/**
 * Merge the verified author's overlay onto the canonical book, deriving a NEW
 * object (canonical never mutated). none-on-conflict: applied only when exactly
 * one claimant is verified. Returns the effective book + the provided fields.
 */
export function mergeEffectiveBook(
  canonical: PublicBook,
  verifiedHexes: readonly string[],
  overlayEvents: SignedNostrEvent[],
): { effectiveBook: PublicBook; authorProvided: OverlayField[] } {
  if (verifiedHexes.length !== 1) {
    return { effectiveBook: canonical, authorProvided: [] };
  }
  const overlay = parseLatestOverlays(overlayEvents).get(verifiedHexes[0]!);
  if (!overlay) {
    return { effectiveBook: canonical, authorProvided: [] };
  }
  const merged: PublicBook = { ...canonical };
  const authorProvided: OverlayField[] = [];
  for (const field of OVERLAY_FIELDS) {
    const value = overlay[field];
    if (value != null) {
      (merged as Record<OverlayField, string | undefined>)[field] = value;
      authorProvided.push(field);
    }
  }
  return { effectiveBook: merged, authorProvided };
}
