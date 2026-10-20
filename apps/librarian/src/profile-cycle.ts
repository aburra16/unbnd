// The `profile` cycle (Story 98 / ADR 0088 §2): sign and publish the
// librarian's kind-0, then its kind-10002 relay list, to the publish relays.
//
// Everything that touches a key or a relay is INJECTED so the cycle is
// fixture-testable with no real LIBRARIAN_NSEC and no live network.
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "@unbnd/relay";
import {
  LIBRARIAN_PROFILE,
  LIBRARIAN_RELAY_LIST,
  buildLibrarianKind0Template,
  buildLibrarianRelayListTemplate,
  buildTrustDesignationTemplate,
  trustDesignationTags,
} from "./profile-content";

export type ProfileDeps = {
  readonly librarianPubkey: string;
  /** Where the kind-0 and kind-10002 go. Never dcosl (it stores only list kinds). */
  readonly publishRelays: readonly string[];
  /** Librarian-sign a template → a signed event with an id (mirrors finalizeEvent). */
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  /** Publish a signed event to a set of relays; ok when at least one accepted. */
  readonly publish: (
    event: SignedNostrEvent,
    relays: readonly string[],
  ) => Promise<PublishResult>;
  /** Brainstorm's `/setup` tuples for an observer (Story 102 / ADR 0090). */
  readonly fetchSetup: (observer: string) => Promise<readonly unknown[]>;
  /** Wall-clock for created_at; deterministic in tests. */
  readonly now?: () => number;
};

export async function runProfileCycle(deps: ProfileDeps): Promise<void> {
  if (deps.publishRelays.some((r) => r.includes("dcosl"))) {
    throw new Error("librarian profile: dcosl stores only list kinds; remove it from LIBRARIAN_PUBLISH_RELAYS");
  }
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  const events: Array<[string, NostrEventTemplate]> = [
    ["kind-0 profile", buildLibrarianKind0Template(LIBRARIAN_PROFILE, now)],
    ["kind-10002 relay list", buildLibrarianRelayListTemplate(LIBRARIAN_RELAY_LIST, now)],
  ];
  const publish = async (label: string, template: NostrEventTemplate) => {
    const signed = deps.sign(template);
    const result = await deps.publish(signed, deps.publishRelays);
    if (!result.ok) {
      throw new Error(`librarian profile: ${label} refused (${result.reason}); re-run 'librarian profile'`);
    }
    console.log(`[librarian] ${label} published (${signed.id})`);
  };
  for (const [label, template] of events) await publish(label, template);

  // The trust designation (Story 102 / ADR 0090): the scorer Brainstorm names.
  const designation = trustDesignationTags(await deps.fetchSetup(deps.librarianPubkey).catch(() => []));
  if (designation.length === 0) {
    throw new Error("librarian profile: Brainstorm's /setup named no scorer for the librarian; re-run 'librarian profile'");
  }
  await publish("kind-10040 trust designation", buildTrustDesignationTemplate(designation, now));
}
