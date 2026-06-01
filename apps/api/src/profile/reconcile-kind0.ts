// Login kind-0 reconciliation (ADR 0027, Decision 5). The login path is the
// natural repair point: the session key is freshly wrapped in-session, so this
// best-effort, custodial-only side effect heals a missing or name-less kind-0
// (AC-5). It NEVER blocks or fails login — any failure is swallowed.
//
// Detection: fetch the freshest raw kind-0. If a non-empty name already
// resolves, do nothing (idempotent — no republish, no created_at churn).
// Otherwise merge the DB displayName in as the name floor (preserving any
// substack/website already present), build at created_at strictly newer than
// the fetched event so NIP-01 replacement wins, sign, publish.
//
// Seams (fetchRaw, sign, publishKind0, now) are injected, never vi.mock'd.
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import {
  buildProfileKind0Content,
  buildKind0Template,
  hasResolvableName,
} from "./kind0";
import type { PublishOutcome } from "./bootstrap-kind0";

export type ReconcileKind0Deps = {
  /** Fetch the freshest RAW kind-0 content + created_at for a pubkey. */
  readonly fetchRaw: (
    pubkeyHex: string,
  ) => Promise<{ content: Record<string, unknown> | null; createdAt: number | null }>;
  /** Server-side sign for the custodial session (null ⇒ no live key, skip). */
  readonly sign: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
  /** kind-0 publisher: awaits the local relay; profile-relay fan-out inside it. */
  readonly publishKind0: (event: SignedNostrEvent) => Promise<PublishOutcome>;
  /** Clock (unix seconds), injected for deterministic tests. */
  readonly now: () => number;
};

export type ReconcileKind0Input = {
  readonly displayName: string;
  readonly pubkeyHex: string;
  readonly sessionIdHex: string;
};

/** created_at strictly newer than the fetched event, so the replacement wins. */
function nextCreatedAt(now: number, fetchedCreatedAt: number | null): number {
  if (fetchedCreatedAt !== null && fetchedCreatedAt >= now) {
    return fetchedCreatedAt + 1;
  }
  return now;
}

/**
 * Best-effort, custodial-only login reconciliation. Idempotent when a good name
 * already resolves; otherwise publishes a name-bearing kind-0 seeded from the DB
 * displayName. Never throws — login is never blocked or failed (AC-5d).
 */
export async function reconcileCustodialKind0(
  deps: ReconcileKind0Deps,
  input: ReconcileKind0Input,
): Promise<void> {
  try {
    const { content, createdAt } = await deps.fetchRaw(input.pubkeyHex);
    if (hasResolvableName(content)) {
      // A good name already resolves — nothing to repair (idempotent).
      return;
    }
    const merged = buildProfileKind0Content(
      content,
      { displayName: input.displayName },
      input.displayName,
    );
    const template = buildKind0Template(merged, nextCreatedAt(deps.now(), createdAt));
    const signed = await deps.sign(input.sessionIdHex, template);
    if (!signed) {
      // eslint-disable-next-line no-console
      console.warn("[kind0-reconcile] no signing key for session; skipped");
      return;
    }
    const published = await deps.publishKind0(signed);
    if (!published.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[kind0-reconcile] publish failed: ${published.reason ?? "unknown"}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[kind0-reconcile] swallowed error", err);
  }
}
