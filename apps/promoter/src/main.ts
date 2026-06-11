// Runtime entrypoint for the promoter worker (Story 30 / ADR 0031 §1). Fired
// periodically by the operator cron (`docker compose --profile promote run --rm
// promoter`). It wires the real deps — the Postgres queue, the relay connections
// (local + dcosl), and the librarian signer — and runs ONE promotion cycle, then
// exits (restart:"no", like the seeder). Kept SEPARATE from `index.ts` so the
// loop tests can import `runPromotionCycle` without executing anything.
//
// `LIBRARIAN_NSEC` is decoded at runtime here (CLAUDE.md: resolved at runtime,
// never hardcoded). It lives ONLY in this worker's env — never the API.
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookSubmissionsHeaderAddress,
  buildBookTagsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { runDemotionCycle, runPromotionCycle, type DemoterDeps, type PromoterDeps } from "./index";
import { createQueue } from "./queue";
import { connectRelay } from "@unbnd/relay";
import { resolveProvider, reindexBook, type ProviderName } from "@unbnd/search";
import { createRevealQueue } from "./reveal/queue";
import { runRevealCommand } from "./reveal/cli";
import { runRevealCycle, type RevealDeps } from "./reveal/cycle";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`promoter: missing required env var ${name}`);
  }
  return v;
}

// ADR 0034 §4 (amended): the operator reveal/withdraw trigger lives here, in the
// key-holding worker — NOT on the API and NOT in a browser. `promoter reveal
// --book <slug> --tag <slug> [--withdraw]` upserts the `reveals` row (recording
// the librarian hex as the actor) and runs ONE reveal cycle, minting the
// librarian-signed event off the API.
async function reveal(argv: string[]): Promise<void> {
  const databaseUrl = env("DATABASE_URL");
  const strfryUrl = env("STRFRY_URL", "ws://strfry:7777");
  const dcoslUrl = env("DCOSL_RELAY_URL", "wss://dcosl.brainstorm.world/");
  const nsec = env("LIBRARIAN_NSEC");

  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  const librarianPubkey = asHexPubkey(getPublicKey(sk));

  const queue = createRevealQueue(databaseUrl);
  await runRevealCommand(argv, {
    enqueueReveal: (bookSlug, tagSlug, state, requestedBy) =>
      queue.enqueueReveal(bookSlug, tagSlug, state, requestedBy),
    requestedBy: librarianPubkey,
  });

  const local = await connectRelay(strfryUrl);
  const dcosl = await connectRelay(dcoslUrl);
  const deps: RevealDeps = {
    librarianPubkey,
    claimPending: () => queue.claimPending(),
    sign: (template: NostrEventTemplate) =>
      finalizeEvent(template as never, sk) as unknown as SignedNostrEvent,
    publishLocal: (event) => local.publish(event),
    publishDcosl: (event) => dcosl.publish(event),
    markDone: (job, mintedId) => queue.markDone(job, mintedId),
    markFailed: (job, reason) => queue.markFailed(job, reason),
    now: () => Math.floor(Date.now() / 1000),
  };
  try {
    await runRevealCycle(deps);
  } finally {
    local.close();
    dcosl.close();
    await queue.close();
  }
  console.log("[promoter] reveal complete");
}

async function promote(): Promise<void> {
  const databaseUrl = env("DATABASE_URL");
  const strfryUrl = env("STRFRY_URL", "ws://strfry:7777");
  const dcoslUrl = env("DCOSL_RELAY_URL", "wss://dcosl.brainstorm.world/");
  const nsec = env("LIBRARIAN_NSEC");

  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  const librarianPubkey = asHexPubkey(getPublicKey(sk));
  const submissionsAddr = formatAddress(
    buildBookSubmissionsHeaderAddress(librarianPubkey),
  );
  // Index-on-write address scoping (Story 60 / ADR 0059 §3, §5).
  const booksZ = formatAddress(buildBookRecordsHeaderAddress(librarianPubkey));
  const tagsZ = formatAddress(buildBookTagsHeaderAddress(librarianPubkey));
  const assertZ = formatAddress(buildBookTagAssertionsHeaderAddress(librarianPubkey));

  // Resolved SearchProvider for the best-effort index-on-write upsert (same way
  // the indexer resolves it from env). The reader issues scoped per-book reads
  // off the worker's own local relay connection; the shared helper rebuilds the
  // doc via RAW consensus and upserts through the neutral provider.
  const searchProvider = resolveProvider({
    provider: env("SEARCH_PROVIDER", "meili") as ProviderName,
    url: env("SEARCH_URL", "http://search:7700"),
    apiKey: env("SEARCH_API_KEY", ""),
  });

  const queue = createQueue(databaseUrl);
  const local = await connectRelay(strfryUrl);
  const dcosl = await connectRelay(dcoslUrl);

  const deps: PromoterDeps = {
    librarianPubkey,
    claimPending: () => queue.claimPending(),
    readSubmission: async (slug) => {
      const events = await local.query({
        kinds: [39999],
        "#z": [submissionsAddr],
        "#d": [slug],
        limit: 1,
      });
      const event = events[0];
      if (!event) throw new Error(`promoter: no submission event for slug ${slug}`);
      return event;
    },
    sign: (template: NostrEventTemplate) =>
      finalizeEvent(template as never, sk) as unknown as SignedNostrEvent,
    publishLocal: (event) => local.publish(event),
    publishDcosl: (event) => dcosl.publish(event),
    markDone: (job, canonicalId) => queue.markDone(job, canonicalId),
    markFailed: (job, reason) => queue.markFailed(job, reason),
    reindexBook: (slug) =>
      reindexBook(
        searchProvider,
        async (bookSlug) => {
          const bookAddr = `39999:${librarianPubkey}:${bookSlug}`;
          const [bookEvents, taxonomyEvents, assertionEvents] = await Promise.all([
            local.query({ kinds: [39999], "#z": [booksZ], "#d": [bookSlug], limit: 1 }),
            local.query({ kinds: [39999], "#z": [tagsZ] }),
            local.query({ kinds: [39999], "#z": [assertZ], "#a": [bookAddr] }),
          ]);
          return { bookEvent: bookEvents[0] ?? null, taxonomyEvents, assertionEvents };
        },
        slug,
        new Date().getUTCFullYear(),
      ),
    now: () => Math.floor(Date.now() / 1000),
  };

  // Story 80 / ADR 0078: the demotion cycle rides the same cron run, sharing
  // the queue, relays, signer, and provider.
  const demoteDeps: DemoterDeps = {
    librarianPubkey,
    claimDemotePending: () => queue.claimDemotePending(),
    sign: deps.sign,
    publishLocal: deps.publishLocal,
    publishDcosl: deps.publishDcosl,
    markDemoted: (job, delistId) => queue.markDemoted(job, delistId),
    markDemoteFailed: (job, reason) => queue.markDemoteFailed(job, reason),
    searchDelete: (slugs) => searchProvider.delete(slugs),
  };

  try {
    await runPromotionCycle(deps);
    await runDemotionCycle(demoteDeps);
  } finally {
    local.close();
    dcosl.close();
    await queue.close();
  }
  console.log("[promoter] cycle complete");
}

// Arg dispatch: `promoter reveal …` runs the operator reveal trigger; the bare
// invocation (the cron) runs the promotion cycle.
async function main(): Promise<void> {
  const [, , subcommand, ...rest] = process.argv;
  if (subcommand === "reveal") {
    await reveal(rest);
    return;
  }
  await promote();
}

main().catch((err) => {
  console.error("[promoter] fatal:", err);
  process.exit(1);
});
