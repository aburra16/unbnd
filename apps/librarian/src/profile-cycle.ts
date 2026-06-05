// The `profile` cycle (Story 58 / ADR 0057 §4 / §Implementation): build the
// librarian's kind-0 profile from config, sign it, and publish to dcosl ∪ the
// profile relays.
//
// Everything that touches a key or a relay is INJECTED so the cycle is
// fixture-testable with no real LIBRARIAN_NSEC and no live network.
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "@unbnd/relay";
import {
  buildLibrarianKind0Template,
  buildLibrarianProfileContent,
  type LibrarianProfileFields,
} from "./profile-content";

export type ProfileDeps = {
  readonly librarianPubkey: string;
  /** The librarian profile fields from config (LIBRARIAN_NAME required). */
  readonly profile: LibrarianProfileFields;
  /** kind-0 publish target. */
  readonly dcoslUrl: string;
  /** kind-0 publish target (unioned with dcosl). */
  readonly profileRelays: readonly string[];
  /** Librarian-sign a template → a signed event with an id (mirrors finalizeEvent). */
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  /** Publish a signed event to a set of relays; ok when at least one accepted. */
  readonly publish: (
    event: SignedNostrEvent,
    relays: readonly string[],
  ) => Promise<PublishResult>;
  /** Wall-clock for created_at; deterministic in tests. */
  readonly now?: () => number;
};

/** One `profile` run: build the kind-0, sign it, publish to dcosl ∪ profile relays. */
export async function runProfileCycle(deps: ProfileDeps): Promise<void> {
  if (!deps.profile.name || deps.profile.name.trim() === "") {
    throw new Error("librarian profile: LIBRARIAN_NAME is required");
  }

  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  const content = buildLibrarianProfileContent(deps.profile);
  const template = buildLibrarianKind0Template(content, now);
  const signed = deps.sign(template);

  const relays = [deps.dcoslUrl, ...deps.profileRelays];
  const result = await deps.publish(signed, relays);
  if (!result.ok) {
    throw new Error(
      `librarian profile: kind-0 publish failed (${result.reason}); re-run 'librarian profile'`,
    );
  }
  console.log(
    `[librarian] kind-0 profile published to ${relays.length} relay(s)`,
  );
}
