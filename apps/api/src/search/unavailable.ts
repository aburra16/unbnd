// Search without a catalog (Story 112 / ADR 0100): the relay provider needs the
// librarian whose list it searches. Without LIBRARIAN_PUBKEY the API still
// starts, as it does for ratings, and search reports why it is unavailable.
import type { SearchProvider } from "@unbnd/search";

export function unavailableSearch(reason: string): SearchProvider {
  return {
    name: "nip50",
    health: async () => ({ ok: false, provider: "nip50", error: reason }),
    search: async () => {
      throw new Error(`search unavailable: ${reason}`);
    },
  };
}
