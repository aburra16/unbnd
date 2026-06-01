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
  buildBookSubmissionsHeaderAddress,
  formatAddress,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { runPromotionCycle, type PromoterDeps } from "./index";
import { createQueue } from "./queue";
import { connectRelay } from "./relay";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`promoter: missing required env var ${name}`);
  }
  return v;
}

async function main(): Promise<void> {
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
    now: () => Math.floor(Date.now() / 1000),
  };

  try {
    await runPromotionCycle(deps);
  } finally {
    local.close();
    dcosl.close();
    await queue.close();
  }
  console.log("[promoter] cycle complete");
}

main().catch((err) => {
  console.error("[promoter] fatal:", err);
  process.exit(1);
});
