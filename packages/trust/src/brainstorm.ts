// Brainstorm / NIP-85 adapter — the ONLY trust file that knows the backend
// (ADR 0014). Resolves an observer's score source via the public
// `GET /setup/{observer}` (the `30382:rank` provider tuple → a service key +
// relay hint), then reads kind-30382 events (`rank`/100 = weight) from the
// configured relays, unioned. Raw HTTP + the shared WS read; no SDK. The
// architecture guard test enforces that these specifics never leak past here.
import { WebSocket } from "ws";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import type { TrustProvider, TrustProviderName } from "./types";

const KIND_TRUSTED_ASSERTION = 30382;
const KIND_NIP98_AUTH = 27235;
const RANK_PROVIDER = "30382:rank";
const SETUP_TTL_MS = 10 * 60_000;
const WEIGHT_TTL_MS = 5 * 60_000;
const DEFAULT_QUERY_TIMEOUT_MS = 6000;

/**
 * The package's own minimal nostr filter (a structural copy). Kept local so
 * `@unbnd/trust` carries no apps/api `Config` edge — the only runtime deps stay
 * `@unbnd/schemas` + `nostr-tools` + `ws` (ADR 0036 A1).
 */
type NostrFilter = {
  readonly kinds?: number[];
  readonly authors?: string[];
  readonly limit?: number;
  readonly until?: number;
  readonly [tagFilter: `#${string}`]: string[] | undefined;
};

type RelayQuery = (url: string, filter: NostrFilter) => Promise<SignedNostrEvent[]>;

/**
 * A tiny self-contained REQ→EOSE relay read (open WS, send REQ, collect EVENT
 * frames until EOSE or timeout). The default `query` seam — takes only a URL +
 * filter + timeout, no apps/api coupling. Callers may inject their own reader.
 */
function queryRelayUrl(
  relayUrl: string,
  filter: NostrFilter,
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<SignedNostrEvent[]> {
  return new Promise<SignedNostrEvent[]>((resolve) => {
    const collected: SignedNostrEvent[] = [];
    const sub = "trust-read";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(collected);
    };
    const ws = new WebSocket(relayUrl);
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      finish();
    }, timeoutMs);
    ws.on("open", () => ws.send(JSON.stringify(["REQ", sub, filter])));
    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg[1] !== sub) return;
      if (msg[0] === "EVENT" && msg[2] && typeof msg[2] === "object") {
        collected.push(msg[2] as SignedNostrEvent);
      } else if (msg[0] === "EOSE") {
        finish();
      }
    });
    ws.on("error", () => finish());
  });
}

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
  readonly #followersCache = new Map<string, Cached<Map<string, number>>>();

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

  /**
   * The shared per-target read for the trusted-assertion (kind-30382) events:
   * resolve the observer's service key, union the configured relays + the /setup
   * hint, read the events authored by that key for the targets, and reduce them
   * with `pick` (per-event value, or null to skip). The union keeps the LARGEST
   * value per target; still-fresh cached values fill targets not re-queried.
   * Best-effort: no service key or a read failure yields whatever is in cache (or
   * empty); never throws. `weights()` and `followers()` differ only in `pick`.
   */
  async #readAssertionUnion(
    observerHex: string,
    targetHexes: readonly string[],
    cache: Map<string, Cached<Map<string, number>>>,
    pick: (event: SignedNostrEvent) => number | null,
  ): Promise<Map<string, number>> {
    if (targetHexes.length === 0) return new Map();
    const cached = cache.get(observerHex);
    const fresh = cached && this.#now() - cached.at < WEIGHT_TTL_MS ? cached.value : null;

    const svc = await this.#serviceKey(observerHex);
    if (!svc) return new Map();

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
          if (!d) continue;
          const v = pick(e);
          if (v === null) continue;
          const prev = out.get(d);
          if (prev === undefined || v > prev) out.set(d, v); // union: keep the largest
        }
      }),
    );

    // Merge any still-fresh cached values (covers targets not re-queried).
    if (fresh) for (const [k, v] of fresh) if (!out.has(k)) out.set(k, v);
    cache.set(observerHex, { value: out, at: this.#now() });
    return out;
  }

  async weights(observerHex: string, targetHexes: readonly string[]): Promise<Map<string, number>> {
    return this.#readAssertionUnion(observerHex, targetHexes, this.#weights, (e) => {
      const rankStr = tag(e, "rank");
      if (rankStr === undefined) return null;
      const rank = Number(rankStr);
      return Number.isFinite(rank) ? Math.max(0, Math.min(1, rank / 100)) : null;
    });
  }

  // Story 74 / ADR 0072 — follower counts from the SAME trusted-assertion events
  // the weights read fetches (the `followers` tag), via the same service key.
  async followers(observerHex: string, targetHexes: readonly string[]): Promise<Map<string, number>> {
    return this.#readAssertionUnion(observerHex, targetHexes, this.#followersCache, (e) => {
      const followersStr = tag(e, "followers");
      if (followersStr === undefined) return null;
      const n = Number(followersStr);
      return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
    });
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

  async authChallenge(observerHex: string): Promise<NostrEventTemplate | null> {
    try {
      const res = await this.#fetch(`${this.#apiUrl}/authChallenge/${observerHex}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { challenge?: string }; challenge?: string };
      const challenge = body.data?.challenge ?? body.challenge ?? null;
      if (!challenge) return null;
      // The Brainstorm-flavored kind-27235 shape (incl. the brainstorm_login tag
      // Brainstorm's /verify expects) lives ONLY here — the guard enforces it.
      return {
        kind: KIND_NIP98_AUTH,
        created_at: Math.floor(this.#now() / 1000),
        tags: [
          ["challenge", challenge],
          ["t", "brainstorm_login"],
        ],
        content: "",
      };
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
