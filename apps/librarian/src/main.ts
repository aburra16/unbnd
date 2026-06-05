// Runtime entrypoint for the librarian worker (Story 58 / ADR 0057 §1). Run as
// a one-off by the operator (`docker compose --profile librarian run --rm
// librarian profile|follows`). It wires the real deps — the relay connections
// and the librarian signer — and runs ONE cycle, then exits (restart:"no", like
// the seeder/promoter).
//
// `LIBRARIAN_NSEC` is decoded at runtime here (CLAUDE.md: resolved at runtime,
// never hardcoded). It lives ONLY in this worker's env — never the API. The
// testable cycles (`profile-cycle.ts`, `follows-cycle.ts`) take injected deps,
// so this wiring is never executed by the test suite.
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { connectRelay, type RelayConnection, type PublishResult } from "@unbnd/relay";
import { resolveTrustProvider } from "@unbnd/trust";
import { loadFollowsConfig, loadProfileConfig } from "./env";
import { runProfileCycle } from "./profile-cycle";
import { runFollowsCycle, type ExistingKind3 } from "./follows-cycle";

/** Decode LIBRARIAN_NSEC → (hex pubkey, signing key). */
function decodeLibrarian(nsec: string): { sk: Uint8Array; pubkey: string } {
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  return { sk, pubkey: getPublicKey(sk) };
}

/**
 * Open a connection per relay URL (best-effort: a relay that fails to connect is
 * skipped with a warning, not fatal). Returns the live connections + a close().
 */
async function openRelays(
  urls: readonly string[],
): Promise<{ conns: Map<string, RelayConnection>; close: () => void }> {
  const conns = new Map<string, RelayConnection>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        conns.set(url, await connectRelay(url));
      } catch (err) {
        console.warn(
          `[librarian] could not connect to ${url}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }),
  );
  return {
    conns,
    close: () => {
      for (const conn of conns.values()) conn.close();
    },
  };
}

/**
 * Fan a signed event out to every connection whose URL is in `relays`. The
 * publish is `ok` when at least one relay accepts it (the durable-write
 * semantics the cycles expect); the per-relay timeout is bounded.
 */
function fanoutPublish(
  conns: Map<string, RelayConnection>,
  timeoutMs: number,
): (event: SignedNostrEvent, relays: readonly string[]) => Promise<PublishResult> {
  return async (event, relays) => {
    const targets = relays
      .map((url) => conns.get(url))
      .filter((c): c is RelayConnection => c !== undefined);
    if (targets.length === 0) {
      return { ok: false, reason: "no reachable relays" };
    }
    const results = await Promise.all(
      targets.map((conn) =>
        conn
          .publish(event, timeoutMs)
          .catch(
            (err): PublishResult => ({
              ok: false,
              reason: err instanceof Error ? err.message : String(err),
            }),
          ),
      ),
    );
    const accepted = results.find((r) => r.ok);
    if (accepted && accepted.ok) return { ok: true, id: accepted.id };
    const firstReason = results.find((r) => !r.ok) as
      | { ok: false; reason: string }
      | undefined;
    return { ok: false, reason: firstReason?.reason ?? "all relays refused" };
  };
}

async function profile(): Promise<void> {
  const config = loadProfileConfig();
  const { sk, pubkey } = decodeLibrarian(config.nsec);

  const { conns, close } = await openRelays([
    config.dcoslUrl,
    ...config.profileRelays,
  ]);
  try {
    await runProfileCycle({
      librarianPubkey: pubkey,
      profile: {
        name: config.name,
        about: config.about,
        picture: config.picture,
        nip05: config.nip05,
      },
      dcoslUrl: config.dcoslUrl,
      profileRelays: config.profileRelays,
      sign: (template: NostrEventTemplate) =>
        finalizeEvent(template as never, sk) as unknown as SignedNostrEvent,
      publish: fanoutPublish(conns, config.relayPublishTimeoutMs),
      now: () => Math.floor(Date.now() / 1000),
    });
  } finally {
    close();
  }
  console.log("[librarian] profile complete");
}

async function follows(): Promise<void> {
  const config = loadFollowsConfig();
  const { sk, pubkey } = decodeLibrarian(config.nsec);

  const trust = resolveTrustProvider(
    config.trustProvider === "fixture"
      ? { provider: "fixture", fixture: { weights: {} } }
      : {
          provider: "brainstorm",
          apiUrl: config.brainstormApiUrl,
          relays: config.trustRelays,
        },
  );

  const { conns, close } = await openRelays([
    ...config.trustRelays,
    ...config.generalRelays,
  ]);
  try {
    await runFollowsCycle({
      librarianPubkey: pubkey,
      seedCurators: config.seedCurators,
      trustRelays: config.trustRelays,
      generalRelays: config.generalRelays,
      readExistingKind3: async (): Promise<ExistingKind3 | null> => {
        // Read the newest existing kind-3 from the trust relays so a re-run
        // merges (drops no prior follow). Best-effort across the trust relays.
        let newest: SignedNostrEvent | null = null;
        for (const url of config.trustRelays) {
          const conn = conns.get(url);
          if (!conn) continue;
          try {
            const events = await conn.query(
              { kinds: [3], authors: [pubkey], limit: 1 },
              config.relayPublishTimeoutMs,
            );
            for (const ev of events) {
              if (!newest || ev.created_at > newest.created_at) newest = ev;
            }
          } catch (err) {
            console.warn(
              `[librarian] could not read existing kind-3 from ${url}:`,
              err instanceof Error ? err.message : String(err),
            );
          }
        }
        return newest ? { tags: newest.tags, content: newest.content } : null;
      },
      sign: (template: NostrEventTemplate) =>
        finalizeEvent(template as never, sk) as unknown as SignedNostrEvent,
      publish: fanoutPublish(conns, config.relayPublishTimeoutMs),
      trust,
      now: () => Math.floor(Date.now() / 1000),
    });
  } finally {
    close();
  }
  console.log("[librarian] follows complete");
}

// Arg dispatch: `librarian profile` publishes the kind-0; `librarian follows`
// publishes the kind-3 + triggers GrapeRank.
async function main(): Promise<void> {
  const [, , subcommand] = process.argv;
  if (subcommand === "profile") {
    await profile();
    return;
  }
  if (subcommand === "follows") {
    await follows();
    return;
  }
  throw new Error("usage: librarian <profile|follows>");
}

main().catch((err) => {
  console.error("[librarian] fatal:", err);
  process.exit(1);
});
