// Worker config parsing + loading for the librarian worker (Story 58 / ADR 0057
// §2). The pure parsers (parseSeedCurators / parseRelays) are unit-tested in
// isolation; the loaders read process.env at the wiring layer. No real curator
// pubkey or profile content lives here — SEED_CURATORS and the profile fields
// are operator-supplied out of band (the two-document firewall).

const HEX64 = /^[0-9a-f]{64}$/;

// ADR §2 default general-relay list: the PROFILE_RELAYS set minus dcosl (dcosl
// rejects kind-3). The kind-3 lands here for broad client discoverability.
export const DEFAULT_LIBRARIAN_GENERAL_RELAYS: readonly string[] = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// ADR §2 default trust / nip85 relay set — the relays the GrapeRank crawler
// reads the librarian's follows from.
export const DEFAULT_TRUST_RELAYS: readonly string[] = [
  "wss://nip85.nosfabrica.com",
  "wss://nip85.brainstorm.world",
];

// ADR §2 default profile-relay set (unioned with dcosl for the kind-0).
export const DEFAULT_PROFILE_RELAYS: readonly string[] = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

export const DEFAULT_DCOSL_RELAY_URL = "wss://dcosl.brainstorm.world/";
export const DEFAULT_BRAINSTORM_API_URL =
  "https://brainstormserver.nosfabrica.com";
export const DEFAULT_RELAY_PUBLISH_TIMEOUT_MS = 10_000;

/**
 * Parse a CSV of seed-curator pubkeys into a hex array. Each entry is trimmed
 * and validated against `^[0-9a-f]{64}$` (64 lowercase hex). An empty /
 * whitespace-only value, or any entry that is not valid 64-lowercase-hex, is a
 * hard error — the operator must supply a real seed set for the `follows` mode.
 */
export function parseSeedCurators(csv: string): string[] {
  const entries = csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) {
    throw new Error(
      "SEED_CURATORS is required and must be a CSV of 64-lowercase-hex pubkeys",
    );
  }
  for (const entry of entries) {
    if (!HEX64.test(entry)) {
      throw new Error(
        `SEED_CURATORS entry is not a 64-lowercase-hex pubkey: ${entry}`,
      );
    }
  }
  return entries;
}

/**
 * Parse a CSV of relay URLs into a trimmed array. An empty value falls back to
 * the provided default list.
 */
export function parseRelays(csv: string, fallback: readonly string[]): string[] {
  const entries = csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return entries.length > 0 ? entries : [...fallback];
}

/** Read a required env var (or fall back); empty string counts as missing. */
export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`librarian: missing required env var ${name}`);
  }
  return v;
}

/** Read an optional env var; returns undefined when unset / empty. */
export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

export type FollowsConfig = {
  readonly nsec: string;
  readonly seedCurators: string[];
  readonly trustRelays: string[];
  readonly generalRelays: string[];
  readonly trustProvider: "brainstorm" | "fixture";
  readonly brainstormApiUrl: string;
  readonly relayPublishTimeoutMs: number;
};

export type ProfileConfig = {
  readonly nsec: string;
  readonly name: string;
  readonly about?: string;
  readonly picture?: string;
  readonly nip05?: string;
  readonly dcoslUrl: string;
  readonly profileRelays: string[];
  readonly relayPublishTimeoutMs: number;
};

function parseTimeoutMs(): number {
  const raw = optionalEnv("RELAY_PUBLISH_TIMEOUT_MS");
  if (raw === undefined) return DEFAULT_RELAY_PUBLISH_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`RELAY_PUBLISH_TIMEOUT_MS must be a positive integer: ${raw}`);
  }
  return Math.floor(n);
}

function parseTrustProvider(): "brainstorm" | "fixture" {
  const raw = optionalEnv("TRUST_PROVIDER") ?? "brainstorm";
  if (raw !== "brainstorm" && raw !== "fixture") {
    throw new Error(`TRUST_PROVIDER must be 'brainstorm' or 'fixture': ${raw}`);
  }
  return raw;
}

/** Load + validate the `follows` mode config from process.env. */
export function loadFollowsConfig(): FollowsConfig {
  return {
    nsec: env("LIBRARIAN_NSEC"),
    seedCurators: parseSeedCurators(env("SEED_CURATORS", "")),
    trustRelays: parseRelays(
      optionalEnv("TRUST_RELAYS") ?? "",
      DEFAULT_TRUST_RELAYS,
    ),
    generalRelays: parseRelays(
      optionalEnv("LIBRARIAN_GENERAL_RELAYS") ?? "",
      DEFAULT_LIBRARIAN_GENERAL_RELAYS,
    ),
    trustProvider: parseTrustProvider(),
    brainstormApiUrl: env("BRAINSTORM_API_URL", DEFAULT_BRAINSTORM_API_URL),
    relayPublishTimeoutMs: parseTimeoutMs(),
  };
}

/** Load + validate the `profile` mode config from process.env. */
export function loadProfileConfig(): ProfileConfig {
  return {
    nsec: env("LIBRARIAN_NSEC"),
    name: env("LIBRARIAN_NAME"),
    about: optionalEnv("LIBRARIAN_ABOUT"),
    picture: optionalEnv("LIBRARIAN_PICTURE_URL"),
    nip05: optionalEnv("LIBRARIAN_NIP05"),
    dcoslUrl: env("DCOSL_RELAY_URL", DEFAULT_DCOSL_RELAY_URL),
    profileRelays: parseRelays(
      optionalEnv("PROFILE_RELAYS") ?? "",
      DEFAULT_PROFILE_RELAYS,
    ),
    relayPublishTimeoutMs: parseTimeoutMs(),
  };
}
