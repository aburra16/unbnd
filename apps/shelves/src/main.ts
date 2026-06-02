// Runtime entrypoint for the least-privilege shelves worker (Story 35 / ADR
// 0036 §1). Fired by the operator cron (`docker compose --profile shelves run
// --rm shelves`). Wires the real deps — the local relay reads, the trust
// provider, the Postgres cache writer — runs ONE `runShelvesCycle`, exits.
//
// LEAST-PRIVILEGE: this worker holds NO `LIBRARIAN_NSEC`. It computes + caches;
// it signs and publishes NOTHING. It carries the librarian PUBKEY (a public
// concept-handle / authors filter) resolved at runtime (CLAUDE.md), never the
// secret. Kept SEPARATE from `compute.ts` so the unit tests import the pure core
// without executing anything.
import { asHexPubkey } from "@unbnd/schemas";
import { resolveTrustProvider, type TrustProvider } from "@unbnd/trust";
import { runShelvesCycle } from "./compute";
import { loadShelfDefs } from "./config";
import { createShelvesCache } from "./cache";
import { queryAllPages, queryRelay } from "./relay";

const KIND = 39999;

const DEFAULT_TRUST_RELAYS = [
  "wss://nip85.nosfabrica.com",
  "wss://nip85.brainstorm.world",
];
// nosfabrica — the interim default house observer (ADR 0014), mirrors the API.
const DEFAULT_HOUSE_OBSERVER =
  "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`shelves: missing required env var ${name}`);
  }
  return v;
}

function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function resolveTrust(): TrustProvider {
  const provider = env("TRUST_PROVIDER", "brainstorm");
  if (provider === "fixture") {
    const raw = env("TRUST_FIXTURE");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("shelves: TRUST_FIXTURE must be valid JSON");
    }
    return resolveTrustProvider({ provider: "fixture", fixture: parsed as never });
  }
  if (provider === "brainstorm") {
    const relaysRaw = optionalEnv("TRUST_RELAYS");
    const relays = relaysRaw
      ? relaysRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_TRUST_RELAYS;
    return resolveTrustProvider({
      provider: "brainstorm",
      apiUrl: env("BRAINSTORM_API_URL", "https://brainstormserver.nosfabrica.com"),
      relays,
    });
  }
  throw new Error(`shelves: unknown TRUST_PROVIDER ${JSON.stringify(provider)}`);
}

async function main(): Promise<void> {
  const relayUrl = env("STRFRY_URL", "ws://localhost:7777");
  const databaseUrl = env("DATABASE_URL");
  const lib = asHexPubkey(env("LIBRARIAN_PUBKEY"));
  const houseObserverPubkey =
    optionalEnv("HOUSE_OBSERVER_PUBKEY") ?? DEFAULT_HOUSE_OBSERVER;
  const defs = loadShelfDefs();
  const trust = resolveTrust();
  const cache = createShelvesCache(databaseUrl);

  // Each concept read pages past the relay's per-REQ cap (ADR 0021).
  const readConcept = (z: string) =>
    queryAllPages((cursor) => queryRelay(relayUrl, { kinds: [KIND], "#z": [z], ...cursor }));

  console.log(
    `[shelves] relay=${relayUrl} trust=${trust.name} librarian=${lib.slice(0, 12)} observer=${houseObserverPubkey.slice(0, 12)}`,
  );

  try {
    await runShelvesCycle({
      config: { librarianPubkey: lib, houseObserverPubkey },
      readConcept,
      trust,
      now: () => Math.floor(Date.now() / 1000),
      defs,
      cache,
    });
    console.log("[shelves] cycle complete");
  } finally {
    await cache.close();
  }
}

main().catch((err) => {
  console.error("[shelves] fatal:", err);
  process.exit(1);
});
