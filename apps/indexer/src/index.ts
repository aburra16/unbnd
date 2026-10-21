// Catalog search indexer (ADR 0013). Reads the catalog from the local relay
// (books + the tag taxonomy + tag assertions), builds provider-neutral
// SearchDocuments, and loads them through the SearchProvider. Idempotent and
// re-runnable (documents upsert by id). Provider-agnostic: a Vespa swap is a
// SEARCH_PROVIDER flip — this file never names a backend.
import {
  asHexPubkey,
  buildBookTagsHeaderAddress,
  formatAddress,
} from "@unbnd/schemas";
import { forEachCatalogPage, resolveProvider, type ProviderName } from "@unbnd/search";
import { queryRelay, queryAllPages } from "./relay";
import { buildSearchDocuments } from "./build-documents";
import { runIndexInPages } from "./run-index";

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

  const tagsZ = formatAddress(buildBookTagsHeaderAddress(lib));

  console.log(`[indexer] relay=${relayUrl} provider=${provider.name} librarian=${lib.slice(0, 12)}`);

  // The tag list is the librarian's alone, as the labels pass reads it (ADR 0094 §5);
  // it is small. The catalog is read a page at a time (ADR 0096 §4).
  const taxonomy = await queryAllPages((cursor) =>
    queryRelay(relayUrl, { kinds: [KIND], "#z": [tagsZ], authors: [lib], ...cursor }),
  );
  const year = new Date().getUTCFullYear();
  const total = await runIndexInPages(provider, async (onDocs) => {
    await forEachCatalogPage({
      query: (filter) => queryRelay(relayUrl, filter as never),
      librarian: lib,
      onPage: async (records, assertionsBySlug) => {
        const assertions = [...assertionsBySlug.values()].flat();
        await onDocs(buildSearchDocuments(records, taxonomy, assertions, year));
      },
    });
  });
  console.log(`[indexer] done: ${total} documents indexed`);
}

main().catch((err) => {
  console.error("[indexer] fatal:", err);
  process.exit(1);
});
