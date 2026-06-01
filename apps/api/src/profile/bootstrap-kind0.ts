// Signup kind-0 bootstrap (ADR 0027, Decision 4). A custodial user's chosen
// display name never reaches nostr today, so the product shows them as a raw
// npub. This helper publishes a name-bearing kind-0 immediately after signup so
// the name resolves in Unbnd and every nostr client (AC-1).
//
// Fail-open (AC-4): a null/throwing sign, a rejected publish, or an { ok: false }
// publish is logged and SWALLOWED. The helper returns void and NEVER throws —
// the signup response (201) is never affected, and the account is never rolled
// back. The seams (sign, publishKind0, now) are injected, never vi.mock'd.
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { buildProfileKind0Content, buildKind0Template } from "./kind0";

/**
 * The publish-result shape these helpers consume. Intentionally loose on `ok`
 * (mirroring `nostr/publish.ts`'s `Publisher`) so an inline test mock that does
 * not narrow its `ok` literal is still assignable; the real `PublishResult`
 * (a discriminated union) is assignable to it.
 */
export type PublishOutcome = { ok: boolean; id?: string; reason?: string };

export type BootstrapKind0Deps = {
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

export type BootstrapKind0Input = {
  readonly displayName: string;
  readonly sessionIdHex: string;
};

/**
 * Build a `{ name, display_name }` kind-0 from the signup displayName, sign it
 * with the session's wrapped key, and publish it. All internal failures are
 * logged + swallowed; never throws (AC-4 fail-open).
 */
export async function bootstrapCustodialKind0(
  deps: BootstrapKind0Deps,
  input: BootstrapKind0Input,
): Promise<void> {
  try {
    // A fresh signup has no prior kind-0 — build from {} with the displayName as
    // both the patch and the floor (name == display_name == D).
    const content = buildProfileKind0Content(
      null,
      { displayName: input.displayName },
      input.displayName,
    );
    const template = buildKind0Template(content, deps.now());
    const signed = await deps.sign(input.sessionIdHex, template);
    if (!signed) {
      // No live session key (post-restart / evicted) — nothing to publish.
      // eslint-disable-next-line no-console
      console.warn("[kind0-bootstrap] no signing key for session; skipped");
      return;
    }
    const published = await deps.publishKind0(signed);
    if (!published.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[kind0-bootstrap] publish failed: ${published.reason ?? "unknown"}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[kind0-bootstrap] swallowed error", err);
  }
}
