// Header-only publish (Story 97 / ADR 0087). Signs and publishes the headers
// the seeder owns, without running the seed: `run seeder node headers.js`.
// Publishes exactly what a full seed run publishes (seededHeaderTemplates), so
// the two can never disagree. Exits non-zero if any header is refused.
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import { connectResilientRelay } from "@unbnd/relay";
import { seededHeaderTemplates } from "./headers";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing env ${name}`);
  }
  return v;
}

async function main(): Promise<void> {
  const relayUrl = env("DCOSL_RELAY_URL", "wss://dcosl.brainstorm.world/");
  const decoded = decode(env("LIBRARIAN_NSEC"));
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  const librarian = asHexPubkey(getPublicKey(sk));

  const relay = await connectResilientRelay({
    url: relayUrl,
    attempts: Number(env("RELAY_RECONNECT_ATTEMPTS", "6")),
    baseMs: Number(env("RELAY_RECONNECT_BASE_MS", "500")),
    maxMs: Number(env("RELAY_RECONNECT_MAX_MS", "8000")),
  });
  console.log(`[headers] librarian=${librarian.slice(0, 12)} relay=${relayUrl}`);

  let failed = 0;
  for (const template of seededHeaderTemplates(librarian, Math.floor(Date.now() / 1000))) {
    const d = template.tags.find((t) => t[0] === "d")![1];
    const signed = finalizeEvent(template, sk) as unknown as SignedNostrEvent;
    const r = await relay.publish(signed);
    if (r.ok) console.log(`[headers] ${d}: ok ${signed.id}`);
    else {
      failed++;
      console.error(`[headers] ${d}: refused (${r.reason})`);
    }
  }
  relay.close();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[headers] fatal", err);
  process.exit(1);
});
