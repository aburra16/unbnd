import { asHexPubkey, type HexPubkey } from "@unbnd/schemas";

/**
 * Synthetic Librarian pubkey used by the fixture data only.
 *
 * Deployments resolve the real Librarian pubkey at runtime from config
 * per the CLAUDE.md "Per-deployment Unbnd Librarian pubkey" rule. This
 * constant exists so the static fixtures can carry valid `parentHeader`
 * addresses while keeping the runtime-lookup contract elsewhere intact.
 *
 * If a string starting with this constant ever shows up in a network
 * request or a published event, that's a bug — real events sign as the
 * deployment's actual Librarian key.
 */
export const FIXTURE_LIBRARIAN_PUBKEY: HexPubkey = asHexPubkey(
  "0".repeat(63) + "1",
);

/**
 * Synthetic pubkey for the user whose profile we render in the
 * `/profile/mira-calloway` route. Fixture-only.
 */
export const FIXTURE_MIRA_PUBKEY: HexPubkey = asHexPubkey(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
