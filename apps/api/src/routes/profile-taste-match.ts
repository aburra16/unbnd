// Story 65 / ADR 0064 — GET /api/profile/:id/taste-match. Observer-relative,
// read-time (never cached, mirrors For-You): resolves the SIGNED-IN viewer from
// the session cookie, reads the viewer's and the target's ratings author-scoped,
// and returns the raw taste-match (computeTasteMatch). Signed out → no match;
// viewing your own profile → self. Best-effort: a read failure degrades to an
// honest empty match, never a 500. v1 raw agreement, independent of the
// House/Yours toggle (the trust-weighted variant is a later story).
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import { buildBookRatingsHeaderAddress, formatAddress } from "@unbnd/schemas";
import { computeTasteMatch } from "@unbnd/trust";
import type { Config } from "../config";
import type { NostrFilter, PagedResult } from "../nostr/query";
import { toHex } from "../nostr/npub";
import { scoreBySlug } from "../ratings/summary";

const KIND = 39999;
const COOKIE_NAME = "session";
const DEFAULT_MIN_OVERLAP = 5;

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export type TasteMatchSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type TasteMatchDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<TasteMatchSessionUser | null>;
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
};

export type TasteMatchResponse =
  | { readonly signedIn: false }
  | { readonly signedIn: true; readonly self: true }
  | {
      readonly signedIn: true;
      readonly self: false;
      readonly commonBooks: number;
      readonly thresholdMet: boolean;
      readonly percentage?: number;
    };

export function buildTasteMatchRouter(deps: TasteMatchDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const ratingsZ = () => formatAddress(buildBookRatingsHeaderAddress(lib() as never));
  const minOverlap = () => deps.config.tasteMatchMinOverlap ?? DEFAULT_MIN_OVERLAP;

  router.get("/api/profile/:id/taste-match", async (req, res, next) => {
    try {
      // Hidden when signed out (the web renders nothing). No reads.
      const viewer = await deps.sessionUser(cookieOf(req));
      if (!viewer) return void res.status(200).json({ signedIn: false });

      const targetHex = toHex(req.params.id);
      if (!targetHex)
        return void res
          .status(404)
          .json({ error: { code: "not_found", message: "No such profile." } });

      // Viewing your own profile → no self-comparison.
      if (targetHex === viewer.pubkeyHex)
        return void res.status(200).json({ signedIn: true, self: true });

      // Read both rating sets author-scoped (the observer is the session user).
      // Best-effort: a read failure degrades to an honest empty match, not a 500.
      let observerScores: Map<string, number>;
      let targetScores: Map<string, number>;
      try {
        const [viewerPaged, targetPaged] = await Promise.all([
          deps.queryPaged({ kinds: [KIND], "#z": [ratingsZ()], authors: [viewer.pubkeyHex] }),
          deps.queryPaged({ kinds: [KIND], "#z": [ratingsZ()], authors: [targetHex] }),
        ]);
        observerScores = scoreBySlug(viewerPaged.events);
        targetScores = scoreBySlug(targetPaged.events);
      } catch {
        return void res.status(200).json({
          signedIn: true,
          self: false,
          commonBooks: 0,
          thresholdMet: false,
        });
      }

      const match = computeTasteMatch(observerScores, targetScores, minOverlap());
      res.status(200).json({ signedIn: true, self: false, ...match });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
