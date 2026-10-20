// Brainstorm's production endpoints (Story 98 / ADR 0088 §3): the one default
// every app reads. Env (BRAINSTORM_API_URL, TRUST_RELAYS) still overrides.
// /setup returns a relay hint that is unioned with these, so a relay move on
// Brainstorm's side keeps working before this default catches up.
export const BRAINSTORM_DEFAULTS = {
  apiUrl: "https://api.brainstorm.world",
  trustRelays: ["wss://scores.brainstorm.world", "wss://nip85.nosfabrica.com"],
} as const satisfies { apiUrl: string; trustRelays: readonly string[] };
