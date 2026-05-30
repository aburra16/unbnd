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
import type { NostrFilter } from "../nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { countOwnRatings } from "../ratings/summary";
import { countOwnAppliedTags } from "../tags/aggregate";

const COOKIE_NAME = "session";
const KIND = 39999;

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

      const author = user.pubkeyHex;

      // Each read is wrapped so a single throw omits ONLY its field(s). A
      // resolved read yields a present count (a true 0 stays present).
      const ratingsP = (async () =>
        countOwnRatings(
          await deps.query({
            kinds: [KIND],
            "#z": [ratingsConcept()],
            authors: [author],
          }),
        ))().then(
        (r) => ({ ok: true as const, r }),
        () => ({ ok: false as const }),
      );
      const tagsP = (async () =>
        countOwnAppliedTags(
          await deps.query({
            kinds: [KIND],
            "#z": [tagsConcept()],
            authors: [author],
          }),
        ))().then(
        (n) => ({ ok: true as const, n }),
        () => ({ ok: false as const }),
      );

      const [ratings, tags] = await Promise.all([ratingsP, tagsP]);

      const stats: {
        booksRated?: number;
        reviews?: number;
        tagsApplied?: number;
      } = {};
      if (ratings.ok) {
        stats.booksRated = ratings.r.booksRated;
        stats.reviews = ratings.r.reviews;
      }
      if (tags.ok) stats.tagsApplied = tags.n;

      res.status(200).json({ stats });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
