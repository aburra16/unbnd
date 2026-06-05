// The `follows` cycle (Story 58 / ADR 0057 §4): publish the librarian's kind-3
// seed-follow list, then trigger GrapeRank for the librarian observer.
//
// Per ADR §4, the sequence is:
//   read existing kind-3 -> mergeSeedFollows -> build -> sign
//     -> publish kind-3 to (TRUST_RELAYS ∪ LIBRARIAN_GENERAL_RELAYS), NOT dcosl
//     -> ONLY on a confirmed kind-3 publish -> GrapeRank trigger:
//          trust.authChallenge(librarianHex) -> sign(challenge)
//          -> trust.personalize(librarianHex, signed)
//
// The kind-3 publish is the DURABLE part: a publish failure throws so the
// operator re-runs (the idempotent merge makes a re-run safe). The GrapeRank
// trigger is BEST-EFFORT / FAIL-OPEN: a null challenge, a throw, or
// personalize() === false is logged and the cycle still resolves (exit 0) —
// the durable follows are published and Brainstorm's crawler picks them up on
// its own schedule; the trigger only nudges it sooner.
//
// Everything that touches a key, a relay, or the trust backend is INJECTED so
// the cycle is fixture-testable with no real LIBRARIAN_NSEC and no live network.
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "@unbnd/relay";
import type { TrustProvider } from "@unbnd/trust";
import {
  buildLibrarianKind3Template,
  mergeSeedFollows,
} from "./follows-template";

const HEX64 = /^[0-9a-f]{64}$/;

/** The librarian's existing kind-3, as read from the trust relays. */
export type ExistingKind3 = {
  readonly tags: string[][];
  readonly content: string;
};

export type FollowsDeps = {
  readonly librarianPubkey: string;
  /** The configured seed-curator pubkeys (one `p` tag each). */
  readonly seedCurators: readonly string[];
  /** kind-3 publish target: the nip85 / GrapeRank-crawler relays. */
  readonly trustRelays: readonly string[];
  /** kind-3 publish target: additional broad relays for client discoverability. */
  readonly generalRelays: readonly string[];
  /** Read the librarian's newest existing kind-3, or null when there is none. */
  readonly readExistingKind3: () => Promise<ExistingKind3 | null>;
  /** Librarian-sign a template → a signed event with an id (mirrors finalizeEvent). */
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  /** Publish a signed event to a set of relays; ok when at least one accepted. */
  readonly publish: (
    event: SignedNostrEvent,
    relays: readonly string[],
  ) => Promise<PublishResult>;
  /** The trust adapter driving the GrapeRank trigger (BrainstormProvider in prod). */
  readonly trust: TrustProvider;
  /** Wall-clock for created_at; deterministic in tests. */
  readonly now?: () => number;
};

/**
 * Trigger a GrapeRank personalization run for the librarian observer. Reuses
 * the @unbnd/trust adapter so no Brainstorm specifics leak into the worker.
 * Best-effort / fail-open: any failure is logged and swallowed.
 */
async function triggerGrapeRank(deps: FollowsDeps): Promise<void> {
  const failOpen =
    "[librarian] GrapeRank trigger did not queue; re-run 'librarian follows' or wait for the next crawl";
  try {
    const challenge = await deps.trust.authChallenge(deps.librarianPubkey);
    if (!challenge) {
      console.warn(failOpen);
      return;
    }
    const signed = deps.sign(challenge);
    const ok = await deps.trust.personalize(deps.librarianPubkey, signed);
    if (!ok) {
      console.warn(failOpen);
      return;
    }
    console.log("[librarian] GrapeRank trigger queued for the librarian observer");
  } catch (err) {
    console.warn(failOpen, err instanceof Error ? err.message : String(err));
  }
}

/** One `follows` run: publish the durable kind-3, then nudge GrapeRank. */
export async function runFollowsCycle(deps: FollowsDeps): Promise<void> {
  // Config validation: the seed set is required and every entry must be hex.
  if (deps.seedCurators.length === 0) {
    throw new Error(
      "librarian follows: SEED_CURATORS is required (no seed curators configured)",
    );
  }
  for (const hex of deps.seedCurators) {
    if (!HEX64.test(hex)) {
      throw new Error(
        `librarian follows: seed-curator entry is not a 64-lowercase-hex pubkey: ${hex}`,
      );
    }
  }

  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);

  // Read the existing kind-3 so a re-run merges (drops no prior follow).
  const existing = await deps.readExistingKind3();
  const mergedTags = mergeSeedFollows(existing?.tags ?? null, deps.seedCurators);
  const template = buildLibrarianKind3Template(
    mergedTags,
    existing?.content ?? "",
    now,
  );
  const signed = deps.sign(template);

  // The DURABLE publish: kind-3 → trust relays ∪ general relays, NEVER dcosl.
  const relays = [...deps.trustRelays, ...deps.generalRelays];
  const result = await deps.publish(signed, relays);
  if (!result.ok) {
    throw new Error(
      `librarian follows: kind-3 publish failed (${result.reason}); re-run 'librarian follows'`,
    );
  }
  console.log(
    `[librarian] kind-3 published to ${relays.length} relay(s) with ${deps.seedCurators.length} seed follow(s)`,
  );

  // Only after a confirmed durable publish: trigger GrapeRank (fail-open).
  await triggerGrapeRank(deps);
}
