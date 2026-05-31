// The public-relay replaceable-kind publisher (ADR 0023 Decision 4, ADR 0022
// F2-A). kind-0 and kind-3 both live on the PUBLIC profile relays (not dcosl,
// which rejects non-DList kinds), so the propagation model is:
//   - AWAIT the LOCAL strfry publish — it gates the response + read-back; a
//     local failure surfaces as ok:false (mapped to 502 upstream).
//   - On local success ONLY, fan out best-effort to the profile relays
//     (fire-and-forget). A profile-relay failure (or the whole fan-out
//     rejecting) must NOT fail the user's save.
//   - dcosl is EXCLUDED by construction: the caller passes `config.profileRelays`.
//
// Story-22 lesson: the publishers are INJECTED (not an un-mockable intra-module
// `vi.mock`). The Story-22 defect was a module-level mock that could not
// intercept `publishToMany`'s in-module reference to `publishEvent` under
// vitest/ESM. This factory takes `publishLocal` / `publishMany` as arguments so
// the injection-based suite can drive them directly.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "./publish";

export type PublishPublicRelayKindDeps = {
  readonly localRelay: string;
  readonly profileRelays: readonly string[];
  readonly publishLocal: (
    relayUrl: string,
    event: SignedNostrEvent,
  ) => Promise<PublishResult>;
  readonly publishMany: (
    relayUrls: readonly string[],
    event: SignedNostrEvent,
  ) => Promise<PublishResult[]>;
};

export function publishPublicRelayKind(
  label: string,
  deps: PublishPublicRelayKindDeps,
): (event: SignedNostrEvent) => Promise<PublishResult> {
  return async (event: SignedNostrEvent): Promise<PublishResult> => {
    const local = await deps.publishLocal(deps.localRelay, event);
    if (local.ok && deps.profileRelays.length > 0) {
      // Fire-and-forget: never block the response, never fail the save. A
      // rejecting fan-out (or any rejecting relay) is swallowed and logged.
      void Promise.resolve(deps.publishMany(deps.profileRelays, event))
        .then((rs) =>
          rs.forEach(
            (r) =>
              !r.ok &&
              // eslint-disable-next-line no-console
              console.warn(`[${label}] ${r.reason}`),
          ),
        )
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(
            `[${label}] fan-out failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }
    return local;
  };
}
