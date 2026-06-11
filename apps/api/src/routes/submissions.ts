// Community submission write-path (ADR 0016, story 16a). Sovereign posts a
// client-signed { event }; custodial posts the intent and the server signs with
// the session's ephemeral-wrapped key. Records land in the `book-submissions`
// concept (separate from the canonical catalog). `GET /api/submissions/mine`
// lists the signed-in user's submissions. DI like the ratings/tags routers.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import { npubEncode } from "nostr-tools/nip19";
import {
  buildBookSubmissionsHeaderAddress,
  fromBookRecordEvent,
  fromWireEvent,
  asHexPubkey,
  formatAddress,
  type SignedNostrEvent,
  type NostrEventTemplate,
} from "@unbnd/schemas";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { PromotionStatus } from "../db";
import type { TrustProvider } from "../trust";
import { tokenToId } from "../auth/sessions";
import { validateSignedEvent } from "../nostr/validate";
import { buildSubmissionTemplate, SubmissionError } from "../submissions/template";
import {
  computeSubmissionSignals,
  type SubmissionSignals,
} from "../submissions/signals";

const COOKIE_NAME = "session";
const KIND = 39999;

export type SubmissionsSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type SubmissionsDeps = {
  readonly config: Config;
  readonly sessionUser: (cookie: string | undefined) => Promise<SubmissionsSessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
  /** Trust-weighting source (ADR 0014/0031). Absent → gate closes, signals null. */
  readonly trust?: TrustProvider;
  /**
   * Enqueue a promotion (ADR 0031). Idempotent on slug: a second enqueue of the
   * same slug resolves `{ status: "already" }` via the UNIQUE(slug) collision.
   * Absent in fixtures that don't exercise promote.
   */
  readonly enqueuePromotion?: (
    slug: string,
    requestedBy: string,
  ) => Promise<{ status: "queued" | "already" }>;
  /**
   * Batched promotion-state read (ADR 0031 §3b). ONE `WHERE slug = ANY(...)`
   * query over the page's slugs → `Map<slug, status>` (absent slug → never
   * enqueued → the row's `promotionStatus` is null). Injected like
   * `enqueuePromotion`; absent in fixtures that don't exercise the enriched list
   * (every row's `promotionStatus` then degrades to null, route still 200).
   */
  readonly readPromotionStatuses?: (
    slugs: string[],
  ) => Promise<Map<string, PromotionStatus>>;
  /**
   * Enqueue a demotion (Story 80 / ADR 0078 §2): a gated UPDATE that moves a
   * `done` (or retriable `demote_failed`) promotions row to `demote_pending`,
   * recording the requesting curator. `not_promoted` = no demotable row (never
   * promoted / seeded / in flight); `already` = already demoted or queued
   * (idempotent no-op). Absent in fixtures that don't exercise demote.
   */
  readonly enqueueDemotion?: (
    slug: string,
    requestedBy: string,
  ) => Promise<{ status: "queued" | "already" | "not_promoted" }>;
};

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

function toSubmission(e: SignedNostrEvent, withSubmitter: boolean) {
  try {
    const rec = fromBookRecordEvent(
      fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
    );
    return {
      slug: rec.slug,
      title: rec.title,
      authorName: rec.authorName,
      isbn13: rec.isbn13,
      coverUrl: rec.coverUrl,
      publishYear: rec.publishYear,
      createdAt: e.created_at,
      ...(withSubmitter ? { submitter: npubEncode(e.pubkey) } : {}),
    };
  } catch {
    return null;
  }
}

export function buildSubmissionsRouter(deps: SubmissionsDeps): Router {
  const router = express.Router();
  const conceptAddr = () =>
    deps.config.librarianPubkey
      ? formatAddress(buildBookSubmissionsHeaderAddress(asHexPubkey(deps.config.librarianPubkey)))
      : null;

  // Publish a submission. Sovereign → { event }; custodial → intent fields.
  router.post("/api/submissions", async (req, res, next) => {
    try {
      const cookie = cookieOf(req);
      const user = await deps.sessionUser(cookie);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });

      if (user.tier === "custodial") {
        let template: NostrEventTemplate;
        try {
          template = buildSubmissionTemplate(
            deps.config,
            { ...req.body, submitterPubkey: user.pubkeyHex },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof SubmissionError) {
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
            message: v.code === "pubkey_mismatch" ? "Must be signed by your own key." : "Invalid submission.",
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

  // Build a template for the client to sign (sovereign).
  router.post("/api/submissions/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const template = buildSubmissionTemplate(
        deps.config,
        { ...req.body, submitterPubkey: user.pubkeyHex },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof SubmissionError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        return void res.status(status).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // The signed-in user's own submissions.
  router.get("/api/submissions/mine", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const addr = conceptAddr();
      const events = addr
        ? await deps.query({ kinds: [KIND], "#z": [addr], authors: [user.pubkeyHex] })
        : [];
      const submissions = events
        .map((e) => toSubmission(e, false))
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      res.status(200).json({ submissions });
    } catch (err) {
      next(err);
    }
  });

  // Public: all community submissions (16b-i), enriched per ADR 0031 §3b with the
  // three server-computed fields the web renders per row: `canPromote` (USER-level,
  // computed ONCE per request — the session user's own house-PoV gate, stamped
  // identically on every row), `promotionStatus` (one batched `readPromotionStatuses`
  // read), and `signals` (per-row `computeSubmissionSignals`, honest null). Every
  // enrichment degrades fail-closed (false / null), never a 500.
  router.get("/api/submissions", async (req, res, next) => {
    try {
      const addr = conceptAddr();
      const events = addr ? await deps.query({ kinds: [KIND], "#z": [addr], limit: 200 }) : [];
      const rows = events
        .map((e) => toSubmission(e, true))
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.createdAt - a.createdAt);

      // canPromote: resolved ONCE for the session user (not per row). Anon and
      // every trust degrade → false (same fail-closed gate as the promote route).
      let canPromote = false;
      try {
        const user = await deps.sessionUser(cookieOf(req));
        if (user) {
          const threshold = deps.config.curatorThreshold ?? 0.5;
          canPromote = (await houseWeightOf(user.pubkeyHex)) >= threshold;
        }
      } catch {
        canPromote = false;
      }

      // promotionStatus: ONE batched read keyed by the listed slugs (never N).
      const slugs = rows.map((r) => r.slug);
      let statusBySlug = new Map<string, PromotionStatus>();
      if (deps.readPromotionStatuses && slugs.length > 0) {
        try {
          statusBySlug = await deps.readPromotionStatuses(slugs);
        } catch {
          statusBySlug = new Map();
        }
      }

      // signals: per-row house-vantage compute, honest null on none/degrade.
      const house = deps.config.houseObserverPubkey;
      const lib = deps.config.librarianPubkey;
      const threshold = deps.config.curatorThreshold ?? 0.5;
      const submissions = await Promise.all(
        rows.map(async (row) => {
          let signals: SubmissionSignals | null = null;
          if (deps.trust && house && lib) {
            try {
              const ratingEvents = await deps.query({
                kinds: [KIND],
                "#a": [`${KIND}:${lib}:${row.slug}`],
              });
              signals = await computeSubmissionSignals({
                trust: deps.trust,
                houseObserverHex: house,
                threshold,
                ratingEvents,
              });
            } catch {
              signals = null;
            }
          }
          return {
            ...row,
            canPromote,
            promotionStatus: statusBySlug.get(row.slug) ?? null,
            signals,
          };
        }),
      );
      res.status(200).json({ submissions });
    } catch (err) {
      next(err);
    }
  });

  // Resolve the caller's own house-PoV trust weight (ADR 0031 AC-1/AC-6). The
  // gate is ALWAYS the house vantage over the SESSION user's own key. Any degrade
  // (no provider, no observer, empty map, throwing seam) resolves to weight 0 so
  // the gate CLOSES — the seam never surfaces a 500.
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

  // Story 30 / ADR 0031 §2 — the emergent curator gate + enqueue. The gate is
  // server-enforced (not merely UI-hidden): anon → 401; below threshold → 403
  // below_gate; at/above → enqueue (200). UNIQUE(slug) collision → 200 `already`.
  router.post("/api/submissions/:slug/promote", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user) {
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
      }
      const threshold = deps.config.curatorThreshold ?? 0.5;
      const weight = await houseWeightOf(user.pubkeyHex);
      if (weight < threshold) {
        return void res
          .status(403)
          .json({ error: { code: "below_gate", message: "Not a curator." } });
      }
      if (!deps.enqueuePromotion) {
        return void res
          .status(501)
          .json({ error: { code: "not_supported", message: "Promotion unavailable." } });
      }
      const result = await deps.enqueuePromotion(req.params.slug, user.pubkeyHex);
      res.status(200).json({ status: result.status });
    } catch (err) {
      next(err);
    }
  });

  // Story 80 / ADR 0078 — STUB (red): the demote endpoint lands in
  // implementation, mirroring the promote gate above.
  router.post("/api/submissions/:slug/demote", (_req, res) => {
    res.status(501).json({
      error: { code: "not_implemented", message: "Demotion is not implemented yet." },
    });
  });

  // Story 30 / ADR 0031 §3 — per-submission trust signals (read). Computed from
  // the HOUSE observer's vantage. Honest degrade → `signals: null` (no fabricated
  // count, no raw-as-trusted average), never a 500.
  router.get("/api/submissions/:slug/signals", async (req, res, next) => {
    try {
      const house = deps.config.houseObserverPubkey;
      const lib = deps.config.librarianPubkey;
      if (!deps.trust || !house || !lib) {
        return void res.status(200).json({ signals: null });
      }
      const addr = `${KIND}:${lib}:${req.params.slug}`;
      const ratingEvents = await deps.query({ kinds: [KIND], "#a": [addr] });
      const signals = await computeSubmissionSignals({
        trust: deps.trust,
        houseObserverHex: house,
        threshold: deps.config.curatorThreshold ?? 0.5,
        ratingEvents,
      });
      res.status(200).json({ signals });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
