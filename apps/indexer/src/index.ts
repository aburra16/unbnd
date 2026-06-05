// Catalog search indexer (ADR 0013). Reads the catalog from the local relay
// (books + the tag taxonomy + tag assertions), builds provider-neutral
// SearchDocuments, and loads them through the SearchProvider. Idempotent and
// re-runnable (documents upsert by id). Provider-agnostic: a Vespa swap is a
// SEARCH_PROVIDER flip — this file never names a backend.
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
} from "@unbnd/schemas";
import { resolveProvider, type ProviderName } from "@unbnd/search";
import { queryRelay, queryAllPages } from "./relay";
import { buildSearchDocuments } from "./build-documents";
import { runIndex } from "./run-index";

const KIND = 39999;

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`indexer: missing required env var ${name}`);
  }
  return v;
}

async function main() {
  const relayUrl = env("STRFRY_URL", "ws://localhost:7777");
  const lib = asHexPubkey(env("LIBRARIAN_PUBKEY"));
  const provider = resolveProvider({
    provider: env("SEARCH_PROVIDER", "meili") as ProviderName,
    url: env("SEARCH_URL"),
    apiKey: env("SEARCH_API_KEY"),
  });

  const booksZ = formatAddress(buildBookRecordsHeaderAddress(lib));
  const tagsZ = formatAddress(buildBookTagsHeaderAddress(lib));
  const assertZ = formatAddress(buildBookTagAssertionsHeaderAddress(lib));

  console.log(`[indexer] relay=${relayUrl} provider=${provider.name} librarian=${lib.slice(0, 12)}`);

  // Paginate past the relay's per-REQ cap so the WHOLE catalog is indexed.
  const readAll = (z: string) =>
    queryAllPages((cursor) => queryRelay(relayUrl, { kinds: [KIND], "#z": [z], ...cursor }));
  const [books, taxonomy, assertions] = await Promise.all([
    readAll(booksZ),
    readAll(tagsZ),
    readAll(assertZ),
  ]);
  console.log(
    `[indexer] read ${books.length} books, ${taxonomy.length} taxonomy, ${assertions.length} assertions`,
  );

  const docs = buildSearchDocuments(books, taxonomy, assertions, new Date().getUTCFullYear());
  console.log(`[indexer] built ${docs.length} documents`);

  await runIndex(provider, docs);
  console.log(`[indexer] done: ${docs.length} documents indexed`);
}

main().catch((err) => {
  console.error("[indexer] fatal:", err);
  process.exit(1);
});
