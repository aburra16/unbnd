// Catalog year correction (Story 104 / ADR 0093 §4): `run seeder node years.js`
// prints what it would change; `node years.js --apply` publishes it. Reads the
// librarian's records from dcosl, asks Open Library for edition years and first
// authors, plans every correction before publishing any, and replaces each
// corrected record at its own address, librarian-signed. A dry run needs only
// the librarian's public key (LIBRARIAN_PUBKEY, or derived from LIBRARIAN_NSEC);
// --apply needs LIBRARIAN_NSEC. Each record is read again just before its
// correction is published and skipped if it changed. Exits non-zero if any
// publish is refused or any record was skipped as stale.
import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  formatAddress,
  type HexPubkey,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { connectResilientRelay, queryAllPages } from "@unbnd/relay";
import { fetchAuthors, fetchWorkEvidence } from "./ol-evidence";
import { runYearCorrection } from "./year-corrections";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing env ${name}`);
  }
  return v;
}

/** The librarian identity: a key when LIBRARIAN_NSEC is set, else the public key alone. */
function librarianIdentity(): { readonly pubkey: HexPubkey; readonly sk?: Uint8Array } {
  const nsec = process.env.LIBRARIAN_NSEC;
  const declared = process.env.LIBRARIAN_PUBKEY;
  if (nsec) {
    const decoded = decode(nsec);
    if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
    const sk = decoded.data as Uint8Array;
    const pubkey = asHexPubkey(getPublicKey(sk));
    if (declared && asHexPubkey(declared) !== pubkey) {
      throw new Error("LIBRARIAN_PUBKEY does not match LIBRARIAN_NSEC");
    }
    return { pubkey, sk };
  }
  if (declared) return { pubkey: asHexPubkey(declared) };
  throw new Error("missing env LIBRARIAN_PUBKEY or LIBRARIAN_NSEC");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const relayUrl = env("DCOSL_RELAY_URL", "wss://dcosl.brainstorm.world/");
  const rateMs = Number(env("YEARS_RATE_MS", "250"));
  const { pubkey, sk } = librarianIdentity();
  if (apply && !sk) throw new Error("--apply needs LIBRARIAN_NSEC");

  const relay = await connectResilientRelay({
    url: relayUrl,
    attempts: Number(env("RELAY_RECONNECT_ATTEMPTS", "6")),
    baseMs: Number(env("RELAY_RECONNECT_BASE_MS", "500")),
    maxMs: Number(env("RELAY_RECONNECT_MAX_MS", "8000")),
  });
  console.error(`[years] librarian=${pubkey.slice(0, 12)} relay=${relayUrl} ${apply ? "APPLY" : "dry run"}`);

  const booksZ = formatAddress(buildBookRecordsHeaderAddress(pubkey));
  const { events: read } = await queryAllPages(
    (cursor) => relay.query({ kinds: [39999], authors: [pubkey], "#z": [booksZ], ...cursor }, 15_000),
    { pageSize: 500, maxPages: Infinity, totalBudgetMs: Infinity },
  );
  // The correction re-signs this content with the librarian key: keep only
  // events the librarian really signed, whatever the relay sends.
  const events = read.filter((e) => e.pubkey === pubkey && verifyEvent(e as never));
  console.error(`[years] read ${read.length} records, ${events.length} librarian-signed`);

  const result = await runYearCorrection({
    events,
    librarian: pubkey,
    fetchWorks: (ids) => fetchWorkEvidence(ids),
    fetchAuthors: (keys) => fetchAuthors(keys),
    currentYear: new Date().getUTCFullYear(),
    now: () => Math.floor(Date.now() / 1000),
    log: (line) => console.log(line),
    ...(apply && sk
      ? {
          publish: async (template) => {
            const signed = finalizeEvent(template, sk) as unknown as SignedNostrEvent;
            const r = await relay.publish(signed);
            await sleep(rateMs);
            return r;
          },
          latest: async (slug) => {
            const [live] = await relay.query(
              { kinds: [39999], authors: [pubkey], "#d": [slug], limit: 1 },
              15_000,
            );
            // Same id is not enough: the body is re-signed, so check its signature.
            return live && verifyEvent(live as never) ? live : undefined;
          },
        }
      : {}),
  });
  relay.close();
  console.error(
    `[years] published=${result.published} stale=${result.stale} failed=${result.failed}`,
  );
  // A stale record was skipped, not corrected: the operator should run again.
  if (result.failed > 0 || result.stale > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[years] fatal", err);
  process.exit(1);
});
