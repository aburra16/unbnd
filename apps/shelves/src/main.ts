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
import { forEachPage } from "@unbnd/relay";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { resolveTrustProvider, type TrustProvider, BRAINSTORM_DEFAULTS } from "@unbnd/trust";
import { runShelvesCycle } from "./compute";
import { loadShelfDefs } from "./config";
import { createShelvesCache } from "./cache";
import { queryAllPages, queryRelay } from "./relay";

const KIND = 39999;

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
      : [...BRAINSTORM_DEFAULTS.trustRelays];
    return resolveTrustProvider({
      provider: "brainstorm",
      apiUrl: env("BRAINSTORM_API_URL", BRAINSTORM_DEFAULTS.apiUrl),
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

  // Book reviews and their removals (Story 99 / ADR 0089), paged like the concepts.
  const readReviews = async () => {
    const reviews = await queryAllPages((cursor) =>
      queryRelay(relayUrl, { kinds: [34259], "#m": ["book"], ...cursor }),
    );
    if (reviews.length === 0) return reviews;
    const authors = [...new Set(reviews.map((e) => e.pubkey))];
    const removals = await queryAllPages((cursor) =>
      queryRelay(relayUrl, { kinds: [5], authors, "#k": ["34259"], ...cursor }),
    );
    return [...reviews, ...removals];
  };

  // Book records as small summaries, built a page at a time (ADR 0096 §5).
  const booksZ = formatAddress(buildBookRecordsHeaderAddress(lib));
  const readBooks = async () => {
    const summaries: SignedNostrEvent[] = [];
    const keep = new Set(["d", "added", "delisted"]);
    await forEachPage(
      (cursor) => queryRelay(relayUrl, { kinds: [KIND], "#z": [booksZ], authors: [lib], ...cursor }),
      async (events) => {
        for (const e of events) {
          summaries.push({ ...e, content: "", sig: "", tags: e.tags.filter((t) => keep.has(t[0] ?? "")) });
        }
      },
      { pageSize: 500, maxPages: Infinity, totalBudgetMs: Infinity },
    );
    return summaries;
  };
  // Genre assertions for the reviewed books only, by book address in chunks.
  const assertsZ = formatAddress(buildBookTagAssertionsHeaderAddress(lib));
  const readAssertionsFor = async (slugs: readonly string[]) => {
    const out: SignedNostrEvent[] = [];
    const addresses = slugs.map((s) => `39999:${lib}:${s}`);
    for (let i = 0; i < addresses.length; i += 250) {
      out.push(...(await queryRelay(relayUrl, { kinds: [KIND], "#z": [assertsZ], "#a": addresses.slice(i, i + 250) })));
    }
    return out;
  };

  console.log(
    `[shelves] relay=${relayUrl} trust=${trust.name} librarian=${lib.slice(0, 12)} observer=${houseObserverPubkey.slice(0, 12)}`,
  );

  try {
    await runShelvesCycle({
      config: { librarianPubkey: lib, houseObserverPubkey },
      readConcept,
      readReviews,
      readBooks,
      readAssertionsFor,
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
