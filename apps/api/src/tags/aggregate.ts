// Aggregate tag assertions into honest raw consensus (ADR 0009). No trust
// weighting (Layer 2). Accusatory tags are dropped from surfaced output until
// the trust+role gate exists.
import {
  fromBookTagAssertionEvent,
  fromBookTagEvent,
  fromWireEvent,
  type SignedNostrEvent,
  type TagSensitivity,
  type TagType,
} from "@unbnd/schemas";

/** A taxonomy element as read back from the `book-tags` concept. */
export type TaxonomyElement = {
  readonly slug: string;
  readonly type: TagType;
  readonly name: string;
  readonly sensitivity: TagSensitivity;
};

/**
 * Consensus for one tag on one book. `applies`/`disputes` are the raw,
 * unweighted polarity counts (the labelled-community substrate). `trusted` is
 * true when ≥1 positively-trusted asserter (weight > 0) backed this tag from
 * the active observer's vantage — false on the raw `aggregateBookTags` path and
 * on the degraded/no-trust weighted path (ADR 0025).
 */
export type TagConsensus = {
  readonly slug: string;
  readonly name: string;
  readonly type: TagType;
  readonly applies: number;
  readonly disputes: number;
  readonly trusted: boolean;
  /**
   * ADR 0034 §3: true ONLY on an accusatory tag surfaced because a live reveal
   * exists for it (its slug was in `revealedTagSlugs`). The web renders a
   * revealed tag attributed to a review action, never as community consensus.
   * Absent on every normal/genre/style tag and on the default (no-reveal) path.
   */
  readonly revealed?: boolean;
  /**
   * Story 81 / ADR 0079: true ONLY on a non-accusatory tag the trusted graph
   * does NOT net-apply (trustedDisputes >= trustedApplies with >=1 trusted
   * asserter). Never set on the raw/no-trust view. Additive; omitted unless true.
   */
  readonly contested?: boolean;
  /**
   * Story 78 / ADR 0076: true ONLY on an UNREVEALED accusatory tag surfaced in
   * the curator-only gated view (`includeGatedAccusatory`). It is the curator's
   * cue to decide whether to reveal; the public never sees it. Absent otherwise.
   */
  readonly gated?: boolean;
};

export type BookTags = {
  readonly genres: TagConsensus[];
  readonly styles: TagConsensus[];
  readonly signals: TagConsensus[];
};

/**
 * Raw, unweighted consensus — the original `aggregateBookTags` shape with NO
 * `trusted` field (ADR 0025 keeps the raw aggregate untouched; the weighted
 * layer is the only carrier of `trusted`).
 */
export type RawTagConsensus = Omit<TagConsensus, "trusted">;

export type RawBookTags = {
  readonly genres: RawTagConsensus[];
  readonly styles: RawTagConsensus[];
  readonly signals: RawTagConsensus[];
};

function parseAssertion(event: SignedNostrEvent) {
  const unsigned = fromWireEvent({
    kind: event.kind,
    content: event.content,
    tags: event.tags,
  });
  return fromBookTagAssertionEvent(unsigned as never);
}

export function parseTaxonomy(events: SignedNostrEvent[]): TaxonomyElement[] {
  const out: TaxonomyElement[] = [];
  for (const e of events) {
    try {
      const tag = fromBookTagEvent(
        fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
      );
      out.push({ slug: tag.slug, type: tag.type, name: tag.name, sensitivity: tag.sensitivity });
    } catch {
      // skip anything that isn't a well-formed tag element
    }
  }
  return out;
}

export function aggregateBookTags(
  assertions: SignedNostrEvent[],
  taxonomy: TaxonomyElement[],
): RawBookTags {
  // Raw consensus = the weighted aggregation with no weights (every asserter is
  // weight 0), with the `trusted` field stripped so the raw aggregate keeps its
  // original shape. The raw applies/disputes counts are unchanged.
  const { genres, styles, signals } = aggregateBookTagsWeighted(
    assertions,
    taxonomy,
    new Map(),
  );
  const strip = ({ slug, name, type, applies, disputes }: TagConsensus): RawTagConsensus => ({
    slug,
    name,
    type,
    applies,
    disputes,
  });
  return {
    genres: genres.map(strip),
    styles: styles.map(strip),
    signals: signals.map(strip),
  };
}

/**
 * Trust-weighted classification consensus from an observer's vantage (ADR 0025).
 * Mirrors `weightedRatings`: for each deduped tag, sum the trust weights of
 * apply-asserters and dispute-asserters separately over asserters with weight
 * > 0. A tag is `trusted` when it had ≥1 positively-trusted asserter; from that
 * trusted vantage a tag is surfaced when `trustedApplies > trustedDisputes`,
 * else it falls back to the raw `applies > disputes` rule. Untrusted asserters
 * contribute weight 0, so untrusted volume cannot flip or dilute the trusted
 * view (AC-2). Raw `applies`/`disputes` are preserved as the labelled-community
 * substrate. `weighted` is true when any surfaced tag carries trusted signal.
 *
 * An empty `weights` map is the degraded / no-trust path: every tag is
 * `trusted: false`, `weighted` is false, and surfacing is purely raw.
 */
export function aggregateBookTagsWeighted(
  assertions: SignedNostrEvent[],
  taxonomy: TaxonomyElement[],
  weights: Map<string, number>,
  // ADR 0034 §3: the slugs of accusatory tags currently revealed for THIS book.
  // Default empty = today's behavior (every accusatory tag hidden), so every
  // existing caller and the raw `aggregateBookTags` path are unchanged.
  revealedTagSlugs: ReadonlySet<string> = new Set(),
  // Story 78 / ADR 0076: when true (curator-only), surface UNREVEALED accusatory
  // tags marked `gated: true` so a curator can decide to reveal. Default false =
  // today's behavior (gated tags invisible) — the PUBLIC gate is unchanged.
  includeGatedAccusatory = false,
): BookTags & { weighted: boolean } {
  const tax = new Map(taxonomy.map((t) => [t.slug, t]));
  // Dedup by (author, tagSlug) keeping the latest created_at.
  const latest = new Map<
    string,
    { author: string; slug: string; polarity: number; createdAt: number }
  >();
  for (const e of assertions) {
    let a;
    try {
      a = parseAssertion(e);
    } catch {
      continue;
    }
    const key = `${e.pubkey}|${a.tagSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, {
        author: e.pubkey,
        slug: a.tagSlug,
        polarity: a.polarity,
        createdAt: e.created_at,
      });
    }
  }

  const acc = new Map<
    string,
    { applies: number; disputes: number; trustedApplies: number; trustedDisputes: number }
  >();
  for (const v of latest.values()) {
    const c =
      acc.get(v.slug) ?? { applies: 0, disputes: 0, trustedApplies: 0, trustedDisputes: 0 };
    const w = weights.get(v.author) ?? 0;
    if (v.polarity === 1) {
      c.applies++;
      if (w > 0) c.trustedApplies += w;
    } else if (v.polarity === -1) {
      c.disputes++;
      if (w > 0) c.trustedDisputes += w;
    }
    acc.set(v.slug, c);
  }

  const result: BookTags = { genres: [], styles: [], signals: [] };
  let anyTrusted = false;
  for (const [slug, c] of acc) {
    const el = tax.get(slug);
    if (!el) continue; // unknown still dropped
    // Accusatory tags stay hidden UNLESS a live reveal exists for this slug
    // (filter-at-read; the canonical assertions are never mutated — AC-3/AC-4).
    const isAccusatory = el.sensitivity === "accusatory";
    const isRevealed = revealedTagSlugs.has(slug);
    // Accusatory tags stay hidden from the PUBLIC unless revealed. Story 78: when
    // includeGatedAccusatory (curator-only), an UNREVEALED accusatory tag is
    // surfaced instead, marked `gated` (the curator's cue), never `revealed`.
    const isGated = isAccusatory && !isRevealed;
    if (isGated && !includeGatedAccusatory) continue;
    const trusted = c.trustedApplies + c.trustedDisputes > 0;
    if (trusted) anyTrusted = true;
    const consensus: TagConsensus = {
      slug,
      name: el.name,
      type: el.type,
      applies: c.applies,
      disputes: c.disputes,
      trusted,
      // A revealed accusatory tag carries `revealed` (AC-4/AC-5); an unrevealed
      // one in the curator-only view carries `gated` (Story 78). Never both.
      ...(isAccusatory ? (isRevealed ? { revealed: true } : { gated: true }) : {}),
    };
    if (el.type === "genre") result.genres.push(consensus);
    else if (el.type === "style") result.styles.push(consensus);
    else result.signals.push(consensus);
  }
  return { ...result, weighted: anyTrusted };
}

/**
 * Own-applied-tags count for the signed-in user's profile (ADR 0019 Decision 2,
 * AC-7). Single-author read, so latest-wins keys on the (bookSlug, tagSlug) PAIR
 * (author is fixed) rather than (author, tagSlug) as in `aggregateBookTags`.
 * Counts pairs whose latest assertion has polarity +1; disputes (latest -1) and
 * retractions are excluded by construction.
 */
export function countOwnAppliedTags(assertions: SignedNostrEvent[]): number {
  const latest = new Map<string, { polarity: number; createdAt: number }>();
  for (const e of assertions) {
    let a;
    try {
      a = parseAssertion(e);
    } catch {
      continue;
    }
    const key = `${a.bookSlug}|${a.tagSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, { polarity: a.polarity, createdAt: e.created_at });
    }
  }
  let applied = 0;
  for (const v of latest.values()) {
    if (v.polarity === 1) applied++;
  }
  return applied;
}

export function aggregateGenreBooks(assertions: SignedNostrEvent[]): string[] {
  // Dedup by (author, book) keeping latest; net = applies - disputes per book.
  const latest = new Map<string, { polarity: number; createdAt: number; book: string }>();
  for (const e of assertions) {
    let a;
    try {
      a = parseAssertion(e);
    } catch {
      continue;
    }
    const key = `${e.pubkey}|${a.bookSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, { polarity: a.polarity, createdAt: e.created_at, book: a.bookSlug });
    }
  }
  const net = new Map<string, number>();
  for (const v of latest.values()) {
    net.set(v.book, (net.get(v.book) ?? 0) + v.polarity);
  }
  return [...net.entries()].filter(([, n]) => n > 0).map(([book]) => book);
}
