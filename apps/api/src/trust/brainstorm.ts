// Brainstorm / NIP-85 adapter — the ONLY trust file that knows the backend
// (ADR 0014). Resolves an observer's score source via the public
// `GET /setup/{observer}` (the `30382:rank` provider tuple → a service key +
// relay hint), then reads kind-30382 events (`rank`/100 = weight) from the
// configured relays, unioned. Raw HTTP + the shared WS read; no SDK. The
// architecture guard test enforces that these specifics never leak past here.
import { queryRelayUrl, type NostrFilter } from "../nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { TrustProvider, TrustProviderName } from "./types";

const KIND_TRUSTED_ASSERTION = 30382;
const RANK_PROVIDER = "30382:rank";
const SETUP_TTL_MS = 10 * 60_000;
const WEIGHT_TTL_MS = 5 * 60_000;

type RelayQuery = (url: string, filter: NostrFilter) => Promise<SignedNostrEvent[]>;

function tag(e: SignedNostrEvent, name: string): string | undefined {
  return e.tags.find((t) => t[0] === name)?.[1];
}

type Cached<T> = { value: T; at: number };

export class BrainstormProvider implements TrustProvider {
  readonly name: TrustProviderName = "brainstorm";
  readonly #apiUrl: string;
  readonly #relays: readonly string[];
  readonly #fetch: typeof fetch;
  readonly #query: RelayQuery;
  readonly #now: () => number;
  readonly #serviceKeys = new Map<string, Cached<{ key: string; relayHint?: string } | null>>();
  readonly #weights = new Map<string, Cached<Map<string, number>>>();

  constructor(
    opts: { apiUrl: string; relays: readonly string[] },
    deps: { fetchImpl?: typeof fetch; query?: RelayQuery; now?: () => number } = {},
  ) {
    this.#apiUrl = opts.apiUrl.replace(/\/$/, "");
    this.#relays = opts.relays;
    this.#fetch = deps.fetchImpl ?? fetch;
    this.#query = deps.query ?? ((url, filter) => queryRelayUrl(url, filter, 6000));
    this.#now = deps.now ?? (() => Date.now());
  }

  /** Resolve the observer's `30382:rank` service key (+ relay hint) via /setup. */
  async #serviceKey(observer: string): Promise<{ key: string; relayHint?: string } | null> {
    const hit = this.#serviceKeys.get(observer);
    if (hit && this.#now() - hit.at < SETUP_TTL_MS) return hit.value;
    let value: { key: string; relayHint?: string } | null = null;
    try {
      const res = await this.#fetch(`${this.#apiUrl}/setup/${observer}`);
      if (res.ok) {
        const body = (await res.json()) as unknown;
        const tuples = Array.isArray(body)
          ? (body as unknown[])
          : Array.isArray((body as { data?: unknown }).data)
            ? ((body as { data: unknown[] }).data)
            : [];
        for (const t of tuples) {
          if (Array.isArray(t) && t[0] === RANK_PROVIDER && typeof t[1] === "string") {
            value = { key: t[1], relayHint: typeof t[2] === "string" ? t[2] : undefined };
            break;
          }
        }
      }
    } catch {
      value = null;
    }
    this.#serviceKeys.set(observer, { value, at: this.#now() });
    return value;
  }

  async weights(observerHex: string, targetHexes: readonly string[]): Promise<Map<string, number>> {
    if (targetHexes.length === 0) return new Map();
    const cached = this.#weights.get(observerHex);
    const fresh = cached && this.#now() - cached.at < WEIGHT_TTL_MS ? cached.value : null;

    const svc = await this.#serviceKey(observerHex);
    if (!svc) return new Map();

    // Union the configured relays + the /setup relay hint.
    const relays = svc.relayHint && !this.#relays.includes(svc.relayHint)
      ? [...this.#relays, svc.relayHint]
      : this.#relays;

    const out = new Map<string, number>();
    const targets = [...targetHexes];
    await Promise.all(
      relays.map(async (relay) => {
        let events: SignedNostrEvent[];
        try {
          events = await this.#query(relay, {
            kinds: [KIND_TRUSTED_ASSERTION],
            authors: [svc.key],
            "#d": targets,
          });
        } catch {
          return;
        }
        for (const e of events) {
          const d = tag(e, "d");
          const rankStr = tag(e, "rank");
          if (!d || rankStr === undefined) continue;
          const rank = Number(rankStr);
          if (!Number.isFinite(rank)) continue;
          const w = Math.max(0, Math.min(1, rank / 100));
          const prev = out.get(d);
          if (prev === undefined || w > prev) out.set(d, w); // union: keep the strongest
        }
      }),
    );

    // Merge any still-fresh cached weights (covers targets not re-queried).
    if (fresh) for (const [k, v] of fresh) if (!out.has(k)) out.set(k, v);
    this.#weights.set(observerHex, { value: out, at: this.#now() });
    return out;
  }

  async hasScores(observerHex: string): Promise<boolean> {
    const svc = await this.#serviceKey(observerHex);
    if (!svc) return false;
    const relays =
      svc.relayHint && !this.#relays.includes(svc.relayHint)
        ? [...this.#relays, svc.relayHint]
        : this.#relays;
    for (const relay of relays) {
      try {
        const events = await this.#query(relay, {
          kinds: [KIND_TRUSTED_ASSERTION],
          authors: [svc.key],
          limit: 1,
        });
        if (events.length > 0) return true;
      } catch {
        // try the next relay
      }
    }
    return false;
  }

  async authChallenge(observerHex: string): Promise<string | null> {
    try {
      const res = await this.#fetch(`${this.#apiUrl}/authChallenge/${observerHex}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { challenge?: string }; challenge?: string };
      return body.data?.challenge ?? body.challenge ?? null;
    } catch {
      return null;
    }
  }

  async personalize(observerHex: string, signedChallenge: SignedNostrEvent): Promise<boolean> {
    try {
      const verify = await this.#fetch(`${this.#apiUrl}/authChallenge/${observerHex}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_event: signedChallenge }),
      });
      if (!verify.ok) return false;
      const vbody = (await verify.json()) as { data?: { token?: string }; token?: string };
      const token = vbody.data?.token ?? vbody.token;
      if (!token) return false;
      // New calc coming → drop any cached service key/weights for this observer.
      this.#serviceKeys.delete(observerHex);
      this.#weights.delete(observerHex);
      const trigger = await this.#fetch(`${this.#apiUrl}/user/graperank`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      });
      return trigger.ok;
    } catch {
      return false;
    }
  }
}
