// Session-gated own-profile stats (ADR 0019 Decision 2, AC-5–AC-8). One
// combined GET /api/profile/me/stats runs three author-scoped reads in parallel.
// Each read is wrapped independently: a field is PRESENT when its read succeeds
// (a true 0 is a present 0) and ABSENT when that single read throws, so one
// failing source never blanks the other two and a fabricated 0 is never sent.
// Single-author read (authors:[user.pubkeyHex]); POV-first does not apply.
// Mirrors routes/shelves.ts session-gating deps.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { NostrFilter, PagedResult } from "../nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { countOwnRatings } from "../ratings/summary";
import { countOwnAppliedTags } from "../tags/aggregate";
import { toHex } from "../nostr/npub";
import { distinctFollowCount } from "../profile/follow-count";

const COOKIE_NAME = "session";
const KIND = 39999;
const PUBLIC_TTL_MS = 60_000;

type CappedKey = "booksRated" | "reviews" | "tagsApplied";

// Three states per field: present `number` (exact, incl. a true 0), `undefined`
// (omit-on-throw), and — newly (ADR 0021) — a capped floor (a present number
// whose key is listed in `capped`). The parallel `capped` array is additive: the
// present-check and omit-on-throw semantics are unchanged. Absent/empty ⇒ nothing
// capped.
type Stats = {
  booksRated?: number;
  reviews?: number;
  tagsApplied?: number;
  // ADR 0023 (AC-9): the count of DISTINCT `p` tags on the target's freshest
  // kind-3 (a present 0 when they follow no one / have no kind-3). Omitted on a
  // throwing kind-3 read (omit-on-throw, never a fabricated 0). Honest +
  // uncapped — one user's own bounded contact list in a single event.
  followingCount?: number;
  capped?: CappedKey[];
};


export type ProfileStatsSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type ProfileStatsDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<ProfileStatsSessionUser | null>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  // Paginating author-scoped read (ADR 0021). Pages past the relay's 500 cap and
  // returns { events, capped }; statsFor counts `.events` and flags `.capped`.
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
  // Injectable clock for the public-twin TTL cache (ADR 0020 Decision 4).
  readonly now?: () => number;
};

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export function buildProfileStatsRouter(deps: ProfileStatsDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const ratingsConcept = () => `39998:${lib()}:book-ratings`;
  const tagsConcept = () => `39998:${lib()}:book-tag-assertions`;
  const now = deps.now ?? (() => Date.now());

  // Run the two author-scoped reads for one author. Each read is wrapped so a
  // single throw omits ONLY its field(s); a resolved read yields a present
  // count (a true 0 stays present, a fabricated 0 is never sent). Shared by the
  // session-gated /me/stats and the public by-pubkey twin.
  async function statsFor(author: string): Promise<Stats> {
    // Paged reads (ADR 0021): each pages past the 500 cap and reports `.capped`.
    // A throw (e.g. total-budget exhaustion) still omits ONLY its field(s) and
    // contributes nothing to `capped` (omit-on-throw, Story 19/20).
    const ratingsP = (async () => {
      const paged = await deps.queryPaged({
        kinds: [KIND],
        "#z": [ratingsConcept()],
        authors: [author],
      });
      return { r: countOwnRatings(paged.events), capped: paged.capped };
    })().then(
      (v) => ({ ok: true as const, ...v }),
      () => ({ ok: false as const }),
    );
    const tagsP = (async () => {
      const paged = await deps.queryPaged({
        kinds: [KIND],
        "#z": [tagsConcept()],
        authors: [author],
      });
      return { n: countOwnAppliedTags(paged.events), capped: paged.capped };
    })().then(
      (v) => ({ ok: true as const, ...v }),
      () => ({ ok: false as const }),
    );

    // A fourth parallel, independently-wrapped read (ADR 0023): the target's
    // freshest kind-3, via the one-shot `query` dep (a single event, limit:1 —
    // no paging needed). Omit-on-throw, exactly like the other cells.
    const followingP = (async () => {
      const events = await deps.query({ kinds: [3], authors: [author], limit: 1 });
      return distinctFollowCount(events);
    })().then(
      (n) => ({ ok: true as const, n }),
      () => ({ ok: false as const }),
    );

    const [ratings, tags, following] = await Promise.all([ratingsP, tagsP, followingP]);

    const stats: Stats = {};
    const capped: CappedKey[] = [];
    if (ratings.ok) {
      stats.booksRated = ratings.r.booksRated;
      stats.reviews = ratings.r.reviews;
      // booksRated + reviews are capped together (one ratings read).
      if (ratings.capped) capped.push("booksRated", "reviews");
    }
    if (tags.ok) {
      stats.tagsApplied = tags.n;
      if (tags.capped) capped.push("tagsApplied");
    }
    if (following.ok) stats.followingCount = following.n;
    if (capped.length > 0) stats.capped = capped;
    return stats;
  }

  // 60s in-memory TTL cache keyed by the resolved target hex (ADR 0020
  // Decision 4). Time-only invalidation; `now` is injectable for tests.
  const publicCache = new Map<string, { value: Stats; at: number }>();

  router.get("/api/profile/me/stats", async (req, res, next) => {
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
            message: "Profile stats are not configured.",
          },
        });

      const stats = await statsFor(user.pubkeyHex);
      res.status(200).json({ stats });
    } catch (err) {
      next(err);
    }
  });

  // Any user's public activity counts, by npub or hex (ADR 0020 Decision 1,
  // AC-4). Un-gated, author-scoped to the path param, same Stats shape as
  // /me/stats. Unresolvable segment → 404 not_found (AC-6); a valid-but-empty
  // target returns present-0 counts. 60s TTL cache keyed by the resolved hex.
  router.get("/api/profile/:npub/stats", async (req, res, next) => {
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
            message: "Profile stats are not configured.",
          },
        });

      const hit = publicCache.get(hex);
      if (hit && now() - hit.at < PUBLIC_TTL_MS) {
        return void res.status(200).json({ stats: hit.value });
      }
      const stats = await statsFor(hex);
      publicCache.set(hex, { value: stats, at: now() });
      res.status(200).json({ stats });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
