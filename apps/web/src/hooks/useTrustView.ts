// Trust perspective + self-serve personalization (ADR 0014, Phase B; ADR 0026
// custodial parity). Resolves whether the signed-in user has GrapeRank scores,
// drives the House⇄Yours view, and runs the in-app Personalize trigger. Sovereign
// NIP-07-signs the server-built challenge template; custodial triggers in-session
// (the server signs — no extension). Both poll until scores land (~5–6 min build).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type NostrEventTemplate,
  type SignedEvent,
} from "../lib/api";
import { useSession } from "./useSession";

export type TrustView = "house" | "yours";
export type TrustStatus =
  | "loading"
  | "house-only" // signed-out / trust disabled
  | "gated" // custodial below the follow gate → honest prompt, no trigger
  | "ready" // has scores → can toggle Yours
  | "none" // eligible, no scores yet → can Personalize
  | "building"; // calc running

type Nip07 = {
  signEvent: (t: NostrEventTemplate) => Promise<SignedEvent>;
};

const POLL_MS = 20_000;
const VIEW_KEY = "unbnd.trustView";

function storedView(): TrustView {
  try {
    return localStorage.getItem(VIEW_KEY) === "yours" ? "yours" : "house";
  } catch {
    return "house";
  }
}

export function useTrustView() {
  const session = useSession();
  const signedIn = session.status === "signed-in";
  // Custodial = email-signup (no own key in the browser); sovereign = NIP-07.
  const custodial = signedIn && session.user.email !== null;
  const npub = signedIn ? session.user.npub : undefined;

  const [status, setStatus] = useState<TrustStatus>("loading");
  const [view, setViewState] = useState<TrustView>(storedView);
  const [error, setError] = useState<string | null>(null);

  // Persist the chosen perspective so it carries across pages (the bar on the
  // home page and the ratings panel on book pages share it).
  const setView = useCallback((v: TrustView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore storage failures
    }
  }, []);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (session.status === "loading") return;
    if (!signedIn) {
      setStatus("house-only");
      return;
    }
    let cancelled = false;
    // Both tiers resolve the same status (ADR 0026 stops collapsing custodial to
    // house-only). Trust off → house-only. Eligible → ready/none by scores.
    // Custodial below the follow gate (canPersonalize:false) → gated; sovereign
    // is never gated (canPersonalize is always true for sovereign server-side).
    api.trust
      .status()
      .then((s) => {
        if (cancelled) return;
        if (!s.enabled) setStatus("house-only");
        else if (!s.canPersonalize) setStatus(custodial ? "gated" : "house-only");
        else setStatus(s.hasScores ? "ready" : "none");
      })
      .catch(() => !cancelled && setStatus("house-only"));
    return () => {
      cancelled = true;
    };
  }, [session.status, signedIn, custodial]);

  // Poll while a calc is building.
  useEffect(() => {
    if (status !== "building") return;
    poll.current = setInterval(() => {
      api.trust.status().then((s) => {
        if (s.hasScores) {
          setStatus("ready");
          setView("yours");
        }
      }).catch(() => {});
    }, POLL_MS);
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [status]);

  const personalize = useCallback(async () => {
    setError(null);
    try {
      if (custodial) {
        // The server signs the template with the session's ephemeral key — no
        // extension, no client-side signing.
        await api.trust.personalizeCustodial();
        setStatus("building");
        return;
      }
      const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
      if (!nostr) {
        setError("No Nostr extension found.");
        return;
      }
      // Sovereign signs the SERVER-built template verbatim (ADR 0026 — the web no
      // longer constructs the kind-27235; the provider owns its shape).
      const { template } = await api.trust.challenge();
      const signed = await nostr.signEvent(template);
      await api.trust.personalize(signed);
      setStatus("building");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start personalization.");
    }
  }, [custodial]);

  return { status, view, setView, personalize, error, npub };
}
